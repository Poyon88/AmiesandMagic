// Concepts de carte : validation de la réponse du planificateur et ancrage de
// la race dans le prompt d'illustration.
import { describe, expect, it } from "vitest";
import { MOMENTS, ancrageRace, nameRuleText, premierMot, repartir, sanitizeConcepts, sanitizePlan } from "./card-concepts";
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
