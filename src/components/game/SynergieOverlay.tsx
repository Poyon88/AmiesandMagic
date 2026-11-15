"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { GameState, Keyword } from "@/lib/game/types";
import { CAPACITES_SYNERGISABLES } from "@/lib/game/abilities";
import { getCapabilities } from "@/lib/game/capability-adapter";
import { composedIcon } from "@/lib/game/composed-display";
import { KEYWORD_LABELS, KEYWORD_SYMBOLS } from "@/lib/game/keyword-labels";
import { SPELL_KEYWORD_LABELS, SPELL_KEYWORD_SYMBOLS } from "@/lib/game/spell-keywords";
import { useVocab } from "@/i18n/useVocab";
import KeywordIcon from "@/components/shared/KeywordIcon";

/** Nom affichable d'une capacité, sans son « X » : on choisit la capacité, pas
 *  une de ses valeurs. */
function nomBrut(id: string): string {
  const brut = KEYWORD_LABELS[id as Keyword] ?? SPELL_KEYWORD_LABELS[id as keyof typeof SPELL_KEYWORD_LABELS] ?? id;
  return brut.replace(/\s*[+-]?X(\/[+-]?Y)?$/, "").trim();
}
const symboleDe = (id: string) =>
  KEYWORD_SYMBOLS[id as Keyword] ?? SPELL_KEYWORD_SYMBOLS[id as keyof typeof SPELL_KEYWORD_SYMBOLS] ?? "✦";

/** Capacités synergisables portées par une carte EN JEU (les deux plateaux),
 *  effets composés compris, sous le nom que la carte affiche. */
export function capacitesEnJeu(gs: GameState): Set<string> {
  const ids = new Set<string>();
  for (const p of gs.players) for (const c of p.board) {
    for (const cap of getCapabilities(c.card)) {
      const id = cap.composed ? composedIcon(cap).keyword.replace(/^spell_/, "") : cap.abilityId;
      if (CAPACITES_SYNERGISABLES.has(id)) ids.add(id);
    }
  }
  return ids;
}

/** SYNERGIE — le propriétaire choisit la capacité que sa créature surveille.
 *  Aucune sortie : comme tout déclencheur en attente, le choix est obligatoire
 *  et le chrono tranche au hasard si le joueur ne répond pas. */
export default function SynergieOverlay({ gameState, onChoose }: {
  gameState: GameState;
  onChoose: (abilityId: string) => void;
}) {
  const t = useTranslations("game");
  const vocab = useVocab();
  const [recherche, setRecherche] = useState("");

  const toutes = useMemo(() => {
    const libelle = (id: string) => {
      const viaVocab = KEYWORD_LABELS[id as Keyword] ? vocab.keywordLabel(id as Keyword) : null;
      return (viaVocab ?? nomBrut(id)).replace(/\s*[+-]?X(\/[+-]?Y)?$/, "").trim();
    };
    return [...CAPACITES_SYNERGISABLES]
      .map((id) => ({ id, nom: libelle(id) }))
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [vocab]);
  const enJeu = useMemo(() => capacitesEnJeu(gameState), [gameState]);

  const filtre = recherche.trim().toLowerCase();
  const visibles = toutes.filter((c) => !filtre || c.nom.toLowerCase().includes(filtre));
  const groupes = [
    { titre: t("synergie_in_play"), items: visibles.filter((c) => enJeu.has(c.id)) },
    { titre: t("synergie_others"), items: visibles.filter((c) => !enJeu.has(c.id)) },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "min(92vw, 720px)", maxHeight: "86vh" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", fontFamily: "'Cinzel', serif", textAlign: "center", textShadow: "0 2px 8px rgba(0,0,0,0.95)" }}>
          🧬 {t("synergie_title")}
        </div>
        <p style={{ fontSize: 14, color: "#bbb", textAlign: "center", fontFamily: "'Crimson Text', serif", marginTop: -6 }}>
          {t("synergie_subtitle")}
        </p>
        <input
          autoFocus
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={t("synergie_search")}
          aria-label={t("synergie_search")}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #444", background: "#141423", color: "#fff", fontSize: 14 }}
        />
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingRight: 4 }}>
          {groupes.map((g) => (
            <div key={g.titre}>
              <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#d4a800", fontFamily: "'Cinzel', serif", marginBottom: 6 }}>
                {g.titre}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
                {g.items.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onChoose(c.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8,
                      background: "#141423", border: "1px solid #333", color: "#eee", cursor: "pointer",
                      fontFamily: "'Cinzel', serif", fontSize: 12, textAlign: "left",
                    }}
                  >
                    <KeywordIcon symbol={symboleDe(c.id)} keyword={c.id} size={22} />
                    <span>{c.nom}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {groupes.length === 0 && <p style={{ color: "#999", textAlign: "center", fontSize: 13 }}>{t("synergie_none")}</p>}
        </div>
      </div>
    </div>
  );
}
