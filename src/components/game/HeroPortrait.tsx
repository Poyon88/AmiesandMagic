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
    // Boîte = le MÉDAILLON exactement (rond, 192 px / 208 px) : l'orbite du
    // héros (HeroOrbit) se centre sur elle. L'écu des PV déborde en bas, en
    // absolu, sans agrandir la boîte.
    <div className="relative">
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
          pointer-events-none relative w-48 h-48 lg:w-52 lg:h-52 rounded-full overflow-hidden
          transition-[box-shadow,transform]
          ${isValidTarget && !powerRing ? "ring-2 ring-attack-red animate-[pulse-ring_1.5s_ease-in-out_infinite] hover:scale-105" : ""}
          ${powerRing ? "hover:scale-105" : ""}
          ${onClick && !isValidTarget ? "hover:scale-105" : ""}
        `}
      >
        {/* Cadre CARRÉ (192 px, 208 px sur grand écran) : les vignettes de héros
            sont carrées (768² / 2048²) et l'ancien cadre 160 × 192 en `cover`
            rognait 16 px de chaque côté du médaillon. La pile de main adverse
            (GameBoard, disposition MTGO) se cale sur cette largeur — à garder
            en phase si elle change.
            Hero portrait — admin-uploaded 2D image (`thumbnailUrl`) wins
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

        {/* Centered tap zone — the portrait box itself is pointer-transparent
            (pointer-events-none above); only this ~55%-wide disc over the
            crest captures clicks/taps. This keeps hand cards that peek out
            from behind the floating portrait tappable on touch/iPad, where
            the full portrait box used to steal their taps. */}
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

      {/* PV dans l'écu, à cheval sur le bas du médaillon. Rouge sous 10 PV. */}
      <div
        className="pointer-events-none absolute left-1/2 z-10 flex items-start justify-center"
        style={{
          bottom: -22, width: 58, height: 64, transform: "translateX(-50%)",
          background: "var(--am-gold)",
          clipPath: "polygon(0 0, 100% 0, 100% 66%, 50% 100%, 0 66%)",
          filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.7))",
        }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            marginTop: 3, width: 52, height: 58,
            background: "linear-gradient(180deg, color-mix(in srgb, var(--orbit-hp) 80%, white 20%), var(--orbit-hp) 60%, #071c17)",
            clipPath: "polygon(0 0, 100% 0, 100% 66%, 50% 100%, 0 66%)",
            paddingBottom: 12,
          }}
        >
          <span
            className={`text-[28px] font-black leading-none ${hero.hp <= 10 ? "text-accent" : "text-[#f6eedb]"}`}
            style={{ fontFamily: "var(--font-cinzel), serif", textShadow: "0 2px 4px rgba(0,0,0,0.8)" }}
          >
            {hero.hp}
          </span>
        </div>
      </div>

      {/* Armure : petit écu d'acier à droite des PV. */}
      {hero.armor > 0 && (
        <div
          className="pointer-events-none absolute z-10 flex items-center justify-center"
          style={{
            bottom: -10, left: "calc(50% + 32px)", width: 36, height: 40,
            background: "var(--am-gold)",
            clipPath: "polygon(0 0, 100% 0, 100% 66%, 50% 100%, 0 66%)",
          }}
        >
          <div className="flex items-center justify-center"
            style={{ width: 31, height: 35, marginTop: -2, background: "linear-gradient(180deg, #8d97a5, #3d4450)", clipPath: "polygon(0 0, 100% 0, 100% 66%, 50% 100%, 0 66%)", paddingBottom: 8 }}>
            <span className="text-[16px] font-black leading-none text-white" style={{ fontFamily: "var(--font-cinzel), serif" }}>{hero.armor}</span>
          </div>
        </div>
      )}
    </div>
  );
}
