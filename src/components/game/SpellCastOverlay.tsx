"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { SpellCastEvent } from "@/lib/store/gameStore";

interface SpellCastOverlayProps {
  event: SpellCastEvent | null;
  onComplete: () => void;
}

export default function SpellCastOverlay({ event, onComplete }: SpellCastOverlayProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!event) return;
    const timer = setTimeout(onComplete, 2000);
    return () => clearTimeout(timer);
  }, [event, onComplete]);

  if (!mounted) return null;

  const countered = event?.countered ?? false;
  const color = countered ? "239, 68, 68" : "168, 85, 247"; // red vs purple
  const hexColor = countered ? "#ef4444" : "#a855f7";
  const lightColor = countered ? "#fca5a5" : "#c084fc";
  const textColor = countered ? "#fecaca" : "#e9d5ff";
  const subTextColor = countered ? "#f87171" : "#c4b5fd";

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
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 90,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Background flash */}
          <motion.div
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(ellipse at center, rgba(${color}, 0.25) 0%, transparent 70%)`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.6, 0] }}
            transition={{ duration: 1.5, times: [0, 0.15, 0.4, 1] }}
          />

          {/* Center glow burst */}
          <motion.div
            style={{
              position: "absolute",
              width: 200,
              height: 200,
              borderRadius: "50%",
              background: `radial-gradient(circle, rgba(${color}, 0.6) 0%, rgba(${color}, 0.3) 40%, transparent 70%)`,
              boxShadow: `0 0 60px 20px rgba(${color}, 0.3)`,
            }}
            initial={{ scale: 0.2, opacity: 0 }}
            animate={{ scale: [0.2, 1.5, 2], opacity: [0, 1, 0] }}
            transition={{ duration: 1.2, times: [0, 0.3, 1], ease: "easeOut" }}
          />

          {/* Expanding ring */}
          <motion.div
            style={{
              position: "absolute",
              width: 120,
              height: 120,
              borderRadius: "50%",
              border: `2px solid rgba(${color}, 0.8)`,
              boxShadow: `0 0 20px rgba(${color}, 0.4), inset 0 0 20px rgba(${color}, 0.2)`,
            }}
            initial={{ scale: 0.3, opacity: 1 }}
            animate={{ scale: 3, opacity: 0 }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.1 }}
          />

          {/* Second ring */}
          <motion.div
            style={{
              position: "absolute",
              width: 80,
              height: 80,
              borderRadius: "50%",
              border: `1px solid ${lightColor}99`,
            }}
            initial={{ scale: 0.5, opacity: 1 }}
            animate={{ scale: 4, opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
          />

          {/* Sparkle particles */}
          {[...Array(12)].map((_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const radius = 80 + Math.random() * 60;
            const dx = Math.cos(angle) * radius;
            const dy = Math.sin(angle) * radius;
            return (
              <motion.div
                key={i}
                style={{
                  position: "absolute",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: lightColor,
                  boxShadow: `0 0 10px ${hexColor}, 0 0 20px ${hexColor}`,
                }}
                initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                animate={{ x: dx, y: dy, opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
                transition={{ duration: 1 + Math.random() * 0.4, ease: "easeOut", delay: 0.05 * i }}
              />
            );
          })}

          {/* Spell name */}
          <motion.div
            style={{
              position: "relative",
              textAlign: "center",
            }}
            initial={{ scale: 0.5, opacity: 0, y: 10 }}
            animate={{ scale: [0.5, 1.1, 1], opacity: [0, 1, 1, 0], y: [10, 0, 0, -20] }}
            transition={{ duration: 2, times: [0, 0.15, 0.6, 1], ease: "easeOut" }}
          >
            {countered && (
              <div
                style={{
                  fontSize: "2.5rem",
                  marginBottom: 8,
                  filter: `drop-shadow(0 0 12px ${hexColor})`,
                }}
              >
                🚫
              </div>
            )}
            <div
              style={{
                fontSize: "1.75rem",
                fontWeight: 800,
                color: textColor,
                textShadow: `0 0 20px rgba(${color}, 0.9), 0 0 40px rgba(${color}, 0.5), 0 2px 4px rgba(0,0,0,0.8)`,
                letterSpacing: "0.05em",
                textDecoration: countered ? "line-through" : "none",
              }}
            >
              {event.spellName}
            </div>
            <div
              style={{
                fontSize: countered ? "1rem" : "0.75rem",
                fontWeight: countered ? 700 : 400,
                color: subTextColor,
                textShadow: `0 0 10px rgba(${color}, 0.6), 0 1px 2px rgba(0,0,0,0.8)`,
                marginTop: 4,
                maxWidth: 300,
              }}
            >
              {countered ? "🛡️ Contresort !" : event.effectText}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
