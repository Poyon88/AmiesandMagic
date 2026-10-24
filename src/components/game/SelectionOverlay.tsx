"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Card } from "@/lib/game/types";
import GameCard from "@/components/cards/GameCard";
import { useGameStore } from "@/lib/store/gameStore";

interface SelectionOverlayProps {
  cards: Card[];
  onChoose: (cardId: number) => void;
  /** Titre et sous-titre propres (Découverte) ; absents ⇒ ceux de la Sélection. */
  title?: string;
  subtitle?: string;
  /** Étiquette posée au-dessus de certaines cartes, par id (ex. « autre clan »). */
  badges?: Record<number, string>;
}

export default function SelectionOverlay({ cards, onChoose, title, subtitle, badges }: SelectionOverlayProps) {
  const t = useTranslations("game");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const tokenTemplates = useGameStore((s) => s.tokenTemplates);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        {/* Title */}
        <div style={{
          fontSize: 20, fontWeight: 700, color: "#fff",
          fontFamily: "'Cinzel', serif", textAlign: "center",
          textShadow: "0 2px 8px rgba(0,0,0,0.95), 0 0 3px #000",
        }}>
          {title ?? t('selection_title')}
        </div>
        <p style={{ fontSize: 14, color: "#bbb", textAlign: "center", fontFamily: "'Crimson Text', serif", marginTop: -12 }}>
          {subtitle ?? t('selection_subtitle')}
        </p>

        {/* Cards */}
        <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
          {cards.map((card, i) => (
            <div
              key={`${card.id}-${i}`}
              onClick={() => onChoose(card.id)}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{
                cursor: "pointer",
                transform: hoveredIndex === i ? "translateY(-12px) scale(1.05)" : "none",
                transition: "all 0.2s ease",
                borderRadius: 12,
                border: hoveredIndex === i ? "2px solid #a855f7" : "2px solid transparent",
                boxShadow: hoveredIndex === i ? "0 0 20px #a855f766" : "0 4px 12px rgba(0,0,0,0.3)",
              }}
            >
              {badges?.[card.id] && (
                <div style={{
                  textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                  color: "#c8a84e", fontFamily: "'Cinzel', serif", marginBottom: 6,
                }}>
                  {badges[card.id]}
                </div>
              )}
              <GameCard card={card} size="md" tokens={tokenTemplates} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
