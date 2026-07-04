"use client";

// Shared presentational primitives for the full-screen overlays (spell cast,
// hero power, …). SpellCast and HeroPower were ~90% duplicates — the flash,
// halo, expanding ring and orbiting sparkles are identical in structure and
// differ only by colour, size and a couple of durations. These components
// capture that structure once; callers pass the deltas as props.

import { motion } from "framer-motion";
import { sparkleRadius, sparkleDuration } from "@/lib/fx/overlayMotion";

/** Full-screen radial flash, anchored on the left where the reveal card sits. */
export function RadialFlash({ color, duration = 2.5 }: { color: string; duration?: number }) {
  return (
    <motion.div
      style={{
        position: "absolute",
        inset: 0,
        background: `radial-gradient(ellipse at 20% 50%, rgba(${color}, 0.32) 0%, transparent 55%)`,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 0.7, 0] }}
      transition={{ duration, times: [0, 0.12, 0.7, 1] }}
    />
  );
}

/** Blurred radial halo that blooms behind the reveal subject. */
export function HaloBloom({
  color,
  size,
  duration,
  peakTime = 0.16,
}: { color: string; size: number; duration: number; peakTime?: number }) {
  return (
    <motion.div
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle, rgba(${color}, 0.55) 0%, rgba(${color}, 0.22) 45%, transparent 70%)`,
        filter: "blur(12px)",
      }}
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: [0.4, 1.15, 1], opacity: [0, 0.9, 0] }}
      transition={{ duration, times: [0, peakTime, 1], ease: "easeOut" }}
    />
  );
}

/** Stroked ring that lunges outward and fades — a shockwave in DOM. */
export function ExpandingRing({
  color,
  size,
  duration,
  delay = 0.1,
}: { color: string; size: number; duration: number; delay?: number }) {
  return (
    <motion.div
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid rgba(${color}, 0.75)`,
        boxShadow: `0 0 28px rgba(${color}, 0.5)`,
      }}
      initial={{ scale: 0.5, opacity: 1 }}
      animate={{ scale: 3, opacity: 0 }}
      transition={{ duration, ease: "easeOut", delay }}
    />
  );
}

/** Ring of sparkles flying outward. Geometry is deterministic per index
 *  (no per-render Math.random → stable across re-renders and networked
 *  clients). */
export function OrbitingSparkles({
  count,
  lightColor,
  hexColor,
  baseRadius,
  spread,
  durBase = 1.5,
  durSpread = 0.5,
  stagger = 0.05,
}: {
  count: number;
  lightColor: string;
  hexColor: string;
  baseRadius: number;
  spread: number;
  durBase?: number;
  durSpread?: number;
  stagger?: number;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const radius = sparkleRadius(i, baseRadius, spread);
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
            transition={{ duration: sparkleDuration(i, durBase, durSpread), ease: "easeOut", delay: stagger * i }}
          />
        );
      })}
    </>
  );
}
