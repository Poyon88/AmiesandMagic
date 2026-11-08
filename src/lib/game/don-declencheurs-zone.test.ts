// Don d'une capacité CURÉE avec un déclencheur de ZONE (en main, au cimetière)
// ou un Retard X dont le décompte démarre au don.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { grantTriggersFor } from "./abilities";
import { describeComposedCap } from "./composed-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CapabilityTrigger, CardInstance, ComposedEffect, GameAction, GameState, TargetSpec } from "./types";

const don = (trigger: CapabilityTrigger, location: TargetSpec["location"], extra: Partial<ComposedEffect> = {}): Capability => ({
  uid: "cx_d", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
  composed: {
    content: "grant_keyword", grantAbilityId: "canon", grantTrigger: trigger, magnitude: { x: 2 },
    target: { entity: "unit", side: "ally", count: "all", location, designation: "automatic" }, ...extra,
  },
});
const sort = (c: Capability) => mkInstance(mkCard({ name: "Don", card_type: "spell", mana_cost: 0, attack: null, health: null, keywords: [], capabilities: [c] as never }));
const porteuse = () => mkInstance(mkCard({ name: "Porteuse", mana_cost: 2, attack: 1, health: 3 }));
const cible = () => mkInstance(mkCard({ name: "Cible", mana_cost: 2, attack: 0, health: 20 }));

function etat(): GameState {
  const s = mkState();
  for (const p of s.players) for (let i = 0; i < 6; i++) p.deck.push(mkInstance(mkCard({ name: `Pioche ${i}`, mana_cost: 9 })));
  s.players[1].board.push(cible());
  return s;
}
const lancer = (s: GameState, c: CardInstance) => {
  s.players[0].hand.push(c);
  return applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as GameAction);
};
const pvCible = (s: GameState) => s.players[1].board[0].currentHealth;

describe("déclencheurs proposés au don", () => {
  it("zones + Retard pour une curée multi-déclencheurs ; pas de zone hors plateau pour une « sur plateau »", () => {
    const l = grantTriggersFor("canon", "board");
    expect(l).toEqual(expect.arrayContaining(["on_end_of_turn_in_hand", "on_start_of_turn_in_hand", "on_end_of_turn_in_graveyard", "on_delay"]));
    const surPlateau = grantTriggersFor("sacrifice", "board");
    expect(surPlateau).toContain("on_delay");
    expect(surPlateau).not.toContain("on_end_of_turn_in_hand");
  });
});

describe("le don part depuis sa zone", () => {
  it("fin de tour, EN MAIN : Canon conféré à une carte en main tire à chaque fin de tour", () => {
    const s = etat();
    s.players[0].hand.push(porteuse());
    let st = lancer(s, sort(don("on_end_of_turn_in_hand", "hand")));
    const pv0 = pvCible(st);
    st = applyAction(st, { type: "end_turn" } as GameAction);
    expect(pvCible(st)).toBe(pv0 - 2);
  });

  it("début de tour, EN MAIN", () => {
    const s = etat();
    s.players[0].hand.push(porteuse());
    let st = lancer(s, sort(don("on_start_of_turn_in_hand", "hand")));
    const pv0 = pvCible(st);
    st = applyAction(st, { type: "end_turn" } as GameAction); // tour adverse : rien
    expect(pvCible(st)).toBe(pv0);
    st = applyAction(st, { type: "end_turn" } as GameAction); // début de mon tour
    expect(pvCible(st)).toBe(pv0 - 2);
  });

  it("fin de tour, AU CIMETIÈRE", () => {
    const s = etat();
    s.players[0].graveyard.push(porteuse());
    let st = lancer(s, sort(don("on_end_of_turn_in_graveyard", "graveyard")));
    const pv0 = pvCible(st);
    st = applyAction(st, { type: "end_turn" } as GameAction);
    expect(pvCible(st)).toBe(pv0 - 2);
  });

  it("une capacité « en main » ne part pas depuis le plateau", () => {
    const s = etat();
    s.players[0].board.push(porteuse());
    let st = lancer(s, sort(don("on_end_of_turn_in_hand", "board")));
    const pv0 = pvCible(st);
    st = applyAction(st, { type: "end_turn" } as GameAction);
    expect(pvCible(st)).toBe(pv0);
  });
});

describe("Retard X conféré", () => {
  it("démarre au don : part au début du X-ième tour suivant, une seule fois", () => {
    const s = etat();
    s.players[0].board.push(porteuse());
    let st = lancer(s, sort(don("on_delay", "board", { grantDelay: 1 })));
    const pv0 = pvCible(st);
    st = applyAction(st, { type: "end_turn" } as GameAction);
    expect(pvCible(st)).toBe(pv0);
    st = applyAction(st, { type: "end_turn" } as GameAction); // début de mon tour : Retard 1
    expect(pvCible(st)).toBe(pv0 - 2);
    st = applyAction(applyAction(st, { type: "end_turn" } as GameAction), { type: "end_turn" } as GameAction);
    expect(pvCible(st)).toBe(pv0 - 2);
  });

  it("le texte annonce le délai", () => {
    expect(describeComposedCap(don("on_delay", "board", { grantDelay: 2 }))).toMatch(/dans 2 tour/);
  });
});
