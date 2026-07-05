"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import Image from "next/image";
import type { CardInstance } from "@/lib/game/types";
import { useGameStore } from "@/lib/store/gameStore";
import type { DragEvent } from "react";
import { KEYWORD_SYMBOLS, KEYWORD_LABELS, toRoman, cleanEffectText, buildKeywordDisplayEntries, keywordModeColor, keywordModeFilter } from "@/lib/game/keyword-labels";
import { SPELL_KEYWORDS, SPELL_KEYWORD_SYMBOLS, getSpellKeywordLabel, getSpellKeywordDesc, formatConvocationToken, formatConvocationTokens } from "@/lib/game/spell-keywords";
import { isCreatureKwShadowedBySpell, getEntraideReduction, getTokenManaCost } from "@/lib/game/abilities";
import { persistentStats } from "@/lib/game/engine";
import KeywordIcon from "@/components/shared/KeywordIcon";
import { useKeywordIconStore } from "@/lib/store/keywordIconStore";
import { composedCapsOf, composedIcon, composedTriggerMode, composedValueText, describeComposedCap } from "@/lib/game/composed-display";
import { KEYWORDS as keywordDefs } from "@/lib/card-engine/constants";
import CostBadges from "@/components/cards/CostBadges";
import RarityFrame from "@/components/cards/RarityFrame";
import useLongPress, { LONG_PRESS_RESET_STYLE } from "@/hooks/useLongPress";
import useCoarsePointer from "@/hooks/useCoarsePointer";
import { SPRINGS } from "@/lib/fx/overlayMotion";

interface HandCardProps {
  cardInstance: CardInstance;
  canPlay: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  // Boost récent sur cette carte EN MAIN (ex. Entrainement) → flash doré +
  // halo (mêmes couleurs que BoardCreature). "empower" (violet) réservé si un
  // jour un buff de capacité vise la main ; sinon "buff" (or).
  boost?: "buff" | "empower" | null;
}

