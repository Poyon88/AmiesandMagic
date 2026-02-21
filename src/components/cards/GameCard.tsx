"use client";

import type { Card, Keyword } from "@/lib/game/types";
import CardArt from "@/components/cards/CardArt";

interface GameCardProps {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  size?: "sm" | "md" | "lg";
  count?: number;
}

const keywordColors: Record<Keyword, string> = {
  charge: "bg-orange-600",
  taunt: "bg-blue-700",
  divine_shield: "bg-yellow-600",
  ranged: "bg-green-600",
};

const keywordLabels: Record<Keyword, string> = {
  charge: "Charge",
  taunt: "Taunt",
  divine_shield: "Divine Shield",
  ranged: "Ranged",
};

export default function GameCard({
  card,
  onClick,
  disabled = false,
  selected = false,
  size = "md",
  count,
}: GameCardProps) {
  const sizeClasses = {
    sm: "w-32 h-44",
    md: "w-40 h-56",
    lg: "w-52 h-72",
  };

  const isCreature = card.card_type === "creature";

  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={`
        ${sizeClasses[size]}
        relative rounded-lg border-2 overflow-hidden flex flex-col
        ${
          disabled
            ? "opacity-50 cursor-not-allowed border-card-border"
            : "cursor-pointer hover:scale-105 transition-transform"
        }
        ${
          selected
            ? "border-primary shadow-lg shadow-primary/30"
            : "border-card-border hover:border-primary/60"
        }
        ${isCreature ? "bg-card-bg" : "bg-purple-900/40"}
      `}
    >
      {/* Mana cost bubble */}
      <div className="absolute top-1 left-1 w-7 h-7 rounded-full bg-mana-blue flex items-center justify-center text-white font-bold text-sm shadow-md z-10">
        {card.mana_cost}
      </div>

      {/* Count badge */}
      {count !== undefined && (
        <div className="absolute top-1 right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center text-background font-bold text-xs z-10">
          x{count}
        </div>
      )}

      {/* Card art */}
      <CardArt card={card} className="h-[40%]" />

      {/* Card name */}
      <div className="px-2 py-1 text-center">
        <h3
          className={`font-bold text-foreground leading-tight ${
            size === "sm" ? "text-[10px]" : "text-xs"
          }`}
        >
          {card.name}
        </h3>
      </div>

      {/* Effect text */}
      <div className="flex-1 px-2 overflow-hidden">
        <p
          className={`text-foreground/70 leading-tight ${
            size === "sm" ? "text-[8px]" : "text-[10px]"
          }`}
        >
          {card.effect_text}
        </p>
      </div>

      {/* Keywords */}
      {card.keywords.length > 0 && (
        <div className="px-1.5 pb-0.5 flex flex-wrap gap-0.5 justify-center">
          {card.keywords.map((kw) => (
            <span
              key={kw}
              className={`${keywordColors[kw]} text-white rounded px-1 py-0 text-[7px] font-medium`}
            >
              {keywordLabels[kw]}
            </span>
          ))}
        </div>
      )}

      {/* Bottom stats */}
      {isCreature && (
        <div className="flex justify-between px-2 py-1">
          <div className="w-6 h-6 rounded-full bg-attack-yellow flex items-center justify-center text-background font-bold text-xs">
            {card.attack}
          </div>
          <div className="text-[9px] text-foreground/40 self-center uppercase">
            {card.card_type}
          </div>
          <div className="w-6 h-6 rounded-full bg-health-red flex items-center justify-center text-white font-bold text-xs">
            {card.health}
          </div>
        </div>
      )}

      {!isCreature && (
        <div className="flex justify-center py-1.5">
          <span className="text-[9px] text-purple-300/60 uppercase">Spell</span>
        </div>
      )}
    </div>
  );
}
