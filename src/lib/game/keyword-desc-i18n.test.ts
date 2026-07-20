import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Contrôles portant sur les CATALOGUES traduits, pas sur le moteur : une
// traduction peut casser le rendu sans qu'aucun test TS ne s'en aperçoive.

const LOCALES = ["fr", "en", "es", "de", "it", "pt", "ja", "zh"] as const;
const ROOT = path.resolve(__dirname, "../../../messages");

const load = (loc: string) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, `${loc}.json`), "utf8"));

const markersOf = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

const fr = load("fr");

describe("catalogues traduits — marqueurs", () => {
  it.each(LOCALES)("%s conserve exactement les marqueurs du FR", (loc) => {
    const cat = load(loc);
    const drift: string[] = [];
    for (const [id, entry] of Object.entries(fr.vocab.keywords) as [string, { desc?: string }][]) {
      if (!entry.desc) continue;
      const target = cat.vocab.keywords?.[id]?.desc;
      if (typeof target !== "string") continue;
      // Détecte un {race} traduit en {raza}, ou un marqueur perdu/ajouté.
      if (markersOf(entry.desc) !== markersOf(target)) {
        drift.push(`${id}: FR[${markersOf(entry.desc)}] ≠ ${loc}[${markersOf(target)}]`);
      }
    }
    expect(drift).toEqual([]);
  });

  it.each(LOCALES)("%s déclare tous les replis de marqueurs", (loc) => {
    const cat = load(loc);
    const missing = Object.keys(fr.vocab.markers).filter(
      (k) => typeof cat.vocab.markers?.[k] !== "string",
    );
    expect(missing).toEqual([]);
  });
});

describe("catalogues traduits — formes fléchies", () => {
  it.each(LOCALES)("%s couvre toutes les races, clans et factions", (loc) => {
    const cat = load(loc);
    const gaps: string[] = [];
    for (const r of Object.keys(fr.vocab.races_forms)) {
      const f = cat.vocab.races_forms?.[r];
      if (!f?.def || !f?.bare || !f?.de) gaps.push(`race ${r}`);
    }
    for (const c of Object.keys(fr.vocab.clans_forms)) {
      if (typeof cat.vocab.clans_forms?.[c] !== "string") gaps.push(`clan ${c}`);
    }
    for (const f of Object.keys(fr.vocab.factions_forms)) {
      if (typeof cat.vocab.factions_forms?.[f] !== "string") gaps.push(`faction ${f}`);
    }
    expect(gaps).toEqual([]);
  });
});

// Les marqueurs {race}/{clan}/{faction} portent DÉJÀ leur déterminant (« le
// Démon » / « the Demon »). Un article devant le marqueur le doublerait —
// c'est l'erreur qu'a produite le premier passage de traduction anglais.
const DETERMINERS: Record<string, string[]> = {
  fr: ["le", "la", "les", "un", "une", "du", "des", "au", "aux"],
  en: ["the", "a", "an"],
  es: ["el", "la", "los", "las", "un", "una", "del", "al"],
  de: ["der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem"],
  it: ["il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "del", "della"],
  pt: ["o", "a", "os", "as", "um", "uma", "do", "da", "dos", "das"],
};

describe("catalogues traduits — pas de déterminant dupliqué", () => {
  it.each(Object.keys(DETERMINERS))("%s n'insère pas d'article devant un marqueur", (loc) => {
    const cat = load(loc);
    const dets = DETERMINERS[loc].join("|");
    // « the {race} », « du {clan} »… juste avant un marqueur porteur d'article.
    // Frontière via \p{L} et non \b : en regex JS, « ã » n'est pas un caractère
    // \w, donc \b coupe à l'intérieur de « mão » et « …mão {race} » passait
    // pour un « o {race} » fautif.
    const re = new RegExp(`(?<!\\p{L})(${dets})\\s+\\{(race|clan|faction|alignment)\\}`, "giu");
    const offenders: string[] = [];
    for (const [id, entry] of Object.entries(cat.vocab.keywords) as [string, { desc?: string }][]) {
      if (typeof entry.desc !== "string") continue;
      const hit = entry.desc.match(re);
      if (hit) offenders.push(`${id}: « ${hit.join(" / ")} » dans « ${entry.desc} »`);
    }
    expect(offenders).toEqual([]);
  });
});
