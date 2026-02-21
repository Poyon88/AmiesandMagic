"use client";

import { useState } from "react";
import type { CardInstance } from "@/lib/game/types";
import CardArt from "@/components/cards/CardArt";

interface MulliganOverlayProps {
  hand: CardInstance[];
  onConfirm: (selectedInstanceIds: string[]) => void;
  waitingForOpponent: boolean;
}

export default function MulliganOverlay({
  hand,
  onConfirm,
  waitingForOpponent,
}: MulliganOverlayProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleCard(instanceId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(instanceId)) {
        next.delete(instanceId);
      } else {
        next.add(instanceId);
      }
      return next;
    });
  }

  if (waitingForOpponent) {
    return (
      <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">⏳</div>
          <p className="text-foreground/70 text-lg">
            En attente de l&apos;adversaire...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center">
      <div className="text-center max-w-2xl px-6">
        <h1 className="text-2xl font-bold text-foreground mb-2">Mulligan</h1>
        <p className="text-foreground/50 mb-8 text-sm">
          Sélectionnez les cartes à remplacer, puis confirmez.
        </p>

        <div className="flex justify-center gap-4 mb-10">
          {hand.map((cardInstance) => {
            const card = cardInstance.card;
            const isSelected = selected.has(cardInstance.instanceId);
            const isCreature = card.card_type === "creature";

            return (
              <button
                key={cardInstance.instanceId}
                onClick={() => toggleCard(cardInstance.instanceId)}
                className={`
                  relative w-28 h-40 rounded-lg border-2 flex flex-col overflow-hidden
                  transition-all cursor-pointer hover:scale-105
                  ${isCreature ? "bg-card-bg" : "bg-purple-900/50"}
                  ${
                    isSelected
                      ? "border-accent ring-2 ring-accent/50 opacity-60 scale-95"
                      : "border-card-border hover:border-primary"
                  }
                `}
              >
                {/* Replace badge */}
                {isSelected && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-accent/20">
                    <span className="text-accent font-bold text-xs px-2 py-1 rounded bg-background/80">
                      REMPLACER
                    </span>
                  </div>
                )}

                {/* Mana cost */}
                <div className="absolute top-1 left-1 w-6 h-6 rounded-full bg-mana-blue flex items-center justify-center text-white font-bold text-xs z-10">
                  {card.mana_cost}
                </div>

                {/* Art */}
                <CardArt card={card} className="h-[35%]" />

                {/* Name */}
                <div className="px-1.5 py-1 text-center">
                  <h3 className="text-[10px] font-bold text-foreground leading-tight">
                    {card.name}
                  </h3>
                </div>

                {/* Effect */}
                <div className="flex-1 px-1.5 overflow-hidden">
                  <p className="text-[8px] text-foreground/60 leading-tight">
                    {card.effect_text}
                  </p>
                </div>

                {/* Stats */}
                {isCreature ? (
                  <div className="flex justify-between px-1.5 pb-1">
                    <span className="w-5 h-5 rounded bg-attack-yellow flex items-center justify-center text-background font-bold text-[10px]">
                      {card.attack}
                    </span>
                    <span className="w-5 h-5 rounded bg-health-red flex items-center justify-center text-white font-bold text-[10px]">
                      {card.health}
                    </span>
                  </div>
                ) : (
                  <div className="text-center pb-1">
                    <span className="text-[8px] text-purple-300/60 uppercase">
                      Sort
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onConfirm(Array.from(selected))}
          className="px-8 py-3 bg-primary hover:bg-primary-dark text-background font-bold rounded-xl text-lg transition-colors"
        >
          {selected.size === 0 ? "Garder tout" : `Remplacer ${selected.size} carte${selected.size > 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}
