// Lecteurs du modèle de données pour la colonne de droite d'une carte.
import { describe, expect, it, vi, afterEach } from "vitest";
import { additionalCostOf, additionalCostsOf, awakenOf, rightSlotsAriaParts } from "./CardTokens";
import { cardAriaLabel } from "./CardCounters";

afterEach(() => vi.restoreAllMocks());

describe("coût additionnel", () => {
  it("aucun → undefined, un seul → ce coût", () => {
    expect(additionalCostOf({})).toBeUndefined();
    expect(additionalCostOf({ discard_cost: 1 })).toEqual({ type: "defausse", value: 1 });
    expect(additionalCostOf({ topdeck_cost: 2 })).toEqual({ type: "repli", value: 2 });
  });
  it("deux coûts (donnée en infraction) : le premier de l'ordre canonique est rendu, et un warn le dit", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(additionalCostsOf({ life_cost: 3, discard_cost: 1 })).toHaveLength(2);
    expect(additionalCostOf({ life_cost: 3, discard_cost: 1 }, "Mammouth de guerre")).toEqual({ type: "vie", value: 3 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Mammouth de guerre"));
  });
  it("l'Éveil n'est PAS un coût additionnel", () => {
    expect(additionalCostOf({ eveil_cost: 7 })).toBeUndefined();
  });
});

describe("Éveil", () => {
  it("total = coût d'éveil, versé borné à [0, total]", () => {
    expect(awakenOf({ eveil_cost: 0 })).toBeUndefined();
    expect(awakenOf({ eveil_cost: 7 })).toEqual({ total: 7, paid: 0 });
    expect(awakenOf({ eveil_cost: 7 }, 9)).toEqual({ total: 7, paid: 7 });
  });
});

describe("aria-label", () => {
  it("dit tout ce que la carte affiche : coût, jeton, Éveil (restant sur total), stats", () => {
    const extras = rightSlotsAriaParts({ discard_cost: 1, eveil_cost: 7 }, { total: 7, paid: 4 });
    expect(cardAriaLabel("Démon des Ombres", 1, { atk: 2, hp: 1 }, extras))
      .toBe("Démon des Ombres, coût 1, défausse 1, Éveil : 3 mana restants sur 7, attaque 2, points de vie 1");
  });
});
