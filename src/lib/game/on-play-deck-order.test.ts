// Les effets « deck » d'une entrée en jeu suivent l'ordre COMPOSÉ PAR L'AUTEUR.
//
// Deux symptômes signalés en partie sur « Devin du Ciel Fendu »
// (Divination · Préincanter 2 · Inspiration 1) :
//   1. la carte choisie par Divination n'était pas celle qu'on piochait ;
//   2. Préincanter ne réduisait jamais le sort que Divination venait de remonter.
//
// Même cause : ces effets étaient résolus par des `if` DISPERSÉS dans
// `applyAction`, donc dans l'ordre du FICHIER — Inspiration, puis Préincanter,
// puis Divination — quel que soit l'ordre de la carte. On piochait donc avant
// d'avoir trié, et on réduisait le sort d'avant.
//
// Ordonner les `capabilities` ne suffisait pas : ce chemin ne les itère pas.
// D'où la passe unique `onPlayDeckEffectsInOrder`.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, GameState, KeywordInstance } from "./types";

/** Devin du Ciel Fendu, avec l'ordre d'auteur passé en paramètre. */
function devin(ordre: string[] = ["divination", "preincanter", "inspiration"]) {
  return mkInstance(mkCard({
    name: "Devin du Ciel Fendu", mana_cost: 3, attack: 2, health: 1,
    effect_text: "[Inspiration 1]",
    keywords: ordre as never,
    keyword_instances: [
      { id: "preincanter", x: 2 },
      { id: "inspiration", x: 1 },
    ] as unknown as KeywordInstance[],
    capabilities: [
      { uid: "cw_0", params: { x: 2 }, targets: [], trigger: "on_play", abilityId: "preincanter", effectKind: "immediate" },
      { uid: "cw_1", params: { x: 1 }, targets: [], trigger: "on_play", abilityId: "inspiration", effectKind: "immediate" },
      { uid: "cw_2", targets: [], trigger: "on_play", abilityId: "divination", effectKind: "immediate" },
    ] as unknown as Capability[],
  }));
}

/** Deck dont les 3 premières cartes sont reconnaissables ; la 3ᵉ est un SORT à
 *  3 mana, cible désignée de Divination puis de Préincanter. */
function table(): GameState {
  const s = mkState();
  s.players[0].id = "MOI";
  s.players[0].deck = [
    mkInstance(mkCard({ name: "Louve", attack: 2, health: 1 })),
    mkInstance(mkCard({ name: "Cavalier", attack: 3, health: 3 })),
    mkInstance(mkCard({ name: "Chasse sous la Lune", card_type: "spell", attack: null, health: null, mana_cost: 3 })),
    mkInstance(mkCard({ name: "Fond1" })),
    mkInstance(mkCard({ name: "Fond2" })),
  ];
  s.players[0].mana = 10;
  return s;
}

/** Joue le Devin en choisissant la carte d'index `choix` parmi les 3 révélées. */
function jouer(s: GameState, carte: ReturnType<typeof devin>, choix: number) {
  s.players[0].hand.push(carte);
  return applyAction(s, {
    type: "play_card", cardInstanceId: carte.instanceId, divinationChoiceIndex: choix,
  });
}

describe("Divination puis Inspiration — on pioche bien la carte choisie", () => {
  it("choisir la 3ᵉ révélée : c'est ELLE qui arrive en main", () => {
    const st = jouer(table(), devin(), 2);
    expect(st.players[0].hand.map((c) => c.card.name)).toContain("Chasse sous la Lune");
    // …et surtout pas la carte qui était sur le dessus avant le tri.
    expect(st.players[0].hand.map((c) => c.card.name)).not.toContain("Louve");
  });

  it("choisir la 2ᵉ révélée : idem", () => {
    const st = jouer(table(), devin(), 1);
    expect(st.players[0].hand.map((c) => c.card.name)).toContain("Cavalier");
  });

  it("choisir la 1re révélée : le dessus ne change pas, on la pioche", () => {
    const st = jouer(table(), devin(), 0);
    expect(st.players[0].hand.map((c) => c.card.name)).toContain("Louve");
  });

  it("les deux non choisies repartent au FOND du deck", () => {
    const st = jouer(table(), devin(), 2);
    const fond = st.players[0].deck.slice(-2).map((c) => c.card.name);
    expect(fond).toEqual(["Louve", "Cavalier"]);
  });
});

describe("Divination puis Préincanter — la réduction suit la carte remontée", () => {
  it("le sort remonté par Divination est bien celui que Préincanter réduit", () => {
    const st = jouer(table(), devin(), 2);
    const enMain = st.players[0].hand.find((c) => c.card.name === "Chasse sous la Lune")!;
    // 3 mana − 2 = 1.
    expect(enMain.manaCostReduction).toBe(2);
  });

  it("sans Divination pour le remonter, le sort du fond n'est pas réduit", () => {
    // Ordre d'auteur SANS divination : Préincanter voit le premier sort du deck
    // tel qu'il est — ici en 3ᵉ position, donc réduit lui aussi, mais on vérifie
    // surtout qu'aucune carte non-sort ne l'est.
    const s = table();
    const carte = mkInstance(mkCard({
      name: "Devin nu", mana_cost: 3, attack: 2, health: 1,
      keywords: ["preincanter"] as never,
      keyword_instances: [{ id: "preincanter", x: 2 }] as unknown as KeywordInstance[],
      capabilities: [
        { uid: "cw_0", params: { x: 2 }, targets: [], trigger: "on_play", abilityId: "preincanter", effectKind: "immediate" },
      ] as unknown as Capability[],
    }));
    s.players[0].hand.push(carte);
    const st = applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId });

    const sort = st.players[0].deck.find((c) => c.card.name === "Chasse sous la Lune")!;
    expect(sort.manaCostReduction).toBe(2);
    expect(st.players[0].deck.find((c) => c.card.name === "Louve")?.manaCostReduction ?? 0).toBe(0);
  });
});

describe("L'ordre de la carte fait autorité", () => {
  it("Inspiration DÉCLARÉE EN PREMIER pioche bien avant le tri", () => {
    // L'auteur peut vouloir l'inverse : on pioche d'abord, puis on trie ce qui
    // reste. Cet ordre doit être respecté aussi.
    const st = jouer(table(), devin(["inspiration", "divination", "preincanter"]), 2);
    // La pioche a pris le dessus d'AVANT tri : la Louve.
    expect(st.players[0].hand.map((c) => c.card.name)).toContain("Louve");
    expect(st.players[0].hand.map((c) => c.card.name)).not.toContain("Chasse sous la Lune");
  });

  it("Préincanter DÉCLARÉ AVANT Divination réduit le sort d'avant le tri", () => {
    const s = table();
    // Le sort est mis sur le DESSUS au départ : Préincanter le voit tout de suite.
    const sort = s.players[0].deck.splice(2, 1)[0];
    s.players[0].deck.unshift(sort);
    const st = jouer(s, devin(["preincanter", "divination", "inspiration"]), 1);
    // `applyAction` clone l'état : on relit l'instance DANS le résultat, la
    // référence locale d'avant l'appel n'est plus celle qui vit dans la partie.
    const apres = [...st.players[0].deck, ...st.players[0].hand]
      .find((c) => c.instanceId === sort.instanceId)!;
    // Réduit avant le tri, puis Divination remonte un autre choix.
    expect(apres.manaCostReduction).toBe(2);
  });
});
