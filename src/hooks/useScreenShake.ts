"use client";

import { useEffect, useRef, useState } from "react";
import { useAnimationControls } from "framer-motion";
import { useGameStore } from "@/lib/store/gameStore";
import { SHAKE_THRESHOLD, BIG_HIT_THRESHOLD, HUGE_HIT_THRESHOLD, subscribe } from "@/lib/fx/impactFx";

const HIT_STOP_MS = 70;
const BIG_HIT_STOP_MS = 110; // longer freeze on big hits — the cinematic beat
const HUGE_HIT_STOP_MS = 160; // palier « énorme » (≥ 6) : l'arrêt le plus long
const DEATH_STOP_MS = 75; // brief freeze on a death (a bigger beat than a small hit)

export function useScreenShake() {
  const damageEvents = useGameStore((s) => s.damageEvents);
  const deathEvents = useGameStore((s) => s.deathEvents);
  const shakeControls = useAnimationControls();
  const [isFrozen, setFrozen] = useState(false);
  const [isFrozenBig, setFrozenBig] = useState(false);
  const lastSignatureRef = useRef<string>("");
  const lastDeathSigRef = useRef<string>("");

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
    const hitStop = biggest >= HUGE_HIT_THRESHOLD ? HUGE_HIT_STOP_MS : isBig ? BIG_HIT_STOP_MS : HIT_STOP_MS;

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

  // SECOUSSE DU PLATEAU — réservée aux moments forts. Les coups ordinaires ne
  // déplacent plus le plateau (choix antérieur, conservé) : seuls les effets
  // qui portent explicitement `secousse` (dégâts ≥ 6, entrée d'une Unique,
  // héros abattu) le font trembler, amplitude décroissante, ~0,45 s.
  useEffect(() => {
    return subscribe((e) => {
      const a = e.secousse;
      if (!a) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      void shakeControls.start({
        x: [0, -a, a * 0.75, -a * 0.5, a * 0.3, -a * 0.12, 0],
        y: [0, a * 0.45, -a * 0.35, a * 0.2, -a * 0.1, 0, 0],
        transition: { duration: 0.45, ease: "easeOut" },
      });
    });
  }, [shakeControls]);

  // A death is a bigger narrative beat than a small hit but, when it comes from
  // an effect or poison rather than a heavy strike, it gets no damage-driven
  // hit-stop. Give it its own short freeze. `isFrozenBig` is left untouched, so
  // a death that follows a big strike keeps that strike's stronger punch.
  useEffect(() => {
    const signature = deathEvents.map((e) => e.instanceId).join("|");
    if (signature === lastDeathSigRef.current) return;
    lastDeathSigRef.current = signature;
    if (deathEvents.length === 0) return;

    // Deferred (like the damage freeze) so the state change lands outside the
    // synchronous effect body. The freeze fires effectively immediately.
    let freezeTimer: ReturnType<typeof setTimeout> | null = null;
    const startTimer = setTimeout(() => {
      setFrozen(true);
      freezeTimer = setTimeout(() => setFrozen(false), DEATH_STOP_MS);
    }, 0);

    return () => {
      clearTimeout(startTimer);
      if (freezeTimer) clearTimeout(freezeTimer);
    };
  }, [deathEvents]);

  return { shakeControls, isFrozen, isFrozenBig };
}
