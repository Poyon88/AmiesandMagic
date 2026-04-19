"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import type { CardInstance } from "@/lib/game/types";
import { KEYWORD_SYMBOLS, KEYWORD_LABELS, toRoman, parseXValuesFromEffectText, cleanEffectText } from "@/lib/game/keyword-labels";
import { SPELL_KEYWORDS, SPELL_KEYWORD_SYMBOLS, SPELL_KEYWORD_LABELS, getSpellKeywordLabel } from "@/lib/game/spell-keywords";
import KeywordIcon from "@/components/shared/KeywordIcon";
import { KEYWORDS as keywordDefs } from "@/lib/card-engine/constants";
import { useGameStore } from "@/lib/store/gameStore";
import { useAudioStore } from "@/lib/store/audioStore";
import SfxEngine from "@/lib/audio/SfxEngine";

function playStandardSfx(eventType: string) {
  if (typeof window === "undefined") return;
  const audio = useAudioStore.getState();
  if (!audio.userHasInteracted || audio.settings.sfxMuted) return;
  const url = audio.standardSfxUrls[eventType];
  if (url) SfxEngine.getInstance().play(url);
}

interface MulliganOverlayProps {
  hand: CardInstance[];
  onConfirm: (selectedInstanceIds: string[]) => void;
  waitingForOpponent: boolean;
  onRevealComplete?: () => void;
}

const REVEAL_DELAY_MS = 2000; // time the card backs stay visible before flipping
const FLIP_DURATION_MS = 900;
const FLIP_STAGGER_MS = 800; // latency between one card starting its flip and the next
const REPLACEMENT_PRE_FLIP_MS = 1500; // pause after confirm before the new backs start flipping
const POST_REVEAL_HOLD_MS = 5000; // beat after the last card is revealed before the game starts

