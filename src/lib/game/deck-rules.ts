// Règles de composition de deck portant sur les capacités.
// Helpers purs (sans React) partagés par la validation live (canAddCard) et la
// validation de sauvegarde (deckStats.violations) du DeckBuilder.

import type { Card } from "./types";
import { ABILITIES } from "./abilities";
import { getCapabilities } from "./capability-adapter";
import { MAX_SAME_CAPABILITY, CAPABILITY_LIMIT_EXEMPT } from "./constants";

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

/** Capacités dépassant la limite (count > MAX_SAME_CAPABILITY), avec un libellé
 *  lisible pour les messages d'erreur de l'UI. */
export function capabilityLimitViolations(
  counts: Map<string, number>,
): { id: string; label: string; count: number }[] {
  const out: { id: string; label: string; count: number }[] = [];
  for (const [id, count] of counts) {
    if (count > MAX_SAME_CAPABILITY) out.push({ id, label: ABILITIES[id]?.label ?? id, count });
  }
  return out;
}
