"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import type { HeroState } from "@/lib/game/types";
import { HERO_MAX_HP } from "@/lib/game/constants";

const HERO_IMAGES: Record<string, string> = {
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
// Granular races (e.g. "Aigles Géants", "Hommes-Loups") don't have a
// dedicated portrait file — the hero is expected to ship its own
// thumbnailUrl. Falls back to the humans portrait so the layout never breaks.
const HERO_IMAGE_FALLBACK = HERO_IMAGES.humans;

interface HeroPortraitProps {
  hero: HeroState;
  isOpponent: boolean;
  isValidTarget?: boolean;
  damageAmount?: number | null;
  onClick?: () => void;
  // Double-click → activates non-targeted hero powers (e.g. gain_armor,
  // deal_damage with target=enemy_hero). Mirrors the 3D hero UX so 2D heroes
  // aren't stuck waiting for a targeting prompt that never opens.
  onDoubleClick?: () => void;
  // Right-click → opens the hero / power description overlay (same UX
  // as the 3D hero). Default browser context menu is suppressed.
  onContextMenu?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export default function HeroPortrait({
  hero,
  isOpponent,
  isValidTarget = false,
  damageAmount = null,
  onClick,
  onDoubleClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
}: HeroPortraitProps) {
  const hpPercentage = Math.max(0, (hero.hp / HERO_MAX_HP) * 100);

  return (
    <div className="relative flex flex-col items-center">
      {/* HP overlay — overlaid on the portrait (no background frame), big
          and bold, with a heavy drop-shadow so it stays legible against
          any artwork. Positioned at top-center so it reads like the HP
          number floating above the head. */}
      <div
        className={`pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 z-10 text-4xl font-black tracking-wide ${
          hero.hp <= 10 ? "text-accent" : "text-white"
        }`}
        style={{
          fontFamily: "var(--font-cinzel), serif",
          textShadow:
            "0 2px 6px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.9), 0 0 1px rgba(0,0,0,1)",
          lineHeight: 1,
        }}
      >
        {hero.hp}
      </div>

      <motion.div
        data-target-id={isOpponent ? "enemy_hero" : "friendly_hero"}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => {
          if (!onContextMenu) return;
          e.preventDefault();
          onContextMenu();
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        animate={
          damageAmount
            ? { x: [0, -5, 5, -5, 5, 0] }
            : { x: 0 }
        }
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={`
          relative w-40 h-48 rounded-xl overflow-hidden
          transition-[box-shadow,transform]
          ${isValidTarget ? "ring-2 ring-attack-red animate-[pulse-ring_1.5s_ease-in-out_infinite] cursor-pointer hover:scale-105" : ""}
          ${onClick && !isValidTarget ? "cursor-pointer hover:scale-105" : ""}
        `}
      >
        {/* Hero portrait — admin-uploaded 2D image (`thumbnailUrl`) wins
            over the faction-default fallback so per-hero artwork shows up
            for 2D-only heroes. The race-default keeps the legacy 3D
            heroes' portraits looking right when they're shown in a
            non-3D context (deck builder, mulligan thumbnail). */}
        {hero.heroDefinition?.thumbnailUrl ? (
          <Image
            src={hero.heroDefinition.thumbnailUrl}
            alt={hero.heroDefinition.name ?? hero.heroDefinition.race}
            fill
            sizes="(min-resolution: 2dppx) 640px, 320px"
            quality={92}
            className="object-cover"
            priority
          />
        ) : hero.heroDefinition?.race ? (
          <Image
            src={HERO_IMAGES[hero.heroDefinition.race] ?? HERO_IMAGE_FALLBACK}
            alt={hero.heroDefinition.race}
            fill
            sizes="(min-resolution: 2dppx) 320px, 160px"
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
          <div className="absolute bottom-1.5 right-1.5 w-[42px] h-[42px] rounded-full bg-yellow-600 border-[3px] border-yellow-400 flex items-center justify-center shadow-lg">
            <span className="text-[18px] font-bold text-white leading-none">{hero.armor}</span>
          </div>
        )}
      </motion.div>
    </div>
  );
}
