import type { Capability } from '@/lib/game/types';
import { fillXYMagnitude } from './composedMagnitude';

/** Normalise les capacités COMPOSÉES reçues du client avant persistance.
 *
 *  Ne garde que celles portant un effet `composed`, réassigne des uid stables
 *  (préfixe `cx_`) pour éviter toute collision avec les uid dérivés du legacy
 *  (sk_/grant_/cw_), et complète les amplitudes +X/+Y partielles.
 *
 *  L'EMBLÈME EST PRÉSERVÉ, et c'est tout l'objet de ce module. La normalisation
 *  forçait `effectKind: 'immediate'` sur TOUTE capacité composée : la case
 *  « Effet permanent posé sur un joueur » cochée dans l'éditeur partait en base
 *  en effet ordinaire. Conséquence, invisible et totale — aucun emblème porté
 *  par une CARTE n'a jamais pu se poser : `placeEmblemsForCard` ne voyait plus
 *  d'emblème à poser, et `composeExecutable` (qui exclut les emblèmes) laissait
 *  au contraire l'effet se résoudre sur-le-champ, en réclamant une cible. Seuls
 *  les emblèmes de POUVOIR DE HÉROS marchaient : ils passent par une autre route.
 *
 *  Le forçage reste la règle pour tout le reste : `grant` et les autres types
 *  d'effet n'ont pas de sens sur une capacité composée, et les laisser passer
 *  ouvrirait des états que le moteur ne sait pas exécuter.
 *
 *  EXTRAIT de la route de sauvegarde plutôt que corrigé sur place : une fonction
 *  enfermée dans un fichier de route n'est pas importable, donc pas testable —
 *  c'est ce qui a permis au défaut de vivre si longtemps. */
export function sanitizeComposed(input: unknown): Capability[] {
  if (!Array.isArray(input)) return [];
  return (input as Capability[])
    .filter((c) => c && typeof c === 'object' && c.composed)
    .map((c, i) => fillXYMagnitude({
      ...c,
      uid: `cx_${i}`,
      effectKind: c.effectKind === 'emblem' ? ('emblem' as const) : ('immediate' as const),
      abilityId: c.abilityId || '_composed',
    }));
}
