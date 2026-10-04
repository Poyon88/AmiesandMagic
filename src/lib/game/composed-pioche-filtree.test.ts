// Piocher composé avec filtre de pool complet (type, race, faction, clan,
// mot-clé) : les X premières cartes du deck qui correspondent, dans l'ordre.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { describeComposedCap } from "./composed-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, CardInstance, ComposedEffect, ComposedPoolFilter, GameState } from "./types";

const carte = (name: string, over: Partial<Card> = {}): CardInstance =>
  mkInstance(mkCard({ name, mana_cost: 1, attack: 1, health: 1, ...over }));
const action = (name: string, over: Partial<Card> = {}) => carte(name, { card_type: "spell", attack: null, health: null, ...over });

function piocher(s: GameState, x: number, pool?: ComposedPoolFilter): GameState {
  const caps: Capability[] = [{ uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
    composed: { content: "draw_cards", magnitude: { x }, pool } as ComposedEffect } as Capability];
  const sort = action("Recherche", { capabilities: caps as never });
  s.players[0].hand.push(sort);
  return applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId });
}
const main = (s: GameState) => s.players[0].hand.map((c) => c.card.name);
const deck = (s: GameState) => s.players[0].deck.map((c) => c.card.name);

describe("Piocher filtré", () => {
  it("type action : les deux premières actions, le reste en place", () => {
    const s = mkState();
    s.players[0].deck = [carte("A"), action("Éclair"), carte("B"), action("Soin"), action("Bouclier")];
    const r = piocher(s, 2, { cardType: "spell" });
    expect(main(r)).toEqual(["Éclair", "Soin"]);
    expect(deck(r)).toEqual(["A", "B", "Bouclier"]);
  });
  it("race + mot-clé cumulés", () => {
    const s = mkState();
    s.players[0].deck = [
      carte("Gnome simple", { race: "Gnomes" }),
      carte("Elfe inventeur", { race: "Elfes", keywords: ["invention"] as never }),
      carte("Gnome inventeur", { race: "Gnomes", keywords: ["invention"] as never }),
    ];
    expect(main(piocher(s, 3, { race: "Gnomes", keywordId: "invention" }))).toEqual(["Gnome inventeur"]);
  });
  it("aucune carte ne correspond : rien, et surtout pas de fatigue", () => {
    const s = mkState();
    s.players[0].deck = [carte("A")];
    const pv = s.players[0].hero.hp;
    const r = piocher(s, 2, { clan: "La Guilde des Ingénieurs" });
    expect(main(r)).toEqual([]);
    expect(r.players[0].hero.hp).toBe(pv);
    expect(deck(r)).toEqual(["A"]);
  });
  it("sans filtre : pioche normale du dessus", () => {
    const s = mkState();
    s.players[0].deck = [carte("A"), action("Éclair")];
    expect(main(piocher(s, 1))).toEqual(["A"]);
  });
  it("texte : le filtre suit le nom ; objets seuls gardent leur tournure", () => {
    const cap = (pool?: ComposedPoolFilter, x = 2) => ({ uid: "u", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
      composed: { content: "draw_cards", magnitude: { x }, pool } }) as Capability;
    expect(describeComposedCap(cap({ cardType: "spell", race: "Gnomes" }))).toBe("Piochez 2 cartes de race Gnomes de type action de votre deck.");
    expect(describeComposedCap(cap({ keywordId: "invention" }, 1))).toBe("Piochez 1 carte portant Invention de votre deck.");
    expect(describeComposedCap(cap({ cardType: "item" }))).toBe("Piochez 2 objets de votre deck.");
    expect(describeComposedCap(cap())).toBe("Piochez 2 cartes.");
  });
});
