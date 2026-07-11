// Affaiblissement -X/-Y : baisse PERMANENTE d'ATK/PV d'une créature ennemie
// ciblée (miroir debuff de Renforcement). Côté sort (résolution) et créature
// (invocation). La baisse est bakée dans `card` → survit à recalculateAuras ;
// PV ≤ 0 tue ; ATK plancher à 0.
import { describe, expect, it } from "vitest";
import { applyAction, recalculateAuras } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameAction, SpellKeywordInstance } from "./types";

function play(state: ReturnType<typeof mkState>, ci: ReturnType<typeof mkInstance>, targetInstanceId?: string): GameAction {
  state.players[0].hand.push(ci);
  return { type: "play_card", cardInstanceId: ci.instanceId, targetInstanceId };
}

function affaiblSpell(attack: number, health: number) {
  return mkInstance(mkCard({
    name: "Affaiblissement", card_type: "spell", attack: null, health: null,
    spell_keywords: [{ id: "affaiblissement", attack, health }] as SpellKeywordInstance[],
  }));
}

describe("Affaiblissement -X/-Y — sort", () => {
  it("baisse -X/-Y une créature ennemie ; bakée dans card (survit à recalculateAuras)", () => {
    const s = mkState();
    const enemy = mkInstance(mkCard({ name: "Cible", attack: 4, health: 5 }));
    s.players[1].board.push(enemy);
    const next = applyAction(s, play(s, affaiblSpell(2, 3), enemy.instanceId));

    const t = next.players[1].board.find(c => c.card.name === "Cible")!;
    expect(t.currentAttack).toBe(2);   // 4 - 2
    expect(t.currentHealth).toBe(2);   // 5 - 3
    expect(t.maxHealth).toBe(2);
    // La baisse tient après un recalcul d'auras (bakée dans card.attack/health).
    recalculateAuras(next.players[1], next.players[0]);
    const t2 = next.players[1].board.find(c => c.card.name === "Cible")!;
    expect(t2.currentAttack).toBe(2);
  });

  it("PV ≤ 0 → la cible meurt (cimetière)", () => {
    const s = mkState();
    const enemy = mkInstance(mkCard({ name: "Fragile", attack: 4, health: 4 }));
    s.players[1].board.push(enemy);
    const next = applyAction(s, play(s, affaiblSpell(0, 5), enemy.instanceId));
    expect(next.players[1].board.some(c => c.card.name === "Fragile")).toBe(false);
    expect(next.players[1].graveyard.some(c => c.card.name === "Fragile")).toBe(true);
  });

  it("ATK plancher à 0 (jamais négative)", () => {
    const s = mkState();
    const enemy = mkInstance(mkCard({ name: "Cible", attack: 3, health: 6 }));
    s.players[1].board.push(enemy);
    const next = applyAction(s, play(s, affaiblSpell(9, 0), enemy.instanceId));
    expect(next.players[1].board.find(c => c.card.name === "Cible")!.currentAttack).toBe(0);
  });
});

describe("Affaiblissement -X/-Y — créature (invocation)", () => {
  it("cible ennemie choisie reçoit -X/-Y (X/Y via keyword_instances)", () => {
    const s = mkState();
    const enemy = mkInstance(mkCard({ name: "Cible", attack: 5, health: 5 }));
    s.players[1].board.push(enemy);
    const bearer = mkInstance(mkCard({
      name: "Sorcière", mana_cost: 3, attack: 2, health: 2,
      keywords: ["affaiblissement"],
      keyword_instances: [{ id: "affaiblissement", x: 3, y: 2 }],
    }));
    const next = applyAction(s, play(s, bearer, enemy.instanceId));
    const t = next.players[1].board.find(c => c.card.name === "Cible")!;
    expect(t.currentAttack).toBe(2); // 5 - 3
    expect(t.currentHealth).toBe(3); // 5 - 2
  });

  it("aucune créature ennemie → pas de cible, joue sans effet (fizzle, pas de crash)", () => {
    const s = mkState();
    const bearer = mkInstance(mkCard({
      name: "Sorcière", mana_cost: 3, attack: 2, health: 2,
      keywords: ["affaiblissement"],
      keyword_instances: [{ id: "affaiblissement", x: 3, y: 2 }],
    }));
    expect(() => applyAction(s, play(s, bearer))).not.toThrow();
  });
});
