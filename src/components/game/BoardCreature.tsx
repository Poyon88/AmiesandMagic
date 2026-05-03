"use client";

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import type { CardInstance } from "@/lib/game/types";
import { useGameStore } from "@/lib/store/gameStore";
import { KEYWORD_SYMBOLS, KEYWORD_LABELS, toRoman, parseXValuesFromEffectText, cleanEffectText } from "@/lib/game/keyword-labels";
import KeywordIcon from "@/components/shared/KeywordIcon";
import { useKeywordIconStore } from "@/lib/store/keywordIconStore";
import { KEYWORDS as keywordDefs } from "@/lib/card-engine/constants";
import RarityFrame from "@/components/cards/RarityFrame";

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
  const targetingMode = useGameStore(s => s.targetingMode);
  const selectedSacrificeIds = useGameStore(s => s.selectedSacrificeIds);
  const toggleSacrificeSelection = useGameStore(s => s.toggleSacrificeSelection);

  const isCostPaymentMode = targetingMode === "cost_payment";
  const isSelectedForSacrifice = selectedSacrificeIds.includes(creature.instanceId);
  // Only the player's own board creatures can be sacrificed for a cost.
  const canSelectForSacrifice = isCostPaymentMode && isOwn;
  // Resolve token template image: instance cards spawned by the engine
  // carry token_id when they originate from a saved template; fall back to
  // race lookup for legacy spawns (spell-keyword "invocation", etc.).
  const tokenTemplate = card.id === -1 && !card.image_url
    ? (card.token_id
        ? tokenTemplates.find(t => t.id === card.token_id)
        : (card.race ? tokenTemplates.find(t => t.race === card.race) : null))
    : null;
  const resolvedImageUrl = card.image_url ?? tokenTemplate?.image_url ?? null;
  const isDamaged = creature.currentHealth < creature.maxHealth;
  const isBuffedAtk = creature.currentAttack > (card.attack ?? 0);
  const isBuffedHp = creature.currentHealth > (card.health ?? 0);
  const [isHovered, setIsHovered] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const creatureRef = useRef<HTMLDivElement>(null);
  const detailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isZoomed = isHovered && !isSelected && !isValidTarget && targetingMode === "none";
  // The overlay shows whenever `showDetails` is on AND the card is in its
  // free-hover zoomed state. The auto-trigger of `showDetails` is gated
  // separately in `onMouseEnter` (own creatures only, no targeting) — but
  // right-click flips `showDetails` manually for any creature, so it
  // remains the universal escape hatch to read enemy descriptions.
  const showOverlay = isZoomed && showDetails;
  // Match HandCard's base dimensions so a creature keeps the same visual
  // footprint when it transitions from the hand to the board (HandCard
  // uses W=120, H=168 with the same outer zoom 1.225).
  const W = 120;
  const H = 168;
  const accentColor = "#74b9ff";
  const iconOverrides = useKeywordIconStore((st) => st.overrides);

  let border = "2px solid #3d3d5c";
  if (isSelectedForSacrifice) border = "2px solid #a060a0";
  else if (isSelected) border = "2px solid #f1c40f";
  else if (isValidTarget) border = "2px solid #e74c3c";
  else if (canAttack) border = "2px solid #2ecc71";

  return (
    <motion.div
      layout
      data-instance-id={creature.instanceId}
      style={{ width: W, height: H, position: "relative", zIndex: isZoomed ? 100 : isSelected ? 10 : 1, zoom: 1.41 }}
      initial={{ y: isOwn ? 40 : -40, opacity: 0, scale: 0.5 }}
      animate={
        damageAmount
          ? { x: [0, -4, 4, -4, 4, 0], y: 0, opacity: 1, scale: 1 }
          : { x: 0, y: 0, opacity: 1, scale: 1 }
      }
      exit={creature.isPoisoned
        ? { opacity: 0, scale: 0.3, rotate: -10, filter: "brightness(0.5) saturate(2) hue-rotate(80deg)", transition: { duration: 1.0, ease: "easeIn" } }
        : { opacity: 0, scale: 0, rotate: -15, filter: "brightness(2) saturate(0)", transition: { duration: 1.0, ease: "easeIn" } }
      }
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
    <div
      ref={creatureRef}
      onClick={canSelectForSacrifice
        ? () => toggleSacrificeSelection(creature.instanceId)
        : onClick}
      onMouseEnter={() => {
        setIsHovered(true);
        onMouseEnter?.();
        // Auto-detail only kicks in when freely hovering own creatures.
        // Skip it during any targeting mode (attack OR spell) and on
        // enemy creatures, so the artwork stays visible while the player
        // is picking a target. Right-click still toggles details
        // manually.
        if (isOwn && targetingMode === "none") {
          detailTimer.current = setTimeout(() => setShowDetails(true), 600);
        }
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
      style={{
        width: W, height: H, borderRadius: 10,
        position: isZoomed ? "absolute" : "relative",
        left: isZoomed ? "50%" : undefined,
        bottom: isOwn && isZoomed ? 0 : undefined,
        top: !isOwn && isZoomed ? 0 : undefined,
        transformOrigin: isOwn ? "bottom center" : "top center",
        transform: isZoomed ? "translateX(-50%)" : "none",
        zoom: isZoomed ? 1.55 : 1,
        background: "linear-gradient(160deg, #1a1a2e, #0d0d1a)",
        border,
        boxShadow: isSelectedForSacrifice ? "0 0 16px #a060a088"
          : isSelected ? "0 0 14px #f1c40f44"
          : isValidTarget ? "0 0 14px #e74c3c44"
          : "none",
        // overflow: visible so the RarityFrame (inset: -4) can extend
        // past the card edges. The art div carries its own border-radius
        // + overflow: hidden to keep the image rounded.
        overflow: "visible",
        cursor: "pointer",
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
      title={`${card.name} (${creature.currentAttack}/${creature.currentHealth})`}
    >
      {/* Rarity frame — fades in only on hover-zoom for non-Commune
          creatures. Inset=6 (border 2 + 4px ring) and borderRadius=14
          keep the frame's rounded corners concentric with the card's
          (borderRadius 10 at the border-outer edge). Sits OUTSIDE the
          clip-wrapper below so it can extend past the card edge. */}
      <RarityFrame
        rarity={card.rarity}
        visible={isZoomed}
        inset={6}
        borderRadius={14}
      />

      {/* Inner clip-wrapper — replaces the inner card's overflow:hidden
          (which we lifted to allow the rarity frame to escape). All card
          content (art, badges, bars, overlays) lives inside and gets
          clipped to the card's rounded corners. borderRadius:8 matches
          the inner edge of the card's 2px border (10 outer − 2 = 8). */}
      <div style={{ position: "absolute", inset: 0, borderRadius: 8, overflow: "hidden" }}>

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

      {/* Cost-payment sacrifice marker */}
      {isSelectedForSacrifice && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 4,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(135deg, #a060a033, #00000022)",
          pointerEvents: "none",
        }}>
          <span style={{ fontSize: 60, color: "#e0c0e0", filter: "drop-shadow(0 0 6px #000)" }}>☠</span>
        </div>
      )}


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

      {/* Mana cost orb (top-left) — sized 1/2.5 of the hand-card orb (22px →
          9px) per the design spec. Mirrors the hand-card style (blue
          gradient, fontSize scaled accordingly) so the player can read
          the cost on the board too. */}
      <div style={{
        position: "absolute", top: 3, left: 3, zIndex: 3,
        width: 9, height: 9, borderRadius: "50%",
        background: "radial-gradient(circle, #1a3a6a, #0d1f3c)",
        outline: "1px solid #74b9ff",
        fontSize: 6, color: "#74b9ff", fontWeight: 700,
        lineHeight: "9px", textAlign: "center",
        boxShadow: "0 0 3px #74b9ff55",
      }}>{card.mana_cost}</div>

      {/* Poison indicator (shifted below the mana orb) */}
      {creature.isPoisoned && (
        <div style={{
          position: "absolute", top: 14, left: 4, zIndex: 3,
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

      {/* Paralyzed overlay */}
      {creature.isParalyzed && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 1,
          background: "rgba(139, 92, 246, 0.15)",
          pointerEvents: "none",
          animation: "paralyze-pulse 2s ease-in-out infinite",
        }} />
      )}

      {/* Paralyzed indicator (stacked below the mana orb, then below poison
          when poison is also active) */}
      {creature.isParalyzed && (
        <div style={{
          position: "absolute", top: creature.isPoisoned ? 36 : 14, left: 4, zIndex: 3,
          width: 18, height: 18, borderRadius: "50%",
          background: "#8b5cf633", border: "1px solid #8b5cf688",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10,
        }}>⛓️</div>
      )}

      {/* Contresort active indicator */}
      {creature.contresortActive && (
        <div style={{
          position: "absolute", top: creature.hasDivineShield ? 26 : 4, right: 4, zIndex: 3,
          width: 18, height: 18, borderRadius: "50%",
          background: "#3b82f633", border: "1px solid #3b82f688",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10,
        }}>🚫</div>
      )}

      {/* Ombre (stealth) indicator */}
      {card.keywords.includes("ombre" as import("@/lib/game/types").Keyword) && !creature.ombreRevealed && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 1,
          background: "rgba(30, 30, 60, 0.25)",
          pointerEvents: "none",
          animation: "ombre-pulse 3s ease-in-out infinite",
        }} />
      )}

      {/* Berserk active indicator */}
      {creature.berserkActive && (
        <div style={{
          position: "absolute", inset: -1, borderRadius: 11,
          border: "2px solid #ef444488",
          pointerEvents: "none", zIndex: 1,
          animation: "berserk-pulse 1s ease-in-out infinite",
        }} />
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
          fontSize: 10, color: "#e0e0e0", fontWeight: 700,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontFamily: "'Cinzel', serif",
        }}>{card.name}</div>

        {/* Keywords + Stats — single row */}
        <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
          {card.keywords.length > 0 && (() => {
            const xVals = { ...creature.grantedKeywordX, ...parseXValuesFromEffectText(card.effect_text) };
            return card.keywords.map((kw) => {
              const x = xVals[kw];
              const hasImg = !!iconOverrides[kw];
              return (
              <div key={kw} style={{
                minWidth: 24, height: 24, borderRadius: 3,
                padding: x != null ? "0 2px" : 0,
                background: hasImg ? "transparent" : `${accentColor}33`,
                border: hasImg ? "none" : `1px solid ${accentColor}66`,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 1,
                fontSize: 8, overflow: "hidden",
              }}>
                {hasImg ? (
                  <div style={{ width: 24, height: 24, flexShrink: 0 }}>
                    <KeywordIcon symbol={KEYWORD_SYMBOLS[kw] || "✦"} size={14} keyword={kw} fill />
                  </div>
                ) : (
                  <KeywordIcon symbol={KEYWORD_SYMBOLS[kw] || "✦"} size={14} keyword={kw} />
                )}
                {x != null && <span style={{ fontSize: 8, fontWeight: 900, color: "#fff", fontFamily: "'Cinzel',serif", textShadow: `0 0 3px ${accentColor}` }}>{toRoman(x)}</span>}
              </div>
              );
            });
          })()}

          <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
            <div style={{
              display: "flex", alignItems: "center",
              padding: "1px 5px", borderRadius: 4,
              background: isBuffedAtk ? "#2ecc7133" : "#e74c3c18",
              border: `1px solid ${isBuffedAtk ? "#2ecc7188" : "#e74c3c55"}`,
            }}>
              <span style={{ fontSize: 14, color: isBuffedAtk ? "#2ecc71" : "#e74c3c", fontWeight: 700 }}>
                {creature.currentAttack}
              </span>
            </div>
            <div style={{
              display: "flex", alignItems: "center",
              padding: "1px 5px", borderRadius: 4,
              background: isDamaged ? "#e74c3c33" : isBuffedHp ? "#2ecc7133" : "#f1c40f18",
              border: `1px solid ${isDamaged ? "#e74c3c88" : isBuffedHp ? "#2ecc7188" : "#f1c40f55"}`,
            }}>
              <span style={{ fontSize: 14, color: isDamaged ? "#e74c3c" : isBuffedHp ? "#2ecc71" : "#f1c40f", fontWeight: 700 }}>
                {creature.currentHealth}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Hover overlay — anchor content at the top so the title stays
          visible when the description is taller than the card. With
          `justifyContent: center` the content was being clipped at both
          ends (the card has overflow: hidden), hiding the title on
          long-text cards like spells with long flavor text. */}
      <div className="no-scrollbar" style={{
        position: "absolute", inset: 0, zIndex: 4,
        background: "#0d0d1ab3",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        opacity: showOverlay ? 1 : 0,
        transition: "opacity 0.25s ease",
        pointerEvents: showOverlay ? "auto" : "none",
        display: "flex", flexDirection: "column", justifyContent: "flex-start",
        padding: "12px 8px",
        gap: 6,
        overflowY: "auto",
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

        {/* Year */}
        {card.card_year && (
          <div style={{ textAlign: "center", fontSize: 7, color: "#888", fontFamily: "'Crimson Text',serif" }}>
            📅 {card.card_year}
          </div>
        )}

        {/* Statuts actifs — runtime flags that aren't on the card itself.
            Only renders when at least one is active so it doesn't take up
            vertical space on plain creatures. Mirrors the corner pips
            (poison ☠️, paralysie ⛓️, bouclier 🔰, contresort 🚫, mal
            d'invocation 💤, fureur 💢, berserk 😤, ombre 🌑) so the
            right-click view is the single source of truth for what's
            currently affecting the creature. */}
        {(() => {
          const statuses: { emoji: string; label: string; color: string }[] = [];
          if (creature.isPoisoned) statuses.push({ emoji: "☠️", label: "Empoisonné", color: "#22c55e" });
          if (creature.isParalyzed) statuses.push({ emoji: "⛓️", label: "Paralysé", color: "#8b5cf6" });
          if (creature.hasDivineShield) statuses.push({ emoji: "🔰", label: "Bouclier divin", color: "#f1c40f" });
          if (creature.contresortActive) statuses.push({ emoji: "🚫", label: "Contresort prêt", color: "#3b82f6" });
          if (creature.hasSummoningSickness && isOwn) statuses.push({ emoji: "💤", label: "Mal d'invocation", color: "#94a3b8" });
          if (creature.fureurActive) statuses.push({ emoji: "💢", label: "Fureur", color: "#f97316" });
          if (creature.berserkActive) statuses.push({ emoji: "😤", label: "Berserk", color: "#dc2626" });
          if (card.keywords.includes("ombre" as import("@/lib/game/types").Keyword) && !creature.ombreRevealed) {
            statuses.push({ emoji: "🌑", label: "Ombre (furtif)", color: "#6b7280" });
          }
          if (statuses.length === 0) return null;
          return (
            <div style={{
              display: "flex", flexDirection: "column", gap: 2,
              padding: "4px 5px",
              background: "#0d0d1aaa", borderRadius: 4,
              border: "1px solid #ffffff14",
            }}>
              <div style={{ fontSize: 7, color: "#888", fontFamily: "'Cinzel',serif", letterSpacing: 0.5, textAlign: "center", marginBottom: 1 }}>
                STATUTS
              </div>
              {statuses.map(s => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 8, color: s.color, fontFamily: "'Crimson Text',serif" }}>
                  <span style={{ fontSize: 9 }}>{s.emoji}</span>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Capacités detail */}
        {card.keywords.length > 0 && (() => {
          const xVals = { ...creature.grantedKeywordX, ...parseXValuesFromEffectText(card.effect_text) };
          return (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {card.keywords.map((kw) => {
              const x = xVals[kw];
              const label = KEYWORD_LABELS[kw] || kw;
              const displayLabel = x != null
                ? label.replace(/ X$/, ` ${toRoman(x)}`)
                : kw === "entraide" && card.entraide_race
                  ? `${label} (${card.entraide_race})`
                  : label;
              const forgeKey = KEYWORD_LABELS[kw];
              const kwDef = forgeKey ? keywordDefs[forgeKey] : null;
              const desc = kwDef?.desc ? (x != null ? kwDef.desc.replace(/X/g, String(x)) : kwDef.desc) : null;
              return (
              <div key={kw} style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                <span style={{ flexShrink: 0 }}><KeywordIcon symbol={KEYWORD_SYMBOLS[kw] || "✦"} size={10} keyword={kw} /></span>
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
          <span style={{ color: isBuffedAtk ? "#2ecc71" : "#e74c3c" }}>⚔ {creature.currentAttack}</span>
          <span style={{ color: isDamaged ? "#e74c3c" : isBuffedHp ? "#2ecc71" : "#f1c40f" }}>❤ {creature.currentHealth}/{creature.maxHealth}</span>
        </div>
      </div>
      </div>{/* close clip-wrapper */}
    </div>
    </motion.div>
  );
}
