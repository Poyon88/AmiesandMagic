// `messages/en.overrides.json` ne doit pas contredire `messages/en.json`.
//
// Ce fichier porte les éditions anglaises faites à la main. Le pipeline de
// traduction (`scripts/translate-messages.mjs`) les fusionne EN DERNIER et ne
// les régénère jamais : une clé qui y figure écrase silencieusement celle du
// catalogue, et ne sera plus jamais retraduite.
//
// Il avait donc pris du retard sans que rien ne le signale — il gardait « 400
// cartes », l'ancien bloc de vitrine, et la liste de factions d'avant la
// refonte (Le Pacte des Bois, La Horde, L'Engeance du Chaos, et des noms restés
// en français). Au prochain passage du pipeline, tout serait revenu.
//
// C'est le même piège que partout ici : un second inventaire que personne ne
// regarde. Ce test le tient au contact du premier.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const lire = (nom: string) =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", nom), "utf8"));

const EN = lire("en.json");
const SURCHARGES = lire("en.overrides.json");

/** Aplatit en clés pointées, comme le fait le pipeline. */
function aplatir(o: unknown, prefixe = "", out: Record<string, string> = {}) {
  if (o && typeof o === "object" && !Array.isArray(o)) {
    for (const [k, v] of Object.entries(o)) aplatir(v, prefixe ? `${prefixe}.${k}` : k, out);
  } else if (typeof o === "string") {
    out[prefixe] = o;
  }
  return out;
}

describe("Surcharges anglaises", () => {
  const plates = aplatir(SURCHARGES);
  const catalogue = aplatir(EN);

  it("il y en a un bon paquet — le scan n'est pas à vide", () => {
    expect(Object.keys(plates).length).toBeGreaterThan(30);
  });

  it("aucune ne contredit le catalogue", () => {
    // Une divergence n'est pas visible aujourd'hui : elle attend le prochain
    // passage du pipeline pour ressusciter l'ancienne valeur.
    const divergentes = Object.entries(plates)
      .filter(([k, v]) => catalogue[k] !== undefined && catalogue[k] !== v)
      .map(([k]) => k);
    expect(divergentes).toEqual([]);
  });

  it("aucune ne porte sur une clé disparue du catalogue", () => {
    // Une clé morte réinjecterait une entrée qu'on a justement retirée — les
    // slugs de factions absorbées, par exemple.
    const orphelines = Object.keys(plates).filter((k) => catalogue[k] === undefined);
    expect(orphelines).toEqual([]);
  });

  it("ne réintroduit aucune faction absorbée par la refonte", () => {
    const texte = JSON.stringify(SURCHARGES);
    for (const disparue of ["halflings", "orcs_goblins", "Le Pacte des Bois", "La Horde", "L'Engeance du Chaos"]) {
      expect(texte, `« ${disparue} » survit dans les surcharges`).not.toContain(disparue);
    }
  });

  it("ne redouble plus le NOM des factions", () => {
    // Il vient de `vocab.factions`, traduit et partagé avec le jeu. Le
    // redoubler ici, c'était la source de la dérive d'origine.
    for (const [id, v] of Object.entries<Record<string, unknown>>(SURCHARGES.landing.factions)) {
      expect(Object.keys(v), `landing.factions.${id}`).toEqual(["tagline"]);
    }
  });
});
