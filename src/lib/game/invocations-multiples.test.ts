// « Invocations multiples » : une Invocation par coût listé, dans l'ordre.
// Même famille que Convocations multiples (plusieurs corps d'un coup), mais on
// y saisit des COÛTS et ce sont de vraies cartes de la collection, tirées au
// hasard au coût EXACT — pas des tokens configurés.
//
// La liste vit dans keyword_instances (créature) / spell_keywords (sort) :
// deux colonnes JSONB déjà existantes, donc aucune migration.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, CardInstance, GameState } from "./types";

function poolCreature(name: string, mana: number, over: Partial<Card> = {}): Card {
  return mkCard({ name, faction: "Mercenaires", rarity: "Commune", mana_cost: mana, attack: 1, health: 1, ...over });
}

/** Sort porteur du mot-clé, tel que la forge l'enregistre. */
function spell(costs: number[], restrict: { race?: string; faction?: string } = {}): CardInstance {
  return mkInstance(mkCard({
    name: "Grand Appel", card_type: "spell", attack: null, health: null,
    spell_keywords: [{ id: "invocations_multiples", costs, ...restrict }] as never,
  }));
}

/** Créature porteuse du mot-clé (effet à l'entrée en jeu). */
function creature(costs: number[]): CardInstance {
  return mkInstance(mkCard({
    name: "Grand Invocateur", mana_cost: 5, attack: 1, health: 1,
    keywords: ["invocations_multiples"] as never,
    keyword_instances: [{ id: "invocations_multiples", costs }] as never,
  }));
}

function play(s: GameState, ci: CardInstance): GameState {
  s.players[0].hand.push(ci);
  return applyAction(s, { type: "play_card", cardInstanceId: ci.instanceId });
}

const summonedNames = (s: GameState, exclude: string) =>
  s.players[0].board.filter((c) => c.card.name !== exclude).map((c) => c.card.name).sort();

describe("Invocations multiples", () => {
  it("invoque une créature par coût listé, au coût EXACT", () => {
    const s = mkState();
    s.factionCardPool = [poolCreature("Recrue", 1), poolCreature("Vétéran", 3), poolCreature("Champion", 5)];

    const next = play(s, spell([1, 3]));

    expect(summonedNames(next, "Grand Appel")).toEqual(["Recrue", "Vétéran"]);
  });

  it("un coût sans candidat est sauté sans bloquer les suivants", () => {
    const s = mkState();
    s.factionCardPool = [poolCreature("Recrue", 1)];

    const next = play(s, spell([9, 1]));

    expect(summonedNames(next, "Grand Appel")).toEqual(["Recrue"]);
  });

  it("le même coût listé deux fois invoque deux créatures", () => {
    const s = mkState();
    s.factionCardPool = [poolCreature("Recrue", 2)];

    const next = play(s, spell([2, 2]));

    expect(summonedNames(next, "Grand Appel")).toEqual(["Recrue", "Recrue"]);
  });

  it("fonctionne aussi à l'entrée en jeu d'une créature", () => {
    const s = mkState();
    s.factionCardPool = [poolCreature("Recrue", 1), poolCreature("Vétéran", 4)];

    const next = play(s, creature([1, 4]));

    expect(summonedNames(next, "Grand Invocateur")).toEqual(["Recrue", "Vétéran"]);
  });

  it("restreint le pool à une RACE, hors alignement de la carte", () => {
    const s = mkState();
    s.factionCardPool = [
      poolCreature("Loup", 2, { race: "Loups", faction: "La Meute" }),
      poolCreature("Nain", 2, { race: "Nains", faction: "Mercenaires" }),
    ];

    const next = play(s, spell([2, 2], { race: "Loups" }));

    expect(summonedNames(next, "Grand Appel")).toEqual(["Loup", "Loup"]);
  });

  it("restreint le pool à une FACTION", () => {
    const s = mkState();
    s.factionCardPool = [
      poolCreature("Meutard", 2, { faction: "La Meute" }),
      poolCreature("Merco", 2, { faction: "Mercenaires" }),
    ];

    const next = play(s, spell([2], { faction: "La Meute" }));

    expect(summonedNames(next, "Grand Appel")).toEqual(["Meutard"]);
  });

  it("sans race ni faction : repli sur l'alignement (comportement d'Invocation X)", () => {
    const s = mkState();
    s.factionCardPool = [
      poolCreature("Merco", 2, { faction: "Mercenaires" }),
      // Faction hors du repli d'alignement (deck vide + Mercenaires) → exclue.
      poolCreature("Meutard", 2, { faction: "La Meute" }),
    ];

    const next = play(s, spell([2]));

    expect(summonedNames(next, "Grand Appel")).toEqual(["Merco"]);
  });

  it("sans coût configuré : aucune invocation, aucune erreur", () => {
    const s = mkState();
    s.factionCardPool = [poolCreature("Recrue", 1)];

    const next = play(s, spell([]));

    expect(summonedNames(next, "Grand Appel")).toEqual([]);
  });
});
