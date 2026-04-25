"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore, type SpellCastEvent } from "@/lib/store/gameStore";
import {
  KEYWORD_SYMBOLS,
  KEYWORD_LABELS,
  toRoman,
  parseXValuesFromEffectText,
  cleanEffectText,
} from "@/lib/game/keyword-labels";
import {
  SPELL_KEYWORD_SYMBOLS,
  getSpellKeywordLabel,
  getSpellKeywordDesc,
} from "@/lib/game/spell-keywords";
import KeywordIcon from "@/components/shared/KeywordIcon";
import { KEYWORDS as keywordDefs } from "@/lib/card-engine/constants";

interface SpellCastOverlayProps {
  event: SpellCastEvent | null;
  onComplete: () => void;
}

const DISPLAY_MS = 2800;

function findTargetEl(id: string): Element | null {
  return (
    document.querySelector(`[data-instance-id="${id}"]`) ??
    document.querySelector(`[data-target-id="${id}"]`)
  );
}

function SpellTargetArrows({
  sourceRef,
  targetIds,
  hexColor,
}: {
  sourceRef: React.RefObject<HTMLDivElement | null>;
  targetIds: string[];
  hexColor: string;
}) {
  const pathsRef = useRef<(SVGPathElement | null)[]>([]);
  const headsRef = useRef<(SVGPolygonElement | null)[]>([]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const src = sourceRef.current?.getBoundingClientRect();
      if (src) {
        // Anchor the arrow on the right edge of the spell card (cards are on the left).
        const sx = src.right - 10;
        const sy = src.top + src.height / 2;
        targetIds.forEach((id, i) => {
          const el = findTargetEl(id);
          const path = pathsRef.current[i];
          const head = headsRef.current[i];
          if (!el || !path || !head) return;
          const r = el.getBoundingClientRect();
          const tx = r.left + r.width / 2;
          const ty = r.top + r.height / 2;
          const midX = (sx + tx) / 2;
          const midY = (sy + ty) / 2;
          const dist = Math.hypot(tx - sx, ty - sy);
          const curve = Math.min(dist * 0.22, 90);
          const cy = midY - curve;
          path.setAttribute("d", `M ${sx} ${sy} Q ${midX} ${cy} ${tx} ${ty}`);
          const angle = (Math.atan2(ty - cy, tx - midX) * 180) / Math.PI;
          head.setAttribute("transform", `translate(${tx}, ${ty}) rotate(${angle})`);
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sourceRef, targetIds]);

  if (targetIds.length === 0) return null;

  return (
    <motion.svg
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 91,
        overflow: "visible",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: DISPLAY_MS / 1000, times: [0, 0.2, 0.78, 1] }}
    >
      {targetIds.map((_, i) => (
        <g key={i}>
          <path
            ref={(el) => { pathsRef.current[i] = el; }}
            fill="none"
            stroke={hexColor}
            strokeWidth={6}
            strokeOpacity={0.95}
            strokeLinecap="round"
            strokeDasharray="14 7"
            style={{ filter: `drop-shadow(0 0 6px ${hexColor})` }}
          />
          <polygon
            ref={(el) => { headsRef.current[i] = el; }}
            points="0,-12 26,0 0,12"
            fill={hexColor}
            style={{ filter: `drop-shadow(0 0 4px ${hexColor})` }}
          />
        </g>
      ))}
    </motion.svg>
  );
}

