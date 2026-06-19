// Pillage X : l'adversaire défausse X cartes aléatoires de sa main.
// Couvre les deux faces (créature à l'invocation + sort) et le clamp quand
// la main adverse contient moins de X cartes.
import { describe, expect, it } from "vitest";
import { playCard } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";

/** Remplit la main du joueur `idx` de `n` cartes neutres. */
function fillHand(state: ReturnType<typeof mkState>, idx: number, n: number) {
  for (let i = 0; i < n; i++) state.players[idx].hand.push(mkInstance(mkCard({ name: `H${i}` })));
}

describe("Pillage X — créature (à l'invocation)", () => {
  it("défausse X cartes de la main adverse vers son cimetière", () => {
    const s = mkState();
    fillHand(s, 1, 3); // adversaire : 3 cartes
    const inst = mkInstance(mkCard({ mana_cost: 0, keywords: ["pillage"], effect_text: "[Pillage 2]" }));
    s.players[0].hand.push(inst);

    const next = playCard(s, { type: "play_card", cardInstanceId: inst.instanceId });

    expect(next.players[1].hand.length).toBe(1);
    expect(next.players[1].graveyard.length).toBe(2);
  });

  it("clampe à la taille de la main quand X la dépasse", () => {
    const s = mkState();
    fillHand(s, 1, 1); // adversaire : 1 seule carte
    const inst = mkInstance(mkCard({ mana_cost: 0, keywords: ["pillage"], effect_text: "[Pillage 3]" }));
    s.players[0].hand.push(inst);

    const next = playCard(s, { type: "play_card", cardInstanceId: inst.instanceId });

    expect(next.players[1].hand.length).toBe(0);
    expect(next.players[1].graveyard.length).toBe(1);
  });
});

describe("Pillage X — sort", () => {
  it("défausse X cartes de la main adverse au lancement", () => {
    const s = mkState();
    fillHand(s, 1, 3);
    const spell = mkInstance(mkCard({
      mana_cost: 0, card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "pillage", amount: 2 }],
    }));
    s.players[0].hand.push(spell);

    const next = playCard(s, { type: "play_card", cardInstanceId: spell.instanceId });

    expect(next.players[1].hand.length).toBe(1);
    expect(next.players[1].graveyard.length).toBe(2);
  });
});
