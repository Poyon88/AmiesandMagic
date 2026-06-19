// Richesse X : mot-clé créature réactif. Chaque fois qu'un joueur défausse une
// carte (main → cimetière), toute créature en jeu portant Richesse gagne +X/+X
// permanent. Couvre les différentes sources de défausse (Pillage, coût de
// défausse) et la portée « les deux plateaux ».
import { describe, expect, it } from "vitest";
import { playCard } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";

function fillHand(state: ReturnType<typeof mkState>, idx: number, n: number) {
  for (let i = 0; i < n; i++) state.players[idx].hand.push(mkInstance(mkCard({ name: `H${i}` })));
}

describe("Richesse X", () => {
  it("gagne +X/+X quand l'adversaire défausse une carte (Pillage 1)", () => {
    const s = mkState();
    const rich = mkInstance(mkCard({ attack: 3, health: 3, keywords: ["richesse"], effect_text: "[Richesse 2]" }));
    s.players[0].board.push(rich);
    fillHand(s, 1, 3);
    const pillager = mkInstance(mkCard({ mana_cost: 0, keywords: ["pillage"], effect_text: "[Pillage 1]" }));
    s.players[0].hand.push(pillager);

    const next = playCard(s, { type: "play_card", cardInstanceId: pillager.instanceId });
    const r = next.players[0].board.find((c) => c.instanceId === rich.instanceId)!;
    expect(r.currentAttack).toBe(5); // 3 + 2
    expect(r.currentHealth).toBe(5);
    expect(r.maxHealth).toBe(5);
  });

  it("se déclenche une fois PAR carte défaussée (Pillage 3 → +X trois fois)", () => {
    const s = mkState();
    const rich = mkInstance(mkCard({ attack: 3, health: 3, keywords: ["richesse"], effect_text: "[Richesse 2]" }));
    s.players[0].board.push(rich);
    fillHand(s, 1, 3);
    const pillager = mkInstance(mkCard({ mana_cost: 0, keywords: ["pillage"], effect_text: "[Pillage 3]" }));
    s.players[0].hand.push(pillager);

    const next = playCard(s, { type: "play_card", cardInstanceId: pillager.instanceId });
    const r = next.players[0].board.find((c) => c.instanceId === rich.instanceId)!;
    expect(r.currentAttack).toBe(9); // 3 + 3×2
    expect(r.currentHealth).toBe(9);
  });

  it("profite à TOUTE créature Richesse, sur les deux plateaux", () => {
    const s = mkState();
    const r0 = mkInstance(mkCard({ attack: 2, health: 2, keywords: ["richesse"], effect_text: "[Richesse 1]" }));
    const r1 = mkInstance(mkCard({ attack: 2, health: 2, keywords: ["richesse"], effect_text: "[Richesse 1]" }));
    s.players[0].board.push(r0);
    s.players[1].board.push(r1);
    fillHand(s, 1, 2);
    const pillager = mkInstance(mkCard({ mana_cost: 0, keywords: ["pillage"], effect_text: "[Pillage 1]" }));
    s.players[0].hand.push(pillager);

    const next = playCard(s, { type: "play_card", cardInstanceId: pillager.instanceId });
    expect(next.players[0].board.find((c) => c.instanceId === r0.instanceId)!.currentAttack).toBe(3);
    expect(next.players[1].board.find((c) => c.instanceId === r1.instanceId)!.currentAttack).toBe(3);
  });

  it("se déclenche aussi sur une défausse via coût de défausse", () => {
    const s = mkState();
    const rich = mkInstance(mkCard({ attack: 3, health: 3, keywords: ["richesse"], effect_text: "[Richesse 2]" }));
    s.players[0].board.push(rich);
    const spell = mkInstance(mkCard({ mana_cost: 0, discard_cost: 1, card_type: "spell", attack: null, health: null }));
    const fodder = mkInstance(mkCard({ name: "fodder" }));
    s.players[0].hand.push(spell, fodder);

    const next = playCard(s, {
      type: "play_card",
      cardInstanceId: spell.instanceId,
      discardInstanceIds: [fodder.instanceId],
    });
    const r = next.players[0].board.find((c) => c.instanceId === rich.instanceId)!;
    expect(r.currentAttack).toBe(5); // 3 + 2
    expect(r.currentHealth).toBe(5);
  });

  it("ne gagne rien sans défausse", () => {
    const s = mkState();
    const rich = mkInstance(mkCard({ attack: 3, health: 3, keywords: ["richesse"], effect_text: "[Richesse 2]" }));
    s.players[0].board.push(rich);
    fillHand(s, 1, 3);
    const noop = mkInstance(mkCard({ mana_cost: 0, card_type: "spell", attack: null, health: null }));
    s.players[0].hand.push(noop);

    const next = playCard(s, { type: "play_card", cardInstanceId: noop.instanceId });
    expect(next.players[0].board.find((c) => c.instanceId === rich.instanceId)!.currentAttack).toBe(3);
  });
});
