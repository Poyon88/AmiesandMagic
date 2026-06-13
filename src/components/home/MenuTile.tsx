"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

interface MenuTileProps {
  href: string;
  label: string;
  description: string;
  accent: "play" | "market" | "collection" | "decks" | "cards" | "heroes" | "card_backs" | "boards";
  glyph?: ReactNode;
  /** Optional full-bleed background image. Sits behind the accent
   *  gradient / glow with a darkening overlay so the text stays
   *  readable. The glyph is hidden when an image is provided to avoid
   *  visual noise. */
  bgImage?: string;
}

// Reusable tile for the home + collection hub. Same overall shape as
// the landing's FactionCard (rounded panel, gold corner ornaments,
// gradient backdrop) but with one accent color per tile category so the
// player can identify the section at a glance. Renders as a proper
// <Link> so middle-click / right-click / keyboard activation behave
// like real navigation.
export default function MenuTile({ href, label, description, accent, glyph, bgImage }: MenuTileProps) {
  const accentColor = ACCENT_HEX[accent];

  return (
    <Link
      href={href}
      className="group block relative overflow-hidden rounded-2xl transition-all duration-500 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8a84e] focus-visible:ring-offset-4 focus-visible:ring-offset-am-bg-0 w-full"
      style={{
        // Landscape ratio so wide gameplay-style background images fit
        // with minimal cropping. Still works for plain glyph tiles
        // because the content is centered. `block` + `w-full` + the
        // grid's `items-start` ensure aspect-ratio isn't overridden by
        // grid row stretching.
        aspectRatio: "16 / 10",
        // Distinct from the page radial-gradient so the tile reads as a
        // discrete panel. The accent color is mixed in at the top so
        // the tile category is recognisable even without the glyph.
        background: `
          radial-gradient(ellipse at 50% 0%, ${accentColor}40 0%, transparent 55%),
          linear-gradient(160deg, rgba(44,37,71,0.96) 0%, rgba(12,11,22,1) 100%)
        `,
        // No default border — only the four gold L-corners are visible
        // in the resting state. The full inset gold border fades in on
        // hover / keyboard focus (see the separate overlay below) so
        // the active tile reads as "selected".
        boxShadow: `
          inset 0 1px 0 rgba(244,224,154,0.18),
          0 20px 46px rgba(0,0,0,0.6)
        `,
      }}
    >
      {/* Accent-colored hover glow that lifts from the bottom edge —
          gives each category a distinct "aura" when active. */}
      <div
        className="absolute inset-x-0 bottom-0 h-2/3 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 100%, ${accentColor}55 0%, transparent 70%)`,
        }}
        aria-hidden="true"
      />
      {/* Optional background image — full-bleed, slightly desaturated
          and darkened so the title + description stay legible. Sits
          below the accent glow + corner ornaments. */}
      {bgImage && (
        <>
          <Image
            src={bgImage}
            alt=""
            fill
            sizes="(max-width: 640px) 90vw, 45vw"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            style={{ filter: "brightness(0.55) saturate(0.9)" }}
            aria-hidden="true"
          />
          {/* Dark gradient overlay focused at the bottom so the text
              block is always readable regardless of the image content. */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(180deg, rgba(10,10,24,0.25) 0%, rgba(10,10,24,0.55) 50%, rgba(10,10,24,0.9) 100%)",
            }}
            aria-hidden="true"
          />
        </>
      )}

      {/* Full gold border — hidden by default, fades in on hover or
          keyboard focus. The Link uses `group` + `focus-within` so
          either pointing at it or tabbing to it surfaces the border. */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none"
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

      {/* Corner ornaments — SVG L-shapes that share the tile's rounded
          corner radius (16 px = rounded-2xl) so the ornament's outer
          curve sits exactly on top of the gold border, blending into a
          single visual element. Positioned at the corners (0,0) so the
          edges align with the tile boundary. */}
      <CornerOrnament className="absolute top-0 left-0" rotate={0} />
      <CornerOrnament className="absolute top-0 right-0" rotate={90} />
      <CornerOrnament className="absolute bottom-0 right-0" rotate={180} />
      <CornerOrnament className="absolute bottom-0 left-0" rotate={270} />

      {/* Content */}
      <div className="relative z-[2] flex flex-col items-center justify-center h-full p-6 md:p-8 gap-3 text-center transition-transform duration-500 group-hover:scale-[1.02]">
        {glyph && !bgImage && (
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
          className="am-foil-text font-[family-name:var(--font-cinzel),serif] font-bold tracking-wider"
          style={{ fontSize: "clamp(20px, 2.4vw, 30px)" }}
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

/** Single gilded L-corner ornament. Matches the tile's
 *  `rounded-2xl` (16 px) corner radius so the ornament's outer curve
 *  sits exactly on the tile's gold border, blending into one shape.
 *  The `rotate` prop spins the same SVG for the four corners. */
function CornerOrnament({ className, rotate }: { className?: string; rotate: 0 | 90 | 180 | 270 }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      className={className}
      style={{ transform: `rotate(${rotate}deg)`, transformOrigin: "center" }}
      aria-hidden="true"
    >
      {/* Outer L following the rounded-2xl curve (radius 16). The tail
          length beyond the curve (~12 px) gives the ornament its
          characteristic L shape. */}
      <path
        d="M 28 0 H 16 A 16 16 0 0 0 0 16 V 28"
        fill="none"
        stroke="#c8a84e"
        strokeOpacity="0.95"
        strokeWidth="2"
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