export default function HandCard({
  cardInstance,
  canPlay,
  isSelected = false,
  onClick,
  boost = null,
}: HandCardProps) {
  const card = cardInstance.card;
  const gameState = useGameStore(s => s.gameState);
  const localPlayerId = useGameStore(s => s.localPlayerId);
  const tokenTemplates = useGameStore(s => s.tokenTemplates);
  const targetingMode = useGameStore(s => s.targetingMode);
  const pendingCostCard = useGameStore(s => s.pendingCostCard);
  const selectedDiscardIds = useGameStore(s => s.selectedDiscardIds);
  const toggleDiscardSelection = useGameStore(s => s.toggleDiscardSelection);

  const isCostPaymentMode = targetingMode === "cost_payment";
  const isPendingCostSource = pendingCostCard?.instanceId === cardInstance.instanceId;
  const isSelectedForDiscard = selectedDiscardIds.includes(cardInstance.instanceId);

  // Flash de boost (mêmes réglages que BoardCreature) : or pour un buff de
  // stats, violet pour une capacité acquise.
  const isBoost = boost != null;
  const isEmpower = boost === "empower";
  const boostDur = isEmpower ? 0.75 : 0.6;
  const haloRgb = isEmpower ? "168,85,247" : "234,179,8";
  const haloPeak = isEmpower ? 1.5 : 1.35;

  // Compute effective mana cost (accounting for Canalisation on spells and
  // Entraide on creatures — cumulable ; plancher 1 pour les sorts via
  // Canalisation, plancher 0 pour les créatures). Reductions must be
  // computed against the OWNER of the hand (the local player), not the
  // active turn — otherwise during the opponent's turn we'd be reading
  // the opponent's board and the cost shown in our hand would silently
  // ignore our own Entraide / Canalisation creatures.
  // Concentration X bakes a persistent reduction directly on the instance —
  // applied first, before Canalisation/Entraide stack on top.
  // Baseline: tokens in hand cost floor((attack+health)/2) — see
  // getTokenManaCost — not the on-board 0.
  const baseManaCost = getTokenManaCost(card);
  let effectiveManaCost = Math.max(0, baseManaCost - (cardInstance.manaCostReduction ?? 0));
  if (gameState) {
    const player = gameState.players.find(p => p.id === localPlayerId)
      ?? gameState.players[gameState.currentPlayerIndex];
    if (card.card_type === "spell") {
      const canalisationCount = player.board.filter(c => c.card.keywords.includes("canalisation" as import("@/lib/game/types").Keyword)).length;
      // Canalisation : plancher à 1 mana (sans augmenter un sort déjà à 0).
      effectiveManaCost = Math.max(Math.min(1, effectiveManaCost), effectiveManaCost - canalisationCount);
    }
    if (card.card_type === "creature") {
      effectiveManaCost -= getEntraideReduction(card, player.board);
    }
    effectiveManaCost = Math.max(0, effectiveManaCost);
  }
  const isCostReduced = effectiveManaCost < baseManaCost;
  const tokenTemplate = card.id === -1 && !card.image_url
    ? (card.token_id
        ? tokenTemplates.find(t => t.id === card.token_id)
        : (card.race ? tokenTemplates.find(t => t.race === card.race) : null))
    : null;
  const resolvedImageUrl = card.image_url ?? tokenTemplate?.image_url ?? null;
  const isCreature = card.card_type === "creature";
  // Stats EFFECTIVES affichées : base + bonus conservés (loyauté, summon,
  // nécrophagie…). Pertinent pour une créature renvoyée en main (rebond) qui
  // garde son bonus de Loyauté — aligne la main sur le cimetière. Pour une
  // carte fraîche, les bonus valent 0 → stats de base inchangées.
  const { attack: displayAttack, health: displayHealth } = isCreature
    ? persistentStats(cardInstance)
    : { attack: card.attack ?? 0, health: card.health ?? 0 };
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const detailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while the description was opened by a long-press (touch). Used so
  // that the next tap dismisses the description instead of playing the
  // card — without affecting desktop hover→click flow.
  const detailsOpenedByTouch = useRef(false);
  // Mobile double-tap-to-cast state for spells. First tap arms + shows the
  // description; second tap (within ARM_TIMEOUT_MS) fires the cast. Drag
  // and desktop click bypass this.
  const armedForCast = useRef(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while the most recent gesture was a touch — set in handleTouchStart
  // and read by onClick to know whether to apply the double-tap rule.
  const lastTapWasTouch = useRef(false);
  const ARM_TIMEOUT_MS = 5000;

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
  // Touch devices have no hover-zoom to read the tiny detail-overlay text, so
  // bump its font sizes. `d` multiplies the overlay text only — the always-on
  // card body is left untouched so the hand layout is unchanged.
  const coarse = useCoarsePointer();
  const d = coarse ? 1.5 : 1;
  const accentColor = isCreature ? "#74b9ff" : "#ce93d8";
  // Cost-payment visuals override the normal selection styling: red border
  // when picked for discard, gold glow on the source card being played.
  const borderColor = isSelectedForDiscard ? "#e74c3c"
    : (isCostPaymentMode && isPendingCostSource) ? "#c8a84e"
    : isSelected ? "#c8a84e"
    : (canPlay && !isCostPaymentMode) ? "#2ecc71"
    : isCreature ? "#3d3d5c" : "#6c3483";
  const iconOverrides = useKeywordIconStore((st) => st.overrides);

  const armForCast = () => {
    armedForCast.current = true;
    setShowDetails(true);
    setIsHovered(true);
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => {
      armedForCast.current = false;
      setShowDetails(false);
      setIsHovered(false);
    }, ARM_TIMEOUT_MS);
  };

  const disarmCast = () => {
    armedForCast.current = false;
    setShowDetails(false);
    setIsHovered(false);
    if (armTimer.current) clearTimeout(armTimer.current);
  };

  // Touch UX: a tap anywhere outside the hand (empty board, a creature, the
  // hero…) dismisses an open detail overlay and disarms a primed spell, so a
  // zoomed card snaps back to its normal on-board look. GameBoard fires the
  // "dismiss-card-detail" window event on those taps. Desktop hover-zoom is
  // untouched — it isn't opened via touch, so neither ref is set.
  useEffect(() => {
    const dismiss = () => {
      if (!detailsOpenedByTouch.current && !armedForCast.current) return;
      detailsOpenedByTouch.current = false;
      armedForCast.current = false;
      setShowDetails(false);
      setIsHovered(false);
      if (detailTimer.current) clearTimeout(detailTimer.current);
      if (armTimer.current) clearTimeout(armTimer.current);
    };
    window.addEventListener("dismiss-card-detail", dismiss);
    return () => window.removeEventListener("dismiss-card-detail", dismiss);
  }, []);

  const longPress = useLongPress(() => {
    if (detailTimer.current) clearTimeout(detailTimer.current);
    // Spells follow the double-tap UX on touch — long-press arms them so
    // a single follow-up tap fires the cast (instead of dismissing the
    // overlay like creatures do).
    if (card.card_type === "spell") {
      if (armedForCast.current) disarmCast();
      else armForCast();
      return;
    }
    // Creatures / tokens keep the original preview-then-dismiss flow.
    // On mobile, the card is never `isHovered` (no mouseenter), so force
    // isHovered alongside showDetails so the overlay actually renders.
    setShowDetails(prev => {
      const next = !prev;
      setIsHovered(next);
      detailsOpenedByTouch.current = next;
      return next;
    });
  });

  // ─── Touch drag (HTML5 drag is mouse-only) ───────────────────────────────
  // Same gesture as the mouse path: a finger held still triggers long-press
  // (handled by useLongPress); a finger that moves past the threshold turns
  // into a drag. The two are composed in the touch handlers below.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchDraggingRef = useRef(false);
  const [touchGhostPos, setTouchGhostPos] = useState<{ x: number; y: number } | null>(null);
  const TOUCH_DRAG_THRESHOLD = 12;

  const handleTouchStart = (e: React.TouchEvent) => {
    longPress.handlers.onTouchStart(e);
    lastTapWasTouch.current = true;
    if (!canPlay) return;
    const t = e.touches[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    touchDraggingRef.current = false;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    longPress.handlers.onTouchMove(e);
    if (!touchStartRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    if (!touchDraggingRef.current) {
      const dx = t.clientX - touchStartRef.current.x;
      const dy = t.clientY - touchStartRef.current.y;
      if (dx * dx + dy * dy > TOUCH_DRAG_THRESHOLD * TOUCH_DRAG_THRESHOLD) {
        touchDraggingRef.current = true;
        setIsDragging(true);
        setIsHovered(false);
        setShowDetails(false);
        detailsOpenedByTouch.current = false;
        // Drag bypasses the double-tap rule — clear the arm so the drop
        // fires its own cast without waiting for a second tap.
        armedForCast.current = false;
        if (armTimer.current) clearTimeout(armTimer.current);
      }
    }
    if (touchDraggingRef.current) {
      setTouchGhostPos({ x: t.clientX, y: t.clientY });
      window.dispatchEvent(
        new CustomEvent("hand-touch-move", {
          detail: { clientX: t.clientX, cardType: card.card_type },
        })
      );
    }
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    longPress.handlers.onTouchEnd(e);
    if (touchDraggingRef.current) {
      const t = e.changedTouches[0];
      let droppedOnBoard = false;
      let clientX = 0;
      if (t) {
        clientX = t.clientX;
        const elem = document.elementFromPoint(t.clientX, t.clientY);
        const board = elem?.closest('[data-droptarget="my-board"]');
        droppedOnBoard = !!board;
      }
      if (droppedOnBoard) {
        window.dispatchEvent(
          new CustomEvent("hand-touch-drop", {
            detail: {
              cardInstanceId: cardInstance.instanceId,
              cardType: card.card_type,
              clientX,
            },
          })
        );
      } else {
        window.dispatchEvent(new CustomEvent("hand-touch-end"));
      }
      touchDraggingRef.current = false;
      setIsDragging(false);
      setTouchGhostPos(null);
      e.preventDefault();
    }
    touchStartRef.current = null;
  };
  const handleTouchCancel = () => {
    longPress.handlers.onTouchCancel();
    if (touchDraggingRef.current) {
      window.dispatchEvent(new CustomEvent("hand-touch-end"));
      touchDraggingRef.current = false;
      setIsDragging(false);
      setTouchGhostPos(null);
    }
    touchStartRef.current = null;
  };

  return (
    <motion.div
      initial={{ y: 60, opacity: 0, scale: 0.7 }}
      animate={
        isBoost
          ? {
              // Flash doux « power-up » : légère montée + éclat de luminosité,
              // retour au repos. Aligné sur BoardCreature (pas de resize).
              y: [0, isEmpower ? -6 : -8, 0],
              opacity: 1,
              scale: 1,
              filter: [
                "brightness(1) saturate(1)",
                `brightness(${isEmpower ? 1.6 : 1.45}) saturate(${isEmpower ? 1.5 : 1.35})`,
                "brightness(1) saturate(1)",
              ],
            }
          : { y: 0, opacity: 1, scale: 1 }
      }
      transition={
        isBoost
          ? { duration: boostDur, ease: "easeOut" }
          : { default: SPRINGS.handEntry, opacity: { duration: 0.25, ease: "easeOut" } }
      }
      data-instance-id={cardInstance.instanceId}
      data-hand-card="true"
      data-zoom={1.41}
      style={{ width: W, height: H, position: "relative", zoom: 1.41 }}
    >
      {/* Halo de boost — enfle puis s'estompe DERRIÈRE la carte (zIndex -1),
          auréole dorée qui déborde des bords. Miroir de BoardCreature. */}
      <motion.div
        aria-hidden
        style={{
          position: "absolute", inset: "-16%", borderRadius: 24,
          pointerEvents: "none", zIndex: -1,
          background: `radial-gradient(closest-side, rgba(${haloRgb},0.55), rgba(${haloRgb},0) 78%)`,
          boxShadow: `0 0 36px 10px rgba(${haloRgb},0.45)`,
        }}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={isBoost ? { opacity: [0, 0.9, 0], scale: [0.85, haloPeak, haloPeak * 0.96] } : { opacity: 0, scale: 0.85 }}
        transition={{ duration: boostDur, ease: "easeOut", times: isBoost ? [0, 0.4, 1] : undefined }}
      />
      <div
        ref={cardRef}
        draggable={canPlay}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onMouseEnter={() => {
          // iPad/Safari fire a synthetic mouseenter on tap (hover emulation)
          // but never a matching mouseleave, so a hover-opened overlay would
          // get stuck. On touch, only long-press opens the detail (it handles
          // its own tap-to-dismiss); desktop hover is unchanged.
          if (coarse) return;
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
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        onClick={() => {
          if (longPress.consume()) return;
          if (touchDraggingRef.current) return;
          const isSpell = card.card_type === "spell";
          const isFromTouch = lastTapWasTouch.current;
          lastTapWasTouch.current = false;

          // Mobile double-tap for spells: first tap arms + shows the
          // description, second tap fires the cast. Desktop clicks (no
          // preceding touchstart) and cost-payment / non-playable taps
          // skip this entirely. Drag-to-board already cleared the arm
          // in handleTouchMove, so dropped spells fire normally.
          if (isSpell && isFromTouch && !isCostPaymentMode && canPlay) {
            if (armedForCast.current) {
              disarmCast();
              onClick?.();
              return;
            }
            armForCast();
            return;
          }

          // Creatures (or non-touch spells): existing long-press preview
          // flow — a tap dismisses the description instead of firing.
          if (detailsOpenedByTouch.current) {
            detailsOpenedByTouch.current = false;
            setShowDetails(false);
            setIsHovered(false);
            if (detailTimer.current) clearTimeout(detailTimer.current);
            return;
          }
          if (isCostPaymentMode) {
            if (!isPendingCostSource) toggleDiscardSelection(cardInstance.instanceId);
          } else if (canPlay) {
            onClick?.();
          }
        }}
        style={{
          ...LONG_PRESS_RESET_STYLE,
          touchAction: "none",
          width: W, height: H, borderRadius: 8,
          position: isZoomed ? "absolute" : "relative",
          bottom: isZoomed ? 0 : undefined,
          left: isZoomed ? "50%" : undefined,
          transformOrigin: "bottom center",
          background: isCreature
            ? "linear-gradient(160deg, #1a1a2e, #0d0d1a)"
            : "linear-gradient(160deg, #1a0a2a, #0d0d1a)",
          border: `2px solid ${borderColor}`,
          boxShadow: isSelectedForDiscard ? "0 0 14px #e74c3c88"
            : (isCostPaymentMode && isPendingCostSource) ? "0 0 14px #c8a84e88"
            : isSelected ? "0 0 12px #c8a84e44"
            : (canPlay && !isCostPaymentMode) ? "0 0 12px #2ecc7166"
            : "none",
          // overflow: visible so the RarityFrame (inset: -4) can extend
          // past the card edges. The art div below now carries its own
          // border-radius + overflow: hidden to keep the image rounded.
          overflow: "visible",
          cursor: isCostPaymentMode
            ? (isPendingCostSource ? "default" : "pointer")
            : isDragging ? "grabbing" : canPlay ? "grab" : "not-allowed",
          opacity: isDragging ? 0.5 : (isCostPaymentMode || canPlay) ? 1 : 0.75,
          transition: "border-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease",
          transform: isZoomed ? "translateX(-50%)" : "none",
          zoom: isZoomed ? 1.3 : 1,
          zIndex: isZoomed ? 50 : 1,
        }}
      >
        {/* Rarity frame — fades in only on hover-zoom for non-Commune
            creatures. Sits behind the art (DOM order = paint order) so its
            metallic gradient is only visible as the 4-px ring around the
            card, not over the card body. */}
        {/* Concentric corners with the card's borderRadius:8 + border:2px
            require inset = 4 + border = 6, and borderRadius = inset +
            (card_radius - border) = 6 + 6 = 12. Visible ring outside the
            card edge is 4px. */}
        <RarityFrame
          rarity={card.rarity}
          visible={isZoomed && isCreature}
          inset={3}
          borderRadius={9}
        />

        {/* Inner clip-wrapper — replaces the inner card's overflow:hidden
            (lifted to allow the rarity frame to escape past the card edge).
            All card content (art, badges, bar, overlay) lives inside and
            gets clipped to the card's rounded corners. borderRadius:6
            matches the inner edge of the card's 2px border (8 outer − 2). */}
        <div style={{ position: "absolute", inset: 0, borderRadius: 6, overflow: "hidden" }}>

        {/* Full-bleed art */}
        <div style={{ position: "absolute", inset: 0 }}>
          {resolvedImageUrl ? (
            <Image
              src={resolvedImageUrl}
              alt={card.name}
              fill
              className="object-cover"
              sizes="(min-resolution: 2dppx) 600px, 300px"
              // Served directly from the Supabase CDN — card-art sources are
              // already small webp (≤800px) so the Next optimizer only added
              // dev-time queueing that left cards blank when many loaded at once.
              unoptimized
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


        {/* Cost badges (mana + life + discard + sacrifice) */}
        <CostBadges card={card} size={22} effectiveManaCost={effectiveManaCost} isCostReduced={isCostReduced} />

        {/* Cost-payment selection overlays */}
        {isSelectedForDiscard && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 4,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg, #e74c3c33, #00000022)",
            pointerEvents: "none",
          }}>
            <span style={{ fontSize: 60, color: "#e74c3c", filter: "drop-shadow(0 0 6px #000)" }}>✕</span>
          </div>
        )}
        {isCostPaymentMode && isPendingCostSource && (
          <div style={{
            position: "absolute", top: 4, right: 4, zIndex: 4,
            background: "#c8a84e", color: "#0d0d1a",
            fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 3,
            pointerEvents: "none",
          }}>EN JEU</div>
        )}

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
            {(card.keywords.length > 0 || (card.keyword_instances?.length ?? 0) > 0) && (() => {
              return buildKeywordDisplayEntries(card)
                .filter((e) => !isCreatureKwShadowedBySpell(e.kw, card.spell_keywords))
                .map((entry, idx) => {
                  const { kw, x, mode } = entry;
                  const hasImg = !!iconOverrides[kw];
                  const modeColor = keywordModeColor(mode);
                  const modeFilter = keywordModeFilter(mode);
                  // On a spell, keywords are CONFERRED — "all allies" gets a
                  // visible green chip behind the icon (a glow was clipped by
                  // overflow:hidden); single target keeps the default look.
                  const grantScope = card.card_type === "spell"
                    ? (card.keyword_instances?.find((k) => k.id === kw)?.grantScope ?? "target")
                    : null;
                  const isAllAllies = grantScope === "all_allies";
                  return (
                    <div key={`${kw}-${entry.instanceIdx ?? `legacy-${idx}`}`} style={{
                      minWidth: 24, height: 24, borderRadius: 3,
                      padding: x != null ? "0 2px" : 0,
                      background: isAllAllies ? "#27ae6055" : (hasImg ? "transparent" : `${accentColor}33`),
                      border: isAllAllies ? "1px solid #27ae60" : (hasImg ? "none" : `1px solid ${accentColor}66`),
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 1,
                      fontSize: 8, overflow: "hidden",
                    }}>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", filter: modeFilter ?? undefined, lineHeight: 0 }}>
                        {hasImg ? (
                          <div style={{ width: 24, height: 24, flexShrink: 0 }}>
                            <KeywordIcon symbol={KEYWORD_SYMBOLS[kw] || "✦"} size={14} keyword={kw} fill />
                          </div>
                        ) : (
                          <KeywordIcon symbol={KEYWORD_SYMBOLS[kw] || "✦"} size={14} keyword={kw} />
                        )}
                      </span>
                      {x != null && <span style={{ fontSize: 8, fontWeight: 900, color: modeColor ?? "#fff", fontFamily: "'Cinzel',serif", textShadow: `0 0 3px ${modeColor ?? accentColor}` }}>{toRoman(x)}</span>}
                    </div>
                  );
                });
            })()}

            {card.spell_keywords && card.spell_keywords.length > 0 && card.spell_keywords.map((spellKw, i) => {
              const def = SPELL_KEYWORDS[spellKw.id];
              if (!def) return null;
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
                minWidth: 24, height: 24, borderRadius: 3,
                padding: hasValue ? "0 2px" : 0,
                background: hasImg ? "transparent" : `${accentColor}33`,
                border: hasImg ? "none" : `1px solid ${accentColor}66`,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 0,
                fontSize: 8, overflow: "hidden",
              }}>
                {hasImg ? (
                  <div style={{ width: 24, height: 24, flexShrink: 0 }}>
                    <KeywordIcon symbol={SPELL_KEYWORD_SYMBOLS[spellKw.id] || "✦"} size={14} keyword={spellKey} fill />
                  </div>
                ) : (
                  <KeywordIcon symbol={SPELL_KEYWORD_SYMBOLS[spellKw.id] || "✦"} size={14} keyword={spellKey} />
                )}
                {valueText && <span style={{
                  fontSize: 8, fontWeight: 900, color: "#fff",
                  fontFamily: "'Cinzel',serif", textShadow: `0 0 3px ${accentColor}`,
                  marginLeft: -6,
                }}>{valueText}</span>}
              </div>
              );
            })}

            {/* Effets composés (sans cadre ; même gabarit icône+valeur que les keywords) */}
            {composedCapsOf(card.capabilities).map((cap, i) => {
              const ic = composedIcon(cap);
              const cfilter = keywordModeFilter(composedTriggerMode(cap));
              const val = composedValueText(cap);
              const tint = keywordModeColor(composedTriggerMode(cap)) ?? accentColor;
              const hasImg = !!iconOverrides[ic.keyword];
              return (
                <div key={`cx-${i}`} title={describeComposedCap(cap, tokenTemplates)} style={{
                  minWidth: 24, height: 24, padding: val ? "0 2px" : 0,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 1, overflow: "hidden",
                }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", filter: cfilter ?? undefined, lineHeight: 0 }}>
                    {hasImg ? (
                      <div style={{ width: 24, height: 24, flexShrink: 0 }}><KeywordIcon symbol={ic.symbol} size={14} keyword={ic.keyword} fill /></div>
                    ) : (
                      <KeywordIcon symbol={ic.symbol} size={14} keyword={ic.keyword} />
                    )}
                  </span>
                  {val && <span style={{ fontSize: 8, fontWeight: 900, color: keywordModeColor(composedTriggerMode(cap)) ?? "#fff", fontFamily: "'Cinzel',serif", textShadow: `0 0 3px ${tint}`, marginLeft: -3 }}>{val}</span>}
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
                  <span style={{ fontSize: 13, color: "#e74c3c", fontWeight: 700 }}>{displayAttack}</span>
                </div>
                <div style={{
                  display: "flex", alignItems: "center",
                  padding: "1px 5px", borderRadius: 4,
                  background: "#f1c40f18", border: "1px solid #f1c40f55",
                }}>
                  <span style={{ fontSize: 13, color: "#f1c40f", fontWeight: 700 }}>{displayHealth}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Hover overlay */}
        <div className="no-scrollbar" style={{
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
            fontSize: 9 * d, color: accentColor, fontWeight: 700,
            textAlign: "center", fontFamily: "'Cinzel', serif",
            borderBottom: `1px solid ${accentColor}44`, paddingBottom: 4,
          }}>{card.name}</div>

          {/* Race / Clan */}
          {(card.race || card.clan) && (
            <div style={{ display: "flex", justifyContent: "center", gap: 4, fontSize: 6 * d, color: "#888", fontFamily: "'Crimson Text',serif" }}>
              {card.race && <span>{card.race}</span>}
              {card.race && card.clan && <span style={{ color: "#555" }}>·</span>}
              {card.clan && <span style={{ fontStyle: "italic" }}>{card.clan}</span>}
            </div>
          )}

          {/* Year — affiché en bas-droit du popup, juste le nombre */}
          {card.card_year && (
            <div style={{
              position: "absolute", bottom: 4, right: 5, zIndex: 1,
              fontSize: 6, color: "#888", fontFamily: "'Crimson Text',serif",
              pointerEvents: "none",
            }}>
              {card.card_year}
            </div>
          )}

          {/* Capacités detail */}
          {(card.keywords.length > 0 || (card.keyword_instances?.length ?? 0) > 0) && (() => {
            const visible = buildKeywordDisplayEntries(card)
              .filter((e) => !isCreatureKwShadowedBySpell(e.kw, card.spell_keywords));
            if (visible.length === 0) return null;
            return (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {visible.map((entry, idx) => {
                const { kw, x, mode } = entry;
                const label = KEYWORD_LABELS[kw] || kw;
                const baseLabel = x != null
                  ? label.replace(/ X$/, ` ${toRoman(x)}`)
                  : kw === "entraide" && card.entraide_race
                    ? `${label} (${card.entraide_race})`
                    : label;
                const modeSuffix = mode === "death" ? " · à la mort" : mode === "tap" ? " · tap" : mode === "return" ? " · retour en main" : mode === "end_of_turn" ? " · fin du tour" : "";
                const displayLabel = baseLabel + modeSuffix;
                const forgeKey = KEYWORD_LABELS[kw];
                const kwDef = forgeKey ? keywordDefs[forgeKey] : null;
                let desc = kwDef?.desc ? (x != null ? kwDef.desc.replace(/X/g, String(x)) : kwDef.desc) : null;
                if (kw === "convocations_multiples" && card.convocation_tokens?.length) {
                  desc = `Invocation : crée ${formatConvocationTokens(card.convocation_tokens, tokenTemplates)}`;
                } else if (kw === "convocation" || kw === "convocation_simple") {
                  const tokenStr = formatConvocationToken(card.convocation_token_id, tokenTemplates, kw === "convocation" ? x : null);
                  if (tokenStr) desc = `Invocation : crée ${tokenStr}`;
                }
                const modeColor = keywordModeColor(mode);
                const modeFilter = keywordModeFilter(mode);
                return (
                <div key={`${kw}-${entry.instanceIdx ?? `legacy-${idx}`}`} style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                  <span style={{ flexShrink: 0, filter: modeFilter ?? undefined, lineHeight: 0 }}>
                    <KeywordIcon symbol={KEYWORD_SYMBOLS[kw] || "✦"} size={9} keyword={kw} />
                  </span>
                  <div>
                    <div style={{ fontSize: 7 * d, color: modeColor ?? accentColor, fontWeight: 600 }}>{displayLabel}</div>
                    {desc && <div style={{ fontSize: 6 * d, color: "#999", lineHeight: 1.3, fontFamily: "'Crimson Text',serif" }}>{desc}</div>}
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
                    <div style={{ fontSize: 7 * d, color: accentColor, fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 6 * d, color: "#999", lineHeight: 1.3, fontFamily: "'Crimson Text',serif" }}>{desc}</div>
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* Effets composés — détail (icône + texte généré) */}
          {composedCapsOf(card.capabilities).length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {composedCapsOf(card.capabilities).map((cap, i) => {
                const ic = composedIcon(cap);
                const cfilter = keywordModeFilter(composedTriggerMode(cap));
                return (
                  <div key={`cxd-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                    <span style={{ flexShrink: 0, filter: cfilter ?? undefined, lineHeight: 0 }}><KeywordIcon symbol={ic.symbol} size={9} keyword={ic.keyword} /></span>
                    <div style={{ fontSize: 6 * d, color: "#bbb", lineHeight: 1.3, fontFamily: "'Crimson Text',serif" }}>{describeComposedCap(cap, tokenTemplates)}</div>
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
              margin: 0, fontSize: 7 * d, color: "#ccc",
              lineHeight: 1.4, fontFamily: "'Crimson Text', serif",
            }}>{cleanEffectText(card.effect_text, card.spell_keywords)}</p>
          </div>
          )}

          {card.flavor_text && (
            <p style={{
              margin: 0, fontSize: 6 * d, color: "#74b9ff77",
              fontStyle: "italic", lineHeight: 1.3, fontFamily: "'Crimson Text', serif",
              textAlign: "center",
            }}>&ldquo;{card.flavor_text}&rdquo;</p>
          )}

          {/* Stats recap */}
          <div style={{
            display: "flex", justifyContent: "center", gap: 6,
            fontSize: 7 * d, color: "#555",
          }}>
            <span style={isCostReduced ? { color: "#2ecc71" } : undefined}>💧 {effectiveManaCost}</span>
            {isCreature && <><span style={{ color: "#e74c3c" }}>⚔ {displayAttack}</span><span style={{ color: "#f1c40f" }}>❤ {displayHealth}</span></>}
          </div>
        </div>
        </div>{/* close clip-wrapper */}
      </div>
      {touchGhostPos && typeof document !== "undefined" && createPortal(
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: W,
            height: H,
            transform: `translate(${touchGhostPos.x - W / 2}px, ${touchGhostPos.y - H / 2}px)`,
            pointerEvents: "none",
            zIndex: 9999,
            borderRadius: 8,
            border: `2px solid ${borderColor}`,
            background: isCreature
              ? "linear-gradient(160deg, #1a1a2e, #0d0d1a)"
              : "linear-gradient(160deg, #1a0a2a, #0d0d1a)",
            overflow: "hidden",
            opacity: 0.85,
            boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
          }}
        >
          {resolvedImageUrl && (
            // Use a plain <img> in the portal — Next/Image inside a fixed
            // overlay would need explicit sizes; this is a transient drag
            // ghost so a regular image is simpler and good enough.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolvedImageUrl}
              alt={card.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
        </div>,
        document.body
      )}
    </motion.div>
  );
}
