// DÉFAUSSE composée (« Pillage ») : l'adversaire défausse X cartes au hasard
// parmi celles de sa main qui satisfont le filtre de pool.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { describeComposedCap } from "./composed-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, ComposedPoolFilter, GameState } from "./types";

function capDefausse(x: number, pool?: ComposedPoolFilter): Capability {
  return {
    uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
    composed: { content: "discard", magnitude: { x }, ...(pool ? { pool } : {}) },
  } as unknown as Capability;
}

function sort(x: number, pool?: ComposedPoolFilter): CardInstance {
  return mkInstance(mkCard({
    name: "Le Pillard", card_type: "spell", attack: null, health: null,
    capabilities: [capDefausse(x, pool)] as never,
  }));
}

const unite = (nom: string, cout: number) => mkInstance(mkCard({ name: nom, mana_cost: cout, attack: 1, health: 1 }));
const action = (nom: string, cout: number) => mkInstance(mkCard({ name: nom, mana_cost: cout, card_type: "spell", attack: null, health: null }));
const objet = (nom: string, cout: number) => mkInstance(mkCard({ name: nom, mana_cost: cout, card_type: "item", attack: null, health: null }));

function lancer(mainAdverse: CardInstance[], x: number, pool?: ComposedPoolFilter, mainLanceur: CardInstance[] = []): GameState {
  const s = mkState();
  s.players[1].hand = mainAdverse;
  s.players[0].hand = mainLanceur;
  const carte = sort(x, pool);
  s.players[0].hand.push(carte);
  return applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId });
}

const noms = (l: CardInstance[]) => l.map(c => c.card.name).sort();

describe("défausse composée", () => {
  it("frappe la main de l'ADVERSAIRE, jamais celle du lanceur", () => {
    const s = lancer([unite("Ennemie", 2)], 1, undefined, [unite("Alliée", 2)]);
    expect(noms(s.players[1].graveyard)).toEqual(["Ennemie"]);
    expect(noms(s.players[0].hand)).toEqual(["Alliée"]);
  });

  it.each([
    ["creature", "U"], ["spell", "A"], ["item", "O"],
  ] as const)("filtre par type %s", (cardType, attendu) => {
    const s = lancer([unite("U", 2), action("A", 2), objet("O", 2)], 3, { cardType });
    expect(noms(s.players[1].graveyard)).toEqual([attendu]);
    expect(s.players[1].hand).toHaveLength(2);
  });

  it("respecte le coût minimum, borne incluse", () => {
    const s = lancer([unite("Deux", 2), unite("Trois", 3), unite("Cinq", 5)], 3, { minCost: 3 });
    expect(noms(s.players[1].graveyard)).toEqual(["Cinq", "Trois"]);
    expect(noms(s.players[1].hand)).toEqual(["Deux"]);
  });

  it("cumule type et coût minimum", () => {
    const s = lancer([unite("U5", 5), action("A5", 5), action("A1", 1)], 3, { cardType: "spell", minCost: 4 });
    expect(noms(s.players[1].graveyard)).toEqual(["A5"]);
  });

  it("ne défausse rien si aucune carte ne répond", () => {
    const s = lancer([unite("Petite", 1)], 2, { minCost: 4 });
    expect(s.players[1].graveyard).toHaveLength(0);
    expect(s.players[1].hand).toHaveLength(1);
  });

  it("annonce le filtre sur la carte", () => {
    const texte = describeComposedCap(capDefausse(2, { cardType: "spell", minCost: 3 }));
    expect(texte.toLowerCase()).toContain("l'adversaire défausse 2 cartes de type action de coût 3 ou plus au hasard");
  });
});
