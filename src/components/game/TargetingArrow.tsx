"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getInstanceCenter, curvedPath } from "@/lib/fx/overlayMotion";

// Touch devices have no continuous cursor position to anchor the arrow tail.
// Players already see valid targets via per-component pulsing highlights
// (BoardCreature isValidTarget, HeroPortrait ring, Hero3DViewer halo), so the
// arrow becomes a desktop-only visual aid in tap-to-target mode.
const isTouchDevice =
  typeof window !== "undefined" &&
  ("ontouchstart" in window || navigator.maxTouchPoints > 0);

interface TargetingArrowProps {
  targetingMode: "none" | "attack" | "attack_power" | "spell" | "spell_multi" | "creature" | "graveyard" | "divination" | "selection" | "tactique_keywords" | "hero_power" | "cost_payment" | "tap" | "pending_trigger";
  sourceInstanceId: string | null;
  hoveredTargetId: string | null;
}

export default function TargetingArrow({
  targetingMode,
  sourceInstanceId,
  hoveredTargetId,
}: TargetingArrowProps) {
  const mousePos = useRef({ x: 0, y: 0 });
  const pathRef = useRef<SVGPathElement>(null);
  const glowPathRef = useRef<SVGPathElement>(null);
  const arrowheadRef = useRef<SVGPolygonElement>(null);
  const rafId = useRef<number>(0);
  const smoothEnd = useRef<{ x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  // Keep props in refs so the rAF loop always reads the latest values
  const sourceIdRef = useRef(sourceInstanceId);
  sourceIdRef.current = sourceInstanceId;
  const hoveredRef = useRef(hoveredTargetId);
  hoveredRef.current = hoveredTargetId;
  const modeRef = useRef(targetingMode);
  modeRef.current = targetingMode;

  const isActive = targetingMode !== "none" && sourceInstanceId !== null;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Mouse tracking
  useEffect(() => {
    if (!isActive) return;

    const onMouseMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
    };

    document.addEventListener("mousemove", onMouseMove);
    return () => document.removeEventListener("mousemove", onMouseMove);
  }, [isActive]);

  // Single rAF loop that reads refs directly
  useEffect(() => {
    if (!isActive) return;
    smoothEnd.current = null; // fresh magnetic tracking each activation

    const loop = (t: number) => {
      const sid = sourceIdRef.current;
      if (!pathRef.current || !glowPathRef.current || !arrowheadRef.current || !sid) {
        rafId.current = requestAnimationFrame(loop);
        return;
      }

      const source = getInstanceCenter(sid);
      if (!source) {
        rafId.current = requestAnimationFrame(loop);
        return;
      }

      // Raw aim: the cursor, or the centre of the hovered valid target.
      let aim = mousePos.current;
      const hid = hoveredRef.current;
      if (hid) {
        const c = getInstanceCenter(hid);
        if (c) aim = c;
      }

      // Magnetic follow: the tip eases toward the aim instead of snapping, so
      // locking onto a valid target reads as a smooth pull, not a teleport.
      const se = smoothEnd.current;
      if (!se) {
        smoothEnd.current = { x: aim.x, y: aim.y };
      } else {
        se.x += (aim.x - se.x) * 0.3;
        se.y += (aim.y - se.y) * 0.3;
      }
      const end = smoothEnd.current!; // always set just above

      // Shared curved-path helper — same curve as the spell-cast arrows
      // (unifies the old 0.25/100 vs 0.22/90 mismatch the player could feel).
      const { d, cx, cy } = curvedPath(source.x, source.y, end.x, end.y);
      pathRef.current.setAttribute("d", d);
      glowPathRef.current.setAttribute("d", d);
      // Dashes flow toward the target (period matches strokeDasharray "20 10").
      pathRef.current.style.strokeDashoffset = String(-((t * 0.06) % 30));

      // Arrowhead rotation: tangent at t=1 of quadratic bezier
      const angle = Math.atan2(end.y - cy, end.x - cx) * (180 / Math.PI);
      arrowheadRef.current.setAttribute(
        "transform",
        `translate(${end.x}, ${end.y}) rotate(${angle})`
      );

      // Update stroke color live (attack vs spell vs hero_power vs tap)
      const m = modeRef.current;
      const color = m === "attack" ? "#ef4444"
        : m === "attack_power" ? "#9D00FF"
        : m === "creature" ? "#2ecc71"
        : m === "hero_power" ? "#F68D09"
        : m === "tap" ? "#F68D09"
        : "#a855f7";
      pathRef.current.setAttribute("stroke", color);
      glowPathRef.current.setAttribute("stroke", color);
      arrowheadRef.current.setAttribute("fill", color);

      rafId.current = requestAnimationFrame(loop);
    };

    rafId.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId.current);
  }, [isActive]);

  if (!isActive || !mounted) return null;
  if (isTouchDevice) return null;

  return createPortal(
    <svg
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 9999,
        overflow: "visible",
      }}
    >
      {/* Glow layer — simple wide stroke, no filter */}
      <path
        ref={glowPathRef}
        fill="none"
        strokeWidth={20}
        strokeOpacity={0.25}
        strokeLinecap="round"
        pointerEvents="none"
      />

      {/* Main arrow path */}
      <path
        ref={pathRef}
        fill="none"
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray="20 10"
        pointerEvents="none"
      />

      {/* Arrowhead */}
      <polygon
        ref={arrowheadRef}
        points="0,-16 36,0 0,16"
        pointerEvents="none"
      />
    </svg>,
    document.body
  );
}
