// NOMBRE D'OCCURRENCES d'un effet composé — combien de fois son contenu se
// rejoue d'affilée (cf. `ComposedEffect.occurrences`).
//
// Module à part, et minuscule, pour une raison précise : la forge a besoin de
// savoir SUR QUELS CONTENUS proposer le champ, et le moteur de savoir combien
// de passes exécuter. Ces deux réponses doivent venir de la même source — mais
// la forge ne doit pas tirer `engine.ts` (un demi-mégaoctet) dans le bundle
// client pour une liste de sept chaînes.

import type { ComposedEffect } from "./types";

/** Contenus qui acceptent une répétition.
 *
 *  Ce sont exactement ceux qui n'agissent PAS sur des unités en jeu : ils
 *  n'ont donc pas de `target.count` pour dire leur multiplicité, et sans ce
 *  champ ils ne pouvaient produire qu'un seul résultat. Les autres contenus
 *  l'expriment déjà par leur nombre de cibles — leur donner un second compteur
 *  n'aurait semé que le doute sur celui qui compte. */
export const OCCURRENCE_CONTENTS: ReadonlySet<string> = new Set([
  "appel", "appel_supreme", "invocation", "tuteur",
  "selection", "selection_magique", "renfort_royal", "faveur", "tresor",
]);

/** Plafond dur des répétitions. Les garde-fous naturels (plateau plein, main
 *  pleine, deck épuisé) arrêtent déjà la plupart des contenus, mais PAS les
 *  Sélections : elles empilent une fenêtre de choix par passe, et une saisie
 *  aberrante laisserait le joueur derrière cinquante modales. Faveur, elle,
 *  n'ouvre aucune fenêtre et s'arrête à la main pleine — le plafond ne la
 *  protège de rien, il la borne simplement comme les autres. */
export const MAX_OCCURRENCES = 10;

/** Nombre de passes à exécuter. Absent, non numérique ou ≤ 1 ⇒ 1, c'est-à-dire
 *  le comportement d'avant l'existence du champ. */
export function nombreDOccurrences(composed: Pick<ComposedEffect, "occurrences">): number {
  const n = composed.occurrences;
  if (typeof n !== "number" || !Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(MAX_OCCURRENCES, Math.floor(n)));
}
