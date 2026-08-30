// APPEL composé : met en jeu, depuis le DECK, la 1re unité de coût ≤ X qui
// satisfait un filtre de pool.
//
// Généralise le mot-clé « Appel du clan », dont le résolveur curé ne sait viser
// que le clan de sa PROPRE carte (`ctx.card.clan`) — impossible d'écrire « un
// sort qui appelle une unité Elfe » sur une carte qui n'est pas elfe. Ici la
// cible se déclare, et le même contenu marche sur un sort comme sur une
// créature, à n'importe quel déclencheur.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { describeComposedCap } from "./composed-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, ComposedPoolFilter, GameState } from "./types";

function sortAppel(x: number, pool?: ComposedPoolFilter): CardInstance {
  const caps = [{
    uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
    composed: { content: "appel", magnitude: { x }, ...(pool ? { pool } : {}) },
  }] as unknown as Capability[];
  return mkInstance(mkCard({
    name: "Le Cor", card_type: "spell", attack: null, health: null,
    // Le sort n'a NI race NI clan : c'est tout l'intérêt — le mot-clé curé
    // n'aurait rien pu appeler.
    capabilities: caps as never,
  }));
}

const unite = (nom: string, cout: number, p: Record<string, unknown> = {}) =>
  mkInstance(mkCard({ name: nom, mana_cost: cout, attack: 1, health: 1, ...p }));

function lancer(deck: CardInstance[], x: number, pool?: ComposedPoolFilter): GameState {
  const s = mkState();
  s.players[0].deck = deck;
  const sort = sortAppel(x, pool);
  s.players[0].hand.push(sort);
  return applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId });
}

const surPlateau = (s: GameState) => s.players[0].board.map(c => c.card.name);

describe("appel depuis le deck", () => {
  it("met en jeu la 1re unité de coût ≤ X", () => {
    const s = lancer([unite("Chère", 7), unite("Juste", 2), unite("Autre", 1)], 2);
    expect(surPlateau(s)).toEqual(["Juste"]);
    // Elle QUITTE le deck.
    expect(s.players[0].deck.map(c => c.card.name)).toEqual(["Chère", "Autre"]);
  });

  it("filtre par RACE — le cas demandé, sur un sort sans race", () => {
    const s = lancer([
      unite("Nain", 2, { race: "Nains" }),
      unite("Elfe", 2, { race: "Elfes" }),
    ], 2, { race: "Elfes" });
    expect(surPlateau(s)).toEqual(["Elfe"]);
  });

  it("filtre aussi par clan, faction et mot-clé porté", () => {
    expect(surPlateau(lancer([unite("A", 1, { clan: "X" }), unite("B", 1, { clan: "Y" })], 3, { clan: "Y" })))
      .toEqual(["B"]);
    expect(surPlateau(lancer([unite("A", 1, { faction: "Elfes" }), unite("B", 1, { faction: "Nains" })], 3, { faction: "Nains" })))
      .toEqual(["B"]);
    expect(surPlateau(lancer([
      unite("Sans", 1),
      unite("Avec", 1, { keywords: ["taunt"] as never }),
    ], 3, { keywordId: "taunt" }))).toEqual(["Avec"]);
  });

  it("cumule les filtres", () => {
    const s = lancer([
      unite("Elfe cher", 9, { race: "Elfes" }),
      unite("Nain juste", 2, { race: "Nains" }),
      unite("Elfe juste", 2, { race: "Elfes" }),
    ], 2, { race: "Elfes" });
    expect(surPlateau(s)).toEqual(["Elfe juste"]);
  });

  it("n'appelle RIEN quand aucune unité ne convient — sans planter", () => {
    expect(surPlateau(lancer([unite("Trop chère", 9)], 2))).toEqual([]);
    expect(surPlateau(lancer([], 2))).toEqual([]);
    // Un SORT dans le deck n'est jamais appelé.
    expect(surPlateau(lancer([mkInstance(mkCard({ name: "Sort", card_type: "spell", mana_cost: 1, attack: null, health: null }))], 5)))
      .toEqual([]);
  });

  it("l'appelée garde sa Traque — elle n'attaque pas le tour même", () => {
    // Une unité mise en jeu GRATUITEMENT ne doit pas frapper aussitôt ; c'est le
    // garde-fou que porte déjà le chemin curé.
    const s = lancer([unite("Normale", 1)], 2);
    expect(s.players[0].board[0].hasSummoningSickness).toBe(true);
  });

  it("…sauf si elle porte Traque (charge)", () => {
    const s = lancer([unite("Rapide", 1, { keywords: ["charge"] as never })], 2);
    expect(s.players[0].board[0].hasSummoningSickness).toBe(false);
  });
});

describe("texte de carte", () => {
  const cap = (x: number, pool?: ComposedPoolFilter) => ({
    uid: "u", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
    composed: { content: "appel", magnitude: { x }, ...(pool ? { pool } : {}) },
  } as unknown as Capability);

  it("dit le plafond de coût", () => {
    expect(describeComposedCap(cap(2))).toBe("Met en jeu la 1re unité de votre deck de coût ≤ 2.");
  });

  it("accole le filtre de pool", () => {
    expect(describeComposedCap(cap(2, { race: "Elfes" }))).toContain("Elfes");
  });

  it("s'accorde avec une amplitude ALÉATOIRE", () => {
    const c = { ...cap(4), composed: { content: "appel", magnitude: { x: 4, randomX: true } } } as unknown as Capability;
    expect(describeComposedCap(c)).toContain("1 à 4");
  });
});
