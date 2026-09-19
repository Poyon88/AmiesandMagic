"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Capability } from "@/lib/game/types";
import type { AlternativeOption } from "@/lib/store/gameStore";
import { useGameStore } from "@/lib/store/gameStore";
import { useVocab } from "@/i18n/useVocab";
import { composedIcon, composedTriggerMode } from "@/lib/game/composed-display";
import { keywordModeColor } from "@/lib/game/keyword-labels";
import KeywordIcon from "@/components/shared/KeywordIcon";

interface ChoixOuOverlayProps {
  options: AlternativeOption[];
  onChoose: (capUid: string) => void;
}

/** « OU » — le contrôleur désigne LAQUELLE des branches de la carte se résout.
 *
 *  L'effet de chaque branche voyage avec le déclencheur : la modale n'a donc
 *  besoin ni de la carte ni du plateau, ce qui la rend valable pour un sort
 *  (dont l'instance a déjà quitté la main) comme pour un râle d'agonie (dont la
 *  source est au cimetière).
 *
 *  Aucune sortie : la question est obligatoire, comme tout déclencheur en
 *  attente. Le chrono de choix tranche au hasard si le joueur ne répond pas. */
export default function ChoixOuOverlay({ options, onChoose }: ChoixOuOverlayProps) {
  const t = useTranslations("game");
  const vocab = useVocab();
  const tokenTemplates = useGameStore((s) => s.tokenTemplates);
  const [survolee, setSurvolee] = useState<string | null>(null);

  /** Capacité reconstituée pour les helpers d'affichage (icône, nom, phrase). */
  const capDe = (o: AlternativeOption): Capability => ({
    uid: o.capUid, trigger: "spell_resolution", effectKind: "immediate",
    abilityId: "_composed", composed: o.composed,
  });

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, maxWidth: 760, width: "92%" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", fontFamily: "'Cinzel', serif", textAlign: "center", textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
          {t('choix_ou_title')}
        </div>
        <p style={{ fontSize: 14, color: "#bbb", textAlign: "center", fontFamily: "'Crimson Text', serif", marginTop: -12 }}>
          {t('choix_ou_subtitle')}
        </p>

        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", width: "100%" }}>
          {options.map((o, i) => {
            const cap = capDe(o);
            const ic = composedIcon(cap);
            const mode = composedTriggerMode(cap);
            const teinte = keywordModeColor(mode) ?? "#d4a800";
            const actif = survolee === o.capUid;
            return (
              <div key={`${o.capUid}-${i}`} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <button
                  onClick={() => onChoose(o.capUid)}
                  onMouseEnter={() => setSurvolee(o.capUid)}
                  onMouseLeave={() => setSurvolee(null)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                    padding: "18px 20px", borderRadius: 12, cursor: "pointer",
                    minWidth: 210, maxWidth: 300,
                    background: actif ? "#1a1a2e" : "#141423",
                    border: `2px solid ${actif ? teinte : "#333"}`,
                    boxShadow: actif ? `0 0 18px ${teinte}66` : "0 4px 18px rgba(0,0,0,0.45)",
                    transition: "all 0.15s",
                  }}
                >
                  <KeywordIcon symbol={ic.symbol} size={34} keyword={ic.keyword} mode={mode} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: teinte, fontFamily: "'Cinzel',serif", textAlign: "center" }}>
                    {vocab.composedName(cap)}
                  </span>
                  <span style={{ fontSize: 12, color: "#ccc", lineHeight: 1.4, fontFamily: "'Crimson Text',serif", textAlign: "center" }}>
                    {vocab.composedDesc(cap, tokenTemplates)}
                  </span>
                </button>
                {/* Le « / » des cartes, repris ici : c'est le même langage. */}
                {i < options.length - 1 && (
                  <span style={{ fontSize: 26, color: "#777", fontWeight: 700, fontFamily: "'Cinzel',serif" }}>/</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
