"use client";

import { useRef } from "react";
import type React from "react";

type Options = {
  /** Delay before the long-press fires, in ms. */
  delay?: number;
  /** Max finger drift (in CSS px) before the press is cancelled. */
  moveTolerance?: number;
};

/**
 * Touch equivalent of right-click for mobile / tablets.
 *
 * Usage:
 *   const lp = useLongPress(() => openDescription());
 *   <div
 *     {...lp.handlers}
 *     style={{ ...LONG_PRESS_RESET_STYLE, ... }}
 *     onClick={() => { if (lp.consume()) return; onClick?.(); }}
 *     onContextMenu={(e) => { e.preventDefault(); openDescription(); }}
 *   />
 *
 * `consume()` reads-and-resets the "did the long-press just fire" flag — call
 * it at the top of `onClick` so the synthesised tap that follows a hold is
 * swallowed instead of triggering the primary action (play / target / attack).
 */
export default function useLongPress(
  onLongPress: () => void,
  options?: Options
) {
  const delay = options?.delay ?? 450;
  const moveTolerance = options?.moveTolerance ?? 10;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const cancel = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    startRef.current = { x: t.clientX, y: t.clientY };
    firedRef.current = false;
    cancel();
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, delay);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!startRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - startRef.current.x;
    const dy = t.clientY - startRef.current.y;
    if (dx * dx + dy * dy > moveTolerance * moveTolerance) cancel();
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    cancel();
    if (firedRef.current) {
      // Suppress the synthesised mouse/click events that follow a touch
      // sequence — without this, the long-press would also trigger the tap
      // action (play card / select target).
      e.preventDefault();
    }
  };

  const onTouchCancel = () => {
    cancel();
    firedRef.current = false;
  };

  return {
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel },
    /** Read-and-reset the long-press flag. Call at the top of onClick. */
    consume: () => {
      const v = firedRef.current;
      firedRef.current = false;
      return v;
    },
  };
}

/**
 * Inline style fragment to merge into long-pressable elements. Disables iOS's
 * native callout (text selection / "Save image"), which would otherwise hijack
 * the gesture.
 */
export const LONG_PRESS_RESET_STYLE: React.CSSProperties = {
  WebkitTouchCallout: "none",
  WebkitUserSelect: "none",
  userSelect: "none",
};
