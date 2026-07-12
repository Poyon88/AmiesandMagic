"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CardInstance } from "@/lib/game/types";
import { toRoman, parseXValuesFromEffectText, cleanEffectText } from "@/lib/game/keyword-labels";
import { isCreatureKwShadowedBySpell } from "@/lib/game/abilities";
import { composedCapsOf, composedIcon, composedKeywordName, composedTriggerMode, describeComposedCap } from "@/lib/game/composed-display";
import ComposedMarker from "@/components/cards/ComposedMarker";
import { useGameStore } from "@/lib/store/gameStore";
import { ALIGNMENTS, getEffectiveAlignment } from "@/lib/card-engine/constants";
import CardArt from "@/components/cards/CardArt";
import CostBadges from "@/components/cards/CostBadges";
import { useCardText } from "./CardTextProvider";
import { useVocab } from "@/i18n/useVocab";

interface CardPreviewProps {
  cardInstance: CardInstance;
  anchorRef: React.RefObject<HTMLElement | null>;
  position?: "above" | "below";
}

export default function CardPreview({ cardInstance, anchorRef, position = "above" }: CardPreviewProps) {
  const tokenTemplates = useGameStore((s) => s.tokenTemplates);
  const { localizeName } = useCardText();
  const vocab = useVocab();
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState({ left: 0, top: 0 });
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const previewW = 220;
  const previewH = 330;

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();

    let left = rect.left + rect.width / 2 - previewW / 2;
    let top: number;

    if (position === "above") {
      top = rect.top - previewH - 8;
      if (top < 8) top = rect.bottom + 8;
    } else {
      top = rect.bottom + 8;
      if (top + previewH > window.innerHeight - 8) top = rect.top - previewH - 8;
    }

    // Clamp horizontal
    if (left < 8) left = 8;
    if (left + previewW > window.innerWidth - 8) left = window.innerWidth - previewW - 8;

    setCoords({ left, top });
  }, [anchorRef, position]);

  if (!mounted) return null;

  const card = cardInstance.card;
  const isCreature = card.card_type === "creature";

  return createPortal(
    <div
      ref={previewRef}
      style={{
        position: "fixed",
        left: coords.left,
        top: coords.top,
        width: previewW,
        height: previewH,
        zIndex: 10001,
        pointerEvents: "none",
      }}
    >
      <div
        className={`
          w-full h-full rounded-xl border-2 flex flex-col overflow-hidden shadow-2xl
          ${isCreature ? "bg-card-bg border-card-border" : "bg-purple-900/80 border-purple-500/40"}
        `}
      >
        {/* Cost badges (mana + life + discard + sacrifice) */}
        <CostBadges card={card} size={32} />

        {/* Art */}
        <CardArt card={card} className="h-28" />

        {/* Name */}
        <div className="px-3 py-2 text-center border-b border-card-border/30">
          <h3 className="text-sm font-bold text-foreground leading-tight">
            {localizeName(card)}
          </h3>
          {(() => {
            const align = getEffectiveAlignment(card);
            if (!align) return null;
            const def = ALIGNMENTS.find(a => a.id === align);
            if (!def) return null;
            return (
              <div className="text-[10px] mt-0.5" style={{ color: def.color, fontWeight: 600 }}>
                {def.emoji} {def.label}
              </div>
            );
          })()}
        </div>

        {/* Effect */}
        <div className="px-3 py-2 flex-1">
          <p className="text-xs text-foreground/70 leading-relaxed">
            {cleanEffectText(card.effect_text, card.spell_keywords)}
          </p>
        </div>

        {/* Keywords */}
        {card.keywords.length > 0 && (() => {
          const xVals = parseXValuesFromEffectText(card.effect_text);
          const visibleKws = card.keywords.filter((kw) => !isCreatureKwShadowedBySpell(kw, card.spell_keywords));
          if (visibleKws.length === 0) return null;
          return (
          <div className="px-3 pb-1 flex gap-1 flex-wrap">
            {visibleKws.map((kw) => {
              const x = xVals[kw];
              const label = vocab.keywordLabel(kw);
              const displayLabel = x != null ? label.replace(/ X$/, ` ${toRoman(x)}`) : label;
              // On a spell, conferred keywords show their grant scope: green
              // text = all allies, default = single targeted creature.
              const grantAll = card.card_type === "spell"
                && (card.keyword_instances?.find((k) => k.id === kw)?.grantScope ?? "target") === "all_allies";
              return (
              <span key={kw}
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${grantAll ? "" : "bg-primary/20 text-primary"}`}
                style={grantAll ? { background: "rgba(39,174,96,0.2)", color: "#27ae60" } : undefined}
              >
                {displayLabel}
              </span>
              );
            })}
          </div>
          );
        })()}

        {/* Spell Keywords */}
        {card.spell_keywords && card.spell_keywords.length > 0 && (
          <div className="px-3 pb-1 flex gap-1 flex-wrap">
            {card.spell_keywords.map((spellKw, i) => {
              const displayLabel = vocab.spellKeywordLabel(spellKw);
              return (
              <span key={`sk_${i}`} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-medium">
                {displayLabel}
              </span>
              );
            })}
          </div>
        )}

        {/* Effets composés (modèle hybride) */}
        {composedCapsOf(card.capabilities).length > 0 && (
          <div className="px-3 pb-1 flex flex-col gap-1">
            {composedCapsOf(card.capabilities).map((cap, i) => {
              const nm = composedKeywordName(cap);
              return (
              <div key={`cx_${i}`} className="text-[10px] text-foreground/70 leading-snug flex gap-1.5 items-start">
                <span className="flex-shrink-0 relative inline-block">{composedIcon(cap).symbol}<ComposedMarker mode={composedTriggerMode(cap)} size={6} /></span>
                <div>
                  {nm && <div className="text-am-gold font-semibold">{nm}</div>}
                  <div>{describeComposedCap(cap, tokenTemplates)}</div>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* Stats */}
        {isCreature ? (
          <div className="flex justify-between px-3 py-2">
            <span className="w-9 h-9 rounded-lg bg-attack-red flex items-center justify-center text-background font-bold text-lg">
              {cardInstance.currentAttack}
            </span>
            <span
              className={`w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-lg ${
                cardInstance.currentHealth < cardInstance.maxHealth
                  ? "bg-accent"
                  : cardInstance.currentHealth > (card.health ?? 0)
                  ? "bg-green-500"
                  : "bg-health-yellow"
              }`}
            >
              {cardInstance.currentHealth}
            </span>
          </div>
        ) : (
          <div className="text-center py-2">
            <span className="text-xs text-purple-300/60 uppercase font-medium tracking-wider">
              Spell
            </span>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
