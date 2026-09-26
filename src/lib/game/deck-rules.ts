// Règles de composition de deck portant sur les capacités.
// Helpers purs (sans React) partagés par la validation live (canAddCard) et la
// validation de sauvegarde (deckStats.violations) du DeckBuilder.

import type { Card } from "./types";
import { ABILITIES } from "./abilities";
import { getCapabilities } from "./capability-adapter";
import { CAPABILITY_LIMIT_EXEMPT, capabilityLimitFor } from "./constants";

/** Ids de capacités NOMMÉES portées par une carte, dédupliqués. Une capacité est
 *  « nommée » si son `abilityId` existe dans le registre ABILITIES, ce qui
 *  exclut de fait les effets composés sur-mesure (placeholder `_composed`,
 *  absent du registre).
 *
 *  Les OBJETS comptent, au même titre que les créatures. La limite par capacité
 *  borne combien de fois une même capacité peut apparaître dans un deck ; or un
 *  objet la délivre exactement comme une créature — il la TRANSFÈRE à son
 *  porteur. Les en exempter aurait ouvert la porte de derrière : dix objets
 *  conférant Vol pour contourner un plafond que dix créatures n'auraient pas eu
 *  le droit de franchir.
 *
 *  Retourne un tableau vide pour les sorts, qui n'en portent pas. */
export function namedCreatureCapabilityIds(card: Card): string[] {
  if (card.card_type !== "creature" && card.card_type !== "item") return [];
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

/** Une carte peut-elle entrer dans un deck construit ?
 *
 *  Les OBJETS n'y entrent jamais : on les trouve EN JEU (Trésor, Compagnons,
 *  Tuteur, Sélection, Faveur, Épargne…). Règle appliquée à trois étages — le
 *  constructeur (canAddCard, violations), le lancement de partie, et un
 *  déclencheur Postgres sur `deck_cards` (supabase-migration-deck-sans-objets.sql),
 *  l'enregistrement d'un deck se faisant depuis le navigateur. */
export function estAjoutableAuDeck(card: Pick<Card, "card_type">): boolean {
  return card.card_type !== "item";
}

/** Nombre d'exemplaires d'objets dans un deck (quantités comprises). Sert aux
 *  decks enregistrés AVANT la règle : ils restent intacts en base, mais sont
 *  signalés et bloqués jusqu'à ce que le joueur retire ses objets. */
export function objetsDansLeDeck(
  entries: Iterable<{ card: Pick<Card, "card_type">; quantity: number }>,
): number {
  let n = 0;
  for (const { card, quantity } of entries) if (!estAjoutableAuDeck(card)) n += quantity;
  return n;
}
