"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { DiscardFromHandEvent } from "@/lib/store/gameStore";

interface Props {
  event: DiscardFromHandEvent | null;
  onComplete: () => void;
}

// Match the discard phase timing in `gameStore.dispatchAction`
// (`DISCARD_MS = 1800`). The overlay self-clears at the end of the window so
// the draw phase can play next.
const DISPLAY_MS = 1800;

// Forced-discard popup: shown between the summon and draw phases when a
// card was forced from a player's hand to their graveyard during the
// resolved action (today: Combustion's "défaussez une carte"). The card
// floats up briefly with a flame motif so the player sees what was lost
// before the new draws arrive.
export default function DiscardFromHandOverlay({ event, onComplete }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!event) return;
    const timer = setTimeout(onComplete, DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [event, onComplete]);

  if (!mounted) return null;

  const CARD_W = 100;
  const CARD_H = 140;
  const cards = event?.cards ?? [];

  return createPortal(
    <AnimatePresence>
      {event && cards.length > 0 && (
        <motion.div
          key={event.timestamp}
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            pointerEvents: "none",
            zIndex: 93,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Label */}
          <motion.div
            style={{
              padding: "5px 16px",
              borderRadius: 6,
              background: "rgba(20, 6, 6, 0.78)",
              border: "1px solid rgba(239, 68, 68, 0.6)",
              color: "#fecaca",
              fontFamily: "'Cinzel', serif",
              fontSize: "0.95rem",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textShadow: "0 0 10px rgba(239, 68, 68, 0.8), 0 2px 4px rgba(0,0,0,0.9)",
            }}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: [0, 1, 1, 0] }}
            transition={{ duration: DISPLAY_MS / 1000, times: [0, 0.15, 0.8, 1] }}
          >
            🔥 Défaussée — {cards.length > 1 ? `${cards.length} cartes` : "1 carte"}
          </motion.div>

          {/* Cards row */}
          <div style={{ display: "flex", gap: 14 }}>
            {cards.map((card, i) => (
              <motion.div
                key={`${event.timestamp}-${i}`}
                style={{
                  position: "relative",
                  width: CARD_W,
                  height: CARD_H,
                  borderRadius: 9,
                  overflow: "hidden",
                  border: "2px solid rgba(239, 68, 68, 0.8)",
                  boxShadow: "0 0 16px 2px rgba(239, 68, 68, 0.6), 0 10px 24px rgba(0,0,0,0.75)",
                  background: card.image_url
                    ? `url('${card.image_url}') center/cover no-repeat, linear-gradient(160deg, #2a0d0d, #0d0d1a)`
                    : "linear-gradient(160deg, #2a0d0d, #0d0d1a)",
                }}
                initial={{ scale: 0.5, opacity: 0, y: 30, rotate: -4 + Math.random() * 8 }}
                animate={{
                  scale: [0.5, 1.1, 1, 1, 0.85],
                  opacity: [0, 1, 1, 1, 0],
                  y: [30, 0, 0, -4, -34],
                  filter: [
                    "brightness(1) saturate(1)",
                    "brightness(1) saturate(1)",
                    "brightness(1) saturate(1)",
                    "brightness(0.7) saturate(1.3) hue-rotate(-10deg)",
                    "brightness(0.4) saturate(1.5) hue-rotate(-15deg)",
                  ],
                }}
                transition={{
                  duration: DISPLAY_MS / 1000,
                  times: [0, 0.15, 0.4, 0.78, 1],
                  ease: ["backOut", "linear", "easeIn"],
                  delay: 0.08 * i,
                }}
              >
                <div style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(180deg, rgba(20,6,6,0.35) 0%, rgba(20,6,6,0.1) 50%, rgba(20,6,6,0.85) 100%)",
                  display: "flex",
                  alignItems: "flex-end",
                  padding: "5px 7px",
                }}>
                  <div style={{
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    color: "#fff",
                    fontFamily: "'Cinzel', serif",
                    textShadow: "0 1px 2px rgba(0,0,0,0.95)",
                    width: "100%",
                    textAlign: "center",
                    lineHeight: 1.15,
                  }}>
                    {card.name}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
