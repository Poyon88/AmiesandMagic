"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import type { HeroState, HeroClass } from "@/lib/game/types";
import { HERO_MAX_HP } from "@/lib/game/constants";

const HERO_IMAGES: Record<HeroClass, string> = {
  necromancer: "/images/heroes/necromancer.png",
  warrior: "/images/heroes/warrior.svg",
  mage: "/images/heroes/mage.svg",
  priest: "/images/heroes/priest.svg",
  ranger: "/images/heroes/ranger.png",
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
        ${isValidTarget ? "ring-2 ring-attack-yellow animate-[pulse-ring_1.5s_ease-in-out_infinite] cursor-pointer hover:scale-105" : ""}
        ${onClick && !isValidTarget ? "cursor-pointer hover:scale-105" : ""}
      `}
    >
      {/* Hero portrait - full bleed */}
      {hero.heroDefinition?.heroClass ? (
        <Image
          src={HERO_IMAGES[hero.heroDefinition.heroClass]}
          alt={hero.heroDefinition.heroClass}
          fill
          sizes="80px"
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

      {/* HP text overlay */}
      <div
        className={`absolute bottom-0 left-0 right-0 flex items-center justify-center py-0.5 bg-black/50 text-sm font-bold ${
          hero.hp <= 10 ? "text-accent" : "text-white"
        }`}
      >
        {hero.hp}
      </div>

      {/* Armor badge */}
      {hero.armor > 0 && (
        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-yellow-600 border-2 border-yellow-400 flex items-center justify-center shadow-md">
          <span className="text-[10px] font-bold text-white">{hero.armor}</span>
        </div>
      )}
    </motion.div>
  );
}
