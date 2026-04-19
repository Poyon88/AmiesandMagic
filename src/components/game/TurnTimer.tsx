"use client";

import { useState, useEffect, useRef } from "react";
import { TURN_TIMER_SECONDS } from "@/lib/game/constants";
import { useAudioStore } from "@/lib/store/audioStore";
import SfxEngine from "@/lib/audio/SfxEngine";
import AudioEngine from "@/lib/audio/AudioEngine";

const WARNING_THRESHOLD = 15;

interface TurnTimerProps {
  isMyTurn: boolean;
  onTimeUp: () => void;
  turnNumber: number;
}

export default function TurnTimer({
  isMyTurn,
  onTimeUp,
  turnNumber,
}: TurnTimerProps) {
  const [timeLeft, setTimeLeft] = useState(TURN_TIMER_SECONDS);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;

  const hasFiredWarningRef = useRef(false);

  // Reset only when the actual turn changes.
  useEffect(() => {
    setTimeLeft(TURN_TIMER_SECONDS);
    AudioEngine.getInstance().resume();
    hasFiredWarningRef.current = false;
  }, [turnNumber]);

  // Start / pause the interval whenever the timer is allowed to tick. The
  // setter is kept pure so React strict mode's double-invoke doesn't multiply
  // side effects — those live in a dedicated effect below.
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!isMyTurn) return;

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setTimeout(() => onTimeUpRef.current(), 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isMyTurn]);

  // Fire the 15-second warning SFX + pause the music exactly once per turn,
  // the first time the countdown crosses the threshold.
  useEffect(() => {
    if (!isMyTurn) return;
    if (hasFiredWarningRef.current) return;
    if (timeLeft > WARNING_THRESHOLD) return;
    hasFiredWarningRef.current = true;
    const audio = useAudioStore.getState();
    const url = audio.standardSfxUrls["timer_warning"];
    if (url && audio.userHasInteracted && !audio.settings.sfxMuted) {
      SfxEngine.getInstance().play(url);
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
