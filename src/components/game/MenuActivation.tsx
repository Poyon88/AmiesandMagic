"use client";

// MENU D'ACTIVATION — une créature qui porte PLUSIEURS pouvoirs activables
// (mots-clés « tap », effets composés « à l'activation », sort appris) laisse le
// joueur choisir lequel utiliser. Une seule activation par tour : l'activation
// engage la créature, quel que soit le pouvoir choisi.
//
// Le menu ne décide de rien : chaque option rappelle le chemin d'activation
// existant (ciblage, coûts et envoi compris), exactement comme le bouton le
// faisait pour le premier pouvoir.

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import KeywordIcon from "@/components/shared/KeywordIcon";
import { useVocab } from "@/i18n/useVocab";
import { useCardText } from "./CardTextProvider";
import { composedIcon } from "@/lib/game/composed-display";
import { KEYWORD_SYMBOLS, applyKeywordValueToLabel, keywordIconFor } from "@/lib/game/keyword-labels";
import type { PouvoirActivable } from "@/lib/game/engine";
import type { CardInstance } from "@/lib/game/types";

interface Option {
  key: string;
  label: string;
  desc: string | null;
  icon: { symbol: string; keyword?: string };
  pouvoir: PouvoirActivable;
}

export default function MenuActivation({ creature, pouvoirs, onPick, onClose }: {
  creature: CardInstance;
  pouvoirs: PouvoirActivable[];
  onPick: (p: PouvoirActivable) => void;
  onClose: () => void;
}) {
  const t = useTranslations("game");
  const vocab = useVocab();
  const { localizeName } = useCardText();
  const ref = useRef<HTMLDivElement>(null);
  const card = creature.card;

  // Nom, phrase et icône de chaque pouvoir, comme sur la carte.
  const options: Option[] = pouvoirs.map((p) => {
    if (p.kind === "keyword") {
      const kw = p.instance.id;
      const ctx = { card, instance: p.instance, x: p.instance.x };
      return {
        key: `kw-${p.instanceIdx}`,
        label: applyKeywordValueToLabel(kw, vocab.keywordLabelFor(kw, ctx), p.instance.x, p.instance),
        desc: vocab.keywordDesc(kw, ctx),
        icon: keywordIconFor(kw, p.instance),
        pouvoir: p,
      };
    }
    if (p.kind === "composed") {
      const ic = composedIcon(p.cap);
      return { key: `cx-${p.uid}`, label: vocab.composedName(p.cap) || ic.symbol, desc: vocab.composedDesc(p.cap), icon: ic, pouvoir: p };
    }
    const sort = creature.apprentissageSpell?.card;
    return {
      key: "learned",
      label: t("activation_learned", { name: sort ? localizeName(sort) : "" }),
      desc: null,
      icon: { symbol: KEYWORD_SYMBOLS.apprentissage ?? "📖", keyword: "apprentissage" },
      pouvoir: p,
    };
  });

  // Fermeture au clic extérieur et à Échap. `pointerdown` plutôt que `click` :
  // le clic qui a ouvert le menu ne doit pas le refermer aussitôt.
  useEffect(() => {
    const dehors = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const echap = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={t("activation_menu_title")}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        bottom: "calc(100% + 26px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 30,
        width: 220,
        padding: 6,
        background: "linear-gradient(180deg, #1d1a10 0%, #0f0d07 100%)",
        border: "1px solid #8a6d00",
        borderRadius: 10,
        boxShadow: "0 0 14px rgba(255, 215, 0, 0.35), 0 6px 16px rgba(0,0,0,0.6)",
        cursor: "default",
      }}
    >
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: 9, fontWeight: 700, letterSpacing: 1, color: "#ffd700", textAlign: "center", padding: "2px 0 6px" }}>
        {t("activation_menu_title")}
      </div>
      {options.map((o) => (
        <button
          key={o.key}
          role="menuitem"
          onClick={(e) => { e.stopPropagation(); onPick(o.pouvoir); }}
          style={{
            display: "flex", alignItems: "flex-start", gap: 6, width: "100%", textAlign: "left",
            padding: "5px 6px", marginTop: 2, borderRadius: 6, border: "1px solid transparent",
            background: "rgba(255, 215, 0, 0.06)", color: "#eee", cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#d4a800"; e.currentTarget.style.background = "rgba(255, 215, 0, 0.16)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "rgba(255, 215, 0, 0.06)"; }}
        >
          <span style={{ flexShrink: 0, display: "inline-flex", lineHeight: 0, marginTop: 1 }}>
            <KeywordIcon symbol={o.icon.symbol} keyword={o.icon.keyword} mode="tap" size={16} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#F68D09" }}>{o.label}</span>
            {o.desc && <span style={{ display: "block", fontSize: 10, lineHeight: 1.3, color: "#ccc", fontFamily: "'Crimson Text',serif" }}>{o.desc}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
