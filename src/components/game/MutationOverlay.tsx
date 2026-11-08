"use client";

// MUTATION X — les quatre choix, enchaînés côté client puis envoyés en UNE
// action (`mutate_card`) : Découverte 1, Découverte 2, capacité léguée par la
// 1re élue, capacité léguée par la 2e. Rien n'est envoyé avant le dernier
// choix : annuler (bouton, Échap, fin du tour) laisse la carte intacte, et les
// offres étant semées sur l'instance, la relancer redonne les mêmes cartes.

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import GameCard from "@/components/cards/GameCard";
import KeywordIcon from "@/components/shared/KeywordIcon";
import { useGameStore } from "@/lib/store/gameStore";
import { useVocab } from "@/i18n/useVocab";
import { composedIcon } from "@/lib/game/composed-display";
import { applyKeywordValueToLabel, keywordIconFor } from "@/lib/game/keyword-labels";
import { modeForCreatureTrigger } from "@/lib/game/capability-adapter";
import { mutationCapacites, mutationOffer, mutationX } from "@/lib/game/mutation";
import type { Capability, Card, CardInstance, Keyword, KeywordInstance, MutateCardAction } from "@/lib/game/types";

interface Props {
  carte: CardInstance;
  pool: Card[] | undefined;
  onConfirm: (action: MutateCardAction) => void;
  onCancel: () => void;
}

/** Instance de mot-clé décrivant la capacité (pour le libellé et l'icône). */
function instanceDe(source: Card, cap: Capability): KeywordInstance {
  const kw = cap.abilityId as Keyword;
  const mode = modeForCreatureTrigger(cap.trigger);
  const trouvee = source.keyword_instances?.find((k) => k.id === kw && k.mode === mode);
  if (trouvee) return trouvee;
  return { id: kw, ...(mode ? { mode } : {}), ...(cap.params?.x != null ? { x: cap.params.x } : {}), ...(cap.params?.y != null ? { y: cap.params.y } : {}) };
}

