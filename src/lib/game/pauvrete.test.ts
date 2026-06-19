// Pauvreté X : une unité dotée de ce mot-clé perd autant de Force (ATK) que
// le nombre de cartes en main de l'adversaire. X est dynamique (recalculé
// dans recalculateAuras), clampé à 0, comme Terreur.
import { describe, expect, it } from "vitest";
import { playCard } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";

function fillHand(state: ReturnType<typeof mkState>, idx: number, n: number) {
  for (let i = 0; i < n; i++) state.players[idx].hand.push(mkInstance(mkCard({ name: `H${i}` })));
}

/** Joue un sort neutre depuis le joueur 0 pour déclencher recalculateAuras. */
function triggerRecalc(state: ReturnType<typeof mkState>) {
  const noop = mkInstance(mkCard({ mana_cost: 0, card_type: "spell", attack: null, health: null }));
  state.players[0].hand.push(noop);
  return playCard(state, { type: "play_card", cardInstanceId: noop.instanceId });
}

describe("Pauvreté X", () => {
  it("réduit l'ATK du nombre de cartes en main de l'adversaire", () => {
    const s = mkState();
    const poor = mkInstance(mkCard({ attack: 5, health: 5, keywords: ["pauvrete"] }));
    s.players[0].board.push(poor);
    fillHand(s, 1, 3); // adversaire : 3 cartes

    const next = triggerRecalc(s);
    const p = next.players[0].board.find((c) => c.instanceId === poor.instanceId)!;
    expect(p.currentAttack).toBe(2); // 5 − 3
  });

  it("clampe l'ATK à 0 quand la main adverse dépasse la Force", () => {
    const s = mkState();
    const poor = mkInstance(mkCard({ attack: 2, health: 5, keywords: ["pauvrete"] }));
    s.players[0].board.push(poor);
    fillHand(s, 1, 5);

    const next = triggerRecalc(s);
    const p = next.players[0].board.find((c) => c.instanceId === poor.instanceId)!;
    expect(p.currentAttack).toBe(0); // max(0, 2 − 5)
  });

  it("est dynamique : l'ATK remonte quand la main adverse diminue", () => {
    const s = mkState();
    const poor = mkInstance(mkCard({ attack: 5, health: 5, keywords: ["pauvrete"] }));
    s.players[0].board.push(poor);
    fillHand(s, 1, 3);

    const afterFull = triggerRecalc(s);
    expect(afterFull.players[0].board[0].currentAttack).toBe(2); // 5 − 3

    // L'adversaire vide une partie de sa main → la pénalité diminue.
    afterFull.players[1].hand.splice(0, 2); // reste 1 carte
    const afterEmpty = triggerRecalc(afterFull);
    expect(afterEmpty.players[0].board[0].currentAttack).toBe(4); // 5 − 1
  });

  it("n'affecte pas une unité sans le mot-clé", () => {
    const s = mkState();
    const plain = mkInstance(mkCard({ attack: 5, health: 5 }));
    s.players[0].board.push(plain);
    fillHand(s, 1, 3);

    const next = triggerRecalc(s);
    expect(next.players[0].board.find((c) => c.instanceId === plain.instanceId)!.currentAttack).toBe(5);
  });
});
