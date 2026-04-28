"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { TURN_TIMER_SECONDS } from "@/lib/game/constants";
import { useAudioStore } from "@/lib/store/audioStore";
import SfxEngine from "@/lib/audio/SfxEngine";
import AudioEngine from "@/lib/audio/AudioEngine";

const WARNING_THRESHOLD = 15;

interface TurnTimerProps {
  isMyTurn: boolean;
  onTimeUp: () => void;
  turnNumber: number;
  /** Wall-clock (`Date.now()`) ms when the current turn began. The display
   *  is always derived from this anchor, so even if the browser throttles
   *  our setInterval (Chrome aggressively throttles unfocused windows when
   *  testing two clients side-by-side), the value is corrected the next
   *  time the tick fires or the tab regains focus. */
  turnStartedAt: number;
}

function computeTimeLeft(turnStartedAt: number): number {
  if (!turnStartedAt) return TURN_TIMER_SECONDS;
  const elapsed = Math.floor((Date.now() - turnStartedAt) / 1000);
  return Math.max(0, Math.min(TURN_TIMER_SECONDS, TURN_TIMER_SECONDS - elapsed));
}

export default function TurnTimer({
  isMyTurn,
  onTimeUp,
  turnNumber,
  turnStartedAt,
}: TurnTimerProps) {
  const [timeLeft, setTimeLeft] = useState(() => computeTimeLeft(turnStartedAt));
  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;

  const hasFiredWarningRef = useRef(false);
  const hasFiredTimeUpRef = useRef(false);
  const warningAudioRef = useRef<HTMLAudioElement | null>(null);

  // Single source of truth for "what should we display now". Wraps the
  // setTimeLeft call and optionally fires onTimeUp when we reach zero on
  // our own turn — kept here so that interval ticks AND focus/visibility
  // recomputes share the exact same logic.
  const tick = useCallback(() => {
    const next = computeTimeLeft(turnStartedAt);
    setTimeLeft(next);
    if (next <= 0 && isMyTurn && !hasFiredTimeUpRef.current) {
      hasFiredTimeUpRef.current = true;
      setTimeout(() => onTimeUpRef.current(), 0);
    }
  }, [turnStartedAt, isMyTurn]);

  // Reset audio + flags when the actual turn changes; recompute display
  // from the new anchor.
  useEffect(() => {
    AudioEngine.getInstance().resume();
    hasFiredWarningRef.current = false;
    hasFiredTimeUpRef.current = false;
    SfxEngine.getInstance().stop(warningAudioRef.current);
    warningAudioRef.current = null;
    setTimeLeft(computeTimeLeft(turnStartedAt));
  }, [turnNumber, turnStartedAt]);

  // 1 Hz interval ticking the display. The browser may throttle this when
  // the window is unfocused (Chrome especially), so we don't rely on it as
  // the only update path — visibility/focus listeners below force a
  // recompute whenever the tab returns to the foreground.
  useEffect(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tick]);

  // Force-recompute when the tab/window becomes visible or refocused —
  // covers the throttled-background-tab case.
  useEffect(() => {
    const handler = () => tick();
    document.addEventListener("visibilitychange", handler);
    window.addEventListener("focus", handler);
    return () => {
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("focus", handler);
    };
  }, [tick]);

  // Fire the 15-second warning SFX + pause the music exactly once per turn,
  // the first time the countdown crosses the threshold (player's turn only).
  useEffect(() => {
    if (!isMyTurn) return;
    if (hasFiredWarningRef.current) return;
    if (timeLeft > WARNING_THRESHOLD) return;
    hasFiredWarningRef.current = true;
    const audio = useAudioStore.getState();
    const url = audio.standardSfxUrls["timer_warning"];
    if (url && audio.userHasInteracted && !audio.settings.sfxMuted) {
      warningAudioRef.current = SfxEngine.getInstance().play(url);
    }
    AudioEngine.getInstance().pause();
  }, [timeLeft, isMyTurn]);

  const percentage = (timeLeft / TURN_TIMER_SECONDS) * 100;
  const isLow = timeLeft <= WARNING_THRESHOLD;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`text-xl font-bold ${
          isLow ? "text-accent animate-pulse" : "text-foreground"
        }`}
      >
        {timeLeft}s
      </div>
      <div className="w-16 h-1.5 bg-background/30 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isLow ? "bg-accent" : "bg-primary"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
