// Le sélecteur de CONTENU de l'éditeur d'effets composés doit afficher des
// libellés, jamais des clés.
//
// Le défaut vu à l'écran : next-intl rend la CLÉ quand la traduction manque, si
// bien que la liste mêlait « Infliger des dégâts » et « forge.content_appel ».
// Treize contenus étaient dans ce cas — tous ceux ajoutés depuis la création du
// sélecteur, dont les plus récents.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RACINE = path.join(__dirname, "..", "..", "..");
const LOCALES = ["fr", "en", "es", "de", "it", "pt", "ja", "zh"];

/** Les contenus proposés par le sélecteur, lus dans la source de l'éditeur. */
function contenusDuSelecteur(): string[] {
  const src = fs.readFileSync(
    path.join(RACINE, "src/components/card-forge/ComposedEffectsEditor.tsx"), "utf8");
  const bloc = src.slice(
    src.indexOf("const COMPOSED_CONTENTS"),
    src.indexOf("/** Contenus paramétrés par un filtre de pool"));
  return [...bloc.matchAll(/\{ v: "([a-z_]+)", l: "/g)].map((m) => m[1]);
}

const contenus = contenusDuSelecteur();

describe("libellés du sélecteur de contenu composé", () => {
  it("le sélecteur propose bien tous les contenus (garde-fou de lecture)", () => {
    expect(contenus.length).toBeGreaterThan(25);
    expect(contenus).toContain("deal_damage");
    expect(contenus).toContain("silence");
  });

  it.each(LOCALES)("%s : chaque contenu a son libellé", (loc) => {
    const forge = JSON.parse(fs.readFileSync(path.join(RACINE, `messages/${loc}.json`), "utf8")).forge;
    const absents = contenus.filter((v) => !forge[`content_${v}`]);
    expect(absents, `libellés manquants en ${loc}`).toEqual([]);
  });

  it("aucun libellé ne ressemble à une clé", () => {
    for (const loc of LOCALES) {
      const forge = JSON.parse(fs.readFileSync(path.join(RACINE, `messages/${loc}.json`), "utf8")).forge;
      for (const v of contenus) {
        expect(String(forge[`content_${v}`]).startsWith("forge.")).toBe(false);
      }
    }
  });
});
