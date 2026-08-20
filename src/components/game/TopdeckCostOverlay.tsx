"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import type { TopdeckCostEvent } from "@/lib/store/gameStore";
import { REPLI_TEINTE, REPLI_RGB } from "@/lib/game/repli-theme";
import { overlayRect } from "@/lib/fx/overlayMotion";

/** Coût de REPLI : X cartes quittent la main pour le DESSUS du deck.
 *
 *  Sans rien à l'écran, la main rétrécit et le compteur du deck monte d'un cran
 *  au même instant — deux mouvements que rien ne relie à la carte qu'on vient de
 *  jouer. Un dos de carte remonte donc de la main vers la pile.
 *
 *  Ce qu'il ne montre PAS, volontairement : la FACE de la carte repliée. Elle
 *  sera la prochaine pioche, et la révéler donnerait gratuitement cette
 *  information à l'adversaire. Le dos suffit à raconter le geste.
 *
 *  Ancré sur `[data-cycle-deck]`, la même ancre que l'exil, Cycle éternel et les
 *  effets « deck » — une seule convention pour tout ce qui s'anime au deck. */

const VOL_MS = 780;
const STAGGER_MS = 140;
/** Marge après le dernier vol avant de rendre la main au store. */
const QUEUE_MS = 200;
/** Au-delà, on tronque : un repli de 4 cartes ne doit pas monopoliser l'écran. */
const MAX_VISIBLE = 3;

interface Props {
  event: TopdeckCostEvent | null;
  onComplete: () => void;
}

/** Centre de la pile de deck visée, ou null si elle n'est pas montée.
 *  `overlayRect` corrige le zoom CSS et les coordonnées Safari — un
 *  getBoundingClientRect brut décale l'ancrage sur iPad. */
function ancreDeck(isLocal: boolean): { x: number; y: number } | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(isLocal ? '[data-cycle-deck="my"]' : '[data-cycle-deck="opponent"]');
  if (!el) return null;
  const r = overlayRect(el);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export default function TopdeckCostOverlay({ event, onComplete }: Props) {
  const t = useTranslations("game");
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);

  // Ancre et point de départ figés à l'arrivée de l'événement : la carte reste
  // à l'écran pendant toute l'animation, elle ne doit pas se replacer si un
  // rendu survient entre-temps.
  const geo = useMemo(() => {
    if (!event || typeof window === "undefined") return null;
    const deck = ancreDeck(event.isLocal);
    if (!deck) return null;
    // La main du joueur local est en bas de l'écran, celle de l'adversaire en
    // haut : le départ suit le camp, sinon la carte semblerait sortir du décor.
    const depart = {
      x: window.innerWidth / 2,
      y: event.isLocal ? window.innerHeight * 0.88 : window.innerHeight * 0.12,
    };
    return { deck, depart };
  }, [event]);

  const visibles = Math.min(event?.count ?? 0, MAX_VISIBLE);

  useEffect(() => {
    if (!event) return;
    const total = VOL_MS + (visibles - 1) * STAGGER_MS + QUEUE_MS;
    const timer = setTimeout(onComplete, total);
    return () => clearTimeout(timer);
  }, [event, visibles, onComplete]);

  if (!monte || !event || !geo) return null;

  const { deck, depart } = geo;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key={event.timestamp}
        style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 92 }}
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {Array.from({ length: visibles }).map((_, i) => (
          <motion.div
            key={`repli-${event.timestamp}-${i}`}
            style={{
              position: "absolute",
              left: depart.x,
              top: depart.y,
              width: 74,
              height: 104,
              marginLeft: -37,
              marginTop: -52,
              borderRadius: 8,
              border: `2px solid ${REPLI_TEINTE}`,
              boxShadow: `0 0 18px rgba(${REPLI_RGB}, 0.65), 0 6px 18px rgba(0,0,0,0.55)`,
              background: event.cardBackUrl
                ? `center / cover no-repeat url(${event.cardBackUrl})`
                : "linear-gradient(160deg, #16323d, #08161c)",
            }}
            initial={{ x: 0, y: 0, scale: 1, opacity: 0, rotate: 0 }}
            animate={{
              x: deck.x - depart.x,
              y: deck.y - depart.y,
              // Rétrécit en arrivant : la carte se range DANS la pile, elle ne
              // s'y pose pas par-dessus.
              scale: [1, 1, 0.42],
              opacity: [0, 1, 1, 0],
              rotate: event.isLocal ? -10 : 10,
            }}
            transition={{
              duration: VOL_MS / 1000,
              times: [0, 0.15, 1],
              ease: [0.4, 0.05, 0.4, 1],
              delay: (i * STAGGER_MS) / 1000,
            }}
          />
        ))}

        {/* Libellé au-dessus de la pile : c'est lui qui NOMME le geste. Sans
            texte, un dos qui file vers le deck pourrait aussi bien se lire
            comme une pioche à l'envers. */}
        <motion.div
          key={`repli-mot-${event.timestamp}`}
          style={{
            position: "absolute",
            left: deck.x,
            top: deck.y,
            transform: "translate(-50%, -50%)",
            padding: "4px 10px",
            borderRadius: 999,
            border: `1px solid ${REPLI_TEINTE}`,
            background: "rgba(8,22,28,0.88)",
            color: REPLI_TEINTE,
            fontFamily: "var(--font-cinzel), serif",
            fontWeight: 700,
            fontSize: 13,
            whiteSpace: "nowrap",
            boxShadow: `0 0 16px rgba(${REPLI_RGB}, 0.5)`,
          }}
          initial={{ opacity: 0, y: 0, scale: 0.85 }}
          animate={{ opacity: [0, 1, 1, 0], y: -42, scale: 1 }}
          transition={{
            duration: (VOL_MS + (visibles - 1) * STAGGER_MS) / 1000,
            times: [0, 0.25, 0.72, 1],
            ease: "easeOut",
            delay: 0.25,
          }}
        >
          ↥ {t("topdeck_cost_caption", { count: event.count })}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
