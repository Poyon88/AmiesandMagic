"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { CycleEternelEvent } from "@/lib/store/gameStore";
import { useCardText } from "./CardTextProvider";

interface CycleEternelOverlayProps {
  event: CycleEternelEvent | null;
  onComplete: () => void;
}

const ENTRY_DURATION_MS = 1800;
const ENTRY_STAGGER_MS = 350;

type Resolved = {
  card: CycleEternelEvent["entries"][number]["card"];
  ownerIsLocal: boolean;
  deckPos: { x: number; y: number };
  index: number;
};

export default function CycleEternelOverlay({ event, onComplete }: CycleEternelOverlayProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Resolve each entry's deck destination at event-receive time so we don't
  // re-query the DOM on every render (the card visual itself stays mounted
  // for the duration of the animation and we don't want it jumping around).
  const resolved: Resolved[] = useMemo(() => {
    if (!event) return [];
    const out: Resolved[] = [];
    for (let i = 0; i < event.entries.length; i++) {
      const entry = event.entries[i];
      const sel = entry.ownerIsLocal ? '[data-cycle-deck="my"]' : '[data-cycle-deck="opponent"]';
      const el = typeof document !== "undefined" ? document.querySelector(sel) : null;
      let pos = { x: window.innerWidth / 2, y: window.innerHeight - 80 };
      if (el) {
        const rect = (el as HTMLElement).getBoundingClientRect();
        pos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
      out.push({ card: entry.card, ownerIsLocal: entry.ownerIsLocal, deckPos: pos, index: i });
    }
    return out;
  }, [event]);

  useEffect(() => {
    if (!event) return;
    const total = ENTRY_DURATION_MS + (event.entries.length - 1) * ENTRY_STAGGER_MS + 200;
    const timer = setTimeout(onComplete, total);
    return () => clearTimeout(timer);
  }, [event, onComplete]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {event && resolved.length > 0 && (
        <motion.div
          key={event.timestamp}
          style={{
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            zIndex: 92,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {resolved.map((entry) => (
            <CycleEntry key={`${event.timestamp}-${entry.index}`} entry={entry} />
          ))}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function CycleEntry({ entry }: { entry: Resolved }) {
  const { localizeName } = useCardText();
  const startX = window.innerWidth / 2;
  const startY = window.innerHeight / 2;
  const { deckPos } = entry;
  const delay = entry.index * (ENTRY_STAGGER_MS / 1000);

  // Randomised per-particle offsets — computed once per mount so React's
  // pure-render rule isn't violated by Math.random() during render.
  const particles = useMemo(
    () =>
      Array.from({ length: 10 }).map(() => ({
        dx: (Math.random() - 0.5) * 30,
        dy: (Math.random() - 0.5) * 30,
        size: 4 + Math.random() * 4,
        hue: 130 + Math.random() * 30,
        lightness: 60 + Math.random() * 20,
      })),
    [],
  );

  return (
    <>
      {/* Recycle swirl ring at the spawn point */}
      <motion.div
        style={{
          position: "absolute",
          left: startX - 80,
          top: startY - 80,
          width: 160,
          height: 160,
          borderRadius: "50%",
          border: "3px solid rgba(120, 220, 160, 0.7)",
          boxShadow: "0 0 30px rgba(120, 220, 160, 0.6), inset 0 0 20px rgba(120, 220, 160, 0.3)",
          pointerEvents: "none",
        }}
        initial={{ scale: 0.3, opacity: 0, rotate: 0 }}
        animate={{
          scale: [0.3, 1.2, 1, 0.5],
          opacity: [0, 1, 0.8, 0],
          rotate: 360,
        }}
        transition={{
          duration: 1.2,
          times: [0, 0.25, 0.55, 1],
          ease: "easeOut",
          delay,
        }}
      />

      {/* The card itself flies to the deck */}
      <motion.div
        style={{
          position: "absolute",
          left: startX,
          top: startY,
          width: 110,
          height: 154,
          marginLeft: -55,
          marginTop: -77,
          borderRadius: 8,
          overflow: "hidden",
          boxShadow:
            "0 0 24px rgba(120, 220, 160, 0.8), 0 0 48px rgba(80, 200, 140, 0.4), 0 8px 24px rgba(0,0,0,0.6)",
          border: "2px solid rgba(160, 240, 180, 0.9)",
          background: entry.card.image_url
            ? `url(${entry.card.image_url}) center/cover`
            : "linear-gradient(135deg, #1a2a1f 0%, #2d4435 60%, #15281d 100%)",
        }}
        initial={{
          x: 0,
          y: 0,
          scale: 0.4,
          opacity: 0,
          rotate: -8,
        }}
        animate={{
          x: [0, 0, deckPos.x - startX],
          y: [0, -30, deckPos.y - startY],
          scale: [0.4, 1, 0.18],
          opacity: [0, 1, 1, 0.6],
          rotate: [-8, 0, 12],
        }}
        transition={{
          duration: ENTRY_DURATION_MS / 1000,
          times: [0, 0.35, 1],
          ease: [0.45, 0.1, 0.6, 1],
          delay,
        }}
      >
        {/* Name banner — only visible while the card is large */}
        <motion.div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "4px 6px",
            background:
              "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 75%, transparent 100%)",
            color: "#e8ffe8",
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "'Cinzel', serif",
            letterSpacing: 0.5,
            textAlign: "center",
            textShadow: "0 0 6px rgba(120, 220, 160, 0.9), 0 1px 2px rgba(0,0,0,0.9)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{
            duration: ENTRY_DURATION_MS / 1000,
            times: [0, 0.2, 0.55, 0.8],
            delay,
          }}
        >
          ♻️ {localizeName(entry.card)}
        </motion.div>
      </motion.div>

      {/* "Cycle éternel" caption above the card */}
      <motion.div
        style={{
          position: "absolute",
          left: startX,
          top: startY - 110,
          transform: "translateX(-50%)",
          fontSize: 14,
          fontWeight: 800,
          color: "#9ff0c0",
          fontFamily: "'Cinzel', serif",
          letterSpacing: 2,
          textShadow:
            "0 0 12px rgba(120, 220, 160, 0.9), 0 0 24px rgba(80, 200, 140, 0.6), 0 2px 4px rgba(0,0,0,0.8)",
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}
        initial={{ opacity: 0, y: 10, scale: 0.7 }}
        animate={{
          opacity: [0, 1, 1, 0],
          y: [10, -10, -10, -30],
          scale: [0.7, 1, 1, 0.8],
        }}
        transition={{
          duration: 1.4,
          times: [0, 0.2, 0.65, 1],
          ease: "easeOut",
          delay,
        }}
      >
        ♻ Cycle Éternel
      </motion.div>

      {/* Particle trail toward the deck */}
      {particles.map((p, i) => {
        const t = (i + 1) / 11;
        const px = startX + (deckPos.x - startX) * t + p.dx;
        const py = startY + (deckPos.y - startY) * t - 40 + p.dy;
        return (
          <motion.div
            key={`particle-${entry.index}-${i}`}
            style={{
              position: "absolute",
              left: px - p.size / 2,
              top: py - p.size / 2,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              background: `hsl(${p.hue}, 80%, ${p.lightness}%)`,
              boxShadow: "0 0 8px rgba(120, 220, 160, 0.9)",
            }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 0.4] }}
            transition={{
              duration: 0.9,
              delay: delay + 0.5 + i * 0.04,
              ease: "easeOut",
            }}
          />
        );
      })}
    </>
  );
}
