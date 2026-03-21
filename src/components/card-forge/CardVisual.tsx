'use client';

import { useState } from 'react';
import { KEYWORDS, FACTIONS, RARITY_MAP } from '@/lib/card-engine/constants';

// ─── KEYWORD → SYMBOL MAP ───────────────────────────────────────────────────

const KEYWORD_SYMBOLS: Record<string, string> = {
  "Loyauté":        "🤝",
  "Ancré":          "⚓",
  "Résistance":     "🛡️",
  "Provocation":    "🎯",
  "Traque":         "⚡",
  "Premier Frappe": "🗡️",
  "Berserk":        "😤",
  "Bouclier":       "🔰",
  "Précision":      "🎯",
  "Drain de vie":   "🩸",
  "Esquive":        "💨",
  "Poison":         "☠️",
  "Célérité":       "⚡",
  "Terreur":        "👁️",
  "Vol":            "🦅",
  "Armure":         "🛡️",
  "Commandement":   "👑",
  "Fureur":         "🔥",
  "Double Attaque": "⚔️",
  "Invisible":      "👻",
  "Liaison de vie": "💀",
  "Ombre":          "🌑",
  "Sacrifice":      "💔",
  "Maléfice":       "🔮",
  "Indestructible": "♾️",
  "Régénération":   "💚",
  "Corruption":     "🖤",
  "Pacte de sang":  "🩸",
  "Souffle de feu": "🐲",
  "Domination":     "👁️‍🗨️",
  "Résurrection":   "✨",
  "Transcendance":  "🌟",
};

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface CardData {
  name: string;
  faction: string;
  type: string;
  rarity: string;
  mana: number;
  attack: number | null;
  defense: number | null;
  power: number | null;
  keywords: string[];
  ability: string;
  flavorText: string;
  budgetUsed: number;
  budgetTotal: number;
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function CardVisual({ card, loading, compact = false, imageUrl, onImageChange }: { card: CardData | null; loading: boolean; compact?: boolean; imageUrl?: string | null; onImageChange?: (url: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const W = compact ? 180 : 300;
  const H = compact ? 252 : 420;
  const s = compact ? 0.6 : 1;

  if (!card && !loading) return (
    <div style={{
      width: W, height: H, borderRadius: 12 * s,
      background: "linear-gradient(135deg,#1a1a2e,#0d0d1a)",
      border: "2px dashed #1a1a3a",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      color: "#2a2a4a", fontFamily: "'Cinzel',serif", gap: 10,
    }}>
      <div style={{ fontSize: 40 * s }}>⚗️</div>
      {!compact && <div style={{ fontSize: 11 }}>Forgez votre première carte</div>}
    </div>
  );

  if (loading) return (
    <div style={{
      width: W, height: H, borderRadius: 12 * s,
      background: "linear-gradient(135deg,#1a1a2e,#0d0d1a)",
      border: "2px solid #1a1a3a",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      color: "#2a2a4a", fontFamily: "'Cinzel',serif", gap: 12,
    }}>
      <div style={{ fontSize: 36 * s, animation: "spin 2s linear infinite" }}>⚙️</div>
      {!compact && <div style={{ fontSize: 10 }}>Forge en cours…</div>}
    </div>
  );

  const fac = FACTIONS[card!.faction] || FACTIONS.Humains;
  const rar = RARITY_MAP[card!.rarity];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: W, height: H, borderRadius: 12 * s, position: "relative",
        background: `linear-gradient(160deg,${fac.bg} 0%,#0d0d1a 100%)`,
        border: `${compact ? 1.5 : 2}px solid ${rar.color}`,
        boxShadow: `0 0 ${20 * s}px ${rar.glow}44,0 0 ${50 * s}px ${rar.glow}11,inset 0 0 ${30 * s}px ${fac.color}18`,
        fontFamily: "'Cinzel',serif",
        overflow: "hidden",
        transition: "all 0.3s ease",
        cursor: "default",
      }}
    >
      {/* ── Full-bleed art area ── */}
      <div style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(135deg,${fac.bg},${fac.color}33,${fac.bg})`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={card!.name}
            style={{
              width: "100%", height: "100%",
              objectFit: "cover", objectPosition: "center",
            }}
          />
        ) : (
          <div style={{
            fontSize: 90 * s, opacity: 0.55,
            filter: `drop-shadow(0 0 ${25 * s}px ${fac.accent})`,
            transition: "all 0.4s ease",
          }}>{fac.emoji}</div>
        )}
      </div>

      {/* ── Image upload button (non-compact only) ── */}
      {!compact && onImageChange && (
        <label style={{
          position: "absolute", top: 8 * s, right: 46 * s, zIndex: 5,
          width: 22 * s, height: 22 * s, borderRadius: "50%",
          background: "#0d0d1acc", border: `1px solid ${fac.color}66`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11 * s, cursor: "pointer",
          opacity: 0.6,
          transition: "opacity 0.2s",
        }}
          onMouseEnter={(e) => { e.stopPropagation(); setHovered(false); }}
        >
          🖼
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImageChange(URL.createObjectURL(file));
              e.target.value = "";
            }}
          />
        </label>
      )}

      {/* ── Subtle vignette over art ── */}
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at center, transparent 40%, ${fac.bg}dd 100%)`,
        pointerEvents: "none",
      }} />

      {/* ── Top bar: name + mana ── */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 2,
        padding: `${8 * s}px ${12 * s}px`,
        background: `linear-gradient(180deg, ${fac.bg}ee 0%, transparent 100%)`,
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6,
      }}>
        <span style={{
          fontSize: 13 * s, color: fac.accent, fontWeight: 700,
          flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          textShadow: `0 1px 6px ${fac.bg}`,
        }}>
          {card!.name}
        </span>
        {/* Mana orb */}
        <div style={{
          width: 28 * s, height: 28 * s, borderRadius: "50%", flexShrink: 0,
          background: "radial-gradient(circle,#1a3a6a,#0d1f3c)",
          border: `${2 * s}px solid #74b9ff`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13 * s, color: "#74b9ff", fontWeight: 700,
          boxShadow: "0 0 8px #74b9ff55",
        }}>{card!.mana}</div>
      </div>

      {/* ── Bottom bar: stats + keywords + rarity ── */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2,
        padding: `${10 * s}px ${10 * s}px ${8 * s}px`,
        background: `linear-gradient(0deg, ${fac.bg}ee 0%, ${fac.bg}cc 60%, transparent 100%)`,
        display: "flex", flexDirection: "column", gap: 6 * s,
      }}>
        {/* Keyword symbols row */}
        {card!.keywords?.length > 0 && (
          <div style={{ display: "flex", gap: 4 * s, flexWrap: "wrap" }}>
            {card!.keywords.map(kw => (
              <div key={kw} title={`${kw}: ${KEYWORDS[kw]?.desc}`} style={{
                width: 24 * s, height: 24 * s, borderRadius: 6 * s,
                background: `${fac.color}33`, border: `1px solid ${fac.color}88`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13 * s, cursor: "default",
                boxShadow: `0 0 6px ${fac.color}44`,
                transition: "all 0.2s",
              }}>
                {KEYWORD_SYMBOLS[kw] || "✦"}
              </div>
            ))}
          </div>
        )}

        {/* Stats + rarity row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {/* Faction · Type */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 * s }}>
            <span style={{ fontSize: 7.5 * s, color: `${fac.accent}aa` }}>{card!.faction}</span>
            <span style={{ fontSize: 6 * s, color: "#333" }}>·</span>
            <span style={{ fontSize: 7 * s, color: rar.color, border: `1px solid ${rar.color}44`, padding: `${1 * s}px ${4 * s}px`, borderRadius: 3 * s }}>{rar.code}</span>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 6 * s, alignItems: "center" }}>
            {card!.type === "Unité" && (
              <>
                <div style={{
                  display: "flex", alignItems: "center", gap: 3 * s,
                  padding: `${2 * s}px ${6 * s}px`, borderRadius: 4 * s,
                  background: "#ff6b6b18", border: "1px solid #ff6b6b55",
                }}>
                  <span style={{ fontSize: 8 * s, color: "#ff6b6b88" }}>⚔</span>
                  <span style={{ fontSize: 14 * s, color: "#ff6b6b", fontWeight: 700 }}>{card!.attack}</span>
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 3 * s,
                  padding: `${2 * s}px ${6 * s}px`, borderRadius: 4 * s,
                  background: "#74b9ff18", border: "1px solid #74b9ff55",
                }}>
                  <span style={{ fontSize: 8 * s, color: "#74b9ff88" }}>🛡</span>
                  <span style={{ fontSize: 14 * s, color: "#74b9ff", fontWeight: 700 }}>{card!.defense}</span>
                </div>
              </>
            )}
            {card!.power != null && (
              <div style={{
                display: "flex", alignItems: "center", gap: 3 * s,
                padding: `${2 * s}px ${6 * s}px`, borderRadius: 4 * s,
                background: `${fac.accent}18`, border: `1px solid ${fac.accent}55`,
              }}>
                <span style={{ fontSize: 8 * s, color: `${fac.accent}88` }}>✨</span>
                <span style={{ fontSize: 14 * s, color: fac.accent, fontWeight: 700 }}>{card!.power}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Hover overlay: ability + flavor text ── */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 3,
        background: `${fac.bg}ee`,
        opacity: hovered ? 1 : 0,
        transition: "opacity 0.3s ease",
        pointerEvents: hovered ? "auto" : "none",
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: `${20 * s}px ${16 * s}px`,
        gap: 12 * s,
      }}>
        {/* Card name */}
        <div style={{
          fontSize: 14 * s, color: fac.accent, fontWeight: 700,
          textAlign: "center", letterSpacing: 1,
          borderBottom: `1px solid ${fac.color}44`, paddingBottom: 8 * s,
        }}>
          {card!.name}
        </div>

        {/* Keywords detail */}
        {card!.keywords?.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 * s }}>
            {card!.keywords.map(kw => (
              <div key={kw} style={{ display: "flex", alignItems: "flex-start", gap: 6 * s }}>
                <span style={{ fontSize: 12 * s, flexShrink: 0 }}>{KEYWORD_SYMBOLS[kw] || "✦"}</span>
                <div>
                  <div style={{ fontSize: 9 * s, color: fac.accent, fontWeight: 700 }}>{kw}</div>
                  <div style={{ fontSize: 8 * s, color: "#888", lineHeight: 1.4, fontFamily: "'Crimson Text',serif" }}>{KEYWORDS[kw]?.desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Ability text */}
        <div style={{
          padding: `${8 * s}px`,
          background: `${fac.color}11`, borderRadius: 5 * s,
          border: `1px solid ${fac.color}22`,
        }}>
          <p style={{
            margin: 0, fontSize: 10 * s, color: "#ccc",
            lineHeight: 1.6, fontFamily: "'Crimson Text',serif",
          }}>
            {card!.ability}
          </p>
        </div>

        {/* Flavor text */}
        {card!.flavorText && (
          <p style={{
            margin: 0, fontSize: 9 * s, color: `${fac.accent}77`,
            fontStyle: "italic", lineHeight: 1.4, fontFamily: "'Crimson Text',serif",
            textAlign: "center",
          }}>
            &ldquo;{card!.flavorText}&rdquo;
          </p>
        )}

        {/* Stats recap */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 10 * s, marginTop: 4 * s,
          fontSize: 8 * s, color: "#444",
        }}>
          <span>💧 {card!.mana}</span>
          {card!.attack != null && <span>⚔ {card!.attack}</span>}
          {card!.defense != null && <span>🛡 {card!.defense}</span>}
          {card!.power != null && <span>✨ {card!.power}</span>}
          <span style={{ color: rar.color }}>{card!.rarity}</span>
        </div>
      </div>
    </div>
  );
}
