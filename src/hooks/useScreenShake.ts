"use client";

import { useEffect, useRef, useState } from "react";
import { useAnimationControls } from "framer-motion";
import { useGameStore } from "@/lib/store/gameStore";

const SHAKE_THRESHOLD = 3;
const BIG_HIT_THRESHOLD = 6;
const HIT_STOP_MS = 70;

export function useScreenShake() {
  const damageEvents = useGameStore((s) => s.damageEvents);
  const shakeControls = useAnimationControls();
  const [isFrozen, setFrozen] = useState(false);
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

    const biggest = damageOnly.reduce((max, e) => Math.max(max, e.amount), 0);
    if (biggest < SHAKE_THRESHOLD) return;

    const earliestDelay = Math.min(...damageOnly.map((e) => e.delayMs ?? 0));
    const isBig = biggest >= BIG_HIT_THRESHOLD;
    const intensity = isBig ? 14 : 7;
    const duration = isBig ? 0.5 : 0.32;

    let freezeTimer: ReturnType<typeof setTimeout> | null = null;

    const startTimer = setTimeout(() => {
      setFrozen(true);
      freezeTimer = setTimeout(() => {
        setFrozen(false);
        shakeControls.start({
          x: [0, -intensity, intensity, -intensity * 0.6, intensity * 0.45, -intensity * 0.25, 0],
          y: [0, intensity * 0.35, -intensity * 0.25, intensity * 0.2, -intensity * 0.1, 0, 0],
          rotate: isBig ? [0, -0.6, 0.5, -0.3, 0.2, 0, 0] : [0, -0.3, 0.25, -0.1, 0.05, 0, 0],
          transition: {
            duration,
            ease: "easeOut",
            times: [0, 0.12, 0.28, 0.45, 0.65, 0.85, 1],
          },
        });
      }, HIT_STOP_MS);
    }, earliestDelay);

    return () => {
      clearTimeout(startTimer);
      if (freezeTimer) clearTimeout(freezeTimer);
    };
  }, [damageEvents, shakeControls]);

  return { shakeControls, isFrozen };
}
