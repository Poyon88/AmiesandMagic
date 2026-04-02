"use client";

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import type { CardInstance } from "@/lib/game/types";
import { useGameStore } from "@/lib/store/gameStore";
import { KEYWORD_SYMBOLS, KEYWORD_LABELS, toRoman, parseXValuesFromEffectText, cleanEffectText } from "@/lib/game/keyword-labels";
import KeywordIcon from "@/components/shared/KeywordIcon";
import { KEYWORDS as keywordDefs } from "@/lib/card-engine/constants";

interface BoardCreatureProps {
  creature: CardInstance;
  isOwn: boolean;
  canAttack?: boolean;
  isSelected?: boolean;
  isValidTarget?: boolean;
  damageAmount?: number | null;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export default function BoardCreature({
  creature,
  isOwn,
  canAttack = false,
  isSelected = false,
  isValidTarget = false,
  damageAmount = null,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: BoardCreatureProps) {
  const card = creature.card;
  const tokenTemplates = useGameStore(s => s.tokenTemplates);
  // Resolve token template image: tokens have id === -1 and no image
  const tokenTemplate = (card.id === -1 && !card.image_url && card.race)
    ? tokenTemplates.find(t => t.race === card.race)
    : null;
  const resolvedImageUrl = card.image_url ?? tokenTemplate?.image_url ?? null;
  const isDamaged = creature.currentHealth < creature.maxHealth;
  const isBuffedAtk = creature.currentAttack > (card.attack ?? 0);
  const isBuffedHp = creature.currentHealth > (card.health ?? 0);
  const [isHovered, setIsHovered] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const creatureRef = useRef<HTMLDivElement>(null);
  const detailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isZoomed = isHovered && !isSelected;
  const showOverlay = isZoomed && showDetails;
  const W = 128;
  const H = 176;
  const accentColor = "#74b9ff";

  // Border color based on state
  let border = "2px solid #3d3d5c";
  if (isSelected) border = "2px solid #f1c40f";
  else if (isValidTarget) border = "2px solid #e74c3c";
  else if (canAttack) border = "2px solid #2ecc71";

  return (
    <motion.div
      layout
      ref={creatureRef}
      data-instance-id={creature.instanceId}
      onClick={onClick}
      onMouseEnter={() => {
        setIsHovered(true);
        onMouseEnter?.();
        detailTimer.current = setTimeout(() => setShowDetails(true), 600);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowDetails(false);
        if (detailTimer.current) clearTimeout(detailTimer.current);
        onMouseLeave?.();
      }}
      onContextMenu={(e: React.MouseEvent) => {
        e.preventDefault();
        setShowDetails(prev => !prev);
        if (detailTimer.current) clearTimeout(detailTimer.current);
      }}
      initial={{ y: isOwn ? 40 : -40, opacity: 0, scale: 0.5 }}
      animate={
        damageAmount
          ? { x: [0, -4, 4, -4, 4, 0], y: 0, opacity: 1, scale: isHovered && !isSelected ? 1.8 : 1 }
          : { x: 0, y: 0, opacity: 1, scale: isHovered && !isSelected ? 1.8 : 1 }
      }
      exit={creature.isPoisoned
        ? { opacity: 0, scale: 0.3, rotate: -10, filter: "brightness(0.5) saturate(2) hue-rotate(80deg)", transition: { duration: 0.7, ease: "easeIn" } }
        : { opacity: 0, scale: 0, rotate: -15, filter: "brightness(2) saturate(0)", transition: { duration: 0.5, ease: "easeIn" } }
      }
      transition={{ duration: 0.5, ease: "easeOut" }}
      style={{
        width: W, height: H, borderRadius: 10, position: "relative",
        background: "linear-gradient(160deg, #1a1a2e, #0d0d1a)",
        border,
        boxShadow: isSelected ? "0 0 14px #f1c40f44" : isValidTarget ? "0 0 14px #e74c3c44" : "none",
        overflow: "hidden",
        cursor: "pointer",
        transition: "border-color 0.2s, box-shadow 0.2s",
        zIndex: isHovered ? 20 : isSelected ? 10 : 1,
      }}
      title={`${card.name} (${creature.currentAttack}/${creature.currentHealth})`}
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
            background: "linear-gradient(135deg, #1a1a2e, #2a2a4599, #1a1a2e)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 40, opacity: 0.5 }}>⚔️</span>
          </div>
        )}
      </div>


      {/* Summoning sickness overlay */}
      {creature.hasSummoningSickness && isOwn && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 1,
          background: "rgba(0,0,0,0.3)",
          pointerEvents: "none",
        }} />
      )}

      {/* Poison overlay */}
      {creature.isPoisoned && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 1,
          background: "rgba(34, 197, 94, 0.15)",
          pointerEvents: "none",
          animation: "poison-pulse 2s ease-in-out infinite",
        }} />
      )}

      {/* Poison indicator */}
      {creature.isPoisoned && (
        <div style={{
          position: "absolute", top: 4, left: 4, zIndex: 3,
          width: 18, height: 18, borderRadius: "50%",
          background: "#22c55e33", border: "1px solid #22c55e88",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10,
        }}>☠️</div>
      )}

      {/* Divine Shield indicator */}
      {creature.hasDivineShield && (
        <div style={{
          position: "absolute", top: 4, right: 4, zIndex: 3,
          width: 18, height: 18, borderRadius: "50%",
          background: "#f1c40f33", border: "1px solid #f1c40f88",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10,
        }}>🔰</div>
      )}

      {/* Taunt ring */}
      {card.keywords.includes("taunt") && (
        <div style={{
          position: "absolute", inset: -1, borderRadius: 11,
          border: "2px solid #3498db88",
          pointerEvents: "none", zIndex: 1,
        }} />
      )}

      {/* Valid target pulse ring */}
      {isValidTarget && (
        <div style={{
          position: "absolute", inset: -2, borderRadius: 12,
          border: "2px solid #e74c3c",
          animation: "pulse-ring 1.5s ease-in-out infinite",
          pointerEvents: "none", zIndex: 1,
        }} />
      )}

      {/* Bottom bar */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2,
        padding: "6px 6px 5px",
        background: "linear-gradient(0deg, #0d0d1add 0%, #0d0d1a88 40%, transparent 65%)",
        display: "flex", flexDirection: "column", gap: 3,
      }}>
        {/* Name */}
        <div style={{
          fontSize: 9, color: "#e0e0e0", fontWeight: 700,
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
                minWidth: 16, height: 16, borderRadius: 4,
                padding: x != null ? "0 3px" : 0,
                background: `${accentColor}33`, border: `1px solid ${accentColor}66`,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 2,
                fontSize: 9,
              }}>
                <KeywordIcon symbol={KEYWORD_SYMBOLS[kw] || "✦"} size={9} />
                {x != null && <span style={{ fontSize: 7, fontWeight: 900, color: "#fff", fontFamily: "'Cinzel',serif", textShadow: `0 0 3px ${accentColor}` }}>{toRoman(x)}</span>}
              </div>
              );
            })}
          </div>
          );
        })()}

        {/* Stats */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{
            padding: "1px 5px", borderRadius: 4,
            background: isBuffedAtk ? "#2ecc7133" : "#f1c40f18",
            border: `1px solid ${isBuffedAtk ? "#2ecc7188" : "#f1c40f55"}`,
          }}>
            <span style={{ fontSize: 13, color: isBuffedAtk ? "#2ecc71" : "#f1c40f", fontWeight: 700 }}>
              {creature.currentAttack}
            </span>
          </div>
          <div style={{
            padding: "1px 5px", borderRadius: 4,
            background: isDamaged ? "#e74c3c33" : isBuffedHp ? "#2ecc7133" : "#e74c3c18",
            border: `1px solid ${isDamaged ? "#e74c3c88" : isBuffedHp ? "#2ecc7188" : "#e74c3c55"}`,
          }}>
            <span style={{ fontSize: 13, color: isDamaged ? "#e74c3c" : isBuffedHp ? "#2ecc71" : "#e74c3c", fontWeight: 700 }}>
              {creature.currentHealth}
            </span>
          </div>
        </div>
      </div>

      {/* Hover overlay */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 4,
        background: "#0d0d1aee",
        opacity: showOverlay ? 1 : 0,
        transition: "opacity 0.25s ease",
        pointerEvents: showOverlay ? "auto" : "none",
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "12px 8px",
        gap: 6,
      }}>
        {/* Name */}
        <div style={{
          fontSize: 10, color: accentColor, fontWeight: 700,
          textAlign: "center", fontFamily: "'Cinzel', serif",
          borderBottom: `1px solid ${accentColor}44`, paddingBottom: 5,
        }}>{card.name}</div>

        {/* Race / Clan */}
        {(card.race || card.clan) && (
          <div style={{ display: "flex", justifyContent: "center", gap: 4, fontSize: 7, color: "#888", fontFamily: "'Crimson Text',serif" }}>
            {card.race && <span>{card.race}</span>}
            {card.race && card.clan && <span style={{ color: "#555" }}>·</span>}
            {card.clan && <span style={{ fontStyle: "italic" }}>{card.clan}</span>}
          </div>
        )}

        {/* Capacités detail */}
        {card.keywords.length > 0 && (() => {
          const xVals = parseXValuesFromEffectText(card.effect_text);
          return (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {card.keywords.map((kw) => {
              const x = xVals[kw];
              const label = KEYWORD_LABELS[kw] || kw;
              const displayLabel = x != null ? label.replace(/ X$/, ` ${toRoman(x)}`) : label;
              const forgeKey = KEYWORD_LABELS[kw];
              const kwDef = forgeKey ? keywordDefs[forgeKey] : null;
              const desc = kwDef?.desc ? (x != null ? kwDef.desc.replace(/X/g, String(x)) : kwDef.desc) : null;
              return (
              <div key={kw} style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                <span style={{ flexShrink: 0 }}><KeywordIcon symbol={KEYWORD_SYMBOLS[kw] || "✦"} size={10} /></span>
                <div>
                  <div style={{ fontSize: 8, color: accentColor, fontWeight: 600 }}>{displayLabel}</div>
                  {desc && <div style={{ fontSize: 7, color: "#999", lineHeight: 1.3, fontFamily: "'Crimson Text',serif" }}>{desc}</div>}
                </div>
              </div>
              );
            })}
          </div>
          );
        })()}

        {/* Effect text */}
        {card.effect_text && (
          <div style={{
            padding: 5,
            background: `${accentColor}11`, borderRadius: 4,
            border: `1px solid ${accentColor}22`,
          }}>
            <p style={{
              margin: 0, fontSize: 8, color: "#ccc",
              lineHeight: 1.4, fontFamily: "'Crimson Text', serif",
            }}>{cleanEffectText(card.effect_text, card.spell_keywords)}</p>
          </div>
        )}

        {card.flavor_text && (
          <p style={{
            margin: 0, fontSize: 7, color: "#74b9ff77",
            fontStyle: "italic", lineHeight: 1.3, fontFamily: "'Crimson Text', serif",
            textAlign: "center",
          }}>&ldquo;{card.flavor_text}&rdquo;</p>
        )}

        {/* Stats recap */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 8,
          fontSize: 8, color: "#555",
        }}>
          <span style={{ color: isBuffedAtk ? "#2ecc71" : "#f1c40f" }}>⚔ {creature.currentAttack}</span>
          <span style={{ color: isDamaged ? "#e74c3c" : isBuffedHp ? "#2ecc71" : "#e74c3c" }}>❤ {creature.currentHealth}/{creature.maxHealth}</span>
        </div>
      </div>
    </motion.div>
  );
}
