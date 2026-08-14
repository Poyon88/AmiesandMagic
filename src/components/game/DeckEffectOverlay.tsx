"use client";

// Badge des effets « deck » SILENCIEUX — Préincanter et Fortifier.
//
// Ces deux capacités préparent une carte DANS le deck : rien à l'écran ne disait
// qu'elles avaient agi, ni au joueur ni à l'adversaire. Un badge s'élève donc de
// la pile de deck concernée, avec l'amplitude réellement accordée.
//
// Ce qu'il ne fait PAS, volontairement : révéler la carte visée. La capacité tient
// à ne pas divulguer le sommet du deck, et l'animation respecte ce choix — elle
// dit QU'il s'est passé quelque chose, jamais SUR QUOI.
//
// Ancré sur `[data-cycle-deck]`, la même ancre que l'exil et Cycle éternel : une
// seule convention pour tout ce qui s'anime au deck.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { DeckEffectEvent } from "@/lib/store/gameStore";
import { overlayRect } from "@/lib/fx/overlayMotion";

interface Props {
  event: DeckEffectEvent | null;
  onComplete: () => void;
}

const DURATION_MS = 1500;

/** Apparence par capacité. Les teintes reprennent celles des icônes de la forge :
 *  Préincanter est une bougie (or chaud), Fortifier une enclume (bronze). */
const APPARENCE = {
  preincanter: { glyphe: "🕯️", teinte: "#f1c40f", halo: "rgba(241,196,15,0.55)" },
  fortifier: { glyphe: "🛠️", teinte: "#e08a3c", halo: "rgba(224,138,60,0.55)" },
} as const;

/** Centre de la pile de deck visée, ou null si elle n'est pas montée.
 *  `overlayRect` corrige le zoom CSS et les coordonnées Safari — indispensable
 *  sur iPad, où un getBoundingClientRect brut décale l'ancrage. */
function ancreDeck(isLocal: boolean): { x: number; y: number } | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(isLocal ? '[data-cycle-deck="my"]' : '[data-cycle-deck="opponent"]');
  if (!el) return null;
  const r = overlayRect(el);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export default function DeckEffectOverlay({ event, onComplete }: Props) {
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);

  // Ancre calculée à l'arrivée de l'événement, et re-calculée si l'événement
  // change : la pile ne bouge pas, mais un remontage (rotation, resize) oui.
  const ancre = useMemo(
    () => (event ? ancreDeck(event.isLocal) : null),
    [event],
  );

  useEffect(() => {
    if (!event) return;
    const t = setTimeout(onComplete, DURATION_MS);
    return () => clearTimeout(t);
  }, [event, onComplete]);

  if (!monte || !event || !ancre) return null;

  const { glyphe, teinte, halo } = APPARENCE[event.abilityId];
  // Préincanter retire du mana (« −2 »), Fortifier ajoute des stats (« +2/+1 »).
  const valeur = event.abilityId === "preincanter"
    ? `−${event.x}`
    : `+${event.x}/+${event.y}`;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key={event.timestamp}
        initial={{ opacity: 0, y: 0, scale: 0.8 }}
        animate={{ opacity: [0, 1, 1, 0], y: -46, scale: 1 }}
        transition={{ duration: DURATION_MS / 1000, times: [0, 0.18, 0.7, 1], ease: "easeOut" }}
        style={{
          position: "fixed",
          left: ancre.x,
          top: ancre.y,
          transform: "translate(-50%, -50%)",
          zIndex: 70,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 11px",
          borderRadius: 999,
          border: `1px solid ${teinte}`,
          background: "rgba(12,10,20,0.86)",
          boxShadow: `0 0 16px ${halo}`,
          fontFamily: "var(--font-cinzel), serif",
          fontWeight: 700,
          fontSize: 15,
          color: teinte,
          whiteSpace: "nowrap",
        }}
      >
        <span aria-hidden="true">{glyphe}</span>
        <span>{valeur}</span>
      </motion.div>

      {/* Pulsation de la pile elle-même : l'anneau dit D'OÙ vient le badge, ce
          qu'un nombre flottant seul ne montrerait pas. */}
      <motion.div
        key={`halo-${event.timestamp}`}
        initial={{ opacity: 0.75, scale: 0.55 }}
        animate={{ opacity: 0, scale: 1.5 }}
        transition={{ duration: 0.85, ease: "easeOut" }}
        style={{
          position: "fixed",
          left: ancre.x,
          top: ancre.y,
          width: 74,
          height: 100,
          marginLeft: -37,
          marginTop: -50,
          borderRadius: 10,
          border: `2px solid ${teinte}`,
          boxShadow: `0 0 22px ${halo}`,
          zIndex: 69,
          pointerEvents: "none",
        }}
      />
    </AnimatePresence>,
    document.body,
  );
}
