import { describe, expect, it } from "vitest";
import { sanitizeBrief, type CardBrief } from "./brief";
import { equilibrer, labelUnite, largestRemainder, META_DE_SORT, MODIFICATEURS_DE_DEGATS, planBatch, regleNom, seededRng, SORTS_DE_DEGATS, sortGenerable } from "./brief-generator";
import { regleRace } from "./race-abilities";

const brief = (over: Partial<CardBrief> = {}): CardBrief => sanitizeBrief({
  count: 20, faction: "Nains", races: ["Nains"], types: { "Unité": 1 },
  rarities: { Commune: 2, "Peu Commune": 1, Rare: 1 },
  abilities: [{ id: "resistance", pct: 40 }, { id: "provocation", pct: 0 }, { id: "taunt", pct: 20 }],
  triggers: [{ trigger: "death", freq: "fort" }], additionalCosts: [{ cost: "sacrifice", freq: "leger" }],
  gender: { M: 50, F: 50, O: 0 }, ...over,
}).brief;

describe("largestRemainder", () => {
  it("répartit exactement n", () => {
    const r = largestRemainder({ a: 1, b: 1, c: 1 }, 10);
    expect(r.a + r.b + r.c).toBe(10);
    expect(Math.max(r.a, r.b, r.c) - Math.min(r.a, r.b, r.c)).toBeLessThanOrEqual(1);
  });
});

describe("planBatch", () => {
  it("respecte le nombre, les raretés, le genre et les quotas", () => {
    const p = planBatch(brief(), seededRng(1));
    expect(p.cards).toHaveLength(20);
    expect(p.cards.filter((c) => c.rarity === "Commune")).toHaveLength(10);
    expect(p.cards.filter((c) => c.gender === "femme")).toHaveLength(10);
    const total = p.cards.reduce((s, c) => s + c.abilities.length, 0);
    const res = p.cards.filter((c) => c.abilities.includes("resistance")).length;
    expect(Math.abs(res - Math.round(total * 0.4))).toBeLessThanOrEqual(1);
    expect(p.quotas.find((q) => q.id === "resistance")?.pose).toBe(res);
  });

  it("aucune capacité interdite, obligatoires posés, un coût additionnel au plus", () => {
    const p = planBatch(brief({ races: ["Fées", "Géants"], faction: "Elfes", count: 60 } as Partial<CardBrief>), seededRng(7));
    for (const c of p.cards) {
      const { interdits, obligatoires } = regleRace(c.race, c.clan);
      const labels = c.abilities.map(labelUnite);
      for (const l of interdits) expect(labels, `${c.race}`).not.toContain(l);
      for (const l of obligatoires) expect(labels, `${c.race}`).toContain(l);
    }
    expect(p.cards.filter((c) => c.cost).length).toBe(Math.round(60 * 0.05));
  });

  it("sets : uniquement des Communes", () => {
    const b = brief({ edition: { kind: "set", setId: 3 }, rarities: { Rare: 1 } } as Partial<CardBrief>);
    expect(planBatch(b, seededRng(2)).cards.every((c) => c.rarity === "Commune")).toBe(true);
  });

  it("Actions : seulement des capacités de sort générables", () => {
    const p = planBatch(brief({ types: { "Action": 1 }, abilities: [{ id: "impact", pct: 50 }] } as Partial<CardBrief>), seededRng(3));
    for (const c of p.cards) for (const id of c.abilities) expect(sortGenerable(id), id).toBe(true);
  });

  it("Actions : toujours un effet principal, un modificateur de dégâts avec des dégâts", () => {
    for (const seed of [1, 2, 3, 4]) {
      const p = planBatch(brief({ count: 40, types: { "Action": 1 }, abilities: [{ id: "precision", pct: 30 }, { id: "boomerang", pct: 20 }] } as Partial<CardBrief>), seededRng(seed));
      for (const c of p.cards) {
        expect(c.abilities.some((id) => !MODIFICATEURS_DE_DEGATS.has(id) && !META_DE_SORT.has(id)), c.abilities.join()).toBe(true);
        if (c.abilities.some((id) => MODIFICATEURS_DE_DEGATS.has(id))) expect(c.abilities.some((id) => SORTS_DE_DEGATS.has(id)), c.abilities.join()).toBe(true);
      }
    }
  });
});

describe("equilibrer", () => {
  it("≥ 85 % des cartes à ±5 % du barème sur 500 tirages", () => {
    let ok = 0, n = 0;
    for (const [faction, races, types] of [["Nains", ["Nains"], { "Unité": 3, "Action": 1 }], ["Elfes", ["Elfes", "Fées"], { "Unité": 1 }]] as const) {
      const p = planBatch(brief({ faction, races: [...races], types, count: 100, rarities: { Commune: 1, "Peu Commune": 1, Rare: 1, "Épique": 1, "Légendaire": 1 } } as Partial<CardBrief>), seededRng(11));
      for (const c of p.cards.concat(planBatch(brief({ faction, races: [...races], count: 100 } as Partial<CardBrief>), seededRng(12)).cards).slice(0, 250)) {
        const b = equilibrer(c);
        n++;
        if (Math.abs(b.score.ratio - 1) <= 0.05) ok++;
        if (c.type === "Unité") { expect(b.attack).toBeGreaterThanOrEqual(1); expect(b.health).toBeGreaterThanOrEqual(1); }
      }
    }
    expect(ok / n).toBeGreaterThanOrEqual(0.85);
  });
});

describe("regleNom", () => {
  it("Commune générique, sinon nom propre", () => {
    expect(regleNom("Commune")).toBe("generique");
    expect(regleNom("Rare")).toBe("propre");
  });
});
