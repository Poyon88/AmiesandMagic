// Concepts de carte : validation de la réponse du planificateur et ancrage de
// la race dans le prompt d'illustration.
import { describe, expect, it } from "vitest";
import {
  MOMENTS, ancrageRace, echellePourCarte, nameRuleText, poidsEchelle, premierMot, repartir, repartirEchelles, sanitizeConcept, sanitizeConcepts, sanitizePlan,
  type CarteEchelle, type Echelle,
} from "./card-concepts";
import { RACE_VISUALS } from "./race-visuals";

const concept = (over: Record<string, unknown> = {}) => ({
  subjectKind: "membre", sujet: "vieille forgeronne aveugle", role: "tient la ligne", scene: "fonderie", cadrage: "portrait serré",
  elementsCharte: "enclume", ideeNom: "Hilda", formeNom: "nom seul", formeAmbiance: "proverbe", ton: "grave", ...over,
});

describe("sanitizeConcepts", () => {
  it("un concept par carte, dans l'ordre", () => {
    const { value, errors } = sanitizeConcepts({ lexique: ["Haut-Gouffre"], concepts: [concept(), concept({ subjectKind: "lieu" })] }, ["Unité", "Action"]);
    expect(errors).toEqual([]);
    expect(value.concepts.map((c) => c.subjectKind)).toEqual(["membre", "lieu"]);
    expect(value.lexique).toEqual(["Haut-Gouffre"]);
  });

  it("une Unité n'est jamais un lieu ni un objet", () => {
    const { value } = sanitizeConcepts({ concepts: [concept({ subjectKind: "lieu" }), concept({ subjectKind: "objet" })] }, ["Unité", "Unité"]);
    expect(value.concepts.map((c) => c.subjectKind)).toEqual(["membre", "membre"]);
  });

  it("signale un nombre de concepts faux ou un concept sans sujet", () => {
    const { value, errors } = sanitizeConcepts({ concepts: [concept({ sujet: "" })] }, ["Unité", "Unité"]);
    expect(value.concepts).toHaveLength(0);
    expect(errors.join(" ")).toContain("1 concepts reçus pour 2");
  });
});