function ChoixCapacite({ source, onPick }: { source: Card; onPick: (uid: string) => void }) {
  const vocab = useVocab();
  const options = mutationCapacites(source).map((cap) => {
    if (cap.composed) {
      const ic = composedIcon(cap);
      return { uid: cap.uid, label: vocab.composedName(cap) || ic.symbol, desc: vocab.composedDesc(cap), icon: ic, mode: modeForCreatureTrigger(cap.trigger) };
    }
    const inst = instanceDe(source, cap);
    const kw = inst.id;
    const ctx = { card: source, instance: inst, x: inst.x };
    return {
      uid: cap.uid,
      label: applyKeywordValueToLabel(kw, vocab.keywordLabelFor(kw, ctx), inst.x, inst),
      desc: vocab.keywordDesc(kw, ctx),
      icon: keywordIconFor(kw, inst),
      mode: inst.mode,
    };
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 300 }}>
      {options.map((o) => (
        <button
          key={o.uid}
          onClick={() => onPick(o.uid)}
          style={{
            display: "flex", alignItems: "flex-start", gap: 8, textAlign: "left",
            padding: "8px 10px", borderRadius: 8, border: "1px solid #6b4fa0",
            background: "rgba(168, 85, 247, 0.10)", color: "#eee", cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(168, 85, 247, 0.28)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(168, 85, 247, 0.10)"; }}
        >
          <span style={{ flexShrink: 0, display: "inline-flex", lineHeight: 0, marginTop: 1 }}>
            <KeywordIcon symbol={o.icon.symbol} keyword={o.icon.keyword} mode={o.mode} size={20} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#d8b4fe" }}>{o.label}</span>
            {o.desc && <span style={{ display: "block", fontSize: 12, lineHeight: 1.3, color: "#ccc", fontFamily: "'Crimson Text',serif" }}>{o.desc}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function MutationOverlay({ carte, pool, onConfirm, onCancel }: Props) {
  const t = useTranslations("game");
  const tokenTemplates = useGameStore((s) => s.tokenTemplates);
  const [a, setA] = useState<Card | null>(null);
  const [b, setB] = useState<Card | null>(null);
  const [capA, setCapA] = useState<string | null>(null);
  const [survol, setSurvol] = useState<number | null>(null);

  const x = mutationX(carte.card);
  const offre1 = useMemo(() => mutationOffer(pool, x, carte.instanceId, 1), [pool, x, carte.instanceId]);
  const offre2 = useMemo(() => (a ? mutationOffer(pool, x, carte.instanceId, 2, a.id) : []), [pool, x, carte.instanceId, a]);

  // Une créature qui n'a qu'une capacité la lègue sans qu'on la demande.
  const seule = (c: Card | null) => {
    const caps = c ? mutationCapacites(c) : [];
    return caps.length === 1 ? caps[0].uid : null;
  };
  const capAEffective = capA ?? seule(a);

  const etape: 1 | 2 | 3 | 4 = !a ? 1 : !b ? 2 : !capAEffective ? 3 : 4;

  const confirmer = (uidB: string) => {
    if (!a || !b || !capAEffective) return;
    onConfirm({ type: "mutate_card", cardInstanceId: carte.instanceId, creatureIds: [a.id, b.id], capUids: [capAEffective, uidB] });
  };

  // Les deux capacités connues : envoi immédiat (dernière étape sautée).
  useEffect(() => {
    if (etape === 4 && b) {
      const uidB = seule(b);
      if (uidB) confirmer(uidB);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etape, b]);

  useEffect(() => {
    const echap = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [onCancel]);

  const titre = etape <= 2 ? t("mutation_discover", { n: etape }) : t("mutation_pick_ability", { n: etape - 2 });
  const offre = etape === 1 ? offre1 : offre2;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", fontFamily: "'Cinzel', serif", textAlign: "center", textShadow: "0 2px 8px rgba(0,0,0,0.95)" }}>
          🧬 {titre}
        </div>
        <p style={{ fontSize: 14, color: "#bbb", textAlign: "center", fontFamily: "'Crimson Text', serif", marginTop: -10 }}>
          {etape <= 2 ? t("mutation_discover_subtitle", { x }) : t("mutation_pick_subtitle")}
        </p>

        {etape <= 2 && (
          offre.length === 0 ? (
            <p style={{ color: "#f87171", fontFamily: "'Crimson Text', serif" }}>{t("mutation_empty")}</p>
          ) : (
            <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
              {offre.map((card, i) => (
                <div
                  key={card.id}
                  onClick={() => (etape === 1 ? setA(card) : setB(card))}
                  onMouseEnter={() => setSurvol(i)}
                  onMouseLeave={() => setSurvol(null)}
                  style={{
                    cursor: "pointer", borderRadius: 12, transition: "all 0.2s ease",
                    transform: survol === i ? "translateY(-12px) scale(1.05)" : "none",
                    border: survol === i ? "2px solid #a855f7" : "2px solid transparent",
                    boxShadow: survol === i ? "0 0 20px #a855f766" : "0 4px 12px rgba(0,0,0,0.3)",
                  }}
                >
                  <GameCard card={card} size="md" tokens={tokenTemplates} />
                </div>
              ))}
            </div>
          )
        )}

        {etape >= 3 && (
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            <GameCard card={(etape === 3 ? a : b)!} size="md" tokens={tokenTemplates} />
            <ChoixCapacite
              key={etape}
              source={(etape === 3 ? a : b)!}
              onPick={(uid) => (etape === 3 ? setCapA(uid) : confirmer(uid))}
            />
          </div>
        )}

        <button
          onClick={onCancel}
          style={{ padding: "6px 18px", borderRadius: 8, border: "1px solid #666", background: "rgba(0,0,0,0.5)", color: "#ddd", cursor: "pointer", fontFamily: "'Cinzel', serif", fontSize: 12 }}
        >
          {t("mutation_cancel")}
        </button>
      </div>
    </div>
  );
}
