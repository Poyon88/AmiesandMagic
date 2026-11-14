// Sort fait d'effets COMPOSÉS : les morts (et leurs râles) se règlent après
// CHAQUE effet, comme après chaque mécanique curée — règle arbitrée le
// 2026-11-02. Avant, elles n'étaient réglées qu'après tous les composés : le
// 2e effet travaillait sur un plateau encore jonché de cadavres à 0 PV, et le
// râle de la victime du 1er effet partait après le 2e.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, ComposedEffect } from "./types";

const cap = (uid: string, trigger: string, composed: ComposedEffect): Capability =>
  ({ uid, trigger, effectKind: "immediate", abilityId: "_composed", composed, targets: [] }) as unknown as Capability;
const aToutes = (x: number): ComposedEffect =>
  ({ target: { side: "enemy", count: "all", entity: "unit", location: "board", designation: "automatic" }, content: "deal_damage", magnitude: { x } }) as unknown as ComposedEffect;
const auHerosEnnemi = (x: number): ComposedEffect =>
  ({ target: { side: "enemy", count: 1, entity: "hero", location: "board", designation: "automatic" }, content: "deal_damage", magnitude: { x } }) as unknown as ComposedEffect;

function partie() {
  const s = mkState();
  s.players[0].mana = 10;
  s.players[1].board = [
    // Râle : 3 au héros du lanceur — un témoin lisible du MOMENT du râle.
    mkInstance(mkCard({ name: "Frêle", attack: 1, health: 2, capabilities: [cap("r0", "on_death", auHerosEnnemi(3))] })),
    mkInstance(mkCard({ name: "Robuste", attack: 1, health: 9 })),
  ];
  const sort = mkInstance(mkCard({
    name: "Double salve", card_type: "spell", attack: null, health: null, mana_cost: 1,
    capabilities: [cap("s0", "spell_resolution", aToutes(2)), cap("s1", "spell_resolution", aToutes(3))],
  }));
  s.players[0].hand = [sort];
  return { s, sort };
}

describe("sort à effets composés — morts réglées après chaque effet", () => {
  it("la victime du 1er effet est morte, et son râle a frappé, AVANT le 2e effet", () => {
    const { s, sort } = partie();
    const st = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId });

    // Un instantané montre Frêle au cimetière, son râle résolu (héros à 27),
    // et Robuste n'ayant encore pris que le 1er effet (9 − 2 = 7).
    const entreDeux = (st.animationCheckpoints ?? []).find((c) => {
      const p1 = c.state.players[1];
      return !p1.board.some((u) => u.card.name === "Frêle")
        && p1.board.find((u) => u.card.name === "Robuste")?.currentHealth === 7
        && c.state.players[0].hero.hp === 27;
    });
    expect(entreDeux).toBeDefined();

    // État final : les deux effets sont passés, le râle une seule fois.
    expect(st.players[1].board.find((u) => u.card.name === "Robuste")?.currentHealth).toBe(4);
    expect(st.players[0].hero.hp).toBe(27);
    expect(st.players[1].graveyard.some((u) => u.card.name === "Frêle")).toBe(true);
  });
});
