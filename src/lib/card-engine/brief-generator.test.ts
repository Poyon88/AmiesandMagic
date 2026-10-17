import { describe, expect, it } from "vitest";
import { sanitizeBrief, type CardBrief } from "./brief";
import { affinite, appliquerEchange, bornesEquilibrage, CAPACITES_A_CHOIX, PART_A_CHOIX, candidatsEchange, echangeables, equilibrer, labelUnite, largestRemainder, META_DE_SORT, MODIFICATEURS_DE_DEGATS, planBatch, regleNom, seededRng, SORTS_DE_DEGATS, sortGenerable } from "./brief-generator";
import { regleRace } from "./race-abilities";
import { getAvailableKeywords, PART_HORS_PROFIL, resserrerProfil } from "./generator";
import { getBareme } from "./bareme";
import { KEYWORDS } from "./constants";

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
        // Un effet composé tient lieu d'effet principal.
        expect(c.composes.length > 0 || c.abilities.some((id) => !MODIFICATEURS_DE_DEGATS.has(id) && !META_DE_SORT.has(id)), c.abilities.join()).toBe(true);
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

describe("capacités en lien avec la race", () => {
  it("le hors-profil ne pèse jamais plus de la moitié du tirage", () => {
    const ks = getAvailableKeywords("Morts-Vivants", "Rare", "Gargouilles", "La Cour Écarlate");
    const tot = ks.reduce((s, k) => s + k.weight, 0);
    const hors = ks.filter((k) => !k.profiled).reduce((s, k) => s + k.weight, 0);
    expect(hors / tot).toBeCloseTo(PART_HORS_PROFIL, 2);
  });

  it("resserrerProfil ne touche pas un tirage déjà concentré ni un tirage sans profil", () => {
    const id = (x: { w: number; p: boolean }, w: number) => ({ ...x, w });
    const concentre = [{ w: 1, p: true }, { w: 0.1, p: false }];
    expect(resserrerProfil(concentre, (x) => x.w, (x) => x.p, id)).toBe(concentre);
    const plat = [{ w: 0.12, p: false }, { w: 0.12, p: false }];
    expect(resserrerProfil(plat, (x) => x.w, (x) => x.p, id)).toBe(plat);
  });

  it("une capacité du brief va d'abord à la race qui la porte le mieux", () => {
    const b = brief({ faction: "Morts-Vivants", races: ["Gargouilles", "Homuncules de Sang"], clans: [], count: 10, abilities: [{ id: "armure", pct: 10 }], triggers: [], additionalCosts: [] });
    for (let seed = 1; seed <= 5; seed++) {
      const p = planBatch(b, seededRng(seed));
      const porteurs = p.cards.filter((c) => c.abilities.includes("armure") && c.locked.includes("armure"));
      const gargouillesLibres = p.cards.filter((c) => c.race === "Gargouilles" && !c.abilities.includes("armure"));
      if (gargouillesLibres.length) for (const c of porteurs) expect(affinite(c, "armure"), `seed ${seed}`).toBeGreaterThanOrEqual(affinite(gargouillesLibres[0], "armure") - 1e-9);
      expect(porteurs.length).toBeGreaterThan(0);
    }
  });
});

