"use client";

import { useState, useEffect, useRef } from "react";
import { TURN_TIMER_SECONDS } from "@/lib/game/constants";

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

  useEffect(() => {
    // Reset timer on turn change
    setTimeLeft(TURN_TIMER_SECONDS);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (isMyTurn) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            // Call onTimeUp outside the state updater to avoid setState-during-render
            setTimeout(() => onTimeUpRef.current(), 0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isMyTurn, turnNumber]);

  const percentage = (timeLeft / TURN_TIMER_SECONDS) * 100;
  const isLow = timeLeft <= 15;

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
