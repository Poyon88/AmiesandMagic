// Format mis en avant sur l'écran « Jouer » : premier de la liste ET
// présélectionné.
//
// SOURCE UNIQUE des deux. Le format par défaut était codé en dur dans
// `MatchmakingQueue` tandis que l'ordre venait du `id` de la table : changer l'un
// sans l'autre donnait une liste dont le premier bouton n'était pas celui qui
// était sélectionné — exactement ce qu'on voyait, Expert · Standard coché en tête
// alors que Classique · Standard est le format d'entrée du jeu.
//
// Un code inconnu de la table (format renommé ou retiré) ne casse rien : l'ordre
// retombe sur celui de la base, et la sélection sur le premier format diffusé.

import type { GameFormat } from "./types";

/** Code du format mis en avant. */
export const FEATURED_FORMAT_CODE = "classique-standard";

/** Formats dans l'ordre d'affichage : le format mis en avant d'abord, le reste
 *  dans l'ordre reçu de la base. Ne filtre RIEN — la diffusion est décidée par
 *  `is_active`, côté requête. */
export function orderFormatsForPlay(formats: readonly GameFormat[]): GameFormat[] {
  const mis = formats.filter((f) => f.code === FEATURED_FORMAT_CODE);
  const autres = formats.filter((f) => f.code !== FEATURED_FORMAT_CODE);
  return [...mis, ...autres];
}

/** Format présélectionné : celui mis en avant s'il est diffusé, sinon le premier
 *  de la liste ordonnée. `null` si aucun format n'est diffusé. */
export function defaultFormatId(formats: readonly GameFormat[]): number | null {
  return orderFormatsForPlay(formats)[0]?.id ?? null;
}
