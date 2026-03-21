"use client";

import { useState } from "react";
import Image from "next/image";
import type { Card } from "@/lib/game/types";
import { KEYWORD_SYMBOLS as keywordSymbols, KEYWORD_LABELS as keywordLabels } from "@/lib/game/keyword-labels";

interface GameCardProps {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  size?: "sm" | "md" | "lg";
  count?: number;
}

export default function GameCard({
  card,
  onClick,
  disabled = false,
  selected = false,
  size = "md",
  count,
}: GameCardProps) {
  const [hovered, setHovered] = useState(false);

  const dims = {
    sm: { w: 180, h: 252 },
    md: { w: 260, h: 364 },
    lg: { w: 340, h: 476 },
  };
  const { w, h } = dims[size];
  const s = size === "sm" ? 0.7 : size === "md" ? 0.85 : 1;
  const isCreature = card.card_type === "creature";

  const borderColor = selected ? "#c8a84e" : isCreature ? "#3d3d5c" : "#6c3483";
  const bgGradient = isCreature
    ? "linear-gradient(160deg, #1a1a2e, #0d0d1a)"
    : "linear-gradient(160deg, #1a0a2a, #0d0d1a)";
  const accentColor = isCreature ? "#74b9ff" : "#ce93d8";

  return (
    <div
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: w, height: h, borderRadius: 10 * s, position: "relative",
        background: bgGradient,
        border: `2px solid ${borderColor}`,
        boxShadow: selected ? "0 0 12px #c8a84e44" : "none",
        overflow: "hidden",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.2s ease",
        transform: !disabled && hovered ? "scale(1.05)" : "none",
      }}
    >
      {/* ── Full-bleed art ── */}
      <div style={{ position: "absolute", inset: 0 }}>
        {card.image_url ? (
          <Image
            src={card.image_url}
            alt={card.name}
            fill
            className="object-cover"
            sizes={`${w}px`}
          />
        ) : (
          <div style={{
            width: "100%", height: "100%",
            background: isCreature ? "linear-gradient(135deg, #1a1a2e, #2a2a4599, #1a1a2e)" : "linear-gradient(135deg, #1a0a2a, #6c348333, #1a0a2a)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{
              fontSize: 48 * s, opacity: 0.5,
              filter: `drop-shadow(0 0 12px ${accentColor})`,
            }}>{isCreature ? "⚔️" : "✨"}</span>
          </div>
        )}
      </div>

      {/* ── Vignette ── */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at center, transparent 30%, #0d0d1add 100%)",
        pointerEvents: "none",
      }} />

      {/* ── Mana orb ── */}
      <div style={{
        position: "absolute", top: 5 * s, left: 5 * s, zIndex: 2,
        width: 24 * s, height: 24 * s, borderRadius: "50%",
        background: "radial-gradient(circle, #1a3a6a, #0d1f3c)",
        border: `2px solid #74b9ff`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12 * s, color: "#74b9ff", fontWeight: 700,
        boxShadow: "0 0 6px #74b9ff55",
      }}>{card.mana_cost}</div>

      {/* ── Count badge ── */}
      {count !== undefined && (
        <div style={{
          position: "absolute", top: 5 * s, right: 5 * s, zIndex: 2,
          width: 22 * s, height: 22 * s, borderRadius: "50%",
          background: "#c8a84e",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10 * s, color: "#0d0d1a", fontWeight: 700,
        }}>x{count}</div>
      )}

      {/* ── Bottom bar: name + keywords + stats ── */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2,
        padding: `${6 * s}px ${8 * s}px`,
        background: "linear-gradient(0deg, #0d0d1aee 0%, #0d0d1acc 60%, transparent 100%)",
        display: "flex", flexDirection: "column", gap: 4 * s,
      }}>
        {/* Card name */}
        <div style={{
          fontSize: 10 * s, color: "#e0e0e0", fontWeight: 700,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontFamily: "'Cinzel', serif",
        }}>{card.name}</div>

        {/* Keyword symbols */}
        {card.keywords.length > 0 && (
          <div style={{ display: "flex", gap: 3 * s, flexWrap: "wrap" }}>
            {card.keywords.map((kw) => (
              <div key={kw} title={keywordLabels[kw]} style={{
                width: 18 * s, height: 18 * s, borderRadius: 4 * s,
                background: `${accentColor}33`, border: `1px solid ${accentColor}66`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10 * s,
              }}>{keywordSymbols[kw]}</div>
            ))}
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{
            fontSize: 7 * s, color: "#ffffff44", textTransform: "uppercase",
            letterSpacing: 1,
          }}>{card.card_type}</span>

          {isCreature && (
            <div style={{ display: "flex", gap: 5 * s }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 2 * s,
                padding: `${1 * s}px ${5 * s}px`, borderRadius: 4 * s,
                background: "#f1c40f18", border: "1px solid #f1c40f55",
              }}>
                <span style={{ fontSize: 12 * s, color: "#f1c40f", fontWeight: 700 }}>{card.attack}</span>
              </div>
              <div style={{
                display: "flex", alignItems: "center", gap: 2 * s,
                padding: `${1 * s}px ${5 * s}px`, borderRadius: 4 * s,
                background: "#e74c3c18", border: "1px solid #e74c3c55",
              }}>
                <span style={{ fontSize: 12 * s, color: "#e74c3c", fontWeight: 700 }}>{card.health}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Hover overlay: effect text ── */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 3,
        background: "#0d0d1aee",
        opacity: hovered ? 1 : 0,
        transition: "opacity 0.25s ease",
        pointerEvents: hovered ? "auto" : "none",
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: `${14 * s}px ${10 * s}px`,
        gap: 8 * s,
      }}>
        {/* Name */}
        <div style={{
          fontSize: 11 * s, color: accentColor, fontWeight: 700,
          textAlign: "center", fontFamily: "'Cinzel', serif",
          borderBottom: `1px solid ${accentColor}44`, paddingBottom: 6 * s,
        }}>{card.name}</div>

        {/* Keywords detail */}
        {card.keywords.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 * s }}>
            {card.keywords.map((kw) => (
              <div key={kw} style={{ display: "flex", alignItems: "center", gap: 5 * s }}>
                <span style={{ fontSize: 11 * s }}>{keywordSymbols[kw]}</span>
                <span style={{ fontSize: 8 * s, color: accentColor, fontWeight: 600 }}>{keywordLabels[kw]}</span>
              </div>
            ))}
          </div>
        )}

        {/* Effect text */}
        <div style={{
          padding: `${6 * s}px`,
          background: `${accentColor}11`, borderRadius: 4 * s,
          border: `1px solid ${accentColor}22`,
        }}>
          <p style={{
            margin: 0, fontSize: 9 * s, color: "#ccc",
            lineHeight: 1.5, fontFamily: "'Crimson Text', serif",
          }}>{card.effect_text}</p>
        </div>

        {/* Stats recap */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 8 * s,
          fontSize: 8 * s, color: "#555",
        }}>
          <span>💧 {card.mana_cost}</span>
          {isCreature && <><span style={{ color: "#f1c40f" }}>⚔ {card.attack}</span><span style={{ color: "#e74c3c" }}>❤ {card.health}</span></>}
          <span style={{ color: "#666", textTransform: "uppercase" }}>{card.card_type}</span>
        </div>
      </div>
    </div>
  );
}
