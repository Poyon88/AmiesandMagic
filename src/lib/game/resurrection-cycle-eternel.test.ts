// Résurrection + Cycle éternel sur la même créature (cas « Danseuse aux Neuf
// Vies ») : elle revenait en jeu à CHAQUE mort, sans jamais perdre Résurrection.
//
// Deux causes cumulées :
//  1. Cycle éternel n'avait pas la garde `graveyard.includes(c)` : il recyclait
//     une dépouille DÉJÀ sortie du cimetière par la Résurrection → le même objet
//     se retrouvait sur le plateau ET dans le deck, et son
//     `returnInstanceToPlay` remettait `hasUsedResurrection` à false.
//  2. La Résurrection ne retirait le mot-clé que de `card.keywords` : sur une
//     carte backfillée, `getCapabilities` renvoie `capabilities` et ignore
//     `keywords`, donc la capacité restait déclarée (icône incluse).
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { getCapabilities } from "./capability-adapter";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, GameState } from "./types";

const NAME = "Danseuse aux Neuf Vies";

/** Créature backfillée (colonne `capabilities` renseignée), comme en base. */
function danseuse(withCycle: boolean): CardInstance {
  const abilities = withCycle ? ["resurrection", "cycle_eternel"] : ["resurrection"];
  const caps = abilities.map((abilityId, i) => ({
    uid: `cw_${i}`, targets: [], trigger: "on_death", abilityId, effectKind: "immediate",
  })) as unknown as Capability[];
  const inst = mkInstance(mkCard({
    name: NAME, mana_cost: 3, attack: 2, health: 2,
    keywords: abilities as never,
    capabilities: caps as never,
  }));
  inst.hasSummoningSickness = false;
  return inst;
}

/** `count` attaquants prêts à frapper, côté joueur 0. */
function killers(s: GameState, count: number): CardInstance[] {
  const out: CardInstance[] = [];
  for (let i = 0; i < count; i++) {
    const k = mkInstance(mkCard({ name: `Tueur${i}`, attack: 9, health: 9 }));
    k.hasSummoningSickness = false;
    s.players[0].board.push(k);
    out.push(k);
  }
  return out;
}

const onBoard = (s: GameState) => s.players[1].board.find((c) => c.card.name === NAME);

describe("Résurrection : la créature perd vraiment le mot-clé", () => {
  it("revient à 1 PV et ne déclare plus Résurrection (keywords ET capabilities)", () => {
    const s = mkState();
    const d = danseuse(false);
    s.players[1].board.push(d);
    const [k] = killers(s, 1);

    const next = applyAction(s, { type: "attack", attackerInstanceId: k.instanceId, targetInstanceId: d.instanceId });

    const revived = onBoard(next);
    expect(revived).toBeDefined();
    expect(revived!.currentHealth).toBe(1);
    expect(revived!.hasUsedResurrection).toBe(true);
    expect(revived!.card.keywords).not.toContain("resurrection");
    expect(getCapabilities(revived!.card).some((c) => c.abilityId === "resurrection")).toBe(false);
    // La dépouille ne doit pas rester en double au cimetière.
    expect(next.players[1].graveyard).toHaveLength(0);
  });
});

describe("Résurrection + Cycle éternel : une seule règle réclame la dépouille", () => {
  it("1re mort : la Résurrection l'emporte, RIEN n'est ajouté au deck", () => {
    const s = mkState();
    const d = danseuse(true);
    s.players[1].board.push(d);
    const [k] = killers(s, 1);

    const next = applyAction(s, { type: "attack", attackerInstanceId: k.instanceId, targetInstanceId: d.instanceId });

    const revived = onBoard(next);
    expect(revived).toBeDefined();
    expect(revived!.currentHealth).toBe(1);
    expect(revived!.hasUsedResurrection).toBe(true);
    // Le bug : le MÊME objet se retrouvait aussi dans le deck, avec son drapeau
    // de résurrection réarmé par returnInstanceToPlay.
    expect(next.players[1].deck).toHaveLength(0);
  });

  it("2e mort : plus de Résurrection, c'est Cycle éternel qui la recycle", () => {
    const s = mkState();
    const d = danseuse(true);
    s.players[1].board.push(d);
    const [k1, k2] = killers(s, 2);

    const mid = applyAction(s, { type: "attack", attackerInstanceId: k1.instanceId, targetInstanceId: d.instanceId });
    const revived = onBoard(mid)!;
    const next = applyAction(mid, { type: "attack", attackerInstanceId: k2.instanceId, targetInstanceId: revived.instanceId });

    expect(onBoard(next)).toBeUndefined();
    expect(next.players[1].deck.map((c) => c.card.name)).toEqual([NAME]);
    expect(next.players[1].graveyard).toHaveLength(0);
  });
});

describe("Cycle éternel seul — non-régression", () => {
  it("la créature part au deck dès sa première mort", () => {
    const s = mkState();
    const c = mkInstance(mkCard({ name: "Recycleuse", attack: 1, health: 1, keywords: ["cycle_eternel"] as never }));
    c.hasSummoningSickness = false;
    s.players[1].board.push(c);
    const [k] = killers(s, 1);

    const next = applyAction(s, { type: "attack", attackerInstanceId: k.instanceId, targetInstanceId: c.instanceId });

    expect(next.players[1].deck.map((x) => x.card.name)).toEqual(["Recycleuse"]);
    expect(next.players[1].board).toHaveLength(0);
    expect(next.players[1].graveyard).toHaveLength(0);
  });
});
