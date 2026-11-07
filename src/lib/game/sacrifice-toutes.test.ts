// SACRIFICE en portée « toutes » (marqueur « A ») : la source détruit toutes les
// autres unités alliées et gagne la somme de leurs ATK et PV.
import { describe, expect, it } from "vitest";
import { applyAction, creatureNeedsTarget } from "./engine";
import { creatureScopes, scopedDescTemplate } from "./target-scope";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, GameAction, GameState } from "./types";

const sacrificateur = (mode?: "tap", scope = true) => {
  const trigger = mode ? "on_activation" : "on_play";
  return mkInstance(mkCard({
    name: "Prêtre", mana_cost: 0, attack: 1, health: 1,
    keywords: ["sacrifice"] as never,
    keyword_instances: [{ id: "sacrifice", ...(mode ? { mode } : {}), ...(scope ? { targetScope: "all_allies" } : {}) }] as never,
    capabilities: [{ uid: "cw_0", targets: [], trigger, effectKind: "immediate", abilityId: "sacrifice", ...(scope ? { targetScope: "all_allies" } : {}) }] as never,
  }));
};
const allie = (name: string, attack = 2, health = 3, extra: Record<string, unknown> = {}) =>
  mkInstance(mkCard({ name, attack, health, ...extra }));

function jouer(s: GameState, c: CardInstance, targetInstanceId?: string): GameState {
  s.players[0].hand.push(c);
  return applyAction(s, { type: "play_card", cardInstanceId: c.instanceId, targetInstanceId } as GameAction);
}

describe("Sacrifice — portée « toutes »", () => {
  it("s'ouvre aux alliés seulement", () => {
    expect(creatureScopes("sacrifice")).toEqual(["all_allies"]);
  });

  it("à l'entrée : toutes les autres alliées meurent, gains cumulés", () => {
    const s = mkState();
    s.players[0].board.push(allie("A"), allie("B", 3, 4));
    s.players[1].board.push(allie("Ennemie"));
    const c = sacrificateur();
    const st = jouer(s, c);
    const moi = st.players[0].board;
    expect(moi.map((u) => u.card.name)).toEqual(["Prêtre"]);
    expect(moi[0].currentAttack).toBe(6);
    expect(moi[0].currentHealth).toBe(8);
    expect(moi[0].maxHealth).toBe(8);
    expect(st.players[0].graveyard.map((u) => u.card.name).sort()).toEqual(["A", "B"]);
    expect(st.players[1].board).toHaveLength(1);
  });

  it("n'ouvre pas de ciblage, contrairement à la forme simple", () => {
    expect(creatureNeedsTarget(sacrificateur().card)).toBe(false);
    expect(creatureNeedsTarget(sacrificateur(undefined, false).card)).toBe(true);
  });

  it("plateau vide : la source reste seule, sans gain", () => {
    const st = jouer(mkState(), sacrificateur());
    expect(st.players[0].board[0].currentAttack).toBe(1);
  });

  it("le râle d'agonie de chaque sacrifiée part", () => {
    const s = mkState();
    const hero = s.players[0].hero;
    hero.hp = 10;
    const rale = (nom: string) => allie(nom, 1, 1, {
      capabilities: [{ uid: "r", trigger: "on_death", effectKind: "immediate", abilityId: "_composed", targets: [],
        composed: { content: "heal", magnitude: { x: 2 }, target: { entity: "hero", count: 1, side: "ally", location: "board", designation: "automatic" } } }] as Capability[],
    });
    s.players[0].board.push(rale("A"), rale("B"));
    expect(jouer(s, sacrificateur()).players[0].hero.hp).toBe(14);
  });

  it("forme simple inchangée : une seule alliée désignée", () => {
    const s = mkState();
    const a = allie("A");
    s.players[0].board.push(a, allie("B"));
    const st = jouer(s, sacrificateur(undefined, false), a.instanceId);
    expect(st.players[0].board.map((u) => u.card.name).sort()).toEqual(["B", "Prêtre"]);
  });

  it("à l'activation : même effet", () => {
    const s = mkState();
    const c = sacrificateur("tap");
    c.hasSummoningSickness = false;
    s.players[0].board.push(c, allie("A"), allie("B"));
    const st = applyAction(s, { type: "tap_activate", sourceInstanceId: c.instanceId, instanceIdx: 0 } as GameAction);
    expect(st.players[0].board.map((u) => u.card.name)).toEqual(["Prêtre"]);
    expect(st.players[0].board[0].currentAttack).toBe(5);
  });

  it("description dédiée", () => {
    expect(scopedDescTemplate("creature", "sacrifice", "all_allies")).toContain("toutes les autres unités alliées");
  });
});
