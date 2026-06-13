"use client";

import { useEffect, useRef, useState } from "react";
import { useAnimationControls } from "framer-motion";
import { useGameStore } from "@/lib/store/gameStore";
import { SHAKE_THRESHOLD, BIG_HIT_THRESHOLD } from "@/lib/fx/impactFx";

const HIT_STOP_MS = 70;
const BIG_HIT_STOP_MS = 110; // longer freeze on big hits — the cinematic beat

export function useScreenShake() {
  const damageEvents = useGameStore((s) => s.damageEvents);
  const shakeControls = useAnimationControls();
  const [isFrozen, setFrozen] = useState(false);
  const [isFrozenBig, setFrozenBig] = useState(false);
  const lastSignatureRef = useRef<string>("");

  useEffect(() => {
    const signature = damageEvents
      .map((e) => `${e.targetId}:${e.amount}:${e.type ?? "damage"}:${e.delayMs ?? 0}`)
      .join("|");
    if (signature === lastSignatureRef.current) return;
    lastSignatureRef.current = signature;
    if (damageEvents.length === 0) return;

    const damageOnly = damageEvents.filter((e) => (e.type ?? "damage") === "damage");
    if (damageOnly.length === 0) return;

    // The hardest hit drives the shake — and its strike vector aims the kick.
    const biggestEvent = damageOnly.reduce((max, e) => (e.amount > max.amount ? e : max), damageOnly[0]);
    const biggest = biggestEvent.amount;
    if (biggest < SHAKE_THRESHOLD) return;

    const earliestDelay = Math.min(...damageOnly.map((e) => e.delayMs ?? 0));
    const isBig = biggest >= BIG_HIT_THRESHOLD;
    const intensity = isBig ? 14 : 7;
    const duration = isBig ? 0.5 : 0.32;

    // Directional kick: lurch ALONG the strike vector (attacker → target) then
    // settle with a decaying oscillation. Falls back to a horizontal-dominant
    // shudder when no attacker direction was stamped (spell/ability damage).
    let dirX = 1;
    let dirY = 0.25;
    const sx = biggestEvent.srcX;
    const sy = biggestEvent.srcY;
    if (sx != null && sy != null && sx > -9000) {
      const dx = biggestEvent.x - sx;
      const dy = biggestEvent.y - sy;
      const len = Math.hypot(dx, dy) || 1;
      dirX = dx / len;
      dirY = dy / len;
    }
    const kick = (axis: number) => [
      0,
      axis * intensity,
      -axis * intensity * 0.6,
      axis * intensity * 0.4,
      -axis * intensity * 0.2,
      axis * intensity * 0.08,
      0,
    ];

    let freezeTimer: ReturnType<typeof setTimeout> | null = null;
    const hitStop = isBig ? BIG_HIT_STOP_MS : HIT_STOP_MS;

    const startTimer = setTimeout(() => {
      setFrozen(true);
      setFrozenBig(isBig);
      freezeTimer = setTimeout(() => {
        setFrozen(false);
        setFrozenBig(false);
        shakeControls.start({
          x: kick(dirX),
          y: kick(dirY),
          rotate: isBig ? [0, -0.6, 0.5, -0.3, 0.2, 0, 0] : [0, -0.3, 0.25, -0.1, 0.05, 0, 0],
          transition: {
            duration,
            ease: "easeOut",
            times: [0, 0.12, 0.28, 0.45, 0.65, 0.85, 1],
          },
        });
      }, hitStop);
    }, earliestDelay);

    return () => {
      clearTimeout(startTimer);
      if (freezeTimer) clearTimeout(freezeTimer);
    };
  }, [damageEvents, shakeControls]);

  return { shakeControls, isFrozen, isFrozenBig };
}
