"use client";

import { useState } from "react";
import KeywordIcon from "@/components/shared/KeywordIcon";
import { KEYWORD_SYMBOLS, KEYWORD_LABELS } from "@/lib/game/keyword-labels";
import { describeComposedCap } from "@/lib/game/composed-display";
import type { Capability, Emblem } from "@/lib/game/types";

/** Bande des EMBLÈMES d'un joueur, sous son portrait.
 *
 *  Avant ce composant, les emblèmes étaient INVISIBLES : seul le pouvoir de
 *  héros en posait, et on ne les devinait que dans les stats des créatures.
 *  Tolérable pour une aura unique par partie ; intenable dès que n'importe
 *  quelle carte peut en créer, et surtout quand l'adversaire peut vous en poser
 *  un. Un effet permanent que personne ne voit n'est pas une mécanique, c'est
 *  une surprise. */
export default function EmblemStrip({
  emblems,
  align = "left",
}: {
  emblems: Emblem[] | undefined;
  align?: "left" | "right";
}) {
  const [survole, setSurvole] = useState<number | null>(null);
  if (!emblems?.length) return null;

  return (
    <div
      className="flex flex-wrap gap-1"
      style={{ justifyContent: align === "right" ? "flex-end" : "flex-start", maxWidth: 120 }}
    >
      {emblems.map((e, i) => {
        // Un emblème composé n'a pas de libellé propre : on réutilise la
        // description des capacités composées en l'enveloppant dans une
        // Capability minimale, seule forme qu'elle sait lire.
        const libelle = e.abilityId
          ? (KEYWORD_LABELS[e.abilityId as keyof typeof KEYWORD_LABELS] ?? e.abilityId)
          : describeComposedCap({
              uid: "", trigger: "on_end_of_turn", effectKind: "immediate",
              abilityId: "_composed", composed: e.composed,
            } as Capability);
        const montant = e.params?.amount ?? e.params?.attack;
        return (
          <div
            key={`${e.abilityId ?? "cx"}_${i}`}
            className="relative"
            onMouseEnter={() => setSurvole(i)}
            onMouseLeave={() => setSurvole(null)}
          >
            <div
              className="flex items-center gap-[2px] rounded px-[3px] py-[1px]"
              style={{
                background: "rgba(20,14,4,0.85)",
                border: "1px solid rgba(212,168,0,0.55)",
                boxShadow: "0 0 6px rgba(212,168,0,0.25)",
              }}
            >
              <KeywordIcon
                symbol={(e.abilityId && KEYWORD_SYMBOLS[e.abilityId as keyof typeof KEYWORD_SYMBOLS]) || "🏵️"}
                size={16}
                keyword={e.abilityId}
                fill
              />
              {montant != null && (
                <span style={{ fontSize: 11, fontWeight: 900, color: "#d4a800", fontFamily: "'Cinzel',serif" }}>
                  {montant}
                </span>
              )}
              {e.stacks > 1 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#e8d8a0" }}>×{e.stacks}</span>
              )}
              {/* ÉPHÉMÈRE : sans ce compteur, un emblème qui va disparaître est
                  indiscernable d'un permanent — et c'est justement l'information
                  qui change la décision du joueur. */}
              {e.duration != null && (
                <span
                  style={{
                    fontSize: 10, fontWeight: 800, color: "#0d0a03",
                    background: e.duration <= 1 ? "#e08a3c" : "#c9a227",
                    borderRadius: 3, padding: "0 3px", marginLeft: 1,
                  }}
                >
                  {e.duration}
                </span>
              )}
            </div>

            {survole === i && (
              <div
                className="absolute z-50 rounded px-2 py-1"
                style={{
                  top: "110%", left: 0, minWidth: 150, maxWidth: 240,
                  background: "rgba(12,8,2,0.97)",
                  border: "1px solid rgba(212,168,0,0.6)",
                  fontSize: 11, lineHeight: 1.35, color: "#f0e6cc", pointerEvents: "none",
                }}
              >
                <div style={{ fontWeight: 800, color: "#d4a800" }}>{libelle}</div>
                {e.stacks > 1 && <div>{e.stacks} exemplaires</div>}
                <div style={{ color: e.duration != null && e.duration <= 1 ? "#e08a3c" : undefined }}>
                  {e.duration == null
                    ? "Permanent"
                    : e.duration === 1 ? "Dernier tour" : `Encore ${e.duration} tours`}
                </div>
                {/* La source a pu disparaître depuis longtemps — c'est tout
                    l'intérêt d'un emblème, et la seule trace qu'il en reste. */}
                {e.sourceName && <div style={{ opacity: 0.75, fontStyle: "italic" }}>{e.sourceName}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
