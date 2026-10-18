"use client";

import { useState } from "react";
import KeywordIcon from "@/components/shared/KeywordIcon";
import { SPELL_KEYWORD_SYMBOLS } from "@/lib/game/spell-keywords";
import { composedIcon } from "@/lib/game/composed-display";
import { keywordModeColor } from "@/lib/game/keyword-labels";
import { useVocab } from "@/i18n/useVocab";
import type { DelayedSpell } from "@/lib/game/types";

const AMBRE = keywordModeColor("delay") ?? "#D4A373";

/** Bande des SORTS RETARDÉS d'un joueur (Retard X), sous son portrait, à côté
 *  des emblèmes : un jeton par effet en attente, avec les tours restants.
 *  Public — l'adversaire voit ce qui arrive et quand, le sort ayant de toute
 *  façon été révélé au lancement. */
export default function DelayedSpellStrip({
  spells,
  align = "left",
}: {
  spells: DelayedSpell[] | undefined;
  align?: "left" | "right";
}) {
  const vocab = useVocab();
  const [survole, setSurvole] = useState<string | null>(null);
  if (!spells?.length) return null;

  return (
    <div
      className="flex flex-wrap gap-1"
      style={{ justifyContent: align === "right" ? "flex-end" : "flex-start", maxWidth: 120 }}
    >
      {spells.map((d) => {
        // La vue du sort ne porte qu'UN effet : un mot-clé de sort ou une
        // capacité composée.
        const kw = d.card.spell_keywords?.[0];
        const cap = d.card.capabilities?.find((c) => c.composed);
        const icone = kw
          ? { symbol: SPELL_KEYWORD_SYMBOLS[kw.id] || "✦", keyword: `spell_${kw.id}` }
          : cap ? composedIcon(cap) : { symbol: "✦", keyword: "" };
        const effet = kw ? vocab.spellKeywordLabel(kw) : cap ? vocab.composedDesc(cap) : "";
        const dernier = d.turnsLeft <= 1;
        return (
          <div
            key={d.id}
            className="relative"
            onMouseEnter={() => setSurvole(d.id)}
            onMouseLeave={() => setSurvole(null)}
          >
            <div
              className="flex items-center gap-[2px] rounded px-[3px] py-[1px]"
              style={{
                background: "rgba(20,12,4,0.85)",
                border: `1px solid ${AMBRE}99`,
                boxShadow: `0 0 6px ${AMBRE}40`,
              }}
            >
              <div style={{ width: 20, height: 20, flexShrink: 0 }}>
                <KeywordIcon symbol={icone.symbol} size={20} keyword={icone.keyword} mode="delay" fill />
              </div>
              <span
                style={{
                  fontSize: 10, fontWeight: 800, color: "#0d0a03",
                  background: dernier ? "#e08a3c" : AMBRE,
                  borderRadius: 3, padding: "0 3px", marginLeft: 1,
                }}
              >
                ⏳{d.turnsLeft}
              </span>
            </div>

            {survole === d.id && (
              <div
                className="absolute z-50 rounded px-2 py-1"
                style={{
                  top: "110%", [align === "right" ? "right" : "left"]: 0, minWidth: 150, maxWidth: 240,
                  background: "rgba(12,8,2,0.97)",
                  border: `1px solid ${AMBRE}aa`,
                  fontSize: 11, lineHeight: 1.35, color: "#f0e6cc", pointerEvents: "none",
                }}
              >
                <div style={{ fontWeight: 800, color: AMBRE }}>⏳ {d.card.name}</div>
                {effet && <div>{effet}</div>}
                <div style={{ color: dernier ? "#e08a3c" : undefined }}>
                  {dernier ? "Au début du prochain tour" : `Dans ${d.turnsLeft} tours`}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
