"use client";

import Link from "next/link";
import type { ReactNode } from "react";

interface MenuTileProps {
  href: string;
  label: string;
  description: string;
  accent: "play" | "market" | "collection" | "decks" | "cards" | "heroes" | "card_backs" | "boards";
  glyph?: ReactNode;
}

// Reusable tile for the home + collection hub. Same overall shape as
// the landing's FactionCard (rounded panel, gold corner ornaments,
// gradient backdrop) but with one accent color per tile category so the
// player can identify the section at a glance. Renders as a proper
// <Link> so middle-click / right-click / keyboard activation behave
// like real navigation.
export default function MenuTile({ href, label, description, accent, glyph }: MenuTileProps) {
  const accentColor = ACCENT_HEX[accent];

  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-2xl transition-all duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8a84e] focus-visible:ring-offset-4 focus-visible:ring-offset-[#0a0a18]"
      style={{
        aspectRatio: "5/4",
        // Distinct from the page radial-gradient so the tile reads as a
        // discrete panel. The accent color is mixed in at the top so
        // the tile category is recognisable even without the glyph.
        background: `
          radial-gradient(ellipse at 50% 0%, ${accentColor}33 0%, transparent 55%),
          linear-gradient(160deg, rgba(60,60,95,0.95) 0%, rgba(20,20,38,1) 100%)
        `,
        // 2px gold border via outline-style inset (Tailwind border class
        // was rendering too faint against the dark gradient); plus an
        // inset reflet for a panel feel.
        boxShadow: `
          inset 0 0 0 2px rgba(200,168,78,0.55),
          inset 0 1px 0 rgba(200,168,78,0.25),
          0 18px 40px rgba(0,0,0,0.55)
        `,
      }}
    >
      {/* Hover border boost */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ boxShadow: "inset 0 0 0 2px rgba(200,168,78,0.95)" }}
        aria-hidden="true"
      />

      {/* Accent glow */}
      <div
        className="absolute inset-0 opacity-50 group-hover:opacity-90 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 30%, ${accentColor}44 0%, transparent 65%)`,
        }}
      />

      {/* Corner ornaments — SVG L-shapes that hug the rounded border.
          Drawn as four absolute SVGs in the four corners so they remain
          crisp and identical regardless of viewport. */}
      <CornerOrnament className="absolute top-2 left-2" rotate={0} />
      <CornerOrnament className="absolute top-2 right-2" rotate={90} />
      <CornerOrnament className="absolute bottom-2 right-2" rotate={180} />
      <CornerOrnament className="absolute bottom-2 left-2" rotate={270} />

      {/* Content */}
      <div className="relative z-[2] flex flex-col items-center justify-center h-full p-6 md:p-8 gap-3 text-center transition-transform duration-500 group-hover:scale-[1.02]">
        {glyph && (
          <div
            className="mb-1 transition-transform duration-500 group-hover:scale-110"
            style={{
              color: accentColor,
              filter: `drop-shadow(0 6px 14px ${accentColor}55)`,
            }}
            aria-hidden="true"
          >
            {glyph}
          </div>
        )}
        <h2
          className="font-[family-name:var(--font-cinzel),serif] font-bold text-[#c8a84e] tracking-wider"
          style={{
            fontSize: "clamp(20px, 2.4vw, 30px)",
            textShadow: "0 0 18px rgba(200, 168, 78, 0.3)",
          }}
        >
          {label}
        </h2>
        <div
          className="mx-auto h-px w-12 group-hover:w-24 transition-all duration-500"
          style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }}
        />
        <p
          className="font-[family-name:var(--font-crimson),serif] italic text-[#e0e0e0]/75"
          style={{ fontSize: "clamp(13px, 1.4vw, 16px)" }}
        >
          {description}
        </p>
      </div>
    </Link>
  );
}

/** Single gilded L-corner ornament. The `rotate` prop spins it so the
 *  same SVG path serves all four corners — keeps the four corners
 *  visually identical down to the pixel. */
function CornerOrnament({ className, rotate }: { className?: string; rotate: 0 | 90 | 180 | 270 }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      className={className}
      style={{ transform: `rotate(${rotate}deg)` }}
      aria-hidden="true"
    >
      <path
        d="M 22 2 H 6 A 4 4 0 0 0 2 6 V 22"
        fill="none"
        stroke="#c8a84e"
        strokeOpacity="0.85"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const ACCENT_HEX: Record<MenuTileProps["accent"], string> = {
  play: "#e74c3c",
  market: "#e8a94b",
  collection: "#5b9bd5",
  decks: "#c8a84e",
  cards: "#5b9bd5",
  heroes: "#a06bd5",
  card_backs: "#9b5cf6",
  boards: "#2ecc71",
};
