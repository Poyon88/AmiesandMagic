"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DECK_SIZE } from "@/lib/game/constants";

interface DeckWithCount {
  id: number;
  name: string;
  cardCount: number;
  updated_at: string;
}

export default function DeckList({ decks }: { decks: DeckWithCount[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  async function handleDelete(deckId: number) {
    setDeletingId(deckId);
    await supabase.from("decks").delete().eq("id", deckId);
    setConfirmDeleteId(null);
    setDeletingId(null);
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-primary">My Decks</h1>
          <p className="text-foreground/50 text-sm mt-1">
            {decks.length} deck{decks.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/decks/builder")}
            className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-background font-bold rounded-lg transition-colors"
          >
            + New Deck
          </button>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2.5 bg-secondary border border-card-border rounded-lg text-foreground/60 hover:text-foreground hover:border-primary/40 transition-colors"
          >
            Back to Menu
          </button>
        </div>
      </div>

      {/* Deck Grid */}
      {decks.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-foreground/40 text-lg mb-4">
            You don&apos;t have any decks yet
          </p>
          <button
            onClick={() => router.push("/decks/builder")}
            className="px-6 py-3 bg-primary hover:bg-primary-dark text-background font-bold rounded-lg transition-colors"
          >
            Create Your First Deck
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {decks.map((deck) => (
            <div
              key={deck.id}
              className="bg-secondary border border-card-border rounded-xl p-5 hover:border-primary/40 transition-colors"
            >
              <h3 className="font-bold text-foreground text-lg mb-1">
                {deck.name}
              </h3>
              <p
                className={`text-sm mb-4 ${
                  deck.cardCount === DECK_SIZE
                    ? "text-success"
                    : "text-accent"
                }`}
              >
                {deck.cardCount}/{DECK_SIZE} cards
                {deck.cardCount === DECK_SIZE && " (Valid)"}
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() =>
                    router.push(`/decks/builder?id=${deck.id}`)
                  }
                  className="flex-1 py-2 bg-mana-blue/20 text-mana-blue rounded-lg text-sm font-medium hover:bg-mana-blue/30 transition-colors"
                >
                  Edit
                </button>

                {confirmDeleteId === deck.id ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleDelete(deck.id)}
                      disabled={deletingId === deck.id}
                      className="px-3 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80 transition-colors disabled:opacity-50"
                    >
                      {deletingId === deck.id ? "..." : "Confirm"}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-3 py-2 bg-background border border-card-border rounded-lg text-sm text-foreground/50 hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(deck.id)}
                    className="px-3 py-2 bg-accent/20 text-accent rounded-lg text-sm font-medium hover:bg-accent/30 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