export default function SpellCastOverlay({ event, onComplete }: SpellCastOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const tokenTemplates = useGameStore((s) => s.tokenTemplates);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!event) return;
    const timer = setTimeout(onComplete, DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [event, onComplete]);

  if (!mounted) return null;

  const countered = event?.countered ?? false;
  const color = countered ? "239, 68, 68" : "168, 85, 247";
  const hexColor = countered ? "#ef4444" : "#a855f7";
  const lightColor = countered ? "#fca5a5" : "#c084fc";
  const accentColor = countered ? "#fca5a5" : "#c084fc";

  const card = event?.card ?? null;
  const xVals = card ? parseXValuesFromEffectText(card.effect_text) : {};
  const cleaned = card ? cleanEffectText(card.effect_text, card.spell_keywords) : "";

  return createPortal(
    <AnimatePresence>
      {event && (
        <motion.div
          key={event.timestamp}
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingLeft: "6%",
            pointerEvents: "none",
            zIndex: 90,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Background radial flash — focused on the left where the card is */}
          <motion.div
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(ellipse at 20% 50%, rgba(${color}, 0.32) 0%, transparent 55%)`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.7, 0] }}
            transition={{ duration: 3.0, times: [0, 0.12, 0.7, 1] }}
          />

          {/* Halo behind the description */}
          <motion.div
            style={{
              position: "absolute",
              width: 460,
              height: 460,
              borderRadius: "50%",
              background: `radial-gradient(circle, rgba(${color}, 0.55) 0%, rgba(${color}, 0.22) 45%, transparent 70%)`,
              filter: `blur(12px)`,
            }}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: [0.4, 1.1, 1], opacity: [0, 0.9, 0] }}
            transition={{ duration: 3.2, times: [0, 0.15, 1], ease: "easeOut" }}
          />

          {/* Expanding ring */}
          <motion.div
            style={{
              position: "absolute",
              width: 260,
              height: 260,
              borderRadius: "50%",
              border: `2px solid rgba(${color}, 0.75)`,
              boxShadow: `0 0 28px rgba(${color}, 0.5)`,
            }}
            initial={{ scale: 0.5, opacity: 1 }}
            animate={{ scale: 3, opacity: 0 }}
            transition={{ duration: 1.6, ease: "easeOut", delay: 0.1 }}
          />

          {/* Orbiting sparkles */}
          {[...Array(14)].map((_, i) => {
            const angle = (i / 14) * Math.PI * 2;
            const radius = 200 + Math.random() * 70;
            const dx = Math.cos(angle) * radius;
            const dy = Math.sin(angle) * radius;
            return (
              <motion.div
                key={i}
                style={{
                  position: "absolute",
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: lightColor,
                  boxShadow: `0 0 10px ${hexColor}, 0 0 20px ${hexColor}`,
                }}
                initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                animate={{ x: dx, y: dy, opacity: [0, 1, 0], scale: [0, 1.6, 0] }}
                transition={{ duration: 1.6 + Math.random() * 0.5, ease: "easeOut", delay: 0.04 * i }}
              />
            );
          })}

          {/* Card-shaped panel with art background + description overlay */}
          <motion.div
            ref={cardRef}
            style={{
              position: "relative",
              width: 266,
              height: 378,
              maxWidth: "90vw",
              borderRadius: 14,
              overflow: "hidden",
              border: `2px solid rgba(${color}, 0.7)`,
              boxShadow: `0 0 40px 6px rgba(${color}, 0.55), 0 12px 40px rgba(0,0,0,0.7)`,
              background: card?.image_url
                ? `url('${card.image_url}') center/cover no-repeat, linear-gradient(160deg, #1a0a2a, #0d0d1a)`
                : "linear-gradient(160deg, #1a0a2a, #0d0d1a)",
            }}
            initial={{ scale: 0.5, opacity: 0, y: 30 }}
            animate={{
              scale: [0.5, 1.06, 1, 1, 0.97],
              opacity: [0, 1, 1, 1, 0],
              y: [30, 0, 0, -8, -30],
            }}
            transition={{
              duration: DISPLAY_MS / 1000,
              times: [0, 0.13, 0.22, 0.82, 1],
              ease: ["backOut", "easeInOut", "easeIn"],
            }}
          >
            {/* Description overlay (less opaque so the art shows through) */}
            <div style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(180deg, rgba(6,6,18,0.55) 0%, rgba(6,6,18,0.15) 45%, rgba(6,6,18,0.7) 100%)",
              padding: "16px 18px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}>
            {/* Spell name */}
            <div style={{
              fontSize: "1.15rem",
              color: countered ? "#fecaca" : "#e9d5ff",
              fontWeight: 700,
              textAlign: "center",
              fontFamily: "'Cinzel', serif",
              borderBottom: `1px solid rgba(${color}, 0.45)`,
              paddingBottom: 6,
              textShadow: `0 0 10px rgba(${color}, 0.9), 0 2px 3px rgba(0,0,0,0.95)`,
              letterSpacing: "0.03em",
              textDecoration: countered ? "line-through" : "none",
            }}>
              {event.spellName}
            </div>

            {card && (
              <>
                {/* Mana + Faction */}
                <div style={{ display: "flex", justifyContent: "center", gap: 10, fontSize: "0.7rem", color: "#ccc", textShadow: "0 1px 2px rgba(0,0,0,0.9)" }}>
                  {card.faction && <span style={{ color: accentColor, fontWeight: 600 }}>{card.faction}</span>}
                  <span style={{ color: "#74b9ff", fontWeight: 700 }}>💧 {card.mana_cost}</span>
                  {card.rarity && <span style={{ color: "#bbb", fontStyle: "italic" }}>{card.rarity}</span>}
                </div>

                {/* Spacer pushes the text description toward the bottom so the middle of the card stays visible */}
                <div style={{ flex: 1 }} />

                {/* Keyword details */}
                {card.keywords && card.keywords.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {card.keywords.map((kw) => {
                      const x = (xVals as Record<string, number>)[kw];
                      const label = KEYWORD_LABELS[kw] || kw;
                      const displayLabel = x != null ? label.replace(/ X$/, ` ${toRoman(x)}`) : label;
                      const forgeKey = KEYWORD_LABELS[kw];
                      const kwDef = forgeKey ? keywordDefs[forgeKey] : null;
                      const desc = kwDef?.desc
                        ? (x != null ? kwDef.desc.replace(/X/g, String(x)) : kwDef.desc)
                        : null;
                      return (
                        <div key={kw} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                          <span style={{ flexShrink: 0 }}>
                            <KeywordIcon symbol={KEYWORD_SYMBOLS[kw] || "✦"} size={16} keyword={kw} />
                          </span>
                          <div>
                            <div style={{ fontSize: "0.8rem", color: accentColor, fontWeight: 700, textShadow: "0 1px 2px rgba(0,0,0,0.9)" }}>{displayLabel}</div>
                            {desc && (
                              <div style={{ fontSize: "0.7rem", color: "#eee", lineHeight: 1.35, fontFamily: "'Crimson Text', serif", textShadow: "0 1px 2px rgba(0,0,0,0.9)" }}>
                                {desc}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Spell keyword details */}
                {card.spell_keywords && card.spell_keywords.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {card.spell_keywords.map((spellKw, i) => {
                      const label = getSpellKeywordLabel(spellKw);
                      const desc = getSpellKeywordDesc(spellKw, card, tokenTemplates);
                      return (
                        <div key={`sk_${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                          <span style={{ flexShrink: 0 }}>
                            <KeywordIcon symbol={SPELL_KEYWORD_SYMBOLS[spellKw.id] || "✦"} size={16} keyword={`spell_${spellKw.id}`} />
                          </span>
                          <div>
                            <div style={{ fontSize: "0.8rem", color: accentColor, fontWeight: 700, textShadow: "0 1px 2px rgba(0,0,0,0.9)" }}>{label}</div>
                            <div style={{ fontSize: "0.7rem", color: "#eee", lineHeight: 1.35, fontFamily: "'Crimson Text', serif", textShadow: "0 1px 2px rgba(0,0,0,0.9)" }}>
                              {desc}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Effect text */}
                {cleaned && (
                  <div style={{
                    padding: "6px 9px",
                    background: `rgba(${color}, 0.18)`,
                    borderRadius: 6,
                    border: `1px solid rgba(${color}, 0.4)`,
                  }}>
                    <p style={{
                      margin: 0,
                      fontSize: "0.72rem",
                      color: "#f5f5f5",
                      lineHeight: 1.4,
                      fontFamily: "'Crimson Text', serif",
                      textShadow: "0 1px 2px rgba(0,0,0,0.9)",
                    }}>{cleaned}</p>
                  </div>
                )}
              </>
            )}

            {/* Fallback when card is missing — keep the old behavior for recast/legacy events */}
            {!card && event.effectText && (
              <p style={{
                margin: 0,
                fontSize: "0.95rem",
                color: "#eee",
                lineHeight: 1.5,
                fontFamily: "'Crimson Text', serif",
                textAlign: "center",
              }}>{event.effectText}</p>
            )}

            {countered && (
              <div style={{
                marginTop: 6,
                textAlign: "center",
                fontSize: "1.05rem",
                fontWeight: 700,
                color: hexColor,
                textShadow: `0 0 10px ${hexColor}, 0 2px 4px rgba(0,0,0,0.9)`,
              }}>
                🛡️ Contresort !
              </div>
            )}
            </div>
          </motion.div>

          {/* Targeting arrows from the card to each target */}
          {!countered && event.targetIds && event.targetIds.length > 0 && (
            <SpellTargetArrows
              sourceRef={cardRef}
              targetIds={event.targetIds}
              hexColor={hexColor}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
