"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import type { Card } from "@/lib/game/types";
import { KEYWORD_SYMBOLS as keywordSymbols, KEYWORD_LABELS as keywordLabels, toRoman, parseXValuesFromEffectText, cleanEffectText } from "@/lib/game/keyword-labels";
import { SPELL_KEYWORDS, SPELL_KEYWORD_SYMBOLS, SPELL_KEYWORD_LABELS, getSpellKeywordDesc, getSpellKeywordLabel } from "@/lib/game/spell-keywords";
import KeywordIcon from "@/components/shared/KeywordIcon";
import { KEYWORDS as keywordDefs, LIMITED_PRINT_COUNTS } from "@/lib/card-engine/constants";

interface GameCardProps {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  size?: "sm" | "md" | "lg";
  count?: number;
  printNumber?: number;
  maxPrints?: number;
  disableHoverZoom?: boolean;
}

export default function GameCard({
  card,
  onClick,
  disabled = false,
  selected = false,
  size = "md",
  count,
  printNumber,
  maxPrints,
  disableHoverZoom = false,
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
        transform: !disabled && !disableHoverZoom && hovered ? "scale(1.5)" : "none",
        zIndex: !disableHoverZoom && hovered ? 20 : 1,
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
            sizes="(min-resolution: 2dppx) 1024px, 750px"
            quality={95}
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
        width: 27 * s, height: 27 * s, borderRadius: "50%",
        background: "radial-gradient(circle, #1a3a6a, #0d1f3c)",
        outline: `2px solid #74b9ff`,
        fontSize: 17 * s, color: "#74b9ff", fontWeight: 700,
        lineHeight: `${27 * s}px`,
        textAlign: "center",
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
          fontSize: 13 * s, color: "#e0e0e0", fontWeight: 700,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontFamily: "'Cinzel', serif",
        }}>{card.name}</div>

        {/* Keywords + Stats — single row */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 * s, flexWrap: "wrap" }}>
          {/* Keyword symbols */}
          {card.keywords.length > 0 && (() => {
            const xVals = parseXValuesFromEffectText(card.effect_text);
            return card.keywords.map((kw) => {
              const x = xVals[kw];
              const label = keywordLabels[kw] || kw;
              const displayTitle = x != null ? label.replace(/ X$/, ` ${toRoman(x)}`) : label;
              return (
              <div key={kw} title={displayTitle} style={{
                minWidth: 25 * s, height: 25 * s, borderRadius: 4 * s,
                padding: x != null ? `0 ${4 * s}px` : 0,
                background: `${accentColor}33`, border: `1px solid ${accentColor}66`,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 2 * s,
                fontSize: 10 * s,
              }}>
                <KeywordIcon symbol={keywordSymbols[kw] || "✦"} size={14 * s} keyword={kw} />
                {x != null && <span style={{ fontSize: 10 * s, fontWeight: 900, color: "#fff", fontFamily: "'Cinzel',serif", textShadow: `0 0 3px ${accentColor}` }}>{toRoman(x)}</span>}
              </div>
              );
            });
          })()}

          {/* Spell keyword symbols */}
          {card.spell_keywords && card.spell_keywords.length > 0 && card.spell_keywords.map((spellKw, i) => {
              const def = SPELL_KEYWORDS[spellKw.id];
              const displayTitle = getSpellKeywordLabel(spellKw);
              const usesAtkHp = def.params.includes("attack") && def.params.includes("health");
              const usesAmount = def.params.includes("amount");
              const hasValue = usesAmount || usesAtkHp;
              const valueText = usesAtkHp
                ? `+${spellKw.attack ?? 0}/+${spellKw.health ?? 0}`
                : usesAmount ? toRoman(spellKw.amount ?? 1) : null;
              return (
              <div key={`sk_${i}`} title={displayTitle} style={{
                minWidth: 25 * s, height: 25 * s, borderRadius: 4 * s,
                padding: hasValue ? `0 ${4 * s}px` : 0,
                background: `${accentColor}33`, border: `1px solid ${accentColor}66`,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 2 * s,
                fontSize: 10 * s,
              }}>
                <KeywordIcon symbol={SPELL_KEYWORD_SYMBOLS[spellKw.id] || "✦"} size={14 * s} keyword={`spell_${spellKw.id}`} />
                {valueText && <span style={{ fontSize: 10 * s, fontWeight: 900, color: "#fff", fontFamily: "'Cinzel',serif", textShadow: `0 0 3px ${accentColor}` }}>{valueText}</span>}
              </div>
              );
          })}

          {/* Stats — pushed to right */}
          {isCreature && (
            <div style={{ display: "flex", gap: 6 * s, marginLeft: "auto" }}>
              <div style={{
                display: "flex", alignItems: "center",
                padding: `${1 * s}px ${6 * s}px`, borderRadius: 5 * s,
                background: "#e74c3c18", border: "1px solid #e74c3c55",
              }}>
                <span style={{ fontSize: 17 * s, color: "#e74c3c", fontWeight: 700 }}>{card.attack}</span>
              </div>
              <div style={{
                display: "flex", alignItems: "center",
                padding: `${1 * s}px ${6 * s}px`, borderRadius: 5 * s,
                background: "#f1c40f18", border: "1px solid #f1c40f55",
              }}>
                <span style={{ fontSize: 17 * s, color: "#f1c40f", fontWeight: 700 }}>{card.health}</span>
              </div>
            </div>
          )}
        </div>

        {/* Print number */}
        {(() => {
          const mp = maxPrints || (!card.set_id && card.card_year && card.rarity ? LIMITED_PRINT_COUNTS[card.rarity] : undefined);
          return mp ? (
            <span style={{
              fontSize: 9 * s, color: "#ffffff", fontWeight: 600, fontFamily: "'Cinzel',serif",
              letterSpacing: 0.5,
              textShadow: "0 1px 3px rgba(0,0,0,0.8)",
            }}>{printNumber ? `${printNumber}/${mp}` : `/${mp}`}</span>
          ) : null;
        })()}
      </div>

      {/* ── Hover overlay: effect text ── */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 3,
        background: "#060612b3",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
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

        {/* Month / Year (for cards without a set) */}
        {card.card_year && !card.set_id && (
          <div style={{ textAlign: "center", fontSize: 13 * s, color: "#888", fontFamily: "'Crimson Text',serif" }}>
            📅 {card.card_month ? ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"][card.card_month - 1] + " " : ""}{card.card_year}
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
                <span style={{ flexShrink: 0 }}><KeywordIcon symbol={keywordSymbols[kw] || "✦"} size={18 * s} keyword={kw} /></span>
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
              const label = getSpellKeywordLabel(spellKw);
              const desc = getSpellKeywordDesc(spellKw, card);
              return (
              <div key={`sk_${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 7 * s }}>
                <span style={{ flexShrink: 0 }}><KeywordIcon symbol={SPELL_KEYWORD_SYMBOLS[spellKw.id] || "✦"} size={18 * s} keyword={`spell_${spellKw.id}`} /></span>
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
        {cleanEffectText(card.effect_text, card.spell_keywords) && (
        <div style={{
          padding: `${8 * s}px ${10 * s}px`,
          background: `${accentColor}18`, borderRadius: 5 * s,
          border: `1px solid ${accentColor}44`,
        }}>
          <p style={{
            margin: 0, fontSize: 13 * s, color: "#eee",
            lineHeight: 1.5, fontFamily: "'Crimson Text', serif",
          }}>{cleanEffectText(card.effect_text, card.spell_keywords)}</p>
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
          {isCreature && <><span style={{ color: "#e74c3c" }}>⚔{card.attack}</span><span style={{ color: "#f1c40f" }}>❤{card.health}</span></>}
        </div>
      </div>
    </div>
  );
}
