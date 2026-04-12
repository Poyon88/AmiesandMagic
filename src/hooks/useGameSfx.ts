"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/store/gameStore";
import { useAudioStore } from "@/lib/store/audioStore";
import SfxEngine from "@/lib/audio/SfxEngine";

export default function useGameSfx() {
  const lastSfxEvents = useGameStore((s) => s.lastSfxEvents);
  const standardSfxUrls = useAudioStore((s) => s.standardSfxUrls);
  const userHasInteracted = useAudioStore((s) => s.userHasInteracted);
  const prevEventsRef = useRef<unknown>(null);

  useEffect(() => {
    if (!userHasInteracted || lastSfxEvents.length === 0) return;

    // Avoid replaying the same batch (compare by reference)
    if (lastSfxEvents === prevEventsRef.current) return;
    prevEventsRef.current = lastSfxEvents;

    const engine = SfxEngine.getInstance();

    console.log("[SFX] events:", lastSfxEvents, "standardUrls keys:", Object.keys(standardSfxUrls));

    for (const event of lastSfxEvents) {
      const url = event.cardSfxUrl || standardSfxUrls[event.type];
      console.log("[SFX] playing:", event.type, "url:", url?.slice(-40));
      if (url) {
        engine.play(url);
      }
    }
  }, [lastSfxEvents, standardSfxUrls, userHasInteracted]);
}
