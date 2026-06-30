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
    let freezeTimer: ReturnType<typeof setTimeout> | null = null;
    const hitStop = isBig ? BIG_HIT_STOP_MS : HIT_STOP_MS;

    // Hit-stop only: a brief brightness/contrast punch on the board (filter,
    // driven by isFrozen) — NO positional shake/recoil. The board no longer
    // lurches when creatures take damage.
    const startTimer = setTimeout(() => {
      setFrozen(true);
      setFrozenBig(isBig);
      freezeTimer = setTimeout(() => {
        setFrozen(false);
        setFrozenBig(false);
      }, hitStop);
    }, earliestDelay);

    return () => {
      clearTimeout(startTimer);
      if (freezeTimer) clearTimeout(freezeTimer);
    };
  }, [damageEvents, shakeControls]);

  return { shakeControls, isFrozen, isFrozenBig };
}