describe("noms", () => {
  it("premier mot significatif, sans article ni accent", () => {
    expect(premierMot("Garde-Rempart de Burin")).toBe("garde");
    expect(premierMot("La Nuit des Soufflets")).toBe("nuit");
    expect(premierMot("Écho d'Ormund")).toBe("echo");
  });

  it("plusieurs formes d'exemple, plus « Burin » comme gabarit unique", () => {
    for (const r of ["propre", "generique"] as const) for (const t of ["Unité", "Action"]) {
      const txt = nameRuleText(r, t);
      expect(txt).not.toContain("Burin");
      expect(txt.split(" ; ").length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("ancrage de race", () => {
  const nain = RACE_VISUALS["Nains"];
  it("la description des Nains n'impose plus ni rôle ni armure", () => {
    expect(nain).not.toMatch(/warrior|armou?r/i);
  });
  it("en tête pour un membre ou un groupe, en fin pour le reste", () => {
    expect(ancrageRace(nain, "membre")).toEqual({ prefixe: nain, suffixe: null });
    expect(ancrageRace(nain, "groupe").prefixe).toMatch(/^A group of/);
    for (const k of ["lieu", "objet", "machine", "evenement", "monture"] as const) {
      const a = ancrageRace(nain, k);
      expect(a.prefixe, k).toBeNull();
      expect(a.suffixe, k).toContain("dwarf");
    }
  });
});

describe("sanitizePlan", () => {
  it("garde seed, lexique et concepts ; rejette un plan sans seed", () => {
    expect(sanitizePlan({ seed: 42, lexique: ["x"], concepts: [concept()] })?.concepts).toHaveLength(1);
    expect(sanitizePlan({ lexique: [], concepts: [concept()] })).toBeNull();
  });
});

describe("apparence accordée au genre", () => {
  it("une naine n'hérite pas de la barbe tressée", async () => {
    const { physiquePourGenre } = await import("./race-visuals");
    const nain = RACE_VISUALS["Nains"];
    expect(physiquePourGenre(nain, "femme")).not.toMatch(/beard/i);
    expect(physiquePourGenre(nain, "femme")).toContain("stocky");
    expect(physiquePourGenre(nain, "homme")).toBe(nain);
  });
});

describe("moment et tenue", () => {
  it("sanitizeConcept garde les deux axes", () => {
    const { value } = sanitizeConcepts({ concepts: [concept({ moment: "pluie battante", tenue: "tenue de pêche" })] }, ["Unité"]);
    expect(value.concepts[0]).toMatchObject({ moment: "pluie battante", tenue: "tenue de pêche" });
  });

  it("repartir fait sortir chaque valeur avant d'en répéter une", () => {
    const r = repartir(MOMENTS, MOMENTS.length * 2, () => 0.37);
    expect(new Set(r.slice(0, MOMENTS.length)).size).toBe(MOMENTS.length);
    expect(new Set(r.slice(MOMENTS.length)).size).toBe(MOMENTS.length);
  });
});

describe("échelle de la scène", () => {
  const unite = (mana: number, over: Partial<CarteEchelle> = {}): CarteEchelle => ({ type: "Unité", rarity: "Commune", mana, race: "Vampires", ...over });
  const compte = (l: Echelle[]) => l.reduce((m, e) => ({ ...m, [e]: (m[e] ?? 0) + 1 }), {} as Record<string, number>);

  it("barème par coût, héros, colossales et Actions", () => {
    expect(poidsEchelle(unite(1))).toEqual({ seule: 80, entourage: 10, groupe: 10, armee: 0 });
    expect(poidsEchelle(unite(10))).toEqual({ seule: 15, entourage: 20, groupe: 25, armee: 40 });
    expect(poidsEchelle(unite(9, { heros: true }))).toEqual({ seule: 60, entourage: 40 });
    expect(poidsEchelle(unite(5, { race: "Dragons" })).armee).toBe(0);
    expect(poidsEchelle(unite(10, { race: "Dragons" })).armee).toBeGreaterThan(0);
    expect(poidsEchelle(unite(5, { race: "Élémentaire", clan: "Le Socle du Monde" })).armee).toBe(0);
    expect(poidsEchelle({ type: "Action", rarity: "Rare", mana: 4 })).toEqual({ sort: 45, manoeuvre: 35, lieu: 20 });
  });

  it("lot stratifié : 10 Communes à 1-2 mana → 8 seules, 1 entourée, 1 groupe", () => {
    let k = 0;
    const tirage = () => ((k = (k * 9301 + 49297) % 233280) / 233280);
    const r = repartirEchelles(Array.from({ length: 10 }, (_, i) => unite(1 + (i % 2))), tirage);
    expect(compte(r)).toEqual({ seule: 8, entourage: 1, groupe: 1 });
  });

  it("une colossale sous 9 mana n'est jamais une armée ; les Actions ne tirent que leurs échelles", () => {
    for (let s = 0; s < 50; s++) {
      const r = repartirEchelles([...Array.from({ length: 6 }, () => unite(8, { race: "Géants" })), { type: "Action", rarity: "Commune", mana: 3 }]);
      expect(r.slice(0, 6)).not.toContain("armee");
      expect(["sort", "manoeuvre", "lieu"]).toContain(r[6]);
    }
  });

  it("Légendaires toujours héros, une Épique sur deux", () => {
    for (let s = 0; s < 30; s++) {
      const r = repartirEchelles([unite(10, { rarity: "Légendaire" }), unite(10, { rarity: "Épique" }), unite(10, { rarity: "Épique" })]);
      expect(["seule", "entourage"]).toContain(r[0]);
    }
    expect(echellePourCarte(unite(10, { rarity: "Légendaire" }), () => 0.99)).toBe("entourage");
  });

  it("sanitize : échelle invalide écartée, nature du sujet rendue cohérente", () => {
    const { value } = sanitizeConcepts({ concepts: [
      concept({ echelle: "armee", subjectKind: "membre" }),
      concept({ echelle: "sort" }),
      concept({ echelle: "lieu", subjectKind: "membre" }),
    ] }, ["Unité", "Unité", "Action"]);
    expect(value.concepts[0]).toMatchObject({ echelle: "armee", subjectKind: "groupe" });
    expect(value.concepts[1].echelle).toBeUndefined();
    expect(value.concepts[2]).toMatchObject({ echelle: "lieu", subjectKind: "lieu" });
  });

  it("ancrage d'une armée", () => {
    expect(ancrageRace("a stout dwarf", "groupe", "armee").prefixe).toBe("A vast host of stout dwarf");
  });
});

describe("échange de capacité dans le concept", () => {
  const base = { subjectKind: "membre", sujet: "gardienne de pierre" };
  it("conserve un échange bien formé, ignore le reste", () => {
    expect(sanitizeConcept({ ...base, echange: { de: "pietinement", vers: "ancre", raison: "statue scellée" } }, "Unité")?.echange)
      .toEqual({ de: "pietinement", vers: "ancre", raison: "statue scellée" });
    expect(sanitizeConcept({ ...base, echange: null }, "Unité")?.echange).toBeUndefined();
    expect(sanitizeConcept({ ...base, echange: { de: "ancre", vers: "ancre" } }, "Unité")?.echange).toBeUndefined();
    expect(sanitizeConcept({ ...base, echange: { de: "a", vers: "b" } }, "Action")?.echange).toBeUndefined();
  });
});
