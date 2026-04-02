"use client";

import { useState } from "react";
import type { Card } from "@/lib/game/types";
import GameCard from "@/components/cards/GameCard";

interface SelectionOverlayProps {
  cards: Card[];
  onChoose: (index: number) => void;
}

export default function SelectionOverlay({ cards, onChoose }: SelectionOverlayProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        {/* Title */}
        <div style={{
          fontSize: 20, fontWeight: 700, color: "#fff",
          fontFamily: "'Cinzel', serif", textAlign: "center",
          textShadow: "0 2px 8px rgba(0,0,0,0.5)",
        }}>
          🎴 Sélection
        </div>
        <p style={{ fontSize: 14, color: "#bbb", textAlign: "center", fontFamily: "'Crimson Text', serif", marginTop: -12 }}>
          Choisissez une carte à ajouter à votre main
        </p>

        {/* Cards */}
        <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
          {cards.map((card, i) => (
            <div
              key={`${card.id}-${i}`}
              onClick={() => onChoose(i)}
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
              <GameCard card={card} size="md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
