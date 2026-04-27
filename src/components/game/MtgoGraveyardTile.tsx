"use client";

import Image from "next/image";

interface Props {
  count: number;
  imageUrl: string | null;
  isOpponent: boolean;
  onClick: () => void;
}

// MTGO-style clickable graveyard panel. Renders the admin-uploaded
// graveyard image (per-board, falls back to a stylised default) with the
// current pile count overlaid. Clicking opens the same GraveyardOverlay
// that the legacy 💀 button used.
//
// Sized to read like a small card (~96×136 logical, scaled by the outer
// wrapper). Lives in the side margin so the central play area stays
// uncluttered, matching the user's "épuré au centre" requirement.
export default function MtgoGraveyardTile({
  count,
  imageUrl,
  isOpponent,
  onClick,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-no-global-click-sfx="true"
      title={isOpponent ? "Cimetière adverse" : "Votre cimetière"}
      style={{
        width: 96,
        height: 136,
        position: "relative",
        borderRadius: 8,
        overflow: "hidden",
        cursor: "pointer",
        background: "linear-gradient(160deg, #1a0a2a, #0d0d1a)",
        border: `2px solid ${isOpponent ? "rgba(231, 76, 60, 0.55)" : "rgba(155, 89, 182, 0.55)"}`,
        boxShadow: `0 0 12px ${isOpponent ? "rgba(231, 76, 60, 0.35)" : "rgba(155, 89, 182, 0.35)"}, 0 6px 16px rgba(0, 0, 0, 0.5)`,
        padding: 0,
        transition: "transform 0.15s ease, box-shadow 0.2s ease",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.transform = "scale(1.04)";
        el.style.boxShadow = `0 0 18px ${isOpponent ? "rgba(231, 76, 60, 0.55)" : "rgba(155, 89, 182, 0.55)"}, 0 8px 22px rgba(0, 0, 0, 0.6)`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.transform = "scale(1)";
        el.style.boxShadow = `0 0 12px ${isOpponent ? "rgba(231, 76, 60, 0.35)" : "rgba(155, 89, 182, 0.35)"}, 0 6px 16px rgba(0, 0, 0, 0.5)`;
      }}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt="Cimetière"
          fill
          className="object-cover"
          sizes="(min-resolution: 2dppx) 192px, 96px"
          quality={88}
        />
      ) : (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 56, opacity: 0.5,
          background: "radial-gradient(circle at center, rgba(155,89,182,0.25), transparent 70%)",
        }}>
          🪦
        </div>
      )}

      {/* Bottom darkening + count badge */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        padding: "16px 6px 5px",
        background: "linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 50%, transparent 100%)",
        textAlign: "center",
      }}>
        <span style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 18,
          fontWeight: 800,
          color: "#fff",
          textShadow: "0 1px 4px rgba(0,0,0,0.95)",
          letterSpacing: 1,
        }}>
          {count}
        </span>
      </div>

      {/* Top label, subtle */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        padding: "4px 6px 8px",
        background: "linear-gradient(180deg, rgba(0,0,0,0.7), transparent)",
        fontFamily: "'Cinzel', serif",
        fontSize: 9,
        letterSpacing: 1.5,
        color: isOpponent ? "#f5b7b1" : "#d7bde2",
        textShadow: "0 1px 2px rgba(0,0,0,0.95)",
        textAlign: "center",
        textTransform: "uppercase",
      }}>
        {"Cimetière"}
      </div>
    </button>
  );
}
