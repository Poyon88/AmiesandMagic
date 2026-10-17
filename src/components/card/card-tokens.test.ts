// Lecteurs du modèle de données pour la colonne de droite d'une carte.
import { describe, expect, it, vi, afterEach } from "vitest";
import { additionalCostOf, additionalCostsOf, awakenOf, rightSlotsAriaParts } from "./CardTokens";
import { cardAriaLabel } from "./CardCounters";
import { costHelp, COST_HELP_FR } from "@/lib/game/cost-descriptions";
import fs from "node:fs";
import path from "node:path";

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

describe("descriptif au survol", () => {
  it("chaque coût a un titre et un descriptif, au singulier comme au pluriel", () => {
    for (const kind of ["vie", "defausse", "sacrifice", "exil", "repli", "eveil"] as const) {
      for (const n of [1, 3]) {
        const h = costHelp(kind, n);
        expect(h.title, `${kind} ${n}`).toContain(String(n));
        expect(h.desc.length, `${kind} ${n}`).toBeGreaterThan(20);
        expect(h.desc).not.toMatch(/\{\w+\}/);
      }
    }
    expect(costHelp("defausse", 1).desc).toContain("une carte");
    expect(costHelp("defausse", 2).desc).toContain("2 cartes");
  });
  it("Éveil entamé : indique les points restants", () => {
    expect(costHelp("eveil", 7, undefined, 4).extra).toBe("Encore 3 points à verser sur 7.");
    expect(costHelp("eveil", 7).extra).toBeUndefined();
  });
  it("les 8 catalogues portent toutes les clés, avec les mêmes marqueurs", () => {
    for (const loc of ["fr", "en", "es", "de", "it", "pt", "ja", "zh"]) {
      const cat = JSON.parse(fs.readFileSync(path.join(process.cwd(), `messages/${loc}.json`), "utf8")).vocab.cost_help;
      for (const [cle, fr] of Object.entries(COST_HELP_FR)) {
        const [a, b] = cle.split(".");
        const v = cat?.[a]?.[b];
        expect(v, `${loc} / ${cle}`).toBeTruthy();
        for (const m of fr.match(/\{\w+\}/g) ?? []) expect(v, `${loc} / ${cle}`).toContain(m);
      }
    }
  });
});
