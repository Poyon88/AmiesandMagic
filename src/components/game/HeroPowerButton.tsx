"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { HeroDefinition } from "@/lib/game/types";

const POWER_IMAGES: Record<string, string> = {
  elves: "/images/powers/elves.svg",
  dwarves: "/images/powers/dwarves.svg",
  halflings: "/images/powers/halflings.svg",
  humans: "/images/powers/humans.svg",
  beastmen: "/images/powers/beastmen.svg",
  giants: "/images/powers/giants.svg",
  dark_elves: "/images/powers/dark_elves.svg",
  orcs_goblins: "/images/powers/orcs_goblins.svg",
  undead: "/images/powers/undead.svg",
};

interface HeroPowerButtonProps {
  heroDef: HeroDefinition | null;
  isOpponent: boolean;
  canUse: boolean;
  isUsed: boolean;
  mana: number;
  onClick?: () => void;
}

export default function HeroPowerButton({
  heroDef,
  isOpponent,
  canUse,
  isUsed,
  mana,
  onClick,
}: HeroPowerButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  if (!heroDef) return null;

  const isPassive = heroDef.powerType === "passive";
  const notEnoughMana = !isPassive && mana < heroDef.powerCost;
  const available = !isOpponent && canUse && !isUsed && !notEnoughMana && !isPassive;

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({
      x: rect.left + rect.width / 2,
      y: isOpponent ? rect.bottom + 4 : rect.top - 4,
    });
    setHovered(true);
  };

  return (
    <div
      className="relative flex flex-col items-center gap-0.5"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        role="button"
        onClick={available ? onClick : undefined}
        style={{ width: 48, height: 48, borderRadius: "50%" }}
        className={`
          relative shrink-0 border-2 flex items-center justify-center transition-all
          ${isPassive
            ? "border-purple-500/60 bg-purple-900/30 cursor-default"
            : available
            ? "border-primary/80 bg-primary/20 hover:bg-primary/30 hover:scale-110 cursor-pointer shadow-[0_0_8px_rgba(59,130,246,0.4)]"
            : isUsed
            ? "border-card-border/40 bg-card-border/20 opacity-50 cursor-not-allowed"
            : notEnoughMana
            ? "border-card-border/40 bg-card-border/20 opacity-40 cursor-not-allowed"
            : "border-card-border/40 bg-card-border/20 cursor-not-allowed"
          }
        `}
      >
        {/* Mana cost badge */}
        {!isPassive && (
          <span className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-mana-blue flex items-center justify-center text-white text-[10px] font-bold shadow-sm">
            {heroDef.powerCost}
          </span>
        )}

        {/* Passive label */}
        {isPassive && (
          <span className="absolute -top-1 -left-1 px-1 rounded text-[8px] font-bold bg-purple-600 text-white">
            AUTO
          </span>
        )}

        {/* Class power icon */}
        <img
          src={POWER_IMAGES[heroDef.race] ?? ""}
          alt={heroDef.powerName}
          className="w-full h-full rounded-full object-cover"
        />
      </div>

      {/* Power name — always visible */}
      <span className="text-[9px] text-foreground/40 truncate max-w-16 text-center leading-tight">
        {heroDef.powerName}
      </span>

      {/* Tooltip — portaled to body so it's never clipped */}
      {hovered &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed z-[9999] pointer-events-none bg-background/95 border border-card-border rounded-lg px-3 py-2 w-44 text-center shadow-lg"
            style={{
              left: tooltipPos.x,
              top: tooltipPos.y,
              transform: isOpponent
                ? "translateX(-50%)"
                : "translateX(-50%) translateY(-100%)",
            }}
          >
            <div className="text-xs font-bold text-foreground">{heroDef.powerName}</div>
            <div className="text-[10px] text-foreground/60 mt-0.5">{heroDef.powerDescription}</div>
            {isUsed && !isPassive && (
              <div className="text-[10px] text-accent mt-1 font-medium">Used this turn</div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
