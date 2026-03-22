"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import type { CardInstance } from "@/lib/game/types";
import { KEYWORD_SYMBOLS, KEYWORD_LABELS } from "@/lib/game/keyword-labels";

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
  const isDamaged = creature.currentHealth < creature.maxHealth;
  const isBuffedAtk = creature.currentAttack > (card.attack ?? 0);
  const isBuffedHp = creature.currentHealth > (card.health ?? 0);
  const [isHovered, setIsHovered] = useState(false);
  const creatureRef = useRef<HTMLDivElement>(null);

  const showOverlay = isHovered && !isSelected;
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
      onMouseEnter={() => { setIsHovered(true); onMouseEnter?.(); }}
      onMouseLeave={() => { setIsHovered(false); onMouseLeave?.(); }}
      initial={{ y: isOwn ? 40 : -40, opacity: 0, scale: 0.5 }}
      animate={
        damageAmount
          ? { x: [0, -4, 4, -4, 4, 0], y: 0, opacity: 1, scale: 1 }
          : { x: 0, y: 0, opacity: 1, scale: 1 }
      }
      exit={{ opacity: 0, scale: 0, rotate: -15, filter: "brightness(2) saturate(0)", transition: { duration: 0.5, ease: "easeIn" } }}
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
        {card.image_url ? (
          <Image
            src={card.image_url}
            alt={card.name}
            fill
            className="object-cover"
            sizes={`${W}px`}
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

      {/* Vignette (légère) */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at center, transparent 60%, #0d0d1a66 100%)",
        pointerEvents: "none",
      }} />

      {/* Summoning sickness overlay */}
      {creature.hasSummoningSickness && isOwn && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 1,
          background: "rgba(0,0,0,0.3)",
          pointerEvents: "none",
        }} />
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
        background: "linear-gradient(0deg, #0d0d1aee 0%, #0d0d1acc 60%, transparent 100%)",
        display: "flex", flexDirection: "column", gap: 3,
      }}>
        {/* Name */}
        <div style={{
          fontSize: 9, color: "#e0e0e0", fontWeight: 700,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontFamily: "'Cinzel', serif",
        }}>{card.name}</div>

        {/* Keyword symbols */}
        {card.keywords.length > 0 && (
          <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {card.keywords.map((kw) => (
              <div key={kw} style={{
                width: 16, height: 16, borderRadius: 4,
                background: `${accentColor}33`, border: `1px solid ${accentColor}66`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9,
              }}>{KEYWORD_SYMBOLS[kw] || "✦"}</div>
            ))}
          </div>
        )}

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

        {/* Keywords detail */}
        {card.keywords.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {card.keywords.map((kw) => (
              <div key={kw} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 10 }}>{KEYWORD_SYMBOLS[kw] || "✦"}</span>
                <span style={{ fontSize: 8, color: accentColor, fontWeight: 600 }}>{KEYWORD_LABELS[kw] || kw}</span>
              </div>
            ))}
          </div>
        )}

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
            }}>{card.effect_text}</p>
          </div>
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
