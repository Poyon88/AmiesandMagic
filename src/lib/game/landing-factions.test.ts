// Les factions de la PAGE DE GARDE suivent celles du jeu.
//
// La page tenait sa propre liste, avec ses propres slugs et ses propres noms
// traduits. Elle a dérivé sans bruit : après la refonte, Le Pacte des Bois et
// La Horde y accueillaient toujours les visiteurs — Hobbits et Orcs avaient
// pourtant été absorbés — pendant que L'Empire du Milieu et Les Royaumes du
// Soleil, ajoutés depuis, n'y figuraient pas. Le nom des Elfes Noirs y était
// resté « L'Engeance du Chaos », et la version anglaise affichait encore des
// noms français.
//
// La liste est désormais DÉRIVÉE de `FACTIONS`, et les noms viennent du
// catalogue `vocab.factions` partagé avec le jeu. Ce test tient les deux bouts
// que le typage ne tient pas : les accroches (propres au landing) et les
// illustrations, qui restent listées à la main.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FACTIONS } from "@/lib/card-engine/constants";

const LOCALES = ["fr", "en", "es", "de", "it", "pt", "ja", "zh"];

const catalogue = (loc: string) =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), `messages/${loc}.json`), "utf8"));

/** Les factions que la page présente : toutes sauf le vivier partagé. */
const PRESENTEES = Object.entries(FACTIONS)
  .filter(([, def]) => def.alignment !== "spéciale")
  .map(([id]) => id);

describe("Les factions présentées", () => {
  it("sont exactement celles du jeu, Mercenaires excepté", () => {
    expect(PRESENTEES).toEqual([
      "Elfes", "Nains", "EmpireDuMilieu", "RoyaumesDuSoleil", "Humains",
      "Hommes-Bêtes", "Élémentaires", "Morts-Vivants", "Elfes Noirs",
    ]);
  });

  it("écartent Mercenaires — un vivier ouvert à tous, pas une armée", () => {
    expect(PRESENTEES).not.toContain("Mercenaires");
    expect(FACTIONS["Mercenaires"].alignment).toBe("spéciale");
  });

  it("ne citent plus une faction absorbée par la refonte", () => {
    const noms = PRESENTEES.map((id) => FACTIONS[id].displayName);
    expect(noms).not.toContain("Le Pacte des Bois");
    expect(noms).not.toContain("La Horde");
  });
});

describe("Accroches", () => {
  it.each(LOCALES)("%s en fournit une pour chaque faction, et pas une de plus", (loc) => {
    const accroches = catalogue(loc).landing.factions;
    expect(Object.keys(accroches).sort()).toEqual([...PRESENTEES].sort());
  });

  it.each(LOCALES)("%s n'a aucune accroche vide", (loc) => {
    const accroches = catalogue(loc).landing.factions;
    for (const [id, v] of Object.entries<{ tagline?: string }>(accroches)) {
      expect(v.tagline?.trim(), `${loc} / ${id}`).toBeTruthy();
    }
  });

  it.each(LOCALES)("%s ne redouble PAS le nom — il vient de vocab.factions", (loc) => {
    // Le doublon est ce qui a dérivé la dernière fois : deux sources pour le
    // même nom, une seule tenue à jour.
    const accroches = catalogue(loc).landing.factions;
    for (const v of Object.values<Record<string, unknown>>(accroches)) {
      expect(Object.keys(v)).toEqual(["tagline"]);
    }
  });
});

describe("Noms canoniques", () => {
  it.each(LOCALES)("%s nomme chaque faction présentée", (loc) => {
    const vocab = catalogue(loc).vocab.factions;
    for (const id of PRESENTEES) {
      expect(vocab[id]?.displayName?.trim(), `${loc} / ${id}`).toBeTruthy();
    }
  });

  it.each(LOCALES.filter((l) => l !== "fr"))(
    "%s traduit vraiment — les noms ne sont pas restés en français",
    (loc) => {
      const fr = catalogue("fr").vocab.factions;
      const ici = catalogue(loc).vocab.factions;
      const identiques = PRESENTEES.filter(
        (id) => ici[id]?.displayName === fr[id]?.displayName,
      );
      // Une coïncidence isolée reste plausible ; neuf sur neuf, non.
      expect(identiques.length).toBeLessThan(PRESENTEES.length);
    },
  );
});

describe("Illustrations", () => {
  const SRC = fs.readFileSync(
    path.join(process.cwd(), "src/components/landing/LandingPage.tsx"),
    "utf8",
  );
  const slugs = [...SRC.matchAll(/slug: "([a-z_]+)"/g)].map((m) => m[1]);

  it("chaque slug déclaré a bien sa bannière sur le disque", () => {
    for (const slug of slugs) {
      const f = path.join(process.cwd(), `public/images/banners/${slug}.svg`);
      expect(fs.existsSync(f), `bannière manquante : ${slug}`).toBe(true);
    }
  });

  it("le blason de repli existe — une faction sans art doit rester présentable", () => {
    // Les deux dernières factions n'ont pas d'illustration dédiée : elles
    // s'affichent avec le portrait de leur héros, et ce blason si la base est
    // muette. Sans ce fichier, la carte afficherait une image cassée.
    expect(fs.existsSync(path.join(process.cwd(), "public/images/banners/default.svg"))).toBe(true);
  });

  it("la liste des illustrations ne cite aucune faction disparue", () => {
    const ids = [...SRC.matchAll(/^ {2}"?([A-Za-zÀ-ÿ-]+)"?: \{ slug:/gm)].map((m) => m[1]);
    for (const id of ids) expect(FACTIONS[id], `faction inconnue : ${id}`).toBeTruthy();
  });
});
