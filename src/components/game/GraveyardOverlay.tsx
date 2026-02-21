"use client";

import type { CardInstance } from "@/lib/game/types";
import GameCard from "@/components/cards/GameCard";

interface GraveyardOverlayProps {
  cards: CardInstance[];
  title: string;
  onClose: () => void;
}

export default function GraveyardOverlay({
  cards,
  title,
  onClose,
}: GraveyardOverlayProps) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-8">
      <div className="bg-secondary rounded-xl border border-card-border max-w-4xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-card-border">
          <h2 className="text-lg font-bold text-foreground">
            {title} ({cards.length} cards)
          </h2>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-background border border-card-border rounded-lg text-sm text-foreground/60 hover:text-foreground transition-colors"
          >
            Close
          </button>
        </div>

        {/* Cards */}
        <div className="flex-1 overflow-y-auto p-4">
          {cards.length === 0 ? (
            <p className="text-center text-foreground/30 py-8">
              No cards in graveyard
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {cards.map((cardInstance, i) => (
                <GameCard
                  key={`${cardInstance.instanceId}-${i}`}
                  card={cardInstance.card}
                  size="sm"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
