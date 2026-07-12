"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import type { HeroPowerCastEvent } from "@/lib/store/gameStore";
import { useHeroText } from "@/i18n/useHeroText";
import { emitImpact } from "@/lib/fx/impactFx";
import { OVERLAY, cardRevealInitial, cardRevealAnimate, cardRevealTransition } from "@/lib/fx/overlayMotion";
import { RadialFlash, HaloBloom, ExpandingRing, OrbitingSparkles } from "@/components/game/OverlayPrimitives";

interface HeroPowerOverlayProps {
  event: HeroPowerCastEvent | null;
  onComplete: () => void;
}

// Race → hero portrait mapping (mirrors HeroPortrait).
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

export default function HeroPowerOverlay({ event, onComplete }: HeroPowerOverlayProps) {
  const t = useTranslations("game");
  const heroText = useHeroText();
  const [mounted, setMounted] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!event) return;
    const timer = setTimeout(onComplete, OVERLAY.displayMs);
    return () => clearTimeout(timer);
  }, [event, onComplete]);

  // Canvas FX: a golden release burst radiating from the hero-power card.
  useEffect(() => {
    if (!event) return;
    const release = setTimeout(() => {
      const r = cardRef.current?.getBoundingClientRect();
      if (r) {
        emitImpact({
          x: r.left + r.width / 2, y: r.top + r.height / 2,
          amount: 0, type: "cast", dirX: 0, dirY: 0, big: false, paletteKey: "heropower",
        });
      }
    }, 150);
    return () => clearTimeout(release);
  }, [event]);

  if (!mounted) return null;

  const color = "234, 179, 8"; // amber
  const hexColor = "#eab308";
  const lightColor = "#fde047";
  const accentColor = "#fcd34d";

  // Per-hero power illustration wins over the race-generic fallback.
  const imageUrl = event ? (event.powerImageUrl ?? HERO_IMAGES[event.race] ?? null) : null;

  // Localise the FR-canonical event fields at render time (keyed by heroId).
  const heroName = event
    ? heroText.heroName({ id: event.heroId, name: event.heroName })
    : "";
  const powerName = event
    ? heroText.powerName({ id: event.heroId, power_name: event.powerName }) ?? event.powerName
    : "";
  const powerDescription = event
    ? heroText.powerDesc({ id: event.heroId, power_description: event.powerDescription }) ?? event.powerDescription
    : "";

  return createPortal(
    <AnimatePresence>
      {event && (
        <motion.div
          key={event.timestamp}
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingLeft: "6%",
            pointerEvents: "none",
            zIndex: 90,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Background flash · halo · shockwave ring · orbiting sparkles —
              shared overlay chrome (see OverlayPrimitives). */}
          <RadialFlash color={color} duration={2.5} />
          <HaloBloom color={color} size={420} duration={2.6} peakTime={0.18} />
          <ExpandingRing color={color} size={240} duration={1.3} />
          <OrbitingSparkles
            count={12}
            lightColor={lightColor}
            hexColor={hexColor}
            baseRadius={180}
            spread={70}
            durBase={1.5}
            durSpread={0.5}
            stagger={0.05}
          />

          {/* Card-shaped panel: hero portrait as background + text overlay */}
          <motion.div
            ref={cardRef}
            style={{
              position: "relative",
              width: 252,
              height: 350,
              maxWidth: "90vw",
              borderRadius: 14,
              overflow: "hidden",
              border: `2px solid rgba(${color}, 0.7)`,
              boxShadow: `0 0 40px 6px rgba(${color}, 0.55), 0 12px 40px rgba(0,0,0,0.7)`,
              background: imageUrl
                ? `url('${imageUrl}') center/cover no-repeat, linear-gradient(160deg, #1a1a2e, #0d0d1a)`
                : "linear-gradient(160deg, #1a1a2e, #0d0d1a)",
            }}
            initial={cardRevealInitial}
            animate={cardRevealAnimate}
            transition={cardRevealTransition}
          >
            <div style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(180deg, rgba(6,6,18,0.55) 0%, rgba(6,6,18,0.15) 45%, rgba(6,6,18,0.7) 100%)",
              padding: "14px 16px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}>
              {/* Hero name */}
              <div style={{
                fontSize: "0.85rem",
                color: "#ddd",
                fontWeight: 600,
                textAlign: "center",
                fontFamily: "'Crimson Text', serif",
                letterSpacing: "0.02em",
                textShadow: "0 1px 2px rgba(0,0,0,0.95)",
              }}>
                {heroName}
              </div>

              {/* Power name */}
              <div style={{
                fontSize: "1.1rem",
                color: "#fef3c7",
                fontWeight: 700,
                textAlign: "center",
                fontFamily: "'Cinzel', serif",
                borderBottom: `1px solid rgba(${color}, 0.45)`,
                paddingBottom: 5,
                textShadow: `0 0 10px rgba(${color}, 0.9), 0 2px 3px rgba(0,0,0,0.95)`,
                letterSpacing: "0.03em",
              }}>
                ✨ {powerName}
              </div>

              {/* Spacer keeps the illustration centre clear */}
              <div style={{ flex: 1 }} />

              {/* Power description */}
              {powerDescription && (
                <div style={{
                  padding: "6px 9px",
                  background: `rgba(${color}, 0.18)`,
                  borderRadius: 6,
                  border: `1px solid rgba(${color}, 0.4)`,
                }}>
                  <p style={{
                    margin: 0,
                    fontSize: "0.72rem",
                    color: "#f5f5f5",
                    lineHeight: 1.4,
                    fontFamily: "'Crimson Text', serif",
                    textShadow: "0 1px 2px rgba(0,0,0,0.9)",
                  }}>{powerDescription}</p>
                </div>
              )}

              <div style={{
                textAlign: "center",
                fontSize: "0.65rem",
                color: accentColor,
                fontStyle: "italic",
                fontFamily: "'Crimson Text', serif",
                textShadow: "0 1px 2px rgba(0,0,0,0.95)",
              }}>
                {t('power_hero_activated')}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