function MulliganCard({
  cardInstance,
  isSelected,
  onToggle,
  revealed,
  cardBackUrl,
  interactable,
}: {
  cardInstance: CardInstance;
  isSelected: boolean;
  onToggle: () => void;
  revealed: boolean;
  cardBackUrl: string | null;
  interactable: boolean;
}) {
  const card = cardInstance.card;
  const isCreature = card.card_type === "creature";
  const [isHovered, setIsHovered] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const detailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accentColor = isCreature ? "#74b9ff" : "#ce93d8";

  // A card accepts clicks only after its flip has fully played AND the
  // overlay's selection phase is active. This prevents the user from toggling
  // a still-hidden card or from toggling after confirm.
  const [flipPlayed, setFlipPlayed] = useState(false);
  useEffect(() => {
    if (!revealed) {
      setFlipPlayed(false);
      return;
    }
    const timer = setTimeout(() => setFlipPlayed(true), FLIP_DURATION_MS);
    return () => clearTimeout(timer);
  }, [revealed]);
  const readyForInput = flipPlayed && interactable;

  const W = 200;
  const H = 280;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggle(); }}
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
      style={{
        width: W, height: H, borderRadius: 12, position: "relative",
        background: isCreature
          ? "linear-gradient(160deg, #1a1a2e, #0d0d1a)"
          : "linear-gradient(160deg, #1a0a2a, #0d0d1a)",
        border: `2px solid ${isSelected ? "#e74c3c" : isHovered ? "#c8a84e" : "#3d3d5c"}`,
        boxShadow: isSelected ? "0 0 20px #e74c3c44" : isHovered ? "0 0 12px #c8a84e44" : "none",
        overflow: "hidden",
        cursor: readyForInput ? "pointer" : "default",
        transition: "all 0.25s ease",
        transform: isSelected ? "scale(0.92)" : isHovered ? "scale(1.05)" : "none",
        opacity: isSelected ? 0.7 : 1,
        perspective: 1200,
        pointerEvents: readyForInput ? "auto" : "none",
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
            <span style={{ fontSize: 48, opacity: 0.5 }}>{isCreature ? "⚔️" : "✨"}</span>
          </div>
        )}
      </div>

      {/* Replace overlay */}
      {isSelected && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 5,
          background: "rgba(231, 76, 60, 0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{
            background: "#0d0d1acc", color: "#e74c3c", fontWeight: 700,
            fontSize: 13, padding: "6px 14px", borderRadius: 8,
            border: "1px solid #e74c3c66",
            fontFamily: "'Cinzel', serif", letterSpacing: 1,
          }}>REMPLACER</span>
        </div>
      )}

      {/* Mana orb */}
      <div style={{
        position: "absolute", top: 8, left: 8, zIndex: 2,
        width: 28, height: 28, borderRadius: "50%",
        background: "radial-gradient(circle, #1a3a6a, #0d1f3c)",
        border: "2px solid #74b9ff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, color: "#74b9ff", fontWeight: 700,
        boxShadow: "0 0 8px #74b9ff55",
      }}>{card.mana_cost}</div>

      {/* Bottom bar */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2,
        padding: "8px 8px 6px",
        background: "linear-gradient(0deg, #0d0d1add 0%, #0d0d1a88 40%, transparent 65%)",
        display: "flex", flexDirection: "column", gap: 4,
      }}>
        {/* Name */}
        <div style={{
          fontSize: 12, color: "#e0e0e0", fontWeight: 700,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontFamily: "'Cinzel', serif",
        }}>{card.name}</div>

        {/* Keyword symbols */}
        {card.keywords.length > 0 && (() => {
          const xVals = parseXValuesFromEffectText(card.effect_text);
          return (
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {card.keywords.map((kw) => {
              const x = xVals[kw];
              const label = KEYWORD_LABELS[kw] || kw;
              const displayTitle = x != null ? label.replace(/ X$/, ` ${toRoman(x)}`) : label;
              return (
              <div key={kw} title={displayTitle} style={{
                minWidth: 20, height: 20, borderRadius: 5,
                padding: x != null ? "0 3px" : 0,
                background: `${accentColor}33`, border: `1px solid ${accentColor}66`,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 2,
                fontSize: 11,
              }}>
                <KeywordIcon symbol={KEYWORD_SYMBOLS[kw] || "✦"} size={11} />
                {x != null && <span style={{ fontSize: 8, fontWeight: 900, color: "#fff", fontFamily: "'Cinzel',serif", textShadow: `0 0 3px ${accentColor}` }}>{toRoman(x)}</span>}
              </div>
              );
            })}
          </div>
          );
        })()}

        {/* Spell keyword symbols */}
        {card.spell_keywords && card.spell_keywords.length > 0 && (
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {card.spell_keywords.map((spellKw, i) => {
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
                minWidth: 20, height: 20, borderRadius: 5,
                padding: hasValue ? "0 3px" : 0,
                background: `${accentColor}33`, border: `1px solid ${accentColor}66`,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 2,
                fontSize: 11,
              }}>
                <KeywordIcon symbol={SPELL_KEYWORD_SYMBOLS[spellKw.id] || "✦"} size={11} />
                {valueText && <span style={{ fontSize: 8, fontWeight: 900, color: "#fff", fontFamily: "'Cinzel',serif", textShadow: `0 0 3px ${accentColor}` }}>{toRoman(spellKw.amount!)}</span>}
              </div>
              );
            })}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 8, color: "#ffffff44", textTransform: "uppercase" }}>{card.card_type}</span>
          {isCreature && (
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{
                padding: "2px 6px", borderRadius: 4,
                background: "#e74c3c18", border: "1px solid #e74c3c55",
              }}>
                <span style={{ fontSize: 14, color: "#e74c3c", fontWeight: 700 }}>{card.attack}</span>
              </div>
              <div style={{
                padding: "2px 6px", borderRadius: 4,
                background: "#f1c40f18", border: "1px solid #f1c40f55",
              }}>
                <span style={{ fontSize: 14, color: "#f1c40f", fontWeight: 700 }}>{card.health}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hover overlay (delayed) */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 3,
        background: "#0d0d1ab3",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        opacity: showDetails && !isSelected ? 1 : 0,
        transition: "opacity 0.25s ease",
        pointerEvents: showDetails && !isSelected ? "auto" : "none",
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "16px 12px",
        gap: 8,
      }}>
        <div style={{
          fontSize: 13, color: accentColor, fontWeight: 700,
          textAlign: "center", fontFamily: "'Cinzel', serif",
          borderBottom: `1px solid ${accentColor}44`, paddingBottom: 6,
        }}>{card.name}</div>

        {/* Race / Clan */}
        {(card.race || card.clan) && (
          <div style={{ display: "flex", justifyContent: "center", gap: 5, fontSize: 9, color: "#888", fontFamily: "'Crimson Text',serif" }}>
            {card.race && <span>{card.race}</span>}
            {card.race && card.clan && <span style={{ color: "#555" }}>·</span>}
            {card.clan && <span style={{ fontStyle: "italic" }}>{card.clan}</span>}
          </div>
        )}

        {card.keywords.length > 0 && (() => {
          const xVals = parseXValuesFromEffectText(card.effect_text);
          return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {card.keywords.map((kw) => {
              const x = xVals[kw];
              const label = KEYWORD_LABELS[kw] || kw;
              const displayLabel = x != null ? label.replace(/ X$/, ` ${toRoman(x)}`) : label;
              const forgeKey = KEYWORD_LABELS[kw];
              const kwDef = forgeKey ? keywordDefs[forgeKey] : null;
              const desc = kwDef?.desc ? (x != null ? kwDef.desc.replace(/X/g, String(x)) : kwDef.desc) : null;
              return (
              <div key={kw} style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
                <span style={{ flexShrink: 0 }}><KeywordIcon symbol={KEYWORD_SYMBOLS[kw] || "✦"} size={12} /></span>
                <div>
                  <div style={{ fontSize: 10, color: accentColor, fontWeight: 600 }}>{displayLabel}</div>
                  {desc && <div style={{ fontSize: 8, color: "#999", lineHeight: 1.3, fontFamily: "'Crimson Text',serif" }}>{desc}</div>}
                </div>
              </div>
              );
            })}
          </div>
          );
        })()}

        {card.effect_text && (
          <div style={{
            padding: 6, background: `${accentColor}11`, borderRadius: 5,
            border: `1px solid ${accentColor}22`,
          }}>
            <p style={{
              margin: 0, fontSize: 10, color: "#ccc",
              lineHeight: 1.5, fontFamily: "'Crimson Text', serif",
            }}>{cleanEffectText(card.effect_text, card.spell_keywords)}</p>
          </div>
        )}

        {card.flavor_text && (
          <p style={{
            margin: 0, fontSize: 9, color: `${accentColor}77`,
            fontStyle: "italic", lineHeight: 1.3, fontFamily: "'Crimson Text', serif",
            textAlign: "center",
          }}>&ldquo;{card.flavor_text}&rdquo;</p>
        )}

        <div style={{
          display: "flex", justifyContent: "center", gap: 8,
          fontSize: 9, color: "#555",
        }}>
          <span>{"💧"} {card.mana_cost}</span>
          {isCreature && <><span style={{ color: "#e74c3c" }}>{"⚔"} {card.attack}</span><span style={{ color: "#f1c40f" }}>{"❤"} {card.health}</span></>}
        </div>
      </div>

      {/* Card back face — flips away to reveal the card underneath */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 30,
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
          transformOrigin: "center center",
          transform: revealed ? "rotateY(180deg)" : "rotateY(0deg)",
          transition: `transform ${FLIP_DURATION_MS}ms ease`,
          borderRadius: 12,
          overflow: "hidden",
          background: cardBackUrl
            ? "transparent"
            : "linear-gradient(160deg, #1a0a2a, #0d0d1a)",
        }}
      >
        {cardBackUrl ? (
          <img
            src={cardBackUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            draggable={false}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(200,168,78,0.35)",
              fontFamily: "'Cinzel', serif",
              fontWeight: 700,
              fontSize: 28,
              letterSpacing: 3,
            }}
          >
            A&amp;M
          </div>
        )}
      </div>
    </div>
  );
}

