// Garde de RÉCURRENCE du plafond PostgREST.
//
// `db-max-rows` = 1 000 : un `select()` sans `.range()` ne rend pas la table
// mais un sous-ensemble ARBITRAIRE, sans erreur ni signe. La table `cards` a
// franchi le seuil en août 2026 (1 713 lignes au 2026-08-28).
//
// Le correctif `26e5845` avait paginé les lectures connues, mais en a laissé
// quatre — dont `GET /api/cards/save`, la liste que charge l'ÉDITEUR DE CARTES :
// 713 cartes y étaient invisibles, ce qui s'est manifesté par « Soleil vivant »
// (id 1742) introuvable. Le défaut est indétectable à l'œil, d'où ce test :
// il lit le SOURCE et refuse une lecture de catalogue sans `.range(`.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = path.resolve(__dirname, "../../..");

/** Fichiers qui lisent le CATALOGUE ENTIER (pas une carte, pas une poignée
 *  d'ids). Toute nouvelle lecture de ce genre doit être ajoutée ici — et donc
 *  paginée. */
const LECTURES_DE_CATALOGUE = [
  "src/app/api/cards/save/route.ts",
  "src/app/admin/showcase/page.tsx",
  "src/app/admin/auctions/page.tsx",
  "src/app/admin/collections/page.tsx",
  "src/app/tutoriel/page.tsx",
  "src/app/collection/page.tsx",
  "src/app/decks/builder/page.tsx",
  "src/lib/collection/hubBackgrounds.ts",
  "src/lib/cards/nameCollision.ts",
];

/** Source DÉPOUILLÉE de ses commentaires. Sans ça, la garde est illusoire : le
 *  commentaire « sans `.range()` … » qui explique le correctif suffisait à
 *  satisfaire la recherche, et le test restait vert après suppression du vrai
 *  appel. Vérifié en réintroduisant la régression. */
const lire = (rel: string) =>
  fs
    .readFileSync(path.join(RACINE, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

describe("plafond PostgREST — toute lecture de catalogue est paginée", () => {
  it.each(LECTURES_DE_CATALOGUE)("%s pagine sa lecture", (rel) => {
    const src = lire(rel);
    expect(src, `${rel} lit bien la table cards`).toMatch(/from\(["']cards["']\)/);
    expect(src, `${rel} : select sur cards SANS .range() — jusqu'à 1 000 lignes rendues en silence`)
      .toMatch(/\.range\(/);
  });

  it.each(LECTURES_DE_CATALOGUE)("%s passe par le helper commun", (rel) => {
    // `fetchAllRows` / `scanAllRows` enferment les deux subtilités (ordre total,
    // curseur qui avance du nombre de lignes REÇUES). Paginer à la main les
    // réintroduit une par une.
    expect(lire(rel)).toMatch(/fetchAllRows|scanAllRows/);
  });

  it("l'ordre de pagination est TOTAL partout où il trie par nom", () => {
    // `name` ne départage pas les homonymes : sans `id` en dernier, deux pages
    // peuvent se recouvrir ou sauter une ligne — un trou intermittent, pire que
    // celui qu'on bouche.
    for (const rel of LECTURES_DE_CATALOGUE) {
      const src = lire(rel);
      if (!/\.order\(["']name["']\)/.test(src)) continue;
      expect(src, `${rel} trie par name sans id en dernier`).toMatch(
        /\.order\(["']name["']\)[\s\S]{0,80}?\.order\(["']id["']\)/,
      );
    }
  });
});
