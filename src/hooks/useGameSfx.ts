"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/store/gameStore";
import { useAudioStore } from "@/lib/store/audioStore";
import SfxEngine from "@/lib/audio/SfxEngine";

export default function useGameSfx() {
  const lastSfxEvents = useGameStore((s) => s.lastSfxEvents);
  const standardSfxUrls = useAudioStore((s) => s.standardSfxUrls);
  const userHasInteracted = useAudioStore((s) => s.userHasInteracted);
  const prevTimestampRef = useRef(0);

  useEffect(() => {
    if (!userHasInteracted || lastSfxEvents.length === 0) return;

    // Use a simple timestamp to avoid replaying the same batch
    const batchKey = Date.now();
    if (batchKey === prevTimestampRef.current) return;
    prevTimestampRef.current = batchKey;

    const engine = SfxEngine.getInstance();

    for (const event of lastSfxEvents) {
      const url = event.cardSfxUrl || standardSfxUrls[event.type];
      if (url) {
        engine.play(url);
      }
    }
  }, [lastSfxEvents, standardSfxUrls, userHasInteracted]);
}
