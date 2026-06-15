// Contrôle ce qu'un joueur peut utiliser : un bug fuite des cartes non possédées
// ou masque des cartes possédées. Fonctions pures.
import { describe, expect, it } from "vitest";
import { isCardOwned, filterOwnedCards } from "./collection";
import type { Card } from "./types";

// isCardOwned ne lit que `id` et `set_id` → carte minimale.
function card(id: number, setId: number | null): Card {
  return { id, set_id: setId } as unknown as Card;
}

describe("isCardOwned", () => {
  it("le testeur possède tout", () => {
    expect(isCardOwned(card(1, null), new Set(), true)).toBe(true);
  });

  it("une carte rattachée à un set (set_id != null) est gratuite pour tous", () => {
    expect(isCardOwned(card(2, 7), new Set(), false)).toBe(true);
  });

  it("hors set : possédée seulement si dans la collection personnelle", () => {
    expect(isCardOwned(card(3, null), new Set([3]), false)).toBe(true);
    expect(isCardOwned(card(4, null), new Set([3]), false)).toBe(false);
  });
});

describe("filterOwnedCards", () => {
  it("ne garde que les cartes possédées (set OU collection), non-testeur", () => {
    const cards = [card(1, null), card(2, 9), card(3, null), card(4, null)];
    const owned = filterOwnedCards(cards, new Set([3]), false);
    expect(owned.map((c) => c.id)).toEqual([2, 3]); // 2 via set, 3 via collection
  });

  it("le testeur garde tout", () => {
    const cards = [card(1, null), card(2, null)];
    expect(filterOwnedCards(cards, new Set(), true)).toHaveLength(2);
  });
});
