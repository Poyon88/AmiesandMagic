"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import useLongPress from "@/hooks/useLongPress";
import { overlayRect } from "@/lib/fx/overlayMotion";
import type { OrbitSide } from "./orbit-geometry";

/** Bulle UNIQUE de l'orbite : libellé + ligne d'aide d'un élément.
 *
 *  Ouverte au survol (souris) ou à l'APPUI LONG (iPad) — l'ancienne bande
 *  d'emblèmes n'écoutait que `onMouseEnter`, ses infobulles n'existaient donc
 *  pas sur tablette. Sur le plateau, l'orbite ne montre que des formes. */

export interface Bulle {
  key: string;
  rect: { left: number; top: number; width: number; height: number };
  content: React.ReactNode;
  /** Contenu NU (une carte) : ni cadre ni texte, et calé en hauteur pour rester
   *  dans l'écran — au-dessus de l'élément pour mon héros (bas d'écran), en
   *  dessous pour celui d'en face (haut d'écran). */
  nu?: boolean;
}

/** État de la bulle d'une orbite, et poignées à poser sur chaque élément. */
export function useOrbitBulle() {
  const [bulle, setBulle] = useState<Bulle | null>(null);
  const ouvrir = useCallback((key: string, el: Element, content: React.ReactNode, nu?: boolean) => {
    setBulle({ key, rect: overlayRect(el), content, nu });
  }, []);
  const fermer = useCallback((key?: string) => {
    setBulle(b => (key == null || b?.key === key ? null : b));
  }, []);

  // Tactile : la bulle ouverte par appui long se referme au prochain toucher.
  useEffect(() => {
    if (!bulle) return;
    const close = () => setBulle(null);
    const t = setTimeout(() => document.addEventListener("touchstart", close, { once: true }), 0);
    return () => { clearTimeout(t); document.removeEventListener("touchstart", close); };
  }, [bulle]);

  return { bulle, ouvrir, fermer };
}

/** Poignées d'un élément d'orbite : survol + appui long ouvrent la bulle ;
 *  `consume()` à appeler en tête de `onClick` pour avaler le tap qui suit un
 *  appui long (sinon il dépenserait le compteur). */
export function useBulleHandlers(
  key: string,
  content: () => React.ReactNode,
  api: Pick<ReturnType<typeof useOrbitBulle>, "ouvrir" | "fermer">,
  nu?: boolean,
) {
  // L'élément est tenu en ÉTAT (callback ref) et non en `useRef` : les poignées
  // sont étalées pendant le rendu, où la lecture d'un ref est proscrite.
  const [el, setEl] = useState<HTMLElement | null>(null);
  const lp = useLongPress(() => { if (el) api.ouvrir(key, el, content(), nu); });
  // Élément DÉMONTÉ sous le curseur (Machine prise : l'engrenage disparaît au
  // clic) : `onMouseLeave` ne part jamais et la bulle restait à l'écran.
  const { fermer } = api;
  useEffect(() => () => fermer(key), [fermer, key]);
  return {
    attacher: setEl,
    consume: lp.consume,
    handlers: {
      ...lp.handlers,
      onMouseEnter: (e: React.MouseEvent) => api.ouvrir(key, e.currentTarget, content(), nu),
      onMouseLeave: () => api.fermer(key),
    },
  };
}

export default function OrbitTooltip({ bulle, side }: { bulle: Bulle | null; side: OrbitSide }) {
  if (!bulle || typeof document === "undefined") return null;
  const { rect } = bulle;
  if (bulle.nu) {
    const mine = side === "mine";
    return createPortal(
      <div role="tooltip" style={{
        position: "fixed", zIndex: 210, pointerEvents: "none",
        left: mine ? rect.left - 10 : rect.left + rect.width + 10,
        top: mine ? rect.top + rect.height : rect.top,
        transform: mine ? "translate(-100%, -100%)" : undefined,
        filter: "drop-shadow(0 10px 26px rgba(0,0,0,0.75))",
      }}>
        {bulle.content}
      </div>,
      document.body,
    );
  }
  // Côté PLATEAU, comme l'orbite : à gauche de mon héros, à droite du sien.
  const style: React.CSSProperties = side === "mine"
    ? { left: rect.left - 10, transform: "translate(-100%, -50%)" }
    : { left: rect.left + rect.width + 10, transform: "translate(0, -50%)" };
  return createPortal(
    <div
      role="tooltip"
      key={bulle.key}
      ref={garderDansLEcran}
      style={{
        position: "fixed",
        top: rect.top + rect.height / 2,
        ...style,
        zIndex: 210,
        pointerEvents: "none",
        minWidth: 160,
        maxWidth: 260,
        padding: "8px 11px",
        borderRadius: 6,
        background: "rgba(14, 11, 6, 0.97)",
        border: "1px solid color-mix(in srgb, var(--am-gold) 65%, transparent)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
        color: "#efe6cf",
        fontFamily: "var(--font-crimson), serif",
        fontSize: 13,
        lineHeight: 1.35,
      }}
    >
      {bulle.content}
    </div>,
    document.body,
  );
}

/** Bulle centrée sur l'élément mais HAUTE (emblème + carte source) : recalée
 *  pour ne pas sortir de la fenêtre, en haut comme en bas. */
function garderDansLEcran(el: HTMLDivElement | null) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const marge = 8;
  let dy = 0;
  if (r.bottom > window.innerHeight - marge) dy = window.innerHeight - marge - r.bottom;
  if (r.top + dy < marge) dy = marge - r.top;
  if (dy) el.style.top = `${parseFloat(el.style.top) + dy}px`;
}

/** Mise en forme commune : titre en petites capitales dorées, puis lignes. */
export function BulleTexte({ titre, lignes }: { titre: string; lignes: Array<React.ReactNode | null | false | undefined> }) {
  return (
    <>
      <div
        style={{
          fontFamily: "var(--font-cinzel), serif",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--am-gold)",
          marginBottom: 2,
        }}
      >
        {titre}
      </div>
      {lignes.filter(Boolean).map((l, i) => <div key={i}>{l}</div>)}
    </>
  );
}
