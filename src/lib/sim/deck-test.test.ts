import { describe, expect, it } from "vitest";
import type { Card } from "@/lib/game/types";
import { agregerTest, planDuLot, planDuTest, preparer, relire, stocker, wilson, type DeckFige, type PartieJouee } from "./deck-test";
import { factionsDuMatch, viviersDuMatch } from "./match-pools";

let id = 1;
const carte = (o: Partial<Card>): Card => ({
  id: id++, name: `C${id}`, mana_cost: 2, card_type: "creature", attack: 2, health: 2, effect_text: "", keywords: [],
  keyword_instances: null, spell_keywords: null, spell_effects: null, image_url: null, faction: "Elfes", rarity: "Commune", status: "playable", ...o,
} as unknown as Card);

describe("plans de parties", () => {
  it("test ciblé : siège et initiative indépendants, graines distinctes", () => {
    const plan = planDuTest(1, [2, 3], 8, 100);
    expect(plan).toHaveLength(16);
    const combos = new Set(plan.filter((p) => p.p1 === 1 || p.p2 === 1).map((p) => `${p.p1 === 1 ? 0 : 1}-${p.premier}`));
    expect(combos.size).toBe(4); // le deck testé commence et suit, depuis chaque siège
    expect(new Set(plan.map((p) => p.seed)).size).toBe(16);
  });
  it("lot : chaque paire, une seule fois par manche", () => {
    const plan = planDuLot([1, 2, 3], 4, 0);
    expect(plan).toHaveLength(12);
    expect(plan.every((p) => p.p1 !== p.p2)).toBe(true);
  });
  it("forme stockée relue à l'identique", () => {
    const p = planDuTest(1, [2], 1, 5)[0];
    const j = { ...p, vainqueur: 0, tours: 12 } as unknown as PartieJouee;
    expect(relire(stocker(j))).toEqual(p);
  });
});

describe("agrégation", () => {
  it("intervalle de Wilson", () => {
    const [a, b] = wilson(50, 100);
    expect(a).toBeCloseTo(0.404, 2);
    expect(b).toBeCloseTo(0.596, 2);
  });
  it("taux du deck testé, quel que soit son siège, et apport par carte", () => {
    const vide = { recus: 0, poses: 0, equipes: 0, inutilises: 0 };
    const etin = { recue: false, joueeAuTour: null, manaPerdu: null };
    const partie = (k: number, testeEnP1: boolean, gagne: boolean, joue: boolean): PartieJouee => {
      const siege = testeEnP1 ? 0 : 1;
      const cartesTeste: { piochees: number[]; jouees: Record<number, number> } = { piochees: [7], jouees: joue ? { 7: 1 } : {} };
      return {
        k, p1: testeEnP1 ? 1 : 2, p2: testeEnP1 ? 2 : 1, seed: k, premier: 0,
        vainqueur: (gagne ? siege : 1 - siege) as 0 | 1, tours: 10, incidents: 0,
        cartes: siege === 0 ? [cartesTeste, { piochees: [], jouees: {} }] : [{ piochees: [], jouees: {} }, cartesTeste],
        compteurs: [{}, {}], objets: [vide, vide], etincelle: [etin, etin],
      };
    };
    const r = agregerTest(1, [partie(0, true, true, true), partie(1, false, true, true), partie(2, true, false, false), partie(3, false, false, false)]);
    expect(r.total.v).toBe(2);
    expect(r.parAdversaire[0]).toMatchObject({ deckId: 2, v: 2, n: 4 });
    const c7 = r.cartes.find((c) => c.cardId === 7)!;
    expect([c7.jouee, c7.quandJouee.taux, c7.sinon.taux]).toEqual([2, 1, 0]);
  });
});

describe("viviers du match", () => {
  it("alignement du deck + renfort neutre + Mercenaires, Étincelle ajoutée", () => {
    const elfe = carte({ faction: "Elfes" });
    const f = factionsDuMatch([[{ card: elfe }]]);
    expect(f.has("Elfes")).toBe(true);
    expect(f.has("Nains")).toBe(true);          // même alignement (bon)
    expect(f.has("EmpireDuMilieu")).toBe(true); // renfort neutre
    expect(f.has("Morts-Vivants")).toBe(false); // maléfique
    const etincelle = carte({ name: "Etincelle de Mana", card_type: "spell", faction: "Humains", mana_cost: 0 });
    const brouillon = carte({ faction: "Elfes", status: "draft" });
    const v = viviersDuMatch([elfe, etincelle, brouillon], new Set(), [[{ card: elfe, quantity: 2 }]], [null]);
    expect(v.factionCardPool.some((c) => c.id === etincelle.id)).toBe(true);
    expect(v.factionCardPool.some((c) => c.id === brouillon.id)).toBe(false);
  });
});

describe("partie sur decks figés", () => {
  it("se rejoue à l'identique, journal compris", () => {
    const cs = [carte({ mana_cost: 1, attack: 1, health: 2 }), carte({ mana_cost: 2, attack: 2, health: 3 }), carte({ mana_cost: 3, attack: 3, health: 3, keywords: ["taunt"] })];
    const deck = (n: number): DeckFige => ({ id: n, name: `D${n}`, owner: "t", faction: "Elfes", clans: [], hero: null, formatCode: null, cards: cs.map((c) => ({ card_id: c.id, quantity: 10 })) });
    const { jouer } = preparer({ cards: cs, tokens: [], machines: [], specialSetIds: [] }, [deck(1), deck(2)]);
    const p = planDuTest(1, [2], 1, 42)[0];
    const a = jouer(p, true), b = jouer(p, true);
    expect(a.partie.vainqueur).not.toBeNull();
    expect(b.resultat.journal).toEqual(a.resultat.journal);
    expect(a.resultat.journal!.some((l) => l.coup.startsWith("joue "))).toBe(true);
  });
});
