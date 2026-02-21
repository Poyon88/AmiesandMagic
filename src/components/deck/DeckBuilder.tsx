"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Card, Keyword } from "@/lib/game/types";
import { DECK_SIZE } from "@/lib/game/constants";
import GameCard from "@/components/cards/GameCard";

interface DeckEntry {
  card: Card;
  quantity: number;
}

interface DeckBuilderProps {
  cards: Card[];
  userId: string;
  existingDeck: { id: number; name: string } | null;
  existingDeckCards: { card_id: number; quantity: number }[];
}

const KEYWORDS: Keyword[] = ["charge", "taunt", "divine_shield", "ranged"];
const KEYWORD_LABELS: Record<Keyword, string> = {
  charge: "Charge",
  taunt: "Taunt",
  divine_shield: "Divine Shield",
  ranged: "Ranged",
};

export default function DeckBuilder({
  cards,
  userId,
  existingDeck,
  existingDeckCards,
}: DeckBuilderProps) {
  const router = useRouter();
  const supabase = createClient();

  const [deckName, setDeckName] = useState(existingDeck?.name ?? "");
  const [deckCards, setDeckCards] = useState<Map<number, DeckEntry>>(() => {
    const map = new Map<number, DeckEntry>();
    existingDeckCards.forEach((dc) => {
      const card = cards.find((c) => c.id === dc.card_id);
      if (card) map.set(card.id, { card, quantity: dc.quantity });
    });
    return map;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [manaCostFilter, setManaCostFilter] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<"creature" | "spell" | null>(null);
  const [keywordFilter, setKeywordFilter] = useState<Keyword | null>(null);

  const totalCards = useMemo(() => {
    let total = 0;
    deckCards.forEach((entry) => (total += entry.quantity));
    return total;
  }, [deckCards]);

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      if (search && !card.name.toLowerCase().includes(search.toLowerCase()))
        return false;
      if (manaCostFilter !== null && card.mana_cost !== manaCostFilter)
        return false;
      if (typeFilter !== null && card.card_type !== typeFilter) return false;
      if (keywordFilter !== null && !card.keywords.includes(keywordFilter))
        return false;
      return true;
    });
  }, [cards, search, manaCostFilter, typeFilter, keywordFilter]);

  const sortedDeckEntries = useMemo(() => {
    return Array.from(deckCards.values()).sort(
      (a, b) => a.card.mana_cost - b.card.mana_cost || a.card.name.localeCompare(b.card.name)
    );
  }, [deckCards]);

  function addCard(card: Card) {
    if (totalCards >= DECK_SIZE) return;
    const newMap = new Map(deckCards);
    const existing = newMap.get(card.id);
    if (existing) {
      if (existing.quantity >= 4) return; // max 4 copies
      newMap.set(card.id, { ...existing, quantity: existing.quantity + 1 });
    } else {
      newMap.set(card.id, { card, quantity: 1 });
    }
    setDeckCards(newMap);
  }

  function removeCard(cardId: number) {
    const newMap = new Map(deckCards);
    const existing = newMap.get(cardId);
    if (existing) {
      if (existing.quantity > 1) {
        newMap.set(cardId, { ...existing, quantity: existing.quantity - 1 });
      } else {
        newMap.delete(cardId);
      }
    }
    setDeckCards(newMap);
  }

  async function saveDeck() {
    if (!deckName.trim()) {
      setError("Please enter a deck name");
      return;
    }
    if (totalCards !== DECK_SIZE) {
      setError(`Deck must contain exactly ${DECK_SIZE} cards (currently ${totalCards})`);
      return;
    }

    setSaving(true);
    setError("");

    try {
      let deckId = existingDeck?.id;

      if (deckId) {
        // Update existing deck
        await supabase
          .from("decks")
          .update({ name: deckName.trim(), updated_at: new Date().toISOString() })
          .eq("id", deckId);

        // Delete old cards and re-insert
        await supabase.from("deck_cards").delete().eq("deck_id", deckId);
      } else {
        // Create new deck
        const { data, error } = await supabase
          .from("decks")
          .insert({ user_id: userId, name: deckName.trim() })
          .select("id")
          .single();

        if (error) throw error;
        deckId = data.id;
      }

      // Insert deck cards
      const deckCardsToInsert = Array.from(deckCards.values()).map((entry) => ({
        deck_id: deckId!,
        card_id: entry.card.id,
        quantity: entry.quantity,
      }));

      const { error: insertError } = await supabase
        .from("deck_cards")
        .insert(deckCardsToInsert);

      if (insertError) throw insertError;

      router.push("/decks");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save deck");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left: Card Collection */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground">Card Collection</h2>
          <button
            onClick={() => router.push("/decks")}
            className="px-3 py-1.5 bg-secondary border border-card-border rounded-lg text-sm text-foreground/60 hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="px-3 py-1.5 bg-secondary border border-card-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary w-48"
          />
          <div className="flex gap-0.5">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((cost) => (
              <button
                key={cost}
                onClick={() =>
                  setManaCostFilter(manaCostFilter === cost ? null : cost)
                }
                className={`w-6 h-6 rounded-full text-[10px] font-bold transition-colors ${
                  manaCostFilter === cost
                    ? "bg-mana-blue text-white"
                    : "bg-secondary border border-card-border text-foreground/50 hover:border-mana-blue/50"
                }`}
              >
                {cost}
              </button>
            ))}
          </div>
          <button
            onClick={() =>
              setTypeFilter(typeFilter === "creature" ? null : "creature")
            }
            className={`px-2 py-1 rounded text-xs transition-colors ${
              typeFilter === "creature"
                ? "bg-primary text-background"
                : "bg-secondary border border-card-border text-foreground/50"
            }`}
          >
            Creatures
          </button>
          <button
            onClick={() =>
              setTypeFilter(typeFilter === "spell" ? null : "spell")
            }
            className={`px-2 py-1 rounded text-xs transition-colors ${
              typeFilter === "spell"
                ? "bg-purple-600 text-white"
                : "bg-secondary border border-card-border text-foreground/50"
            }`}
          >
            Spells
          </button>
          <select
            value={keywordFilter ?? ""}
            onChange={(e) =>
              setKeywordFilter(
                e.target.value ? (e.target.value as Keyword) : null
              )
            }
            className="px-2 py-1 bg-secondary border border-card-border rounded text-xs text-foreground/70 focus:outline-none"
          >
            <option value="">Keywords</option>
            {KEYWORDS.map((kw) => (
              <option key={kw} value={kw}>
                {KEYWORD_LABELS[kw]}
              </option>
            ))}
          </select>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filteredCards.map((card) => {
            const inDeck = deckCards.get(card.id);
            return (
              <GameCard
                key={card.id}
                card={card}
                size="sm"
                onClick={() => addCard(card)}
                disabled={totalCards >= DECK_SIZE && !inDeck}
                count={inDeck?.quantity}
              />
            );
          })}
        </div>
      </div>

      {/* Right: Current Deck */}
      <div className="w-80 bg-secondary border-l border-card-border flex flex-col">
        {/* Deck header */}
        <div className="p-4 border-b border-card-border">
          <input
            type="text"
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            placeholder="Deck name..."
            className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-foreground focus:outline-none focus:border-primary mb-3"
          />
          <div className="flex items-center justify-between">
            <span
              className={`font-bold text-lg ${
                totalCards === DECK_SIZE ? "text-success" : "text-foreground"
              }`}
            >
              {totalCards}/{DECK_SIZE}
            </span>
            {/* Mana curve mini */}
            <div className="flex gap-0.5 items-end h-6">
              {Array.from({ length: 11 }, (_, cost) => {
                const count = sortedDeckEntries
                  .filter((e) => e.card.mana_cost === cost)
                  .reduce((s, e) => s + e.quantity, 0);
                const maxHeight = 24;
                const height = count > 0 ? Math.max(4, (count / 8) * maxHeight) : 0;
                return (
                  <div
                    key={cost}
                    className="w-2 bg-mana-blue/60 rounded-t"
                    style={{ height: `${height}px` }}
                    title={`${cost} mana: ${count} cards`}
                  />
                );
              })}
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 bg-background rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                totalCards === DECK_SIZE ? "bg-success" : "bg-primary"
              }`}
              style={{ width: `${(totalCards / DECK_SIZE) * 100}%` }}
            />
          </div>
        </div>

        {/* Card list */}
        <div className="flex-1 overflow-y-auto p-2">
          {sortedDeckEntries.length === 0 ? (
            <p className="text-center text-foreground/30 mt-8 text-sm">
              Click cards to add them
            </p>
          ) : (
            <div className="space-y-1">
              {sortedDeckEntries.map((entry) => (
                <div
                  key={entry.card.id}
                  onClick={() => removeCard(entry.card.id)}
                  className="flex items-center gap-2 px-2 py-1.5 bg-background rounded-lg cursor-pointer hover:bg-card-border/30 transition-colors group"
                >
                  <span className="w-5 h-5 rounded-full bg-mana-blue flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                    {entry.card.mana_cost}
                  </span>
                  <span className="text-sm text-foreground flex-1 truncate">
                    {entry.card.name}
                  </span>
                  <span className="text-xs text-foreground/40 group-hover:text-accent transition-colors">
                    x{entry.quantity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Save button */}
        <div className="p-4 border-t border-card-border">
          {error && (
            <p className="text-accent text-xs mb-2">{error}</p>
          )}
          <button
            onClick={saveDeck}
            disabled={saving}
            className="w-full py-3 bg-primary hover:bg-primary-dark text-background font-bold rounded-lg transition-colors disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : existingDeck
              ? "Save Changes"
              : "Create Deck"}
          </button>
        </div>
      </div>
    </div>
  );
}
