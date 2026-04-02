"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import type { Card } from "@/lib/game/types";
import { KEYWORD_SYMBOLS as keywordSymbols, KEYWORD_LABELS as keywordLabels, toRoman, parseXValuesFromEffectText, cleanEffectText } from "@/lib/game/keyword-labels";
import { SPELL_KEYWORDS, SPELL_KEYWORD_SYMBOLS, SPELL_KEYWORD_LABELS } from "@/lib/game/spell-keywords";
import KeywordIcon from "@/components/shared/KeywordIcon";
import { KEYWORDS as keywordDefs } from "@/lib/card-engine/constants";

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
  const [showDetails, setShowDetails] = useState(false);
  const detailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      onMouseEnter={() => {
        setHovered(true);
        detailTimer.current = setTimeout(() => setShowDetails(true), 600);
      }}
      onMouseLeave={() => {
        setHovered(false);
        setShowDetails(false);
        if (detailTimer.current) clearTimeout(detailTimer.current);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowDetails(prev => !prev);
        if (detailTimer.current) clearTimeout(detailTimer.current);
      }}
      style={{
        width: w, height: h, borderRadius: 10 * s, position: "relative",
        background: bgGradient,
        border: `2px solid ${borderColor}`,
        boxShadow: selected ? "0 0 12px #c8a84e44" : "none",
        overflow: "hidden",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.3s ease",
        transform: !disabled && hovered ? "scale(1.5)" : "none",
        zIndex: hovered ? 20 : 1,
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
            sizes="(min-resolution: 2dppx) 750px, 500px"
            quality={90}
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
        background: "linear-gradient(0deg, #0d0d1add 0%, #0d0d1a88 40%, transparent 65%)",
        display: "flex", flexDirection: "column", gap: 4 * s,
      }}>
        {/* Card name */}
        <div style={{
          fontSize: 10 * s, color: "#e0e0e0", fontWeight: 700,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontFamily: "'Cinzel', serif",
        }}>{card.name}</div>

        {/* Keyword symbols */}
        {card.keywords.length > 0 && (() => {
          const xVals = parseXValuesFromEffectText(card.effect_text);
          return (
          <div style={{ display: "flex", gap: 3 * s, flexWrap: "wrap" }}>
            {card.keywords.map((kw) => {
              const x = xVals[kw];
              const label = keywordLabels[kw] || kw;
              const displayTitle = x != null ? label.replace(/ X$/, ` ${toRoman(x)}`) : label;
              return (
              <div key={kw} title={displayTitle} style={{
                minWidth: 18 * s, height: 18 * s, borderRadius: 4 * s,
                padding: x != null ? `0 ${3 * s}px` : 0,
                background: `${accentColor}33`, border: `1px solid ${accentColor}66`,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 2 * s,
                fontSize: 10 * s,
              }}>
                <KeywordIcon symbol={keywordSymbols[kw] || "✦"} size={10 * s} />
                {x != null && <span style={{ fontSize: 7 * s, fontWeight: 900, color: "#fff", fontFamily: "'Cinzel',serif", textShadow: `0 0 3px ${accentColor}` }}>{toRoman(x)}</span>}
              </div>
              );
            })}
          </div>
          );
        })()}

        {/* Spell keyword symbols */}
        {card.spell_keywords && card.spell_keywords.length > 0 && (
          <div style={{ display: "flex", gap: 3 * s, flexWrap: "wrap" }}>
            {card.spell_keywords.map((spellKw, i) => {
              const def = SPELL_KEYWORDS[spellKw.id];
              let displayTitle = def.label;
              if (spellKw.attack != null) displayTitle = displayTitle.replace(/X/, String(spellKw.attack));
              else if (spellKw.amount != null) displayTitle = displayTitle.replace(/X/, String(spellKw.amount));
              if (spellKw.health != null) displayTitle = displayTitle.replace(/Y/, String(spellKw.health));
              const usesAtkHp = def.params.includes("attack") && def.params.includes("health");
              const usesAmount = def.params.includes("amount");
              const hasValue = usesAmount || usesAtkHp;
              const valueText = usesAtkHp
                ? `+${spellKw.attack ?? 0}/+${spellKw.health ?? 0}`
                : usesAmount ? toRoman(spellKw.amount ?? 1) : null;
              return (
              <div key={`sk_${i}`} title={displayTitle} style={{
                minWidth: 18 * s, height: 18 * s, borderRadius: 4 * s,
                padding: hasValue ? `0 ${3 * s}px` : 0,
                background: `${accentColor}33`, border: `1px solid ${accentColor}66`,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 2 * s,
                fontSize: 10 * s,
              }}>
                <KeywordIcon symbol={SPELL_KEYWORD_SYMBOLS[spellKw.id] || "✦"} size={10 * s} />
                {valueText && <span style={{ fontSize: 7 * s, fontWeight: 900, color: "#fff", fontFamily: "'Cinzel',serif", textShadow: `0 0 3px ${accentColor}` }}>{valueText}</span>}
              </div>
              );
            })}
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
        background: "#060612f8",
        opacity: showDetails ? 1 : 0,
        transition: "opacity 0.25s ease",
        pointerEvents: showDetails ? "auto" : "none",
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: `${16 * s}px ${14 * s}px`,
        gap: 8 * s,
        overflowY: "auto",
      }}>
        {/* Name */}
        <div style={{
          fontSize: 18 * s, color: accentColor, fontWeight: 700,
          textAlign: "center", fontFamily: "'Cinzel', serif",
          borderBottom: `1px solid ${accentColor}55`, paddingBottom: 7 * s,
        }}>{card.name}</div>

        {/* Race / Clan */}
        {(card.race || card.clan) && (
          <div style={{ display: "flex", justifyContent: "center", gap: 6 * s, fontSize: 13 * s, color: "#ddd", fontFamily: "'Crimson Text',serif" }}>
            {card.race && <span>{card.race}</span>}
            {card.race && card.clan && <span style={{ color: "#888" }}>·</span>}
            {card.clan && <span style={{ fontStyle: "italic" }}>{card.clan}</span>}
          </div>
        )}

        {/* Capacités detail */}
        {card.keywords.length > 0 && (() => {
          const xVals = parseXValuesFromEffectText(card.effect_text);
          return (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 * s }}>
            {card.keywords.map((kw) => {
              const x = xVals[kw];
              const label = keywordLabels[kw] || kw;
              const displayLabel = x != null ? label.replace(/ X$/, ` ${toRoman(x)}`) : label;
              const forgeKey = keywordLabels[kw];
              const kwDef = forgeKey ? keywordDefs[forgeKey] : null;
              const desc = kwDef?.desc ? (x != null ? kwDef.desc.replace(/X/g, String(x)) : kwDef.desc) : null;
              return (
              <div key={kw} style={{ display: "flex", alignItems: "flex-start", gap: 7 * s }}>
                <span style={{ flexShrink: 0 }}><KeywordIcon symbol={keywordSymbols[kw] || "✦"} size={18 * s} /></span>
                <div>
                  <div style={{ fontSize: 14 * s, color: accentColor, fontWeight: 700 }}>{displayLabel}</div>
                  {desc && <div style={{ fontSize: 12 * s, color: "#ddd", lineHeight: 1.4, fontFamily: "'Crimson Text',serif" }}>{desc}</div>}
                </div>
              </div>
              );
            })}
          </div>
          );
        })()}

        {/* Spell keyword details */}
        {card.spell_keywords && card.spell_keywords.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 * s }}>
            {card.spell_keywords.map((spellKw, i) => {
              const def = SPELL_KEYWORDS[spellKw.id];
              let label = def.label;
              if (spellKw.attack != null) label = label.replace(/X/, String(spellKw.attack));
              else if (spellKw.amount != null) label = label.replace(/X/, String(spellKw.amount));
              if (spellKw.health != null) label = label.replace(/Y/, String(spellKw.health));
              let desc = def.desc;
              if (spellKw.attack != null) desc = desc.replace(/X/g, String(spellKw.attack));
              else if (spellKw.amount != null) desc = desc.replace(/X/g, String(spellKw.amount));
              if (spellKw.health != null) desc = desc.replace(/Y/g, String(spellKw.health));
              return (
              <div key={`sk_${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 7 * s }}>
                <span style={{ flexShrink: 0 }}><KeywordIcon symbol={SPELL_KEYWORD_SYMBOLS[spellKw.id] || "✦"} size={18 * s} /></span>
                <div>
                  <div style={{ fontSize: 14 * s, color: accentColor, fontWeight: 700 }}>{label}</div>
                  <div style={{ fontSize: 12 * s, color: "#ddd", lineHeight: 1.4, fontFamily: "'Crimson Text',serif" }}>{desc}</div>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* Effect text */}
        {cleanEffectText(card.effect_text) && (
        <div style={{
          padding: `${8 * s}px ${10 * s}px`,
          background: `${accentColor}18`, borderRadius: 5 * s,
          border: `1px solid ${accentColor}44`,
        }}>
          <p style={{
            margin: 0, fontSize: 13 * s, color: "#eee",
            lineHeight: 1.5, fontFamily: "'Crimson Text', serif",
          }}>{cleanEffectText(card.effect_text)}</p>
        </div>
        )}

        {/* Flavor text */}
        {card.flavor_text && (
          <p style={{
            margin: 0, fontSize: 12 * s, color: `${accentColor}dd`,
            fontStyle: "italic", lineHeight: 1.4, fontFamily: "'Crimson Text', serif",
            textAlign: "center",
          }}>&ldquo;{card.flavor_text}&rdquo;</p>
        )}

        {/* Stats recap */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 8 * s, flexWrap: "wrap",
          fontSize: 13 * s, color: "#ccc",
          borderTop: `1px solid ${accentColor}33`, paddingTop: 7 * s,
        }}>
          {card.faction && <span style={{ color: accentColor, fontWeight: 600 }}>{card.faction}</span>}
          <span style={{ color: "#74b9ff" }}>💧{card.mana_cost}</span>
          {isCreature && <><span style={{ color: "#f1c40f" }}>⚔{card.attack}</span><span style={{ color: "#e74c3c" }}>❤{card.health}</span></>}
          <span style={{ color: "#bbb", textTransform: "uppercase", fontSize: 12 * s }}>{card.card_type}</span>
        </div>
      </div>
    </div>
  );
}
