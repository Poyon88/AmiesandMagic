// L'orbite du héros fait PULSER un emblème quand il agit. Rien dans l'état ne
// le dit (un emblème qui parle ne change pas l'emblème) : le moteur publie
// donc un registre transitoire, `emblemFireEvents`, HORS du hash de synchro.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { syncHash } from "./stateHash";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, GameState } from "./types";

function avecEmblemeFinDeTour(): GameState {
  const s = mkState();
  s.players[0].emblems = [{
    stacks: 2,
    composed: {
      content: "deal_damage", magnitude: { x: 1 },
      target: { entity: "unit", count: "all", side: "enemy", location: "board", designation: "automatic" },
    } as never,
  }];
  s.players[1].board.push(mkInstance(mkCard({ name: "Cible", attack: 1, health: 9 })));
  return s;
}

describe("emblemFireEvents", () => {
  it("un emblème de fin de tour qui agit est publié, UNE fois quelle que soit sa pile", () => {
    const st = applyAction(avecEmblemeFinDeTour(), { type: "end_turn" });
    expect(st.players[1].board[0].currentHealth).toBe(7); // 2 piles × 1
    expect(st.emblemFireEvents).toEqual([{ ownerId: st.players[0].id, emblemIndex: 0 }]);
  });

  it("n'entre pas dans le hash de synchro", () => {
    const st = applyAction(avecEmblemeFinDeTour(), { type: "end_turn" });
    const sans = { ...st, emblemFireEvents: undefined };
    expect(syncHash(st)).toBe(syncHash(sans));
  });

  it("une action où aucun emblème n'agit ne publie rien", () => {
    const s = mkState();
    const st = applyAction(s, { type: "end_turn" });
    expect(st.emblemFireEvents).toBeUndefined();
  });

  it("une MALÉDICTION (posée chez l'adversaire) est marquée comme telle", () => {
    const caps = [{
      uid: "cx_0", trigger: "on_end_of_turn", effectKind: "emblem", abilityId: "_composed", side: "opponent",
      composed: {
        content: "deal_damage", magnitude: { x: 1 },
        target: { entity: "unit", count: "all", side: "ally", location: "board", designation: "automatic" },
      },
    }, {
      uid: "cx_1", trigger: "on_end_of_turn", effectKind: "emblem", abilityId: "_composed",
      composed: {
        content: "heal", magnitude: { x: 1 },
        target: { entity: "hero", count: "one", side: "ally", designation: "automatic" },
      },
    }] as unknown as Capability[];
    const sort = mkInstance(mkCard({ name: "Mauvais œil", card_type: "spell", attack: null, health: null, capabilities: caps as never }));
    const s = mkState();
    s.players[0].hand.push(sort);
    const st = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId });
    expect(st.players[1].emblems[0]?.malediction).toBe(true);
    expect(st.players[0].emblems[0]?.malediction).toBeUndefined();
  });
});
