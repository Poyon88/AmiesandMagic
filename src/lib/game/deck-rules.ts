// Règles de composition de deck portant sur les capacités.
// Helpers purs (sans React) partagés par la validation live (canAddCard) et la
// validation de sauvegarde (deckStats.violations) du DeckBuilder.

import type { Card } from "./types";
import { ABILITIES } from "./abilities";
import { getCapabilities } from "./capability-adapter";
import { CAPABILITY_LIMIT_EXEMPT, capabilityLimitFor } from "./constants";

/** Ids de capacités NOMMÉES portées par une carte créature, dédupliqués. Une
 *  capacité est « nommée » si son `abilityId` existe dans le registre ABILITIES,
 *  ce qui exclut de fait les effets composés sur-mesure (placeholder `_composed`,
 *  absent du registre). Retourne un tableau vide hors créatures. */
export function namedCreatureCapabilityIds(card: Card): string[] {
  if (card.card_type !== "creature") return [];
  const ids = new Set<string>();
  for (const cap of getCapabilities(card)) {
    if (ABILITIES[cap.abilityId]) ids.add(cap.abilityId);
  }
  return [...ids];
}

/** Total d'occurrences par capacité nommée sur l'ensemble du deck, pondéré par
 *  la quantité de chaque carte. Les capacités exemptées (Vol/ranged) sont
 *  ignorées. */
export function creatureCapabilityCounts(
  entries: Iterable<{ card: Card; quantity: number }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { card, quantity } of entries) {
    for (const id of namedCreatureCapabilityIds(card)) {
      if (CAPABILITY_LIMIT_EXEMPT.has(id)) continue;
      counts.set(id, (counts.get(id) ?? 0) + quantity);
    }
  }
  return counts;
}

/** Capacités dépassant LEUR plafond, avec un libellé lisible et le plafond en
 *  question — les messages d'erreur doivent citer la valeur réellement
 *  appliquée, qui n'est plus la même pour toutes (cf. capabilityLimitFor). */
export function capabilityLimitViolations(
  counts: Map<string, number>,
): { id: string; label: string; count: number; max: number }[] {
  const out: { id: string; label: string; count: number; max: number }[] = [];
  for (const [id, count] of counts) {
    const max = capabilityLimitFor(id);
    if (count > max) out.push({ id, label: ABILITIES[id]?.label ?? id, count, max });
  }
  return out;
}


/** Ids des sets « spéciaux ». Chargé une fois par match ; `undefined` ⇒ aucun. */
export type SpecialSetIds = ReadonlySet<number>;

/** Écarte des POOLS DE COLLECTION les cartes issues d'un set spécial.
 *
 *  Point de passage UNIQUE, appliqué à la CONSTRUCTION des pools plutôt qu'aux
 *  ~8 résolveurs qui y puisent (Sélection ×3, Invocation, Invocations
 *  multiples, Déchainement, Concentration, Épargne). Un résolveur ajouté
 *  demain hérite donc de la règle sans qu'on ait à y penser — c'est exactement
 *  le genre d'inventaire dupliqué qui a déjà dérivé plusieurs fois ici.
 *
 *  Ce filtre ne touche QUE les tirages : une carte de set spécial reste
 *  collectionnable, deck-able, piochable et jouable. Seules les offres que le
 *  joueur n'a pas construites lui-même l'ignorent. */
export function excludeSpecialSets<T extends { set_id?: number | null }>(
  cards: T[],
  specialSetIds: SpecialSetIds | undefined,
): T[] {
  if (!specialSetIds || specialSetIds.size === 0) return cards;
  return cards.filter((c) => c.set_id == null || !specialSetIds.has(c.set_id));
}

/** Écarte des POOLS DE TIRAGE les cartes marquées NON DÉCOUVRABLES.
 *
 *  Même intention que `excludeSpecialSets`, à la carte plutôt qu'au set, et même
 *  point de passage : la CONSTRUCTION des pools, pas les ~8 résolveurs qui y
 *  puisent. Un résolveur ajouté demain hérite de la règle sans qu'on y pense.
 *
 *  Ce filtre ne touche QUE les tirages : une carte non découvrable reste
 *  collectionnable, deck-able, piochable et jouable. Seules les offres que le
 *  joueur n'a pas construites lui-même l'ignorent.
 *
 *  `undefined` vaut DÉCOUVRABLE : les cartes chargées par un chemin qui ne
 *  sélectionne pas encore la colonne ne doivent pas disparaître des pools en
 *  silence. Seul un `false` explicite exclut. */
export function excludeNonDiscoverable<T extends { discoverable?: boolean | null }>(
  cards: T[],
): T[] {
  return cards.filter((c) => c.discoverable !== false);
}
