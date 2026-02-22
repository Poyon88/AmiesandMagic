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
          <EventPopup key={evt.targetId + "-" + evt.type + "-" + Math.random()} event={evt} />
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}

const config = {
  damage: {
    flashColor: "rgba(239, 68, 68, 0.4)",
    particleColor: "#fb923c",
    textColor: "#ef4444",
    format: (evt: DamageEvent) => `-${evt.amount}`,
  },
  heal: {
    flashColor: "rgba(34, 197, 94, 0.4)",
    particleColor: "#4ade80",
    textColor: "#22c55e",
    format: (evt: DamageEvent) => `+${evt.amount}`,
  },
  buff: {
    flashColor: "rgba(250, 204, 21, 0.4)",
    particleColor: "#fbbf24",
    textColor: "#eab308",
    format: (evt: DamageEvent) => evt.label ?? `+${evt.amount}`,
  },
  shield: {
    flashColor: "rgba(250, 204, 21, 0.3)",
    particleColor: "#facc15",
    textColor: "#facc15",
    format: () => "🛡",
  },
};

function ShieldPopup({ event }: { event: DamageEvent }) {
  const { particleColor } = config.shield;

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
      transition={{ duration: 2.5, ease: "easeOut" }}
    >
      {/* Shield glow ring */}
      <motion.div
        style={{
          position: "absolute",
          left: -40,
          top: -40,
          width: 80,
          height: 80,
          borderRadius: "50%",
          border: "3px solid rgba(250, 204, 21, 0.8)",
          boxShadow: "0 0 20px rgba(250, 204, 21, 0.5), inset 0 0 20px rgba(250, 204, 21, 0.2)",
          pointerEvents: "none",
        }}
        initial={{ scale: 0.3, opacity: 1 }}
        animate={{ scale: 1.8, opacity: 0 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      />

      {/* Inner shield flash */}
      <motion.div
        style={{
          position: "absolute",
          left: -30,
          top: -30,
          width: 60,
          height: 60,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(250, 204, 21, 0.6) 0%, rgba(250, 204, 21, 0) 70%)",
          pointerEvents: "none",
        }}
        initial={{ scale: 0.5, opacity: 1 }}
        animate={{ scale: 2, opacity: 0 }}
        transition={{ duration: 0.8 }}
      />

      {/* Rising sparkle particles */}
      {[...Array(10)].map((_, i) => {
        const angle = (i / 10) * Math.PI * 2;
        const radius = 20 + Math.random() * 15;
        const dx = Math.cos(angle) * radius;
        const dy = Math.sin(angle) * radius - 10;
        return (
          <motion.div
            key={i}
            style={{
              position: "absolute",
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: particleColor,
              left: -2,
              top: -2,
              boxShadow: `0 0 8px ${particleColor}`,
              pointerEvents: "none",
            }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: dx, y: dy, opacity: 0, scale: 0 }}
            transition={{ duration: 0.8 + Math.random() * 0.4, ease: "easeOut", delay: i * 0.03 }}
          />
        );
      })}

      {/* Shield icon */}
      <motion.span
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          fontSize: "2.5rem",
          pointerEvents: "none",
          filter: "drop-shadow(0 0 12px rgba(250, 204, 21, 0.8))",
        }}
        initial={{ scale: 2, opacity: 1 }}
        animate={{ scale: 1, opacity: 0 }}
        transition={{ duration: 2.2, ease: "easeOut" }}
      >
        🛡️
      </motion.span>

      {/* Label */}
      <motion.span
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          fontSize: "0.75rem",
          fontWeight: 800,
          color: "#facc15",
          textShadow: "0 0 8px rgba(250, 204, 21, 0.8), 0 1px 2px #000",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
        initial={{ y: 20, opacity: 1 }}
        animate={{ y: -40, opacity: 0 }}
        transition={{ duration: 2.0, ease: "easeOut", delay: 0.2 }}
      >
        Divine Shield
      </motion.span>
    </motion.div>
  );
}

function EventPopup({ event }: { event: DamageEvent }) {
  if (event.x < -9000) return null;

  const type = event.type ?? "damage";

  if (type === "shield") {
    return <ShieldPopup event={event} />;
  }

  const { flashColor, particleColor, textColor, format } = config[type];
  const isPositive = type === "heal" || type === "buff";

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
      {/* Flash circle */}
      <motion.div
        style={{
          position: "absolute",
          left: -30,
          top: -30,
          width: 60,
          height: 60,
          borderRadius: "50%",
          background: flashColor,
          pointerEvents: "none",
        }}
        initial={{ scale: 0.5, opacity: 1 }}
        animate={{ scale: 1.5, opacity: 0 }}
        transition={{ duration: 0.6 }}
      />

      {/* Particles */}
      {isPositive ? (
        // Rising sparkles for heal/buff
        [...Array(8)].map((_, i) => {
          const xSpread = (Math.random() - 0.5) * 40;
          const yEnd = -(20 + Math.random() * 30);
          return (
            <motion.div
              key={i}
              style={{
                position: "absolute",
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: particleColor,
                left: -2.5,
                top: -2.5,
                boxShadow: `0 0 6px ${particleColor}`,
                pointerEvents: "none",
              }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: xSpread, y: yEnd, opacity: 0, scale: 0 }}
              transition={{ duration: 0.8 + Math.random() * 0.4, ease: "easeOut", delay: i * 0.05 }}
            />
          );
        })
      ) : (
        // Burst particles for damage
        [...Array(6)].map((_, i) => {
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
                background: particleColor,
                left: -3,
                top: -3,
                pointerEvents: "none",
              }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: dx, y: dy, opacity: 0, scale: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          );
        })
      )}

      {/* Number */}
      <motion.span
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          fontSize: "1.5rem",
          fontWeight: 900,
          color: textColor,
          textShadow: `0 0 8px ${textColor}, 0 1px 2px #000`,
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
        initial={{ y: 0, scale: 1.5, opacity: 1 }}
        animate={{ y: isPositive ? -36 : -32, scale: 1, opacity: 0 }}
        transition={{ duration: 2.8, ease: "easeOut" }}
      >
        {format(event)}
      </motion.span>
    </motion.div>
  );
}
