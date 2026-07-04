"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { DamageEvent } from "@/lib/game/types";
import { isBigHit } from "@/lib/fx/impactFx";

interface DamageOverlayProps {
  events: DamageEvent[];
}

function DelayedPopup({ delay, children }: { delay: number; children: React.ReactNode }) {
  const [show, setShow] = useState(delay <= 0);
  useEffect(() => {
    if (delay <= 0) return;
    const timer = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  return show ? <>{children}</> : null;
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
        {events.map((evt, i) => {
          // Stable key per event: including amount + delay + index keeps each
          // popup identifiable across re-renders (a changing key would make
          // AnimatePresence unmount + remount the popup every render, which
          // caused the animation to play twice).
          const key = `${i}-${evt.targetId}-${evt.type}-${evt.amount}-${evt.delayMs ?? 0}`;
          return (
            <DelayedPopup key={key} delay={evt.delayMs ?? 0}>
              <EventPopup event={evt} />
            </DelayedPopup>
          );
        })}
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
  poison: {
    flashColor: "rgba(34, 197, 94, 0.4)",
    particleColor: "#22c55e",
    textColor: "#22c55e",
    format: (evt: DamageEvent) => evt.label ?? `☠ -${evt.amount}`,
  },
  dodge: {
    flashColor: "rgba(147, 197, 253, 0.3)",
    particleColor: "#93c5fd",
    textColor: "#93c5fd",
    format: (evt: DamageEvent) => evt.label ?? "💨 Esquive !",
  },
  paralyze: {
    flashColor: "rgba(139, 92, 246, 0.4)",
    particleColor: "#a78bfa",
    textColor: "#8b5cf6",
    format: (evt: DamageEvent) => evt.label ?? "⛓️ Paralysie",
  },
  resurrect: {
    flashColor: "rgba(250, 204, 21, 0.4)",
    particleColor: "#fde68a",
    textColor: "#fbbf24",
    format: (evt: DamageEvent) => evt.label ?? "✨ Résurrection",
  },
  transform: {
    flashColor: "rgba(168, 85, 247, 0.4)",
    particleColor: "#c084fc",
    textColor: "#a855f7",
    format: (evt: DamageEvent) => evt.label ?? "🔮 Transformation",
  },
  // Capability acquired (keyword granted at runtime) — arcane amethyst/gold.
  empower: {
    flashColor: "rgba(168, 85, 247, 0.38)",
    particleColor: "#c084fc",
    textColor: "#d8b4fe",
    format: (evt: DamageEvent) => evt.label ?? "✦ Capacité",
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
        {event.label ?? "Divine Shield"}
      </motion.span>
    </motion.div>
  );
}

function PoisonPopup({ event }: { event: DamageEvent }) {
  const { particleColor, textColor, format } = config.poison;

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
      {/* Poison cloud */}
      <motion.div
        style={{
          position: "absolute",
          left: -35,
          top: -35,
          width: 70,
          height: 70,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(34, 197, 94, 0.5) 0%, rgba(34, 197, 94, 0) 70%)",
          pointerEvents: "none",
        }}
        initial={{ scale: 0.5, opacity: 1 }}
        animate={{ scale: 2, opacity: 0 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      />

      {/* Dripping particles */}
      {[...Array(8)].map((_, i) => {
        const xSpread = (Math.random() - 0.5) * 30;
        const yEnd = 20 + Math.random() * 30;
        return (
          <motion.div
            key={i}
            style={{
              position: "absolute",
              width: 5,
              height: 8,
              borderRadius: "50%",
              background: particleColor,
              left: -2.5,
              top: -4,
              boxShadow: `0 0 6px ${particleColor}`,
              pointerEvents: "none",
            }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: xSpread, y: yEnd, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.8 + Math.random() * 0.4, ease: "easeIn", delay: i * 0.05 }}
          />
        );
      })}

      {/* Text */}
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
        animate={{ y: -32, scale: 1, opacity: 0 }}
        transition={{ duration: 2.4, ease: "easeOut" }}
      >
        {format(event)}
      </motion.span>
    </motion.div>
  );
}

function DamagePopup({ event }: { event: DamageEvent }) {
  const { textColor, format } = config.damage;
  // The shockwave ring, impact cross, debris AND the impact glow all live on the
  // additive Canvas layer (ImpactFxLayer) — far denser/glowier than DOM. The DOM
  // popup owns ONLY the NUMBER (with a "crit" treatment on big hits). It used to
  // also draw a radial flash here, but that stacked a second, flatter glow on
  // top of the Canvas shockwave at the same point — muddy. Canvas owns the glow.
  const big = isBigHit(event.amount);

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
      transition={{ duration: 3.5, ease: "easeOut" }}
    >
      {/* Damage number — punchy impact-frame, crit styling on big hits */}
      <motion.span
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          fontSize: big ? "3.4rem" : "2.4rem",
          fontWeight: 900,
          color: big ? "#fff3d6" : textColor,
          // Dual-offset chromatic shadows give a punchy, slightly aberrated
          // edge; big hits add a gold rim + heavier red bloom.
          textShadow: big
            ? `0 0 4px #fff, 0 0 18px ${textColor}, 0 0 34px ${textColor}, 2px 0 0 #ff3b3b, -2px 0 0 #36d6ff, 0 3px 4px #000`
            : `0 0 14px ${textColor}, 0 0 24px ${textColor}aa, 1px 0 0 #ff6b6b88, -1px 0 0 #36d6ff66, 0 2px 3px #000`,
          WebkitTextStroke: big ? "1px rgba(255,210,120,0.9)" : "0",
          fontFamily: "'Cinzel', serif",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          letterSpacing: "0.02em",
        }}
        initial={{ y: 10, scale: 0.2, opacity: 0, rotate: -12 }}
        animate={{
          y: [10, -6, -6, -52],
          scale: big ? [0.2, 2.4, 1.8, 1.3] : [0.2, 1.9, 1.6, 1.2],
          opacity: [0, 1, 1, 0],
          rotate: [-12, big ? 5 : 4, 0, 0],
        }}
        transition={{
          duration: 3.5,
          times: [0, 0.12, 0.75, 1],
          ease: ["backOut", "easeOut", "easeIn"],
        }}
      >
        {big ? `${format(event)}!` : format(event)}
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

  if (type === "poison") {
    return <PoisonPopup event={event} />;
  }

  if (type === "damage") {
    return <DamagePopup event={event} />;
  }

  const { flashColor, particleColor, textColor, format } = config[type];
  const isPositive = type === "heal" || type === "buff" || type === "dodge" || type === "paralyze" || type === "resurrect" || type === "transform" || type === "empower";
  // buff/empower already get their rising motes / arcane converge from the
  // Canvas layer (ImpactFxLayer). Rendering the DOM sparkle spray on top —
  // same colour family, same point — is literal duplication, so for those two
  // the DOM popup shows the number + flash only. Other types are Canvas-blind
  // and keep their DOM particles.
  const canvasOwnsParticles = type === "buff" || type === "empower";
  // Buff/empower popups (Commandement aura, Renforcement, granted keywords…)
  // often fire in batches when several allies are touched at once. Slow them
  // down so each `+1/+1` or capability label is readable, not strobing past.
  const slowMul = type === "buff" || type === "empower" ? 1.7 : 1;

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
      transition={{ duration: 2.9 * slowMul, ease: "easeOut" }}
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

      {/* Particles — skipped for buff/empower (Canvas owns those). */}
      {canvasOwnsParticles ? null : isPositive ? (
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
              transition={{ duration: (0.8 + Math.random() * 0.4) * slowMul, ease: "easeOut", delay: i * 0.05 * slowMul }}
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
        transition={{ duration: 2.8 * slowMul, ease: "easeOut" }}
      >
        {format(event)}
      </motion.span>
    </motion.div>
  );
}
