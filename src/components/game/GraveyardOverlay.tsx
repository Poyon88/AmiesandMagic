"use client";

import type { CardInstance } from "@/lib/game/types";
import GameCard from "@/components/cards/GameCard";

interface GraveyardOverlayProps {
  cards: CardInstance[];
  title: string;
  onClose: () => void;
  // Selection mode
  selectableInstanceIds?: string[];
  onSelectCard?: (instanceId: string) => void;
}

export default function GraveyardOverlay({
  cards,
  title,
  onClose,
  selectableInstanceIds,
  onSelectCard,
}: GraveyardOverlayProps) {
  const isSelectionMode = selectableInstanceIds && selectableInstanceIds.length > 0;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-8">
      <div className="bg-secondary rounded-xl border border-card-border max-w-4xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-card-border">
          <h2 className="text-lg font-bold text-foreground">
            {title} ({cards.length} carte{cards.length !== 1 ? "s" : ""})
          </h2>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-background border border-card-border rounded-lg text-sm text-foreground/60 hover:text-foreground transition-colors"
          >
            {isSelectionMode ? "Annuler" : "Fermer"}
          </button>
        </div>

        {/* Instruction */}
        {isSelectionMode && (
          <div className="px-4 pt-3">
            <p className="text-sm text-primary font-medium text-center">
              Choisissez une carte du cimetière
            </p>
          </div>
        )}

        {/* Cards */}
        <div className="flex-1 overflow-y-auto p-4">
          {cards.length === 0 ? (
            <p className="text-center text-foreground/30 py-8">
              Aucune carte dans le cimetière
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {cards.map((cardInstance, i) => {
                const isSelectable = selectableInstanceIds?.includes(cardInstance.instanceId);
                return (
                  <div
                    key={`${cardInstance.instanceId}-${i}`}
                    onClick={() => {
                      if (isSelectable && onSelectCard) {
                        onSelectCard(cardInstance.instanceId);
                      }
                    }}
                    style={{
                      cursor: isSelectable ? "pointer" : "default",
                      opacity: isSelectionMode && !isSelectable ? 0.35 : 1,
                      borderRadius: 10,
                      border: isSelectable ? "2px solid #2ecc71" : "2px solid transparent",
                      boxShadow: isSelectable ? "0 0 12px #2ecc7155" : "none",
                      transition: "all 0.2s",
                    }}
                  >
                    <GameCard
                      card={cardInstance.card}
                      size="sm"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
