"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import type { CardInstance } from "@/lib/game/types";
import type { DragEvent } from "react";
import { KEYWORD_SYMBOLS, KEYWORD_LABELS, toRoman, parseXValuesFromEffectText, cleanEffectText } from "@/lib/game/keyword-labels";
import KeywordIcon from "@/components/shared/KeywordIcon";
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
  const s = 0.55;
  const accentColor = isCreature ? "#74b9ff" : "#ce93d8";
  const borderColor = isSelected ? "#c8a84e" : isCreature ? "#3d3d5c" : "#6c3483";

  return (
    <motion.div
      initial={{ y: 60, opacity: 0, scale: 0.7 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <div
        ref={cardRef}
        data-instance-id={cardInstance.instanceId}
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
          width: W, height: H, borderRadius: 8, position: "relative",
          background: isCreature
            ? "linear-gradient(160deg, #1a1a2e, #0d0d1a)"
            : "linear-gradient(160deg, #1a0a2a, #0d0d1a)",
          border: `2px solid ${borderColor}`,
          boxShadow: isSelected ? "0 0 12px #c8a84e44" : "none",
          overflow: "hidden",
          cursor: isDragging ? "grabbing" : canPlay ? "grab" : "not-allowed",
          opacity: isDragging ? 0.5 : canPlay ? 1 : 0.5,
          transition: "all 0.2s ease",
          transform: isZoomed ? "translateY(-20px) scale(1.5)" : "none",
          zIndex: isZoomed ? 50 : 1,
        }}
      >
        {/* Full-bleed art */}
        <div style={{ position: "absolute", inset: 0 }}>
          {card.image_url ? (
            <Image
              src={card.image_url}
              alt={card.name}
              fill
              className="object-cover"
              sizes="300px"
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
          width: 20, height: 20, borderRadius: "50%",
          background: "radial-gradient(circle, #1a3a6a, #0d1f3c)",
          border: "2px solid #74b9ff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, color: "#74b9ff", fontWeight: 700,
          boxShadow: "0 0 6px #74b9ff55",
        }}>{card.mana_cost}</div>

        {/* Bottom bar */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2,
          padding: `${5 * s}px 5px 4px`,
          background: "linear-gradient(0deg, #0d0d1add 0%, #0d0d1a88 40%, transparent 65%)",
          display: "flex", flexDirection: "column", gap: 2,
        }}>
          {/* Name */}
          <div style={{
            fontSize: 8, color: "#e0e0e0", fontWeight: 700,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontFamily: "'Cinzel', serif",
          }}>{card.name}</div>

          {/* Keyword symbols */}
          {card.keywords.length > 0 && (() => {
            const xVals = parseXValuesFromEffectText(card.effect_text);
            return (
            <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              {card.keywords.map((kw) => {
                const x = xVals[kw];
                return (
                <div key={kw} style={{
                  minWidth: 14, height: 14, borderRadius: 3,
                  padding: x != null ? "0 2px" : 0,
                  background: `${accentColor}33`, border: `1px solid ${accentColor}66`,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 1,
                  fontSize: 8,
                }}>
                  <KeywordIcon symbol={KEYWORD_SYMBOLS[kw] || "✦"} size={8} />
                  {x != null && <span style={{ fontSize: 6, fontWeight: 900, color: "#fff", fontFamily: "'Cinzel',serif" }}>{toRoman(x)}</span>}
                </div>
                );
              })}
            </div>
            );
          })()}

          {/* Stats */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 6, color: "#ffffff44", textTransform: "uppercase" }}>{card.card_type}</span>
            {isCreature && (
              <div style={{ display: "flex", gap: 4 }}>
                <div style={{
                  padding: "1px 4px", borderRadius: 3,
                  background: "#f1c40f18", border: "1px solid #f1c40f55",
                }}>
                  <span style={{ fontSize: 10, color: "#f1c40f", fontWeight: 700 }}>{card.attack}</span>
                </div>
                <div style={{
                  padding: "1px 4px", borderRadius: 3,
                  background: "#e74c3c18", border: "1px solid #e74c3c55",
                }}>
                  <span style={{ fontSize: 10, color: "#e74c3c", fontWeight: 700 }}>{card.health}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Hover overlay */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 3,
          background: "#0d0d1aee",
          opacity: showOverlay ? 1 : 0,
          transition: "opacity 0.25s ease",
          pointerEvents: showOverlay ? "auto" : "none",
          display: "flex", flexDirection: "column", justifyContent: "center",
          padding: "10px 7px",
          gap: 5,
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

          {/* Capacités detail */}
          {card.keywords.length > 0 && (() => {
            const xVals = parseXValuesFromEffectText(card.effect_text);
            return (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {card.keywords.map((kw) => {
                const x = xVals[kw];
                const label = KEYWORD_LABELS[kw] || kw;
                const displayLabel = x != null ? label.replace(/ X$/, ` ${toRoman(x)}`) : label;
                const forgeKey = KEYWORD_LABELS[kw];
                const kwDef = forgeKey ? keywordDefs[forgeKey] : null;
                const desc = kwDef?.desc ? (x != null ? kwDef.desc.replace(/X/g, String(x)) : kwDef.desc) : null;
                return (
                <div key={kw} style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                  <span style={{ flexShrink: 0 }}><KeywordIcon symbol={KEYWORD_SYMBOLS[kw] || "✦"} size={9} /></span>
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

          {/* Effect text */}
          <div style={{
            padding: 4,
            background: `${accentColor}11`, borderRadius: 3,
            border: `1px solid ${accentColor}22`,
          }}>
            <p style={{
              margin: 0, fontSize: 7, color: "#ccc",
              lineHeight: 1.4, fontFamily: "'Crimson Text', serif",
            }}>{cleanEffectText(card.effect_text)}</p>
          </div>

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
            <span>💧 {card.mana_cost}</span>
            {isCreature && <><span style={{ color: "#f1c40f" }}>⚔ {card.attack}</span><span style={{ color: "#e74c3c" }}>❤ {card.health}</span></>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
