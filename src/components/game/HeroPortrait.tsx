"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import type { HeroState, Race } from "@/lib/game/types";
import { HERO_MAX_HP } from "@/lib/game/constants";

const HERO_IMAGES: Record<Race, string> = {
  elves: "/images/heroes/elves.png",
  dwarves: "/images/heroes/dwarves.svg",
  halflings: "/images/heroes/halflings.svg",
  humans: "/images/heroes/humans.svg",
  beastmen: "/images/heroes/beastmen.svg",
  giants: "/images/heroes/giants.svg",
  dark_elves: "/images/heroes/dark_elves.svg",
  orcs_goblins: "/images/heroes/orcs_goblins.svg",
  undead: "/images/heroes/undead.png",
};

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
    <div className="flex flex-col items-center gap-1">
      {/* HP display above portrait */}
      <div
        className={`px-2 py-0.5 rounded-md bg-black/60 text-sm font-bold ${
          hero.hp <= 10 ? "text-accent" : "text-white"
        }`}
      >
        {hero.hp}
      </div>

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
          relative w-20 h-24 rounded-xl overflow-hidden
          ${isOpponent ? "border-accent/40" : "border-mana-blue/40"}
          border-2 transition-[border-color,box-shadow,transform]
          ${isValidTarget ? "ring-2 ring-attack-red animate-[pulse-ring_1.5s_ease-in-out_infinite] cursor-pointer hover:scale-105" : ""}
          ${onClick && !isValidTarget ? "cursor-pointer hover:scale-105" : ""}
        `}
      >
        {/* Hero portrait - full bleed */}
        {hero.heroDefinition?.race ? (
          <Image
            src={HERO_IMAGES[hero.heroDefinition.race]}
            alt={hero.heroDefinition.race}
            fill
            sizes="(min-resolution: 2dppx) 160px, 80px"
            quality={90}
            className="object-cover"
            priority
          />
        ) : (
          <div className={`absolute inset-0 flex items-center justify-center ${
            isOpponent ? "bg-accent/20" : "bg-mana-blue/20"
          }`}>
            <span className="text-2xl">{isOpponent ? "👹" : "🛡️"}</span>
          </div>
        )}

        {/* Armor badge */}
        {hero.armor > 0 && (
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-yellow-600 border-2 border-yellow-400 flex items-center justify-center shadow-md">
            <span className="text-[10px] font-bold text-white">{hero.armor}</span>
          </div>
        )}
      </motion.div>
    </div>
  );
}
