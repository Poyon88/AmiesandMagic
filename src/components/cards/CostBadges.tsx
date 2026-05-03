"use client";

import type { Card } from "@/lib/game/types";

interface Props {
  card: Card;
  // Pixel scale — most call sites use 22 (HandCard) or 27*scale (GameCard).
  size?: number;
  // When set, overrides card.mana_cost (used by HandCard to show post-Canalisation
  // /Entraide reduced cost). The blue-vs-green colour is driven by isCostReduced.
  effectiveManaCost?: number;
  isCostReduced?: boolean;
}

// Centralised cost row rendered absolute-positioned in the top-left of a card.
// Replaces the standalone mana orb in GameCard / HandCard / CardPreview. Hides
// any badge whose value is 0 — a card with mana_cost 0 and life_cost 1 will
// only show the heart pip.
export default function CostBadges({ card, size = 22, effectiveManaCost, isCostReduced }: Props) {
  const manaCost = effectiveManaCost ?? card.mana_cost;
  const lifeCost = card.life_cost ?? 0;
  const discardCost = card.discard_cost ?? 0;
  const sacrificeCost = card.sacrifice_cost ?? 0;

  const showMana = manaCost > 0;
  const showLife = lifeCost > 0;
  const showDiscard = discardCost > 0;
  const showSacrifice = sacrificeCost > 0;

  // Edge case: a card declares no costs at all (rare — e.g. "0-cost token").
  // Still render the mana 0 pip so the slot doesn't look empty.
  const renderEmpty = !showMana && !showLife && !showDiscard && !showSacrifice;

  const fontSize = Math.round(size * 0.6);
  const glyphSize = Math.round(size * 0.5);

  return (
    <div style={{
      position: "absolute", top: size * 0.18, left: size * 0.18, zIndex: 2,
      display: "flex", flexDirection: "row", gap: size * 0.18, alignItems: "center",
    }}>
      {(showMana || renderEmpty) && (
        <div title={`Coût en mana : ${manaCost}`} style={{
          width: size, height: size, borderRadius: "50%",
          background: isCostReduced ? "radial-gradient(circle, #1a6a3a, #0d3c1f)" : "radial-gradient(circle, #1a3a6a, #0d1f3c)",
          outline: `2px solid ${isCostReduced ? "#2ecc71" : "#74b9ff"}`,
          fontSize, color: isCostReduced ? "#2ecc71" : "#74b9ff", fontWeight: 700,
          lineHeight: `${size}px`, textAlign: "center",
          boxShadow: isCostReduced ? "0 0 6px #2ecc7155" : "0 0 6px #74b9ff55",
        }}>{manaCost}</div>
      )}
      {showLife && (
        <div title={`Coût en points de vie : ${lifeCost}`} style={{
          width: size, height: size, borderRadius: "50%",
          background: "radial-gradient(circle, #6a1a1a, #3c0d0d)",
          outline: `2px solid #e74c3c`,
          fontSize, color: "#ffb3b3", fontWeight: 700,
          lineHeight: `${size}px`, textAlign: "center",
          boxShadow: "0 0 6px #e74c3c66",
          position: "relative",
        }}>
          <span style={{
            position: "absolute", top: -size * 0.05, right: -size * 0.05,
            fontSize: glyphSize, lineHeight: 1,
            filter: "drop-shadow(0 0 2px #000)",
          }}>♥</span>
          {lifeCost}
        </div>
      )}
      {showDiscard && (
        <div title={`Défaussez ${discardCost} carte${discardCost > 1 ? "s" : ""}`} style={{
          width: size * 0.85, height: size, borderRadius: size * 0.18,
          background: "radial-gradient(circle, #3a3a4a, #1f1f2c)",
          outline: `2px solid #bbbbbb`,
          fontSize, color: "#e0e0e0", fontWeight: 700,
          lineHeight: `${size}px`, textAlign: "center",
          boxShadow: "0 0 6px #00000088",
          position: "relative",
        }}>
          <span style={{
            position: "absolute", top: -size * 0.05, right: -size * 0.1,
            fontSize: glyphSize, lineHeight: 1,
            filter: "drop-shadow(0 0 2px #000)",
          }}>🃏</span>
          {discardCost}
        </div>
      )}
      {showSacrifice && (
        <div title={`Sacrifiez ${sacrificeCost} créature${sacrificeCost > 1 ? "s" : ""}`} style={{
          width: size, height: size, borderRadius: "50%",
          background: "radial-gradient(circle, #3a1a3a, #1f0d1f)",
          outline: `2px solid #a060a0`,
          fontSize, color: "#e0c0e0", fontWeight: 700,
          lineHeight: `${size}px`, textAlign: "center",
          boxShadow: "0 0 6px #a060a066",
          position: "relative",
        }}>
          <span style={{
            position: "absolute", top: -size * 0.05, right: -size * 0.1,
            fontSize: glyphSize, lineHeight: 1,
            filter: "drop-shadow(0 0 2px #000)",
          }}>☠</span>
          {sacrificeCost}
        </div>
      )}
    </div>
  );
}
