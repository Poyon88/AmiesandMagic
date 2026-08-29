// COÛTS ADDITIONNELS — points rendus au budget de la carte.
//
// Un coût payé EN PLUS du mana dessert son porteur : il finance donc le reste de
// la carte. Jusqu'ici les six coûts additionnels étaient purement ignorés par la
// jauge de la forge — une carte qui se payait en vie ou en défausse coûtait le
// même budget qu'une carte gratuite.
import { describe, expect, it } from "vitest";
import { ADDITIONAL_COST_POINTS, additionalCostPoints, STAT_COST, KEYWORDS } from "@/lib/card-engine/constants";

describe("le barème", () => {
  it("rend toujours des points, jamais n'en prend", () => {
    for (const [k, v] of Object.entries(ADDITIONAL_COST_POINTS)) {
      expect(v, k).toBeLessThan(0);
    }
  });

  it("la vie est ANCRÉE sur Douleur X, au point près", () => {
    // Même geste — infliger un dégât à son propre héros — donc même prix. Si
    // Douleur X est rééquilibrée, ce test le signalera.
    expect(ADDITIONAL_COST_POINTS.life).toBe(KEYWORDS["Douleur X"].cost);
  });

  it("la défausse est ANCRÉE sur le prix d'une carte", () => {
    // Inspiration X (piocher) et Pillage X (faire défausser l'adversaire) valent
    // tous deux +5 par carte : défausser soi-même est la même quantité, de
    // l'autre côté.
    expect(KEYWORDS["Inspiration X"].costPerX).toBe(5);
    expect(KEYWORDS["Pillage X"].costPerX).toBe(5);
    expect(ADDITIONAL_COST_POINTS.discard).toBe(-KEYWORDS["Inspiration X"].costPerX);
  });

  it("l'ordre de gravité est celui qu'on a raisonné", () => {
    const { sacrifice, discard, life, topdeck, exile } = ADDITIONAL_COST_POINTS;
    // Sacrifier un allié coûte plus qu'une carte en main ; une carte en main
    // plus qu'un point de vie ; un repli (la carte revient) plus qu'un exil
    // (cartes du deck, aveugles).
    expect(sacrifice).toBeLessThan(discard);
    expect(discard).toBeLessThan(life);
    expect(topdeck).toBeLessThan(exile);
    // Le repli ne coûte pas plus qu'une défausse : on garde la carte.
    expect(topdeck).toBeGreaterThan(discard);
  });

  it("un allié sacrifié pèse plus que deux points de statistiques", () => {
    // Garde-fou de proportion : sacrifier une unité doit rester plus lourd que
    // ce que valent quelques points de stats, sinon le coût serait décoratif.
    expect(Math.abs(ADDITIONAL_COST_POINTS.sacrifice)).toBeGreaterThan(STAT_COST.atk * 2);
  });
});

describe("le total", () => {
  it("vaut zéro quand la carte n'a aucun coût additionnel", () => {
    expect(additionalCostPoints({})).toBe(0);
    expect(additionalCostPoints({ lifeCost: 0, discardCost: null })).toBe(0);
  });

  it("additionne chaque coût par unité payée", () => {
    expect(additionalCostPoints({ lifeCost: 3 })).toBe(-9);
    expect(additionalCostPoints({ discardCost: 2 })).toBe(-10);
    expect(additionalCostPoints({ sacrificeCost: 1, exileCost: 2 })).toBe(-16);
  });

  it("cumule les cinq coûts", () => {
    const t = additionalCostPoints({
      lifeCost: 1, discardCost: 1, sacrificeCost: 1, exileCost: 1, topdeckCost: 1,
    });
    expect(t).toBe(-3 - 5 - 12 - 2 - 3);
  });

  it("IGNORE l'éveil — coût alternatif, pas additionnel", () => {
    // L'éveil remplace le mana au lieu de s'y ajouter, or c'est le mana qui fixe
    // le budget : lui donner une valeur négative le compterait deux fois. Le
    // helper ne l'accepte même pas comme champ.
    expect(Object.keys(ADDITIONAL_COST_POINTS)).not.toContain("eveil");
    expect(additionalCostPoints({ lifeCost: 1 } as never)).toBe(-3);
  });
});

describe("effet sur une carte réelle", () => {
  it("une Rare 3/5 à 5 manas retrouve du budget en se payant en vie", () => {
    // Budget = 5 × 10 × 1,10 = 55. Une 3/5 en consomme 3×5 + 5×4 = 35.
    const stats = 3 * STAT_COST.atk + 5 * STAT_COST.def;
    expect(stats).toBe(35);
    // Deux points de vie rendent 6 points : il en reste 26 au lieu de 20.
    const restantSansCout = 55 - stats;
    const restantAvecCout = 55 - (stats + additionalCostPoints({ lifeCost: 2 }));
    expect(restantSansCout).toBe(20);
    expect(restantAvecCout).toBe(26);
  });
});
