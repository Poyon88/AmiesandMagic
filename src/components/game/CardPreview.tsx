"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CardInstance } from "@/lib/game/types";
import CardArt from "@/components/cards/CardArt";

interface CardPreviewProps {
  cardInstance: CardInstance;
  anchorRef: React.RefObject<HTMLElement | null>;
  position?: "above" | "below";
}

export default function CardPreview({ cardInstance, anchorRef, position = "above" }: CardPreviewProps) {
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState({ left: 0, top: 0 });
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const previewW = 220;
  const previewH = 330;

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();

    let left = rect.left + rect.width / 2 - previewW / 2;
    let top: number;

    if (position === "above") {
      top = rect.top - previewH - 8;
      if (top < 8) top = rect.bottom + 8;
    } else {
      top = rect.bottom + 8;
      if (top + previewH > window.innerHeight - 8) top = rect.top - previewH - 8;
    }

    // Clamp horizontal
    if (left < 8) left = 8;
    if (left + previewW > window.innerWidth - 8) left = window.innerWidth - previewW - 8;

    setCoords({ left, top });
  }, [anchorRef, position]);

  if (!mounted) return null;

  const card = cardInstance.card;
  const isCreature = card.card_type === "creature";

  return createPortal(
    <div
      ref={previewRef}
      style={{
        position: "fixed",
        left: coords.left,
        top: coords.top,
        width: previewW,
        height: previewH,
        zIndex: 10001,
        pointerEvents: "none",
      }}
    >
      <div
        className={`
          w-full h-full rounded-xl border-2 flex flex-col overflow-hidden shadow-2xl
          ${isCreature ? "bg-card-bg border-card-border" : "bg-purple-900/80 border-purple-500/40"}
        `}
      >
        {/* Mana cost */}
        <div className="absolute top-2 left-2 w-9 h-9 rounded-full bg-mana-blue flex items-center justify-center text-white font-bold text-lg z-10 shadow-md">
          {card.mana_cost}
        </div>

        {/* Art */}
        <CardArt card={card} className="h-28" />

        {/* Name */}
        <div className="px-3 py-2 text-center border-b border-card-border/30">
          <h3 className="text-sm font-bold text-foreground leading-tight">
            {card.name}
          </h3>
        </div>

        {/* Effect */}
        <div className="px-3 py-2 flex-1">
          <p className="text-xs text-foreground/70 leading-relaxed">
            {card.effect_text}
          </p>
        </div>

        {/* Keywords */}
        {card.keywords.length > 0 && (
          <div className="px-3 pb-1 flex gap-1 flex-wrap">
            {card.keywords.map((kw) => (
              <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium capitalize">
                {kw.replace("_", " ")}
              </span>
            ))}
          </div>
        )}

        {/* Stats */}
        {isCreature ? (
          <div className="flex justify-between px-3 py-2">
            <span className="w-9 h-9 rounded-lg bg-attack-yellow flex items-center justify-center text-background font-bold text-lg">
              {cardInstance.currentAttack}
            </span>
            <span
              className={`w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-lg ${
                cardInstance.currentHealth < cardInstance.maxHealth
                  ? "bg-accent"
                  : cardInstance.currentHealth > (card.health ?? 0)
                  ? "bg-green-500"
                  : "bg-health-red"
              }`}
            >
              {cardInstance.currentHealth}
            </span>
          </div>
        ) : (
          <div className="text-center py-2">
            <span className="text-xs text-purple-300/60 uppercase font-medium tracking-wider">
              Spell
            </span>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