describe("échange de capacité au concept", () => {
  const lot = () => planBatch(brief({ faction: "Morts-Vivants", races: ["Gargouilles", "Homuncules de Sang"], clans: [], count: 30, types: { "Unité": 3, "Action": 1 }, abilities: [{ id: "armure", pct: 10 }], triggers: [{ trigger: "death", freq: "moyen" }], additionalCosts: [] }), seededRng(7)).cards;

  it("seules les capacités libres et sans déclencheur d'une Unité sont échangeables", () => {
    for (const c of lot()) {
      const e = echangeables(c);
      if (c.type !== "Unité") { expect(e).toEqual([]); continue; }
      for (const id of e) {
        expect(c.locked).not.toContain(id);
        expect(c.modes[labelUnite(id)!]).toBeUndefined();
      }
    }
    expect(lot().some((c) => echangeables(c).length > 0)).toBe(true);
  });

  it("les candidates sont du profil, absentes de la carte, de coût proche, au plus 6", () => {
    for (const c of lot().filter((c) => echangeables(c).length)) {
      const profil = new Set(getAvailableKeywords(c.faction, c.rarity, c.race ?? undefined, c.clan ?? undefined).filter((k) => k.profiled).map((k) => k.id));
      const couts = echangeables(c).map((id) => KEYWORDS[labelUnite(id)!].cost);
      const cands = candidatsEchange(c);
      expect(cands.length).toBeLessThanOrEqual(6);
      for (const k of cands) {
        expect(profil.has(k.label)).toBe(true);
        expect(c.abilities).not.toContain(k.id);
        expect(regleRace(c.race, c.clan).interdits).not.toContain(k.label);
        expect(couts.some((x) => Math.abs(x - k.cout) <= 1)).toBe(true);
      }
    }
  });

  it("appliquerEchange remplace, verrouille, et survit à l'équilibrage ; un échange invalide ne change rien", () => {
    const c = lot().find((c) => echangeables(c).length && candidatsEchange(c).length)!;
    const de = echangeables(c)[0], vers = candidatsEchange(c)[0].id;
    const e = appliquerEchange(c, { de, vers });
    expect(e.abilities).toContain(vers);
    expect(e.abilities).not.toContain(de);
    expect(e.locked).toContain(vers);
    expect(equilibrer(e, getBareme(), {}).labels).toContain(labelUnite(vers));
    expect(appliquerEchange(c, { de, vers: "inexistante" })).toBe(c);
    expect(appliquerEchange(c, { de: "inexistante", vers })).toBe(c);
    expect(appliquerEchange(c, null)).toBe(c);
  });
});

describe("cartes à choix", () => {
  it("au moins 30 % du lot porte une capacité à choix, verrouillée", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const p = planBatch(brief({ count: 40, types: { "Unité": 3, "Action": 1 } } as Partial<CardBrief>), seededRng(seed));
      const avec = p.cards.filter((c) => c.abilities.some((id) => CAPACITES_A_CHOIX.has(id)) || c.composes.length > 0);
      expect(avec.length, `seed ${seed}`).toBeGreaterThanOrEqual(Math.round(40 * PART_A_CHOIX));
      for (const c of p.cards) for (const id of c.abilities.filter((x) => CAPACITES_A_CHOIX.has(x))) {
        if (c.type === "Unité") expect(regleRace(c.race, c.clan).interdits).not.toContain(labelUnite(id));
      }
    }
  });

  it("une capacité à choix survit à l'équilibrage", () => {
    const p = planBatch(brief({ count: 30 } as Partial<CardBrief>), seededRng(8));
    for (const c of p.cards.filter((c) => c.abilities.some((id) => CAPACITES_A_CHOIX.has(id) && c.locked.includes(id)))) {
      const b = equilibrer(c, getBareme(), {});
      expect(b.plan.abilities.some((id) => CAPACITES_A_CHOIX.has(id))).toBe(true);
    }
  });
});

describe("équilibrage à coût fixe (courbe imposée)", () => {
  const courbe = (types: Partial<Record<"Unité" | "Action", number>>, manaCurve: Record<string, number>) => brief({
    count: 26, faction: "Hommes-Bêtes", races: ["Hommes-Félins"], clans: ["Les Seigneurs Fauves"], types, rarities: { Commune: 1 }, manaCurve,
    abilities: [], triggers: [{ trigger: "entry", freq: "moyen" }], additionalCosts: [],
  } as Partial<CardBrief>);

  it("le coût de la courbe est conservé et ≥ 85 % des cartes tiennent ±10 %", () => {
    for (const b of [courbe({ "Unité": 1 }, { "1": 5, "2": 6, "6": 3, "7": 4, "8": 3, "9": 3, "10": 2 }), courbe({ "Action": 1 }, { "1": 3, "4": 2, "5": 2, "6": 3, "7": 2, "8": 2, "9": 2, "10": 2 })]) {
      let ok = 0, n = 0;
      for (const seed of [1, 2, 3]) for (const c of planBatch(b, seededRng(seed)).cards) {
        const r = equilibrer(c, getBareme(), bornesEquilibrage(b, c));
        expect(r.plan.mana).toBe(c.mana);
        n++; if (Math.abs(r.score.ratio - 1) <= 0.1) ok++;
      }
      expect(ok / n).toBeGreaterThan(0.85);
    }
  });

  it("sans courbe, les bornes du brief s'appliquent", () => {
    const b = brief({ constraints: { minMana: 2, maxMana: 8 } } as Partial<CardBrief>);
    expect(bornesEquilibrage(b, planBatch(b, seededRng(1)).cards[0])).toEqual({ minMana: 2, maxMana: 8 });
  });
});
