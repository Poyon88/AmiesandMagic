// Halo des capacités CONDITIONNELLES.
//
// La propriété qui compte n'est pas « le halo s'affiche » mais « le halo dit la
// VÉRITÉ » : il doit s'allumer exactement quand la capacité s'active, ni avant
// ni après. Un halo désaccordé du moteur serait pire que pas de halo — le joueur
// prendrait ses décisions sur une information fausse.
//
// D'où ces tests aux bornes exactes des seuils, et la réutilisation des
// prédicats du moteur plutôt que leur recopie (cf. threshold-glow.ts).
import { describe, expect, it } from "vitest";
import { activeThresholdGlows, primaryThresholdGlow } from "./threshold-glow";
import { SEUIL_DECK_THRESHOLD } from "./constants";
import { FORCE_ANCETRES_GRAVEYARD_THRESHOLD } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, GameState } from "./types";

const carteAvec = (...keywords: string[]): Card =>
  mkCard({ name: "Sujet", attack: 1, health: 1, keywords: keywords as never });

/** État où le joueur 0 a `deck` cartes et `graveCreatures` créatures au cimetière. */
function etat(opts: { deck?: number; graveCreatures?: number; graveSpells?: number; chanteuse?: boolean } = {}): GameState {
  const s = mkState();
  s.players[0].id = "MOI";
  s.players[1].id = "LUI";
  s.players[0].deck = Array.from({ length: opts.deck ?? 40 }, (_, i) => mkInstance(mkCard({ name: `D${i}` })));
  for (let i = 0; i < (opts.graveCreatures ?? 0); i++) {
    s.players[0].graveyard.push(mkInstance(mkCard({ name: `C${i}`, card_type: "creature", attack: 1, health: 1 })));
  }
  for (let i = 0; i < (opts.graveSpells ?? 0); i++) {
    s.players[0].graveyard.push(mkInstance(mkCard({ name: `S${i}`, card_type: "spell", attack: null, health: null })));
  }
  if (opts.chanteuse) {
    s.players[0].board.push(mkInstance(mkCard({ name: "Barde", attack: 1, health: 3, keywords: ["chant"] as never })));
  }
  return s;
}

const allume = (card: Card, s: GameState, owner = "MOI") =>
  activeThresholdGlows(card, s, owner).map(g => g.abilityId);

describe("seuils adossés au DECK — allumage à la borne exacte", () => {
  const carte = carteAvec("seuil_sacrificiel");

  it(`éteint à ${SEUIL_DECK_THRESHOLD + 1} cartes, allumé à ${SEUIL_DECK_THRESHOLD}`, () => {
    expect(allume(carte, etat({ deck: SEUIL_DECK_THRESHOLD + 1 }))).toEqual([]);
    expect(allume(carte, etat({ deck: SEUIL_DECK_THRESHOLD }))).toEqual(["seuil_sacrificiel"]);
    expect(allume(carte, etat({ deck: 0 }))).toEqual(["seuil_sacrificiel"]);
  });

  it("Seuil de colère suit le MÊME seuil (c'est un sort, il ne vit qu'en main)", () => {
    const sort = mkCard({
      name: "Trait", card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "seuil_colere", amount: 2 }] as never,
    });
    expect(allume(sort, etat({ deck: SEUIL_DECK_THRESHOLD + 1 }))).toEqual([]);
    expect(allume(sort, etat({ deck: SEUIL_DECK_THRESHOLD }))).toEqual(["seuil_colere"]);
  });
});

describe("Force des ancêtres — le CIMETIÈRE, créatures seulement", () => {
  const carte = carteAvec("force_des_ancetres");
  const N = FORCE_ANCETRES_GRAVEYARD_THRESHOLD;

  it(`éteint à ${N - 1} créatures, allumé à ${N}`, () => {
    expect(allume(carte, etat({ graveCreatures: N - 1 }))).toEqual([]);
    expect(allume(carte, etat({ graveCreatures: N }))).toEqual(["force_des_ancetres"]);
  });

  it("les SORTS au cimetière ne comptent pas — même filtre que recalculateAuras", () => {
    expect(allume(carte, etat({ graveCreatures: N - 1, graveSpells: 10 }))).toEqual([]);
  });
});

