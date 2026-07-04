"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { TempeteEvent } from "@/lib/store/gameStore";
import { getInstanceCenter, hashRandom } from "@/lib/fx/overlayMotion";

interface Props {
  event: TempeteEvent | null;
  onComplete: () => void;
}

// Per-missile timing — each lightning streak takes BOLT_MS to travel from
// origin to its target, IMPACT_MS for the flash. STAGGER_MS spaces the
// missiles so each is clearly its own projectile (Hearthstone Arcane
// Missiles cadence).
const BOLT_MS = 260;
const IMPACT_MS = 320;
const STAGGER_MS = 200;
const TAIL_FADE_MS = 140;

// Quadratic Bezier path from `(sx, sy)` to `(tx, ty)` with a curved arc
// — control point sits between them, offset perpendicular by `bulge`.
// Gives the missile a visible curved trajectory rather than a flat line.
function bezierPath(sx: number, sy: number, tx: number, ty: number, bulge: number): string {
  const mx = (sx + tx) / 2;
  const my = (sy + ty) / 2;
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.max(1, Math.hypot(dx, dy));
  // Perpendicular unit vector
  const nx = -dy / len;
  const ny = dx / len;
  const cx = mx + nx * bulge;
  const cy = my + ny * bulge;
  return `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;
}

interface Missile {
  key: number;
  origin: { x: number; y: number };
  target: { x: number; y: number };
  path: string;
  delay: number;
  sparks: { dx: number; dy: number }[];
}

// Tempête X — Hearthstone-style "Arcane Missiles" cadence: each drop is a
// distinct curved streak that flies from a random storm cloud point at the
// top of the screen down to its target, with a head + fading tail and an
// impact flash. Total time = STAGGER_MS * N + BOLT_MS + IMPACT_MS, so 5
// drops play in ~1.6s.
export default function TempeteOverlay({ event, onComplete }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Resolve all missile geometries once at event time. Stable across
  // re-renders so the animation doesn't reset if React re-renders mid-flight.
  const missiles = useMemo<Missile[] | null>(() => {
    if (!event || typeof window === "undefined") return null;
    const out: Missile[] = [];
    const skyY = -20;
    const skyZoneLeft = window.innerWidth * 0.15;
    const skyZoneRight = window.innerWidth * 0.85;
    for (let i = 0; i < event.targetIds.length; i++) {
      const target = getInstanceCenter(event.targetIds[i]);
      if (!target) continue;
      // Each missile starts somewhere along a horizontal "storm cloud"
      // band at the top of the viewport. Deterministic per drop (hashRandom)
      // so the missiles don't stack on the same vertical line yet stay
      // identical across re-renders and between networked clients.
      const sx = skyZoneLeft + hashRandom(i, 1) * (skyZoneRight - skyZoneLeft);
      const origin = { x: sx, y: skyY };
      const bulge = (hashRandom(i, 2) - 0.5) * 90;
      // Spark fan computed once here (not in render) and deterministically.
      const sparks = [0, 1, 2, 3, 4].map((s) => {
        const ang = (s / 5) * Math.PI * 2 + hashRandom(i * 5 + s, 3) * 0.4;
        const dist = 24 + hashRandom(i * 5 + s, 4) * 14;
        return { dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist };
      });
      out.push({
        key: i,
        origin,
        target,
        path: bezierPath(origin.x, origin.y, target.x, target.y, bulge),
        delay: (i * STAGGER_MS) / 1000,
        sparks,
      });
    }
    return out;
  }, [event]);

  useEffect(() => {
    if (!event) return;
    const total = STAGGER_MS * (event.targetIds.length - 1) + BOLT_MS + IMPACT_MS;
    const timer = setTimeout(onComplete, total + 100);
    return () => clearTimeout(timer);
  }, [event, onComplete]);

  if (!mounted || !event || !missiles || missiles.length === 0) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gradientId = `tempete-trail-${event.timestamp}`;

  return createPortal(
    <AnimatePresence>
      {event && (
        <motion.svg
          key={event.timestamp}
          width={vw}
          height={vh}
          viewBox={`0 0 ${vw} ${vh}`}
          style={{
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            zIndex: 91,
          }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <defs>
            {/* One gradient PER missile, aligned to its own origin→target
                vector: transparent at the cloud, bright cyan-white at the head.
                A single shared screen-diagonal gradient (the old approach) put
                the bright end in the wrong place for bolts travelling against
                the diagonal. */}
            {missiles.map((m) => (
              <linearGradient key={m.key} id={`${gradientId}-${m.key}`}
                gradientUnits="userSpaceOnUse"
                x1={m.origin.x} y1={m.origin.y} x2={m.target.x} y2={m.target.y}>
                <stop offset="0%" stopColor="#5aa9ff" stopOpacity="0" />
                <stop offset="60%" stopColor="#a7d4ff" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
              </linearGradient>
            ))}
          </defs>

          {missiles.map((m) => (
            <g key={m.key}>
              {/* Cloud flicker — a brief charge at the origin just before the
                  bolt fires (anticipation). */}
              <motion.circle
                cx={m.origin.x}
                cy={m.origin.y}
                r={14}
                fill="rgba(150, 190, 255, 0.5)"
                style={{ filter: "blur(3px)" }}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: [0.5, 1.2, 0.8], opacity: [0, 0.7, 0] }}
                transition={{ duration: 0.16, delay: Math.max(0, m.delay - 0.1), ease: "easeOut" }}
              />
              {/* Outer glow trail — wider, soft */}
              <motion.path
                d={m.path}
                stroke="rgba(120, 180, 255, 0.5)"
                strokeWidth={11}
                strokeLinecap="round"
                fill="none"
                style={{ filter: "blur(2px)" }}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{
                  pathLength: [0, 1, 1],
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: (BOLT_MS + TAIL_FADE_MS) / 1000,
                  times: [0, BOLT_MS / (BOLT_MS + TAIL_FADE_MS), 1],
                  delay: m.delay,
                  ease: "easeIn",
                }}
              />
              {/* Core streak — thin, bright, with the gradient so the head
                  reads as the projectile tip */}
              <motion.path
                d={m.path}
                stroke={`url(#${gradientId}-${m.key})`}
                strokeWidth={3.5}
                strokeLinecap="round"
                fill="none"
                style={{
                  filter: "drop-shadow(0 0 6px #b3d4ff) drop-shadow(0 0 12px #4a90e2)",
                }}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{
                  pathLength: [0, 1, 1],
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: (BOLT_MS + TAIL_FADE_MS) / 1000,
                  times: [0, BOLT_MS / (BOLT_MS + TAIL_FADE_MS), 1],
                  delay: m.delay,
                  ease: "easeIn",
                }}
              />
              {/* Impact flash at target — fires once the missile has
                  landed (delay + BOLT_MS) */}
              <motion.circle
                cx={m.target.x}
                cy={m.target.y}
                r={26}
                fill="rgba(220, 235, 255, 0.85)"
                style={{
                  filter:
                    "drop-shadow(0 0 16px #ffffff) drop-shadow(0 0 28px #5aa9ff)",
                }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{
                  scale: [0, 1.5, 0.5],
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: IMPACT_MS / 1000,
                  times: [0, 0.4, 1],
                  delay: m.delay + BOLT_MS / 1000,
                  ease: "easeOut",
                }}
              />
              {/* Spark burst — 5 little particles fanning out from impact
                  (geometry memoised on the missile, see useMemo). */}
              {m.sparks.map((sp, s) => (
                <motion.circle
                  key={`spark-${m.key}-${s}`}
                  cx={m.target.x}
                  cy={m.target.y}
                  r={2.5}
                  fill="#e8f3ff"
                  style={{ filter: "drop-shadow(0 0 4px #ffffff)" }}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 1 }}
                  animate={{
                    x: sp.dx,
                    y: sp.dy,
                    opacity: [0, 1, 0],
                    scale: [1, 1, 0],
                  }}
                  transition={{
                    duration: IMPACT_MS / 1000,
                    times: [0, 0.3, 1],
                    delay: m.delay + BOLT_MS / 1000,
                    ease: "easeOut",
                  }}
                />
              ))}
            </g>
          ))}
        </motion.svg>
      )}
    </AnimatePresence>,
    document.body,
  );
}
