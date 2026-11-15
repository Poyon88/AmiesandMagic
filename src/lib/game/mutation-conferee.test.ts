// MUTATION CONFÉRÉE — « confère Mutation 6 aux unités de la main » (Chef-d'œuvre
// anatomique). Le don pose le mot-clé sans capacité, et son X sur l'instance :
// la carte affichait Mutation 6 mais « Muter » n'apparaissait jamais.
import { describe, expect, it } from "vitest";
import { applyAction, canMutate } from "./engine";
import { mutationCapacites, mutationOffer, mutationXInstance } from "./mutation";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, GameAction, GameState } from "./types";

let id = 5000;
const commune = (cout: number, atk: number, pv: number, kw: string) =>
  mkCard({ id: id++, name: `Commune ${id}`, mana_cost: cout, attack: atk, health: pv, rarity: "Commune", card_type: "creature", keywords: [kw] as never } as Partial<Card>);

const DON: Capability = {
  uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", position: 0, targets: [],
  composed: {
    content: "grant_keyword", grantAbilityId: "mutation", grantTrigger: "on_play", magnitude: { x: 6 },
    target: { side: "ally", count: "all", entity: "unit", location: "hand", designation: "automatic" },
  },
} as Capability;

function apresLeDon(): { s: GameState; recue: string; native: string } {
  const s = mkState();
  s.mutationPool = [commune(6, 7, 2, "ranged"), commune(6, 2, 9, "taunt"), commune(6, 4, 4, "charge"), commune(6, 3, 3, "ranged"), commune(9, 9, 9, "taunt")];
  s.players[0].mana = 10;
  // Carte SANS Mutation, avec des capacités déclarées (cas de la Matriarche).
  const simple = mkInstance(mkCard({
    name: "Matriarche", mana_cost: 6, attack: 5, health: 5, keywords: ["taunt"] as never,
    capabilities: [{ uid: "cw_0", trigger: "automatic", effectKind: "immediate", abilityId: "taunt", targets: [] }] as never,
  }));
  // Carte qui porte DÉJÀ Mutation 9 : elle garde la sienne (la plus élevée).
  const native = mkInstance(mkCard({
    name: "Chimère", mana_cost: 9, attack: 8, health: 8, keywords: ["mutation"] as never,
    capabilities: [{ uid: "cw_1", trigger: "on_play", effectKind: "immediate", abilityId: "mutation", params: { x: 9 }, targets: [] }] as never,
  }));
  const sort = mkInstance(mkCard({ name: "Chef-d'œuvre", card_type: "spell", mana_cost: 0, attack: null, health: null, capabilities: [DON] }));
  s.players[0].hand.push(simple, native, sort);
  const st = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId } as GameAction);
  return { s: st, recue: simple.instanceId, native: native.instanceId };
}

describe("Mutation conférée en main", () => {
  it("la carte qui reçoit Mutation 6 peut muter, avec X = 6", () => {
    const { s, recue } = apresLeDon();
    const carte = s.players[0].hand.find((c) => c.instanceId === recue)!;
    expect(mutationXInstance(carte)).toBe(6);
    expect(canMutate(s, recue)).toBe(true);
  });

  it("une Mutation 9 native n'est pas abaissée par le don", () => {
    const { s, native } = apresLeDon();
    expect(mutationXInstance(s.players[0].hand.find((c) => c.instanceId === native)!)).toBe(9);
  });

  it("la mutation se résout : stats des élues, capacités léguées, Mutation consommée", () => {
    const { s, recue } = apresLeDon();
    const a = mutationOffer(s.mutationPool, 6, recue, 1)[0];
    const b = mutationOffer(s.mutationPool, 6, recue, 2, a.id)[0];
    const st = applyAction(s, {
      type: "mutate_card", cardInstanceId: recue,
      creatureIds: [a.id, b.id], capUids: [mutationCapacites(a)[0].uid, mutationCapacites(b)[0].uid],
    } as GameAction);
    const carte = st.players[0].hand.find((c) => c.instanceId === recue)!;
    expect(carte.currentAttack).toBe(Math.max(a.attack!, b.attack!));
    expect(carte.currentHealth).toBe(Math.max(a.health!, b.health!));
    expect(carte.card.keywords).not.toContain("mutation");
    expect(carte.card.keywords).toContain("taunt");
    expect(canMutate(st, recue)).toBe(false);
    expect(mutationXInstance(carte)).toBe(0);
  });
});
