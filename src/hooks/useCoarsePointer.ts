"use client";

import { useEffect, useState } from "react";

/**
 * True when the primary pointer is "coarse" — i.e. a touch screen with no
 * hover (phones, tablets, iPad Pro with a finger). Used to enlarge the
 * card detail-overlay text, since touch users can't rely on the desktop
 * hover-zoom to read tiny in-game descriptions.
 *
 * SSR-safe: returns `false` on the server and during the first client render,
 * then updates after mount (and on device/pointer changes, e.g. an iPad that
 * pairs a trackpad).
 */
export default function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return coarse;
}
