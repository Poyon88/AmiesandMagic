"use client";

// Crédit marché — jeton azur frappé d'un marteau d'enchère, dessiné en SVG
// comme <GoldCoin /> et <EssenceIcon /> (aucune dépendance à une police).
import { useId } from "react";

export default function CreditIcon({ size = 16, className, title }: { size?: number; className?: string; title?: string }) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ display: "inline-block", verticalAlign: "-0.125em", flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={`cr-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#bfe3ff" />
          <stop offset="50%" stopColor="#4a90d9" />
          <stop offset="100%" stopColor="#1f4f8a" />
        </linearGradient>
      </defs>
      <path d="M12 2 L20.7 7 V17 L12 22 L3.3 17 V7 Z" fill={`url(#cr-${uid})`} />
      <path d="M12 4.6 L18.4 8.3 V15.7 L12 19.4 L5.6 15.7 V8.3 Z" fill="none" stroke="#e6f3ff" strokeOpacity="0.55" strokeWidth="0.9" />
      <path d="M9 9.5 L13 13.5 M11 7.5 L15 11.5 M10 8.5 L14 12.5 M12.6 12.4 L16.2 16" stroke="#0d2747" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
