// Adresses des pages de faction.
//
// Le slug est DÉRIVÉ de l'id de faction, jamais du nom affiché : ce dernier est
// traduit dans les 8 locales, et une URL qui change avec la langue du visiteur
// casse les liens partagés autant que l'indexation.
//
//   Humains          → /factions/humains
//   EmpireDuMilieu   → /factions/empire-du-milieu
//   Hommes-Bêtes     → /factions/hommes-betes
//   Élémentaires     → /factions/elementaires

import { FACTIONS } from "@/lib/card-engine/constants";

/** `EmpireDuMilieu` → `empire-du-milieu`, accents et espaces compris. */
export function factionSlug(factionId: string): string {
  return factionId
    // Coupe le chameau AVANT de tout passer en minuscules.
    .replace(/([a-zà-ÿ])([A-ZÀ-Þ])/g, "$1-$2")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Slug → id de faction. Table construite à partir de `FACTIONS`, donc une
 *  faction ajoutée est adressable sans qu'on touche à ce fichier. */
const PAR_SLUG: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const id of Object.keys(FACTIONS)) out[factionSlug(id)] = id;
  return out;
})();

export function factionFromSlug(slug: string): string | null {
  return PAR_SLUG[slug] ?? null;
}

/** Les slugs des factions PRÉSENTÉES — les mêmes que la page de garde, donc
 *  sans Mercenaires, qui est un vivier partagé et non une armée. */
export function showcaseFactionSlugs(): string[] {
  return Object.entries(FACTIONS)
    .filter(([, def]) => def.alignment !== "spéciale")
    .map(([id]) => factionSlug(id));
}
