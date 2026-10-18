"use client";

// Infobulle de survol des jetons de coût d'une carte (coûts additionnels, Éveil,
// équipement). Rendue dans un portail en `position: fixed` : la carte coupe ce
// qui déborde (overflow) et se zoome au survol, une bulle restée dedans serait
// rognée ou déformée — même parade que la consigne Safari du projet.
import React, { useState } from "react";
import { createPortal } from "react-dom";

// Même pile que HERALDRY_FONT (CardCounters), recopiée pour ne pas créer
// d'import circulaire : CardCounters importe ce module.
const TITLE_FONT = "var(--font-cinzel), 'Cinzel', Georgia, serif";

export interface CostHelpText {
  title: string;
  desc: string;
  extra?: string;
}

export function CostHelpBubble({ help, rect, note }: { help: CostHelpText; rect: DOMRect; note?: string }) {
  if (typeof document === "undefined") return null;
  // Au-dessus du jeton, sauf s'il n'y a pas la place (carte en haut d'écran).
  const dessous = rect.top < 140;
  const left = Math.min(Math.max(rect.left + rect.width / 2, 120), window.innerWidth - 120);
  return createPortal(
    <div
      role="tooltip"
      style={{
        position: "fixed", zIndex: 10000, pointerEvents: "none",
        left, top: dessous ? rect.bottom + 6 : rect.top - 6,
        transform: dessous ? "translateX(-50%)" : "translateX(-50%) translateY(-100%)",
        width: 220, padding: "6px 9px", borderRadius: 6,
        background: "rgba(14,10,4,0.96)", border: "1px solid rgba(201,162,39,0.7)",
        boxShadow: "0 4px 14px rgba(0,0,0,0.5)",
        color: "#f0e6cc", fontSize: 11, lineHeight: 1.35, textAlign: "left",
        fontFamily: "'Crimson Text',serif",
      }}
    >
      <div style={{ fontFamily: TITLE_FONT, fontWeight: 700, color: "#E3C463", fontSize: 12, marginBottom: 2 }}>{help.title}</div>
      <div>{help.desc}</div>
      {help.extra && <div style={{ marginTop: 3, color: "#FFD277" }}>{help.extra}</div>}
      {note && <div style={{ marginTop: 3, fontStyle: "italic", opacity: 0.8 }}>{note}</div>}
    </div>,
    document.body,
  );
}

/** Survol d'un jeton : la bulle part de son rectangle. Le clic n'est pas
 *  intercepté — sur une carte en main, cliquer le jeton joue toujours la carte. */
export function useHoverRect<K extends string>() {
  const [survol, setSurvol] = useState<{ key: K; rect: DOMRect } | null>(null);
  const props = (key: K) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => setSurvol({ key, rect: e.currentTarget.getBoundingClientRect() }),
    onMouseLeave: () => setSurvol((s) => (s?.key === key ? null : s)),
  });
  return { survol, props };
}
