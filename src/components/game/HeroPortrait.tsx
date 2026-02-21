"use client";

import { motion } from "framer-motion";
import type { HeroState } from "@/lib/game/types";
import { HERO_MAX_HP } from "@/lib/game/constants";

interface HeroPortraitProps {
  hero: HeroState;
  isOpponent: boolean;
  isValidTarget?: boolean;
  damageAmount?: number | null;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export default function HeroPortrait({
  hero,
  isOpponent,
  isValidTarget = false,
  damageAmount = null,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: HeroPortraitProps) {
  const hpPercentage = Math.max(0, (hero.hp / HERO_MAX_HP) * 100);

  return (
    <motion.div
      data-target-id={isOpponent ? "enemy_hero" : "friendly_hero"}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      animate={
        damageAmount
          ? { x: [0, -5, 5, -5, 5, 0] }
          : { x: 0 }
      }
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={`
        relative w-20 h-24 rounded-xl flex flex-col items-center justify-center
        ${isOpponent ? "bg-accent/20 border-accent/40" : "bg-mana-blue/20 border-mana-blue/40"}
        border-2 transition-[border-color,box-shadow,transform]
        ${isValidTarget ? "ring-2 ring-attack-yellow animate-pulse cursor-pointer hover:scale-105" : ""}
        ${onClick && !isValidTarget ? "cursor-pointer hover:scale-105" : ""}
      `}
    >
      {/* Hero icon */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-1 ${
        isOpponent ? "bg-accent/30 border border-accent/40" : "bg-mana-blue/30 border border-mana-blue/40"
      }`}>
        <span className="text-xl">{isOpponent ? "👹" : "🛡️"}</span>
      </div>

      {/* HP bar */}
      <div className="w-14 h-1.5 bg-background/50 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            hpPercentage > 50
              ? "bg-success"
              : hpPercentage > 25
              ? "bg-attack-yellow"
              : "bg-accent"
          }`}
          style={{ width: `${hpPercentage}%` }}
        />
      </div>

      {/* HP text */}
      <div
        className={`text-sm font-bold mt-0.5 ${
          hero.hp <= 10 ? "text-accent" : "text-foreground"
        }`}
      >
        {hero.hp}
      </div>
    </motion.div>
  );
}
