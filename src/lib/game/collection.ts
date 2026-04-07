import type { Card } from "./types";

/**
 * A card is "owned" if:
 * - The player has the "testeur" role (owns everything)
 * - The card belongs to a set (set_id != null) — free for everyone
 * - The card is in the player's personal collection
 */
export function isCardOwned(
  card: Card,
  collectedCardIds: Set<number>,
  isTester: boolean
): boolean {
  if (isTester) return true;
  if (card.set_id != null) return true;
  return collectedCardIds.has(card.id);
}

export function filterOwnedCards(
  cards: Card[],
  collectedCardIds: Set<number>,
  isTester: boolean
): Card[] {
  return cards.filter((card) => isCardOwned(card, collectedCardIds, isTester));
}
