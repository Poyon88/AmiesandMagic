"use client";

import { useEffect, useRef } from "react";

interface LogEntry {
  id: string;
  text: string;
  timestamp: number;
}

export default function EffectLog({ entries }: { entries: LogEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const now = Date.now();
  // Only show entries from last 15 seconds
  const visible = entries.filter(e => now - e.timestamp < 15000);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visible.length]);

  if (visible.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      style={{
        position: "absolute", bottom: 80, right: 12, zIndex: 30,
        width: 240, maxHeight: 160,
        overflowY: "auto", overflowX: "hidden",
        background: "rgba(10, 10, 20, 0.75)",
        borderRadius: 8, padding: "6px 8px",
        border: "1px solid rgba(255,255,255,0.08)",
        pointerEvents: "none",
      }}
    >
      {visible.map(entry => {
        const age = now - entry.timestamp;
        const opacity = age > 10000 ? Math.max(0.2, 1 - (age - 10000) / 5000) : 1;
        return (
          <div
            key={entry.id}
            style={{
              fontSize: 11, color: "#ccc", lineHeight: 1.5,
              fontFamily: "'Crimson Text', serif",
              opacity,
              transition: "opacity 0.5s",
            }}
          >
            {entry.text}
          </div>
        );
      })}
    </div>
  );
}
