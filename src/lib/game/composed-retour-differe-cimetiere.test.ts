// RETOUR DIFFÉRÉ composé sur le CIMETIÈRE : « place les unités alliées du
// cimetière sous le deck de leur propriétaire ». L'effet ne connaissait que le
// plateau : visé sur le cimetière, il ne faisait rien (« La Grande Traversée »,
// dont le second effet restait sans suite).
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { describeComposedCap } from "./composed-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, ComposedEffect, GameAction, GameState } from "./types";

const cap = (uid: string, composed: ComposedEffect): Capability =>
  ({ uid, trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", position: 0, targets: [], composed }) as Capability;
const DETRUIRE: ComposedEffect = { content: "destroy", target: { side: "any", count: "all", entity: "unit", location: "board", designation: "automatic" } };
const SOUS_LE_DECK = (side: "ally" | "enemy" | "any" = "ally", maxCost?: number): ComposedEffect =>
  ({ content: "retour_differe", target: { side, count: "all", entity: "unit", location: "graveyard", designation: "automatic", ...(maxCost != null ? { maxCost } : {}) } });
const unite = (name: string, mana_cost = 2) => mkInstance(mkCard({ name, mana_cost, attack: 1, health: 2 }));
const action = (caps: Capability[]) => mkInstance(mkCard({ name: "Traversée", card_type: "spell", mana_cost: 0, attack: null, health: null, capabilities: caps }));

function etat(): GameState {
  const s = mkState();
  s.players[0].mana = 10;
  s.players[0].deck.push(unite("Dessus"));
  return s;
}
function jouer(s: GameState, carte = action([cap("cx_1", SOUS_LE_DECK())])): GameState {
  s.players[0].hand.push(carte);
  return applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId } as GameAction);
}
const noms = (zone: { card: { name: string } }[]) => zone.map((c) => c.card.name);

describe("Retour différé composé — cimetière", () => {
  it("les unités alliées du cimetière passent SOUS le deck ; les actions restent au cimetière", () => {
    const s = etat();
    const sortMort = mkInstance(mkCard({ name: "Vieille action", card_type: "spell", mana_cost: 1, attack: null, health: null }));
    s.players[0].graveyard.push(unite("Spectre"), sortMort, unite("Lanterne"));
    const st = jouer(s);
    expect(noms(st.players[0].deck)).toEqual(["Dessus", "Spectre", "Lanterne"]);
    expect(noms(st.players[0].graveyard)).toEqual(["Vieille action", "Traversée"]);
  });

  it("« alliées » : le cimetière adverse n'est pas touché ; « les deux camps » : chacun dans SON deck", () => {
    const s = etat();
    s.players[0].graveyard.push(unite("Mienne"));
    s.players[1].graveyard.push(unite("Sienne"));
    expect(noms(jouer(structuredClone(s)).players[1].graveyard)).toEqual(["Sienne"]);
    const st = jouer(s, action([cap("cx_1", SOUS_LE_DECK("any"))]));
    expect(noms(st.players[0].deck)).toContain("Mienne");
    expect(noms(st.players[1].deck)).toEqual(["Sienne"]);
    expect(noms(st.players[1].graveyard)).toEqual([]);
  });

  it("filtre de coût maximum respecté", () => {
    const s = etat();
    s.players[0].graveyard.push(unite("Petite", 2), unite("Grosse", 7));
    const st = jouer(s, action([cap("cx_1", SOUS_LE_DECK("ally", 3))]));
    expect(noms(st.players[0].deck)).toEqual(["Dessus", "Petite"]);
    expect(noms(st.players[0].graveyard)).toContain("Grosse");
  });

  it("La Grande Traversée : détruit toutes les unités, PUIS place les alliées mortes sous le deck", () => {
    const s = etat();
    s.players[0].board.push(unite("Alliée"));
    s.players[1].board.push(unite("Ennemie"));
    s.players[0].graveyard.push(unite("Déjà morte"));
    const st = jouer(s, action([cap("cx_0", DETRUIRE), cap("cx_1", SOUS_LE_DECK())]));
    expect(st.players[0].board).toHaveLength(0);
    expect(st.players[1].board).toHaveLength(0);
    expect(noms(st.players[0].deck).sort()).toEqual(["Alliée", "Dessus", "Déjà morte"].sort());
    expect(noms(st.players[0].graveyard)).toEqual(["Traversée"]);
    expect(noms(st.players[1].graveyard)).toEqual(["Ennemie"]);
  });

  it("le texte de la carte correspond à ce qu'elle fait", () => {
    expect(describeComposedCap(cap("cx_1", SOUS_LE_DECK()))).toContain("cimetière");
  });
});
