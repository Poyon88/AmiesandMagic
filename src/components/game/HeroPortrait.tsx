"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import type { HeroState } from "@/lib/game/types";
import useLongPress, { LONG_PRESS_RESET_STYLE } from "@/hooks/useLongPress";
import { isBigHit } from "@/lib/fx/impactFx";

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
  /** When the hero is a valid target for an ACTIVATABLE POWER, this carries
   *  the power's icon colour so the highlight matches it (jaune pour activable,
   *  etc.). null/undefined → default red attack-target ring is kept. */
  validTargetColor?: string | null;
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
  validTargetColor = null,
  damageAmount = null,
  onClick,
  onDoubleClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
}: HeroPortraitProps) {
  const longPress = useLongPress(() => onContextMenu?.());
  const isBigDmg = damageAmount != null && isBigHit(damageAmount);
  // Activatable-power targeting → colour the ring like the power icon instead
  // of the default red attack ring.
  const powerRing = isValidTarget && !!validTargetColor;

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
        animate={
          damageAmount
            ? {
                // Amplitude-decaying shake (reads as an impact absorbing, not a
                // constant vibration) + a brightness flash, tiered on big hits.
                x: isBigDmg ? [0, -11, 8, -5, 4, -2, 0] : [0, -7, 5, -3, 2, -1, 0],
                filter: [
                  "brightness(1) saturate(1)",
                  `brightness(${isBigDmg ? 1.8 : 1.55}) saturate(0.6)`,
                  "brightness(1) saturate(1)",
                ],
              }
            : { x: 0, filter: "brightness(1) saturate(1)" }
        }
        transition={{ duration: isBigDmg ? 0.55 : 0.45, ease: "easeOut" }}
        style={powerRing
          ? { ...LONG_PRESS_RESET_STYLE, boxShadow: `0 0 0 2px ${validTargetColor}, 0 0 14px 2px ${validTargetColor}66` }
          : LONG_PRESS_RESET_STYLE}
        className={`
          pointer-events-none relative w-40 h-48 rounded-xl overflow-hidden
          transition-[box-shadow,transform]
          ${isValidTarget && !powerRing ? "ring-2 ring-attack-red animate-[pulse-ring_1.5s_ease-in-out_infinite] hover:scale-105" : ""}
          ${powerRing ? "hover:scale-105" : ""}
          ${onClick && !isValidTarget ? "hover:scale-105" : ""}
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
            quality={90}
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

        {/* Centered tap zone — the portrait box itself is pointer-transparent
            (pointer-events-none above); only this ~55%-wide disc over the
            crest captures clicks/taps. This keeps hand cards that peek out
            from behind the floating portrait tappable on touch/iPad, where
            the full 160×192 box used to steal their taps. */}
        <div
          data-target-id={isOpponent ? "enemy_hero" : "friendly_hero"}
          {...longPress.handlers}
          onClick={onClick ? () => { if (longPress.consume()) return; onClick(); } : undefined}
          onDoubleClick={onDoubleClick}
          onContextMenu={(e) => {
            if (!onContextMenu) return;
            e.preventDefault();
            onContextMenu();
          }}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          className={`absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-auto ${onClick ? "cursor-pointer" : ""}`}
          style={{ width: "55%", height: "55%", touchAction: "manipulation" }}
        />
      </motion.div>
    </div>
  );
}
