// Renforcement +X/+Y comme capacité de CRÉATURE : la créature se buffe
// elle-même (+X ATK / +Y PV) selon le déclencheur. Buff cuit dans `card` →
// survit à recalculateAuras. (Le sort renforcement, lui, cible un allié.)
import { describe, expect, it } from "vitest";
import { applyAction, recalculateAuras } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameAction } from "./types";

function play(state: ReturnType<typeof mkState>, ci: ReturnType<typeof mkInstance>): GameAction {
  state.players[0].hand.push(ci);
  return { type: "play_card", cardInstanceId: ci.instanceId };
}

describe("Renforcement +X/+Y — créature (self-buff)", () => {
  it("à l'invocation, la créature gagne +X/+Y sur elle-même", () => {
    const s = mkState();
    const c = mkInstance(mkCard({
      name: "Colosse", mana_cost: 3, attack: 2, health: 2,
      keywords: ["renforcement"],
      keyword_instances: [{ id: "renforcement", x: 2, y: 3 }],
    }));
    const next = applyAction(s, play(s, c));
    const onBoard = next.players[0].board.find(u => u.card.name === "Colosse")!;
    expect(onBoard.currentAttack).toBe(4);  // 2 + 2
    expect(onBoard.currentHealth).toBe(5);  // 2 + 3
    expect(onBoard.maxHealth).toBe(5);
  });

  it("le buff est cuit dans card → survit à recalculateAuras", () => {
    const s = mkState();
    const c = mkInstance(mkCard({
      name: "Colosse", mana_cost: 3, attack: 2, health: 2,
      keywords: ["renforcement"],
      keyword_instances: [{ id: "renforcement", x: 3, y: 0 }],
    }));
    const next = applyAction(s, play(s, c));
    recalculateAuras(next.players[0], next.players[1]);
    const onBoard = next.players[0].board.find(u => u.card.name === "Colosse")!;
    expect(onBoard.currentAttack).toBe(5); // 2 + 3, tient après recalcul
  });

  it("sans target requis : joue directement (pas de picker)", () => {
    const s = mkState();
    const c = mkInstance(mkCard({
      name: "Colosse", mana_cost: 3, attack: 1, health: 1,
      keywords: ["renforcement"],
      keyword_instances: [{ id: "renforcement", x: 1, y: 1 }],
    }));
    const next = applyAction(s, play(s, c));
    // La créature est bien arrivée sur le plateau (buffée), pas restée en attente.
    expect(next.players[0].board.some(u => u.card.name === "Colosse")).toBe(true);
  });
});
