"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { DamageEvent } from "@/lib/game/types";

interface DamageOverlayProps {
  events: DamageEvent[];
}

export default function DamageOverlay({ events }: DamageOverlayProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 100,
      }}
    >
      <AnimatePresence>
        {events.map((evt) => (
          <DamagePopup key={evt.targetId + "-" + evt.amount + "-" + Math.random()} event={evt} />
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}

function DamagePopup({ event }: { event: DamageEvent }) {
  if (event.x < -9000) return null; // no position found

  return (
    <motion.div
      style={{
        position: "absolute",
        left: event.x,
        top: event.y,
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
      }}
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 2.9, ease: "easeOut" }}
    >
      {/* Red flash circle */}
      <motion.div
        style={{
          position: "absolute",
          left: -30,
          top: -30,
          width: 60,
          height: 60,
          borderRadius: "50%",
          background: "rgba(239, 68, 68, 0.4)",
          pointerEvents: "none",
        }}
        initial={{ scale: 0.5, opacity: 1 }}
        animate={{ scale: 1.5, opacity: 0 }}
        transition={{ duration: 0.6 }}
      />

      {/* Burst particles */}
      {[...Array(6)].map((_, i) => {
        const angle = (i / 6) * Math.PI * 2;
        const dx = Math.cos(angle) * 24;
        const dy = Math.sin(angle) * 24;
        return (
          <motion.div
            key={i}
            style={{
              position: "absolute",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#fb923c",
              left: -3,
              top: -3,
              pointerEvents: "none",
            }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: dx, y: dy, opacity: 0, scale: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        );
      })}

      {/* Damage number */}
      <motion.span
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          fontSize: "1.5rem",
          fontWeight: 900,
          color: "#ef4444",
          textShadow: "0 0 8px #ef4444, 0 1px 2px #000",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
        initial={{ y: 0, scale: 1.5, opacity: 1 }}
        animate={{ y: -32, scale: 1, opacity: 0 }}
        transition={{ duration: 2.8, ease: "easeOut" }}
      >
        -{event.amount}
      </motion.span>
    </motion.div>
  );
}
