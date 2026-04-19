"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { HeroPowerCastEvent } from "@/lib/store/gameStore";

interface HeroPowerOverlayProps {
  event: HeroPowerCastEvent | null;
  onComplete: () => void;
}

const DISPLAY_MS = 2800;

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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!event) return;
    const timer = setTimeout(onComplete, DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [event, onComplete]);

  if (!mounted) return null;

  const color = "234, 179, 8"; // amber
  const hexColor = "#eab308";
  const lightColor = "#fde047";
  const accentColor = "#fcd34d";

  const imageUrl = event ? HERO_IMAGES[event.race] : null;

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
          {/* Background radial flash anchored left */}
          <motion.div
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(ellipse at 20% 50%, rgba(${color}, 0.32) 0%, transparent 55%)`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.7, 0] }}
            transition={{ duration: 2.5, times: [0, 0.12, 0.7, 1] }}
          />

          {/* Halo behind the hero */}
          <motion.div
            style={{
              position: "absolute",
              width: 420,
              height: 420,
              borderRadius: "50%",
              background: `radial-gradient(circle, rgba(${color}, 0.55) 0%, rgba(${color}, 0.22) 45%, transparent 70%)`,
              filter: `blur(12px)`,
            }}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: [0.4, 1.1, 1], opacity: [0, 0.9, 0] }}
            transition={{ duration: 2.6, times: [0, 0.18, 1], ease: "easeOut" }}
          />

          {/* Expanding ring */}
          <motion.div
            style={{
              position: "absolute",
              width: 240,
              height: 240,
              borderRadius: "50%",
              border: `2px solid rgba(${color}, 0.75)`,
              boxShadow: `0 0 28px rgba(${color}, 0.5)`,
            }}
            initial={{ scale: 0.5, opacity: 1 }}
            animate={{ scale: 3, opacity: 0 }}
            transition={{ duration: 1.3, ease: "easeOut", delay: 0.1 }}
          />

          {/* Orbiting sparkles */}
          {[...Array(12)].map((_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const radius = 180 + Math.random() * 70;
            const dx = Math.cos(angle) * radius;
            const dy = Math.sin(angle) * radius;
            return (
              <motion.div
                key={i}
                style={{
                  position: "absolute",
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: lightColor,
                  boxShadow: `0 0 10px ${hexColor}, 0 0 20px ${hexColor}`,
                }}
                initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                animate={{ x: dx, y: dy, opacity: [0, 1, 0], scale: [0, 1.6, 0] }}
                transition={{ duration: 1.5 + Math.random() * 0.5, ease: "easeOut", delay: 0.05 * i }}
              />
            );
          })}

          {/* Card-shaped panel: hero portrait as background + text overlay */}
          <motion.div
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
            initial={{ scale: 0.5, opacity: 0, y: 30 }}
            animate={{
              scale: [0.5, 1.06, 1, 1, 0.97],
              opacity: [0, 1, 1, 1, 0],
              y: [30, 0, 0, -8, -30],
            }}
            transition={{
              duration: DISPLAY_MS / 1000,
              times: [0, 0.13, 0.22, 0.82, 1],
              ease: ["backOut", "easeInOut", "easeIn"],
            }}
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
                {event.heroName}
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
                ✨ {event.powerName}
              </div>

              {/* Spacer keeps the illustration centre clear */}
              <div style={{ flex: 1 }} />

              {/* Power description */}
              {event.powerDescription && (
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
                  }}>{event.powerDescription}</p>
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
                Pouvoir héroïque activé
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
