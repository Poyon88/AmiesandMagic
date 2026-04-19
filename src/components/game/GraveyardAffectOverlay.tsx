"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { GraveyardAffectEvent } from "@/lib/store/gameStore";

interface Props {
  event: GraveyardAffectEvent | null;
  onComplete: () => void;
}

const DISPLAY_MS = 2200;

export default function GraveyardAffectOverlay({ event, onComplete }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!event) return;
    const timer = setTimeout(onComplete, DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [event, onComplete]);

  if (!mounted) return null;

  const CARD_W = 88;
  const CARD_H = 124;
  const cards = event?.cards ?? [];

  return createPortal(
    <AnimatePresence>
      {event && cards.length > 0 && (
        <motion.div
          key={event.timestamp}
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: "18%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            pointerEvents: "none",
            zIndex: 92,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Label */}
          <motion.div
            style={{
              padding: "4px 14px",
              borderRadius: 6,
              background: "rgba(6, 6, 18, 0.75)",
              border: "1px solid rgba(147, 51, 234, 0.55)",
              color: "#e9d5ff",
              fontFamily: "'Cinzel', serif",
              fontSize: "0.85rem",
              fontWeight: 700,
              letterSpacing: "0.03em",
              textShadow: "0 0 10px rgba(147, 51, 234, 0.8), 0 2px 4px rgba(0,0,0,0.9)",
            }}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: [0, 1, 1, 0] }}
            transition={{ duration: DISPLAY_MS / 1000, times: [0, 0.15, 0.8, 1] }}
          >
            🪦 Cimetière — {cards.length} carte{cards.length > 1 ? "s" : ""}
          </motion.div>

          {/* Cards row */}
          <div style={{ display: "flex", gap: 10 }}>
            {cards.map((card, i) => (
              <motion.div
                key={`${event.timestamp}-${i}`}
                style={{
                  position: "relative",
                  width: CARD_W,
                  height: CARD_H,
                  borderRadius: 8,
                  overflow: "hidden",
                  border: "2px solid rgba(147, 51, 234, 0.75)",
                  boxShadow: "0 0 14px 2px rgba(147, 51, 234, 0.55), 0 8px 20px rgba(0,0,0,0.7)",
                  background: card.image_url
                    ? `url('${card.image_url}') center/cover no-repeat, linear-gradient(160deg, #1a0a2a, #0d0d1a)`
                    : "linear-gradient(160deg, #1a0a2a, #0d0d1a)",
                }}
                initial={{ scale: 0.4, opacity: 0, y: 14, rotate: -6 + Math.random() * 12 }}
                animate={{
                  scale: [0.4, 1.08, 1, 1, 0.7],
                  opacity: [0, 1, 1, 1, 0],
                  y: [14, 0, 0, -4, -26],
                  filter: [
                    "grayscale(0) brightness(1)",
                    "grayscale(0) brightness(1)",
                    "grayscale(0) brightness(1)",
                    "grayscale(0.6) brightness(0.7)",
                    "grayscale(1) brightness(0.3)",
                  ],
                }}
                transition={{
                  duration: DISPLAY_MS / 1000,
                  times: [0, 0.15, 0.35, 0.75, 1],
                  ease: ["backOut", "linear", "easeIn"],
                  delay: 0.08 * i,
                }}
              >
                <div style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(180deg, rgba(6,6,18,0.35) 0%, rgba(6,6,18,0.1) 50%, rgba(6,6,18,0.8) 100%)",
                  display: "flex",
                  alignItems: "flex-end",
                  padding: "4px 6px",
                }}>
                  <div style={{
                    fontSize: "0.6rem",
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
    document.body
  );
}