export default function MulliganOverlay({
  hand,
  onConfirm,
  waitingForOpponent,
  onRevealComplete,
}: MulliganOverlayProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<"initial" | "selecting" | "replacing" | "complete">("initial");
  const myCardBackUrl = useGameStore((s) => s.myCardBackUrl);
  const kickedOffInitialRef = useRef(false);
  const kickedOffReplacementRef = useRef(false);
  const handRef = useRef(hand);
  handRef.current = hand;
  // Cap the mulligan UI to the hand size we started with. The engine adds
  // a Mana Spark to the 2nd player's hand as soon as both mulligans are
  // confirmed — we don't want that bonus card to appear as a 5th tile
  // during the reveal animation.
  const mulliganHandSizeRef = useRef(hand.length);
  const displayedHand = hand.slice(0, mulliganHandSizeRef.current);

  // Initial reveal — staggered flips, one card at a time, after the reveal
  // delay. Fires exactly once. We deliberately do NOT return a cleanup
  // function: parent re-renders (e.g. a new `hand` reference) would otherwise
  // cancel the pending timers before they fire.
  useEffect(() => {
    if (waitingForOpponent) return;
    if (kickedOffInitialRef.current) return;
    if (phase !== "initial") return;
    if (hand.length === 0) return;
    kickedOffInitialRef.current = true;
    const ids = handRef.current.slice(0, mulliganHandSizeRef.current).map((c) => c.instanceId);
    setTimeout(() => {
      ids.forEach((id, i) => {
        setTimeout(() => {
          setRevealedIds((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
          });
          playStandardSfx("mulligan_flip");
          if (i === ids.length - 1) {
            // Wait for the last flip to finish before opening selection.
            setTimeout(() => setPhase("selecting"), FLIP_DURATION_MS);
          }
        }, i * FLIP_STAGGER_MS);
      });
    }, REVEAL_DELAY_MS);
  }, [phase, waitingForOpponent, hand.length]);

  // Replacement reveal — triggers once the hand prop contains cards we haven't
  // seen before (i.e. the engine resolved the mulligan swap).
  useEffect(() => {
    if (phase !== "replacing") return;
    if (kickedOffReplacementRef.current) return;
    const newCards = hand
      .slice(0, mulliganHandSizeRef.current)
      .filter((c) => !revealedIds.has(c.instanceId));
    if (newCards.length === 0) return; // hand hasn't refreshed yet
    kickedOffReplacementRef.current = true;
    setTimeout(() => {
      newCards.forEach((c, i) => {
        setTimeout(() => {
          setRevealedIds((prev) => {
            const next = new Set(prev);
            next.add(c.instanceId);
            return next;
          });
          playStandardSfx("mulligan_flip");
          if (i === newCards.length - 1) {
            // After the last replacement card flips, hold on the revealed
            // hand for a few seconds before signalling the parent to unmount.
            setTimeout(() => setPhase("complete"), FLIP_DURATION_MS + POST_REVEAL_HOLD_MS);
          }
        }, i * FLIP_STAGGER_MS);
      });
    }, REPLACEMENT_PRE_FLIP_MS);
  }, [phase, hand, revealedIds]);

  function toggleCard(instanceId: string) {
    if (phase !== "selecting") return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(instanceId)) {
        next.delete(instanceId);
      } else {
        next.add(instanceId);
      }
      return next;
    });
    playStandardSfx("mulligan_pick");
  }

  function handleConfirmClick() {
    if (phase !== "selecting") return;
    const hasReplacements = selected.size > 0;
    onConfirm(Array.from(selected));
    if (hasReplacements) {
      // We'll flip in the replacements once the hand prop updates.
      setPhase("replacing");
    } else {
      // Nothing to flip — still give the player a beat to read the hand.
      setTimeout(() => setPhase("complete"), POST_REVEAL_HOLD_MS);
    }
  }

  // Signal the parent as soon as the local animation is finished so it can
  // safely unmount the overlay (the game phase may have already flipped to
  // "playing" while we were still running the replacement reveal).
  useEffect(() => {
    if (phase !== "complete") return;
    onRevealComplete?.();
  }, [phase, onRevealComplete]);

  // Only show the waiting screen once the local reveal animation (initial +
  // replacement) has finished. Otherwise the player loses the flip
  // animation the moment they confirm the mulligan.
  if (waitingForOpponent && phase === "complete") {
    return (
      <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">{"⏳"}</div>
          <p className="text-foreground/70 text-lg">
            En attente de l&apos;adversaire...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center">
      <div className="text-center max-w-4xl px-6">
        <h1 className="text-2xl font-bold text-foreground mb-2">Mulligan</h1>
        <p className="text-foreground/50 mb-8 text-sm">
          Sélectionnez les cartes à remplacer, puis confirmez.
        </p>

        <div className="flex justify-center gap-5 mb-10">
          {displayedHand.map((cardInstance) => (
            <MulliganCard
              key={cardInstance.instanceId}
              cardInstance={cardInstance}
              isSelected={selected.has(cardInstance.instanceId)}
              onToggle={() => toggleCard(cardInstance.instanceId)}
              revealed={revealedIds.has(cardInstance.instanceId)}
              cardBackUrl={myCardBackUrl}
              interactable={phase === "selecting"}
            />
          ))}
        </div>

        <button
          onClick={handleConfirmClick}
          disabled={phase !== "selecting"}
          className="px-8 py-3 bg-primary hover:bg-primary-dark text-background font-bold rounded-xl text-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {phase === "initial"
            ? "Révélation en cours..."
            : phase === "replacing"
            ? "Remplacement en cours..."
            : phase === "complete"
            ? "Préparation..."
            : selected.size === 0
            ? "Garder tout"
            : `Remplacer ${selected.size} carte${selected.size > 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}
