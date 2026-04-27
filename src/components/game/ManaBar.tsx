"use client";

interface ManaBarProps {
  current: number;
  max: number;
}

export default function ManaBar({ current, max }: ManaBarProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            className={`w-6 h-6 rounded-full border transition-colors ${
              i < current
                ? "bg-mana-blue border-mana-blue shadow-sm shadow-mana-blue/50"
                : "bg-background/30 border-card-border"
            }`}
          />
        ))}
      </div>
      <span className="text-base font-bold text-mana-blue">
        {current}/{max}
      </span>
    </div>
  );
}
