// TRANSFORMATION EN EFFET COMPOSÉ (sort) — chaque unité visée devient une des
// cartes désignées (au hasard s'il y en a plusieurs, un tirage par unité), avec
// la même mécanique que la capacité de créature : forme d'origine rendue dès
// que l'unité quitte le plateau.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, GameAction, GameState, TargetSpec } from "./types";

const DRAGON = mkCard({ id: 8801, name: "Dragon", mana_cost: 6, attack: 5, health: 6, faction: "Humains" });
const MOUTON = mkCard({ id: 8802, name: "Mouton", mana_cost: 1, attack: 0, health: 1, faction: "Humains" });

const cible = (over: Partial<TargetSpec>): TargetSpec => ({
  entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice", ...over,
});

function sort(cardIds: number[], target: TargetSpec): CardInstance {
  const caps: Capability[] = [{
    uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
    composed: { content: "transformation", cardIds, target },
  }];
  return mkInstance(mkCard({ name: "Métamorphe", card_type: "spell", attack: null, health: null, mana_cost: 0, capabilities: caps as never }));
}

function table(): GameState {
  const s = mkState();
  s.factionCardPool = [DRAGON, MOUTON];
  const unite = (name: string) => { const u = mkInstance(mkCard({ name, attack: 3, health: 4, faction: "Humains" })); u.hasSummoningSickness = false; return u; };
  s.players[0].board.push(unite("Alliée"));
  s.players[1].board.push(unite("E1"), unite("E2"));
  return s;
}

function lancer(s: GameState, carte: CardInstance, targetMap?: Record<string, string>): GameState {
  s.players[0].hand.push(carte);
  return applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId, ...(targetMap ? { targetMap } : {}) } as GameAction);
}

const noms = (s: GameState, i: 0 | 1) => s.players[i].board.map(u => u.card.name).sort();

describe("Transformation (sort)", () => {
  it("toutes les unités ennemies deviennent la carte désignée ; les alliées non", () => {
    const n = lancer(table(), sort([MOUTON.id], cible({ count: "all", designation: "automatic" })));
    expect(noms(n, 1)).toEqual(["Mouton", "Mouton"]);
    expect(noms(n, 0)).toEqual(["Alliée"]);
    const m = n.players[1].board[0];
    expect(m.currentAttack).toBe(0);
    expect(m.formeOrigine?.name).toMatch(/^E[12]$/);
  });

  it("toutes les unités des deux camps", () => {
    const n = lancer(table(), sort([DRAGON.id], cible({ count: "all", side: "any", designation: "automatic" })));
    expect(noms(n, 0)).toEqual(["Dragon"]);
    expect(noms(n, 1)).toEqual(["Dragon", "Dragon"]);
  });

  it("une unité au choix : seule la cible change", () => {
    const s = table();
    const e1 = s.players[1].board[0];
    const n = lancer(s, sort([DRAGON.id], cible({})), { "cx_0#0": e1.instanceId, cx_0: e1.instanceId });
    expect(n.players[1].board.find(u => u.instanceId === e1.instanceId)!.card.name).toBe("Dragon");
    expect(n.players[1].board.find(u => u.instanceId !== e1.instanceId)!.card.name).toBe("E2");
  });

  it("plusieurs cartes désignées : chaque unité tire la sienne, tirage reproductible", () => {
    const tirage = (graine: number) => {
      const s = table();
      s.rngState = graine;
      const n = lancer(s, sort([DRAGON.id, MOUTON.id], cible({ count: "all", side: "any", designation: "automatic" })));
      return [...n.players[0].board, ...n.players[1].board].map(u => u.card.name).join();
    };
    expect(tirage(3)).toBe(tirage(3));
    const issues = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(tirage));
    expect(issues.size).toBeGreaterThan(1);
    for (const i of issues) for (const nom of i.split(",")) expect(["Dragon", "Mouton"]).toContain(nom);
  });

  it("reprend sa forme d'origine en quittant le plateau", () => {
    const s = table();
    const n = lancer(s, sort([DRAGON.id], cible({ count: "all", designation: "automatic" })));
    // Renvoi en main de toutes les ennemies : elles reviennent sous leur forme d'origine.
    const renvoi = mkInstance(mkCard({
      name: "Reflux", card_type: "spell", attack: null, health: null, mana_cost: 0,
      capabilities: [{ uid: "cx_1", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
        composed: { content: "bounce", target: cible({ count: "all", designation: "automatic" }) } }] as never,
    }));
    const apres = lancer(n, renvoi);
    expect(apres.players[1].hand.map(c => c.card.name).sort()).toEqual(["E1", "E2"]);
    expect(apres.players[1].hand.every(c => !c.formeOrigine)).toBe(true);
  });

  it("sans carte désignée : aucun effet", () => {
    const n = lancer(table(), sort([], cible({ count: "all", designation: "automatic" })));
    expect(noms(n, 1)).toEqual(["E1", "E2"]);
  });
});

describe("Transformation (sort) — texte", () => {
  it("nomme la cible puis la carte d'arrivée", async () => {
    const { describeComposedCap } = await import("./composed-display");
    const cap = (cardIds: number[], target: TargetSpec): Capability => ({
      uid: "cx", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
      composed: { content: "transformation", cardIds, target },
    });
    expect(describeComposedCap(cap([MOUTON.id], cible({ count: "all", designation: "automatic" }))))
      .toBe("Transforme toutes les unités ennemies en la carte désignée.");
    expect(describeComposedCap(cap([MOUTON.id, DRAGON.id], cible({}))))
      .toMatch(/^Transforme .* en une des 2 cartes désignées, au hasard\.$/);
  });
});
