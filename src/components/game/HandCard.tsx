"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import type { CardInstance } from "@/lib/game/types";
import { useGameStore } from "@/lib/store/gameStore";
import type { DragEvent } from "react";
import { KEYWORD_SYMBOLS, KEYWORD_LABELS, toRoman, parseXValuesFromEffectText, cleanEffectText } from "@/lib/game/keyword-labels";
import { SPELL_KEYWORDS, SPELL_KEYWORD_SYMBOLS, SPELL_KEYWORD_LABELS, getSpellKeywordLabel, getSpellKeywordDesc } from "@/lib/game/spell-keywords";
import { isCreatureKwShadowedBySpell } from "@/lib/game/abilities";
import KeywordIcon from "@/components/shared/KeywordIcon";
import { useKeywordIconStore } from "@/lib/store/keywordIconStore";
import { KEYWORDS as keywordDefs } from "@/lib/card-engine/constants";

interface HandCardProps {
  cardInstance: CardInstance;
  canPlay: boolean;
  isSelected?: boolean;
  onClick?: () => void;
}

export default function HandCard({
  cardInstance,
  canPlay,
  isSelected = false,
  onClick,
}: HandCardProps) {
  const card = cardInstance.card;
  const gameState = useGameStore(s => s.gameState);
  const tokenTemplates = useGameStore(s => s.tokenTemplates);

  // Compute effective mana cost (accounting for Canalisation)
  let effectiveManaCost = card.mana_cost;
  if (card.card_type === "spell" && gameState) {
    const player = gameState.players[gameState.currentPlayerIndex];
    const canalisationCount = player.board.filter(c => c.card.keywords.includes("canalisation" as import("@/lib/game/types").Keyword)).length;
    effectiveManaCost = Math.max(0, effectiveManaCost - canalisationCount);
  }
  const isCostReduced = effectiveManaCost < card.mana_cost;
  const tokenTemplate = card.id === -1 && !card.image_url
    ? (card.token_id
        ? tokenTemplates.find(t => t.id === card.token_id)
        : (card.race ? tokenTemplates.find(t => t.race === card.race) : null))
    : null;
  const resolvedImageUrl = card.image_url ?? tokenTemplate?.image_url ?? null;
  const isCreature = card.card_type === "creature";
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const detailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleDragStart(e: DragEvent<HTMLDivElement>) {
    if (!canPlay) {
      e.preventDefault();
      return;
    }
    setIsDragging(true);
    setIsHovered(false);
    e.dataTransfer.setData("cardInstanceId", cardInstance.instanceId);
    e.dataTransfer.setData("cardType", card.card_type);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragEnd() {
    setIsDragging(false);
  }

  const isZoomed = !isDragging && isHovered && !isSelected;
  const showOverlay = isZoomed && showDetails;
  const W = 120;
  const H = 168;
  const accentColor = isCreature ? "#74b9ff" : "#ce93d8";
  const borderColor = isSelected ? "#c8a84e" : isCreature ? "#3d3d5c" : "#6c3483";
  const iconOverrides = useKeywordIconStore((st) => st.overrides);

  return (
    <motion.div
      initial={{ y: 60, opacity: 0, scale: 0.7 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      data-instance-id={cardInstance.instanceId}
      style={{ width: W, height: H, position: "relative", zoom: 1.225 }}
    >
      <div
        ref={cardRef}
        draggable={canPlay}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onMouseEnter={() => {
          setIsHovered(true);
          detailTimer.current = setTimeout(() => setShowDetails(true), 600);
        }}
        onMouseLeave={() => {
          setIsHovered(false);
          setShowDetails(false);
          if (detailTimer.current) clearTimeout(detailTimer.current);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setShowDetails(prev => !prev);
          if (detailTimer.current) clearTimeout(detailTimer.current);
        }}
        onClick={canPlay ? onClick : undefined}
        style={{
          width: W, height: H, borderRadius: 8,
          position: isZoomed ? "absolute" : "relative",
          bottom: isZoomed ? 0 : undefined,
          left: isZoomed ? "50%" : undefined,
          transformOrigin: "bottom center",
          background: isCreature
            ? "linear-gradient(160deg, #1a1a2e, #0d0d1a)"
            : "linear-gradient(160deg, #1a0a2a, #0d0d1a)",
          border: `2px solid ${borderColor}`,
          boxShadow: isSelected ? "0 0 12px #c8a84e44" : "none",
          overflow: "hidden",
          cursor: isDragging ? "grabbing" : canPlay ? "grab" : "not-allowed",
          opacity: isDragging ? 0.5 : canPlay ? 1 : 0.75,
          transition: "border-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease",
          transform: isZoomed ? "translateX(-50%)" : "none",
          zoom: isZoomed ? 1.3 : 1,
          zIndex: isZoomed ? 50 : 1,
        }}
      >
        {/* Full-bleed art */}
        <div style={{ position: "absolute", inset: 0 }}>
          {resolvedImageUrl ? (
            <Image
              src={resolvedImageUrl}
              alt={card.name}
              fill
              className="object-cover"
              sizes="(min-resolution: 2dppx) 600px, 300px"
              quality={90}
            />
          ) : (
            <div style={{
              width: "100%", height: "100%",
              background: isCreature
                ? "linear-gradient(135deg, #1a1a2e, #2a2a4599, #1a1a2e)"
                : "linear-gradient(135deg, #1a0a2a, #6c348333, #1a0a2a)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 36, opacity: 0.5 }}>{isCreature ? "⚔️" : "✨"}</span>
            </div>
          )}
        </div>


        {/* Mana orb */}
        <div style={{
          position: "absolute", top: 4, left: 4, zIndex: 2,
          width: 22, height: 22, borderRadius: "50%",
          background: isCostReduced ? "radial-gradient(circle, #1a6a3a, #0d3c1f)" : "radial-gradient(circle, #1a3a6a, #0d1f3c)",
          outline: `2px solid ${isCostReduced ? "#2ecc71" : "#74b9ff"}`,
          fontSize: 13, color: isCostReduced ? "#2ecc71" : "#74b9ff", fontWeight: 700,
          lineHeight: "22px", textAlign: "center",
          boxShadow: isCostReduced ? "0 0 6px #2ecc7155" : "0 0 6px #74b9ff55",
        }}>{effectiveManaCost}</div>

        {/* Bottom bar */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2,
          padding: "5px 6px 4px",
          background: "linear-gradient(0deg, #0d0d1add 0%, #0d0d1a88 40%, transparent 65%)",
          display: "flex", flexDirection: "column", gap: 3,
        }}>
          {/* Name */}
          <div style={{
            fontSize: 10, color: "#e0e0e0", fontWeight: 700,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontFamily: "'Cinzel', serif",
          }}>{card.name}</div>

          {/* Keywords + Stats — single row */}
          <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
            {card.keywords.length > 0 && (() => {
              const xVals = parseXValuesFromEffectText(card.effect_text);
              return card.keywords
                .filter((kw) => !isCreatureKwShadowedBySpell(kw, card.spell_keywords))
                .map((kw) => {
                const x = xVals[kw];
                const hasImg = !!iconOverrides[kw];
                return (
                <div key={kw} style={{
                  minWidth: 28, height: 28, borderRadius: 3,
                  padding: x != null ? "0 2px" : 0,
                  background: hasImg ? "transparent" : `${accentColor}33`,
                  border: hasImg ? "none" : `1px solid ${accentColor}66`,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 1,
                  fontSize: 8, overflow: "hidden",
                }}>
                  {hasImg ? (
                    <div style={{ width: 28, height: 28, flexShrink: 0 }}>
                      <KeywordIcon symbol={KEYWORD_SYMBOLS[kw] || "✦"} size={16} keyword={kw} fill />
                    </div>
                  ) : (
                    <KeywordIcon symbol={KEYWORD_SYMBOLS[kw] || "✦"} size={16} keyword={kw} />
                  )}
                  {x != null && <span style={{ fontSize: 8, fontWeight: 900, color: "#fff", fontFamily: "'Cinzel',serif", textShadow: `0 0 3px ${accentColor}` }}>{toRoman(x)}</span>}
                </div>
                );
              });
            })()}

            {card.spell_keywords && card.spell_keywords.length > 0 && card.spell_keywords.map((spellKw, i) => {
              const def = SPELL_KEYWORDS[spellKw.id];
              const displayTitle = getSpellKeywordLabel(spellKw);
              const usesAtkHp = def.params.includes("attack") && def.params.includes("health");
              const usesAmount = def.params.includes("amount");
              const hasValue = usesAmount || usesAtkHp;
              const useStatBuffFormat = usesAtkHp && def.label.includes("+X");
              const valueText = usesAtkHp
                ? useStatBuffFormat
                  ? `+${spellKw.attack ?? 0}/+${spellKw.health ?? 0}`
                  : `${spellKw.attack ?? 0}/${spellKw.health ?? 0}`
                : usesAmount ? toRoman(spellKw.amount ?? 1) : null;
              const spellKey = `spell_${spellKw.id}`;
              const hasImg = !!iconOverrides[spellKey];
              return (
              <div key={`sk_${i}`} title={displayTitle} style={{
                minWidth: 28, height: 28, borderRadius: 3,
                padding: hasValue ? "0 2px" : 0,
                background: hasImg ? "transparent" : `${accentColor}33`,
                border: hasImg ? "none" : `1px solid ${accentColor}66`,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 0,
                fontSize: 8, overflow: "hidden",
              }}>
                {hasImg ? (
                  <div style={{ width: 28, height: 28, flexShrink: 0 }}>
                    <KeywordIcon symbol={SPELL_KEYWORD_SYMBOLS[spellKw.id] || "✦"} size={16} keyword={spellKey} fill />
                  </div>
                ) : (
                  <KeywordIcon symbol={SPELL_KEYWORD_SYMBOLS[spellKw.id] || "✦"} size={16} keyword={spellKey} />
                )}
                {valueText && <span style={{
                  fontSize: 8, fontWeight: 900, color: "#fff",
                  fontFamily: "'Cinzel',serif", textShadow: `0 0 3px ${accentColor}`,
                  marginLeft: -6,
                }}>{valueText}</span>}
              </div>
              );
            })}

            {isCreature && (
              <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                <div style={{
                  display: "flex", alignItems: "center",
                  padding: "1px 5px", borderRadius: 4,
                  background: "#e74c3c18", border: "1px solid #e74c3c55",
                }}>
                  <span style={{ fontSize: 13, color: "#e74c3c", fontWeight: 700 }}>{card.attack}</span>
                </div>
                <div style={{
                  display: "flex", alignItems: "center",
                  padding: "1px 5px", borderRadius: 4,
                  background: "#f1c40f18", border: "1px solid #f1c40f55",
                }}>
                  <span style={{ fontSize: 13, color: "#f1c40f", fontWeight: 700 }}>{card.health}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Hover overlay */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 3,
          background: "#0d0d1ab3",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          opacity: showOverlay ? 1 : 0,
          transition: "opacity 0.25s ease",
          pointerEvents: showOverlay ? "auto" : "none",
          display: "flex", flexDirection: "column", justifyContent: "flex-start",
          padding: "10px 7px",
          gap: 5,
          overflowY: "auto",
        }}>
          {/* Name */}
          <div style={{
            fontSize: 9, color: accentColor, fontWeight: 700,
            textAlign: "center", fontFamily: "'Cinzel', serif",
            borderBottom: `1px solid ${accentColor}44`, paddingBottom: 4,
          }}>{card.name}</div>

          {/* Race / Clan */}
          {(card.race || card.clan) && (
            <div style={{ display: "flex", justifyContent: "center", gap: 4, fontSize: 6, color: "#888", fontFamily: "'Crimson Text',serif" }}>
              {card.race && <span>{card.race}</span>}
              {card.race && card.clan && <span style={{ color: "#555" }}>·</span>}
              {card.clan && <span style={{ fontStyle: "italic" }}>{card.clan}</span>}
            </div>
          )}

          {/* Year */}
          {card.card_year && (
            <div style={{ textAlign: "center", fontSize: 6, color: "#888", fontFamily: "'Crimson Text',serif" }}>
              📅 {card.card_year}
            </div>
          )}

          {/* Capacités detail */}
          {card.keywords.length > 0 && (() => {
            const xVals = parseXValuesFromEffectText(card.effect_text);
            const visibleKws = card.keywords.filter((kw) => !isCreatureKwShadowedBySpell(kw, card.spell_keywords));
            if (visibleKws.length === 0) return null;
            return (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {visibleKws.map((kw) => {
                const x = xVals[kw];
                const label = KEYWORD_LABELS[kw] || kw;
                const displayLabel = x != null ? label.replace(/ X$/, ` ${toRoman(x)}`) : label;
                const forgeKey = KEYWORD_LABELS[kw];
                const kwDef = forgeKey ? keywordDefs[forgeKey] : null;
                const desc = kwDef?.desc ? (x != null ? kwDef.desc.replace(/X/g, String(x)) : kwDef.desc) : null;
                return (
                <div key={kw} style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                  <span style={{ flexShrink: 0 }}><KeywordIcon symbol={KEYWORD_SYMBOLS[kw] || "✦"} size={9} keyword={kw} /></span>
                  <div>
                    <div style={{ fontSize: 7, color: accentColor, fontWeight: 600 }}>{displayLabel}</div>
                    {desc && <div style={{ fontSize: 6, color: "#999", lineHeight: 1.3, fontFamily: "'Crimson Text',serif" }}>{desc}</div>}
                  </div>
                </div>
                );
              })}
            </div>
            );
          })()}

          {/* Spell keyword details */}
          {card.spell_keywords && card.spell_keywords.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {card.spell_keywords.map((spellKw, i) => {
                const label = getSpellKeywordLabel(spellKw);
                const desc = getSpellKeywordDesc(spellKw, card, tokenTemplates);
                return (
                <div key={`sk_${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                  <span style={{ flexShrink: 0 }}><KeywordIcon symbol={SPELL_KEYWORD_SYMBOLS[spellKw.id] || "✦"} size={9} keyword={`spell_${spellKw.id}`} /></span>
                  <div>
                    <div style={{ fontSize: 7, color: accentColor, fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 6, color: "#999", lineHeight: 1.3, fontFamily: "'Crimson Text',serif" }}>{desc}</div>
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* Effect text */}
          {cleanEffectText(card.effect_text, card.spell_keywords) && (
          <div style={{
            padding: 4,
            background: `${accentColor}11`, borderRadius: 3,
            border: `1px solid ${accentColor}22`,
          }}>
            <p style={{
              margin: 0, fontSize: 7, color: "#ccc",
              lineHeight: 1.4, fontFamily: "'Crimson Text', serif",
            }}>{cleanEffectText(card.effect_text, card.spell_keywords)}</p>
          </div>
          )}

          {card.flavor_text && (
            <p style={{
              margin: 0, fontSize: 6, color: "#74b9ff77",
              fontStyle: "italic", lineHeight: 1.3, fontFamily: "'Crimson Text', serif",
              textAlign: "center",
            }}>&ldquo;{card.flavor_text}&rdquo;</p>
          )}

          {/* Stats recap */}
          <div style={{
            display: "flex", justifyContent: "center", gap: 6,
            fontSize: 7, color: "#555",
          }}>
            <span style={isCostReduced ? { color: "#2ecc71" } : undefined}>💧 {effectiveManaCost}</span>
            {isCreature && <><span style={{ color: "#e74c3c" }}>⚔ {card.attack}</span><span style={{ color: "#f1c40f" }}>❤ {card.health}</span></>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
