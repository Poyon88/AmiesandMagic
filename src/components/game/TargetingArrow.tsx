"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TargetingArrowProps {
  targetingMode: "none" | "attack" | "spell";
  sourceInstanceId: string | null;
  hoveredTargetId: string | null;
}

function findElement(id: string): Element | null {
  return (
    document.querySelector(`[data-instance-id="${id}"]`) ??
    document.querySelector(`[data-target-id="${id}"]`)
  );
}

function getElementCenter(el: Element): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
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

    const loop = () => {
      const sid = sourceIdRef.current;
      if (!pathRef.current || !glowPathRef.current || !arrowheadRef.current || !sid) {
        rafId.current = requestAnimationFrame(loop);
        return;
      }

      const sourceEl = findElement(sid);
      if (!sourceEl) {
        rafId.current = requestAnimationFrame(loop);
        return;
      }

      const source = getElementCenter(sourceEl);
      let end = mousePos.current;

      const hid = hoveredRef.current;
      if (hid) {
        const targetEl = findElement(hid);
        if (targetEl) {
          end = getElementCenter(targetEl);
        }
      }

      const dist = Math.hypot(end.x - source.x, end.y - source.y);

      // Quadratic bezier control point — curve upward
      const midX = (source.x + end.x) / 2;
      const midY = (source.y + end.y) / 2;
      const curveStrength = Math.min(dist * 0.25, 100);
      const cx = midX;
      const cy = midY - curveStrength;

      const d = `M ${source.x} ${source.y} Q ${cx} ${cy} ${end.x} ${end.y}`;
      pathRef.current.setAttribute("d", d);
      glowPathRef.current.setAttribute("d", d);

      // Arrowhead rotation: tangent at t=1 of quadratic bezier
      const angle = Math.atan2(end.y - cy, end.x - cx) * (180 / Math.PI);
      arrowheadRef.current.setAttribute(
        "transform",
        `translate(${end.x}, ${end.y}) rotate(${angle})`
      );

      // Update stroke color live (attack vs spell)
      const color = modeRef.current === "attack" ? "#ef4444" : "#a855f7";
      pathRef.current.setAttribute("stroke", color);
      glowPathRef.current.setAttribute("stroke", color);
      arrowheadRef.current.setAttribute("fill", color);

      rafId.current = requestAnimationFrame(loop);
    };

    rafId.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId.current);
  }, [isActive]);

  if (!isActive || !mounted) return null;

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
        strokeWidth={10}
        strokeOpacity={0.25}
        strokeLinecap="round"
        pointerEvents="none"
      />

      {/* Main arrow path */}
      <path
        ref={pathRef}
        fill="none"
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray="10 5"
        pointerEvents="none"
      />

      {/* Arrowhead */}
      <polygon
        ref={arrowheadRef}
        points="0,-8 18,0 0,8"
        pointerEvents="none"
      />
    </svg>,
    document.body
  );
}
