import { describe, expect, it } from "vitest";
import { resolveNewsLocale, slugifyNewsTitle, NEWS_TARGET_LOCALES } from "./types";

const base = {
  title: "Titre FR",
  teaser: "Teaser FR",
  body_md: "Corps FR",
  translations: {
    en: { title: "Title EN", teaser: "Teaser EN", body_md: "Body EN" },
    de: { title: "Titel DE" }, // traduction PARTIELLE (échec en cours de route)
  },
};

describe("resolveNewsLocale", () => {
  it("fr → contenu source", () => {
    expect(resolveNewsLocale(base, "fr")).toEqual({ title: "Titre FR", teaser: "Teaser FR", bodyMd: "Corps FR" });
  });

  it("locale traduite → contenu traduit", () => {
    expect(resolveNewsLocale(base, "en")).toEqual({ title: "Title EN", teaser: "Teaser EN", bodyMd: "Body EN" });
  });

  it("locale absente → repli intégral sur le français", () => {
    expect(resolveNewsLocale(base, "ja")).toEqual({ title: "Titre FR", teaser: "Teaser FR", bodyMd: "Corps FR" });
  });

  it("traduction partielle → repli CHAMP PAR CHAMP", () => {
    expect(resolveNewsLocale(base, "de")).toEqual({ title: "Titel DE", teaser: "Teaser FR", bodyMd: "Corps FR" });
  });

  it("champ traduit VIDE → repli sur le français (jamais de chaîne vide)", () => {
    const item = { ...base, translations: { en: { title: "", teaser: "T", body_md: "" } } };
    const r = resolveNewsLocale(item, "en");
    expect(r.title).toBe("Titre FR");
    expect(r.teaser).toBe("T");
    expect(r.bodyMd).toBe("Corps FR");
  });
});

describe("slugifyNewsTitle", () => {
  it("accents → ascii, espaces/ponctuation → tirets", () => {
    expect(slugifyNewsTitle("Mise à jour : l'Été des Héros !")).toBe("mise-a-jour-l-ete-des-heros");
  });

  it("jamais vide", () => {
    expect(slugifyNewsTitle("!!!")).toBe("news");
    expect(slugifyNewsTitle("")).toBe("news");
  });

  it("tronqué à 80 caractères", () => {
    expect(slugifyNewsTitle("a".repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe("NEWS_TARGET_LOCALES", () => {
  it("les 7 locales hors français", () => {
    expect(NEWS_TARGET_LOCALES).toEqual(["en", "es", "de", "it", "pt", "ja", "zh"]);
  });
});