describe("Chant — présence d'une chanteuse", () => {
  const sort = mkCard({
    name: "Hymne", card_type: "spell", attack: null, health: null,
    spell_keywords: [{ id: "chant", amount: 2 }] as never,
  });

  it("s'allume dès qu'une chanteuse est en jeu", () => {
    expect(allume(sort, etat())).toEqual([]);
    expect(allume(sort, etat({ chanteuse: true }))).toEqual(["chant"]);
  });

  it("une chanteuse ADVERSE n'allume pas le halo du lanceur", () => {
    const s = etat();
    s.players[1].board.push(mkInstance(mkCard({ name: "Barde", attack: 1, health: 3, keywords: ["chant"] as never })));
    expect(allume(sort, s)).toEqual([]);
  });

  it("une chanteuse à 0 PV (cadavre en sursis) n'allume rien", () => {
    const s = etat({ chanteuse: true });
    s.players[0].board[0].currentHealth = 0;
    expect(allume(sort, s)).toEqual([]);
  });
});

describe("le halo suit le CONTRÔLEUR, pas le joueur local", () => {
  it("le deck de l'adversaire décide du halo de SES cartes", () => {
    const carte = carteAvec("seuil_sacrificiel");
    const s = etat({ deck: 40 });              // MOI : deck plein
    s.players[1].deck = [];                     // LUI : deck vide → seuil franchi

    expect(allume(carte, s, "MOI")).toEqual([]);
    expect(allume(carte, s, "LUI")).toEqual(["seuil_sacrificiel"]);
  });
});

describe("cumul et priorité", () => {
  it("deux seuils actifs ⇒ deux entrées, mais UNE seule couleur d'anneau", () => {
    const carte = carteAvec("seuil_sacrificiel", "force_des_ancetres");
    const s = etat({ deck: SEUIL_DECK_THRESHOLD, graveCreatures: FORCE_ANCETRES_GRAVEYARD_THRESHOLD });

    expect(allume(carte, s)).toEqual(["force_des_ancetres", "seuil_sacrificiel"]);
    // L'anneau ne porte qu'une couleur : la première de la palette gagne.
    expect(primaryThresholdGlow(carte, s, "MOI")?.abilityId).toBe("force_des_ancetres");
  });
});

describe("cas sans halo", () => {
  it("carte sans capacité à seuil", () => {
    expect(allume(carteAvec("taunt"), etat({ deck: 0, graveCreatures: 20 }))).toEqual([]);
    expect(primaryThresholdGlow(carteAvec("taunt"), etat({ deck: 0 }), "MOI")).toBeNull();
  });

  it("état absent ou contrôleur inconnu ⇒ rien (pas de crash au rendu)", () => {
    const carte = carteAvec("seuil_sacrificiel");
    expect(activeThresholdGlows(carte, null, "MOI")).toEqual([]);
    expect(activeThresholdGlows(carte, etat({ deck: 0 }), null)).toEqual([]);
    expect(activeThresholdGlows(carte, etat({ deck: 0 }), "FANTOME")).toEqual([]);
  });
});

describe("cartes RÉELLES — modèle `capabilities` sans keyword_instances", () => {
  // Reproduction de la situation rapportée : « Le Chant des Eaux Affamées »
  // (carte 697) en main, « Chanteuse de la Lave Profonde » (carte 688) sur le
  // plateau. Les deux ne portent QUE des `capabilities` — pas de
  // `keyword_instances` — et c'est la forme que produit la forge aujourd'hui.
  const chanteuse = () => mkInstance(mkCard({
    name: "Chanteuse de la Lave Profonde", mana_cost: 3, attack: 2, health: 1,
    keywords: ["canalisation", "chant", "ombre"] as never,
    capabilities: [
      { uid: "cw_0", targets: [], trigger: "automatic", abilityId: "canalisation", effectKind: "immediate" },
      { uid: "cw_1", targets: [], trigger: "automatic", abilityId: "chant", effectKind: "immediate" },
      { uid: "cw_2", targets: [], trigger: "automatic", abilityId: "ombre", effectKind: "immediate" },
    ] as never,
  }));
  const sortChant = mkCard({
    name: "Le Chant des Eaux Affamées", card_type: "spell", attack: null, health: null,
    spell_keywords: [{ id: "deferlement", amount: 1 }, { id: "chant", amount: 1 }] as never,
    capabilities: [
      { uid: "sk_0", params: { x: 1 }, targets: [], trigger: "spell_resolution", abilityId: "deferlement", effectKind: "immediate" },
      { uid: "sk_1", params: { x: 1 }, targets: [], trigger: "spell_resolution", abilityId: "chant", effectKind: "immediate" },
    ] as never,
  });

  it("le sort s'allume dès que la chanteuse est sur le plateau du lanceur", () => {
    const s = etat();
    expect(allume(sortChant, s)).toEqual([]);

    s.players[0].board.push(chanteuse());
    expect(allume(sortChant, s)).toEqual(["chant"]);
    expect(primaryThresholdGlow(sortChant, s, "MOI")?.rgb).toBe("23, 182, 196"); // cyan
  });
});
