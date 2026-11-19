import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  TEXTES_EDITABLES, appliquerTextes, estCleEditable, estSectionVitrine, lireCle, textesPourLocale,
} from "../config";

const FR = JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages/fr.json"), "utf8")) as {
  landing: Record<string, unknown>;
};

describe("TEXTES_EDITABLES", () => {
  it("ne déclare que des clés qui existent dans messages/fr.json", () => {
    for (const t of TEXTES_EDITABLES) {
      expect(lireCle(FR.landing, t.key), `clé landing.${t.key} absente de fr.json`).toBeTruthy();
    }
  });

  it("n'a pas de clé en double", () => {
    expect(new Set(TEXTES_EDITABLES.map((t) => t.key)).size).toBe(TEXTES_EDITABLES.length);
  });

  it("écarte les textes à variable, qu'une faute de saisie casserait", () => {
    for (const t of TEXTES_EDITABLES) {
      expect(lireCle(FR.landing, t.key)).not.toMatch(/\{[a-z_]+\}/i);
    }
  });
});

describe("estCleEditable / estSectionVitrine", () => {
  it("refuse ce qui n'est pas déclaré", () => {
    expect(estCleEditable("hero_sub")).toBe(true);
    expect(estCleEditable("nav_play")).toBe(false);
    expect(estCleEditable("__proto__")).toBe(false);
    expect(estCleEditable(3)).toBe(false);
    expect(estSectionVitrine("mur")).toBe(true);
    expect(estSectionVitrine("autre")).toBe(false);
  });
});

describe("textesPourLocale", () => {
  const lignes = [
    { key: "hero_sub", fr: "Bonjour", translations: { en: "Hello", es: "  " } },
    { key: "cta_btn", fr: "Jouer", translations: null },
    { key: "nav_play", fr: "Pirate", translations: { en: "Pirate" } },
  ];

  it("rend le texte saisi en français", () => {
    expect(textesPourLocale(lignes, "fr")).toEqual({ hero_sub: "Bonjour", cta_btn: "Jouer" });
  });

  it("rend la traduction, et rien quand elle manque ou est vide", () => {
    expect(textesPourLocale(lignes, "en")).toEqual({ hero_sub: "Hello" });
    expect(textesPourLocale(lignes, "es")).toEqual({});
  });
});

describe("appliquerTextes", () => {
  const dict = { hero_sub: "défaut", factions: { Humains: { tagline: "Unis" } } };

  it("substitue une clé simple et une clé pointée sans toucher l'original", () => {
    const out = appliquerTextes(dict, { hero_sub: "neuf", "factions.Humains.tagline": "Ensemble" });
    expect(out).toEqual({ hero_sub: "neuf", factions: { Humains: { tagline: "Ensemble" } } });
    expect(dict.hero_sub).toBe("défaut");
    expect(dict.factions.Humains.tagline).toBe("Unis");
  });

  it("ignore une clé qui ne mène pas à un texte existant", () => {
    const out = appliquerTextes(dict, { inconnue: "x", "factions.Nains.tagline": "y", factions: "z" });
    expect(out).toEqual(dict);
  });

  it("rend le dictionnaire tel quel sans texte à substituer", () => {
    expect(appliquerTextes(dict, {})).toBe(dict);
  });
});
