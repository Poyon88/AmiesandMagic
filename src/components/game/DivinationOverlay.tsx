"use client";

import { useState } from "react";
import type { CardInstance } from "@/lib/game/types";
import GameCard from "@/components/cards/GameCard";
import { useGameStore } from "@/lib/store/gameStore";

interface DivinationOverlayProps {
  cards: CardInstance[];
  onChoose: (index: number) => void;
  onCancel: () => void;
}

export default function DivinationOverlay({ cards, onChoose, onCancel }: DivinationOverlayProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const tokenTemplates = useGameStore((s) => s.tokenTemplates);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        {/* Title */}
        <div style={{
          fontSize: 20, fontWeight: 700, color: "#fff",
          fontFamily: "'Cinzel', serif", textAlign: "center",
          textShadow: "0 2px 8px rgba(0,0,0,0.5)",
        }}>
          🔍 Divination
        </div>
        <p style={{ fontSize: 14, color: "#bbb", textAlign: "center", fontFamily: "'Crimson Text', serif", marginTop: -12 }}>
          Choisissez la carte à placer sur le dessus de votre pioche
        </p>

        {/* Cards */}
        <div style={{ display: "flex", gap: 20, justifyContent: "center" }}>
          {cards.map((cardInstance, i) => (
            <div
              key={cardInstance.instanceId}
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
              <GameCard card={cardInstance.card} size="md" tokens={tokenTemplates} />
            </div>
          ))}
        </div>

        {/* Cancel */}
        <button
          onClick={onCancel}
          style={{
            padding: "8px 24px", borderRadius: 8,
            background: "#333", border: "1px solid #555", color: "#aaa",
            fontSize: 13, fontFamily: "'Cinzel', serif", cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
