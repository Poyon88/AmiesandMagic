"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { ExileCostEvent } from "@/lib/store/gameStore";

/** Coût d'EXIL : X cartes quittent le dessus du deck pour payer une carte.
 *
 *  Elles ne rejoignent AUCUNE zone — ni cimetière, ni main, personne ne peut
 *  les récupérer. Rien à l'écran ne les montrait partir : seul le compteur du
 *  deck baissait, sans que le joueur relie cette baisse à la carte qu'il venait
 *  de jouer. D'où cette déchirure, jouée sur la pile elle-même.
 *
 *  Chaque carte se fend en DEUX moitiés qui s'écartent puis tombent en tournant.
 *  Le déchirement est ce qui distingue l'exil du reste : une carte piochée glisse
 *  vers la main, une carte défaussée part au cimetière — celle-ci est détruite,
 *  et le geste doit se lire comme irréversible. */

const TEAR_DURATION_MS = 900;
const TEAR_STAGGER_MS = 130;
/** Marge après la dernière déchirure avant de rendre la main au store. */
const TAIL_MS = 220;
/** Au-delà, on tronque : un exil de 5 cartes ne doit pas monopoliser l'écran. */
const MAX_VISIBLE = 4;

interface ExileCostOverlayProps {
  event: ExileCostEvent | null;
  onComplete: () => void;
}

/** Une moitié de carte déchirée. Le bord intérieur est irrégulier (clip-path en
 *  dents de scie) — une simple coupe droite se lirait comme une carte fendue,
 *  pas déchirée. */
function TornHalf({
  side,
  delay,
  cardBackUrl,
}: {
  side: "left" | "right";
  delay: number;
  cardBackUrl: string | null;
}) {
  const isLeft = side === "left";
  // Déchirure verticale au milieu, avec un tracé dentelé côté intérieur.
  const clip = isLeft
    ? "polygon(0% 0%, 52% 0%, 46% 12%, 54% 26%, 45% 41%, 53% 58%, 46% 73%, 54% 88%, 49% 100%, 0% 100%)"
    : "polygon(52% 0%, 100% 0%, 100% 100%, 49% 100%, 54% 88%, 46% 73%, 53% 58%, 45% 41%, 54% 26%, 46% 12%)";

  return (
    <motion.div
      style={{
        position: "absolute", inset: 0,
        clipPath: clip,
        borderRadius: 8,
        overflow: "hidden",
        background: cardBackUrl
          ? `center / cover no-repeat url(${cardBackUrl})`
          : "linear-gradient(160deg, #2a2a45, #12121f)",
        boxShadow: "0 6px 18px rgba(0,0,0,0.55)",
      }}
      initial={{ x: 0, y: 0, rotate: 0, opacity: 0 }}
      animate={{
        // Les deux moitiés s'écartent, basculent, puis tombent hors du cadre.
        x: isLeft ? [-2, -26, -46] : [2, 26, 46],
        y: [0, 10, 92],
        rotate: isLeft ? [0, -9, -26] : [0, 9, 26],
        opacity: [0, 1, 0],
      }}
      transition={{ duration: TEAR_DURATION_MS / 1000, delay, ease: "easeIn", times: [0, 0.28, 1] }}
    />
  );
}

export default function ExileCostOverlay({ event, onComplete }: ExileCostOverlayProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Position de la pile résolue à la RÉCEPTION de l'évènement, pas à chaque
  // rendu : la déchirure reste ancrée même si la mise en page bouge pendant
  // l'animation (même patron que CycleEternelOverlay).
  const anchor = useMemo(() => {
    if (!event || typeof document === "undefined") return null;
    const sel = event.isLocal ? '[data-cycle-deck="my"]' : '[data-cycle-deck="opponent"]';
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, [event]);

  const visible = Math.min(event?.count ?? 0, MAX_VISIBLE);

  useEffect(() => {
    if (!event) return;
    const total = TEAR_DURATION_MS + Math.max(0, visible - 1) * TEAR_STAGGER_MS + TAIL_MS;
    const timer = setTimeout(onComplete, total);
    return () => clearTimeout(timer);
  }, [event, visible, onComplete]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {event && anchor && visible > 0 && (
        <motion.div
          key={event.timestamp}
          style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 93 }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {Array.from({ length: visible }, (_, i) => {
            const delay = (i * TEAR_STAGGER_MS) / 1000;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: anchor.left, top: anchor.top,
                  width: anchor.width, height: anchor.height,
                }}
              >
                <TornHalf side="left" delay={delay} cardBackUrl={event.cardBackUrl} />
                <TornHalf side="right" delay={delay} cardBackUrl={event.cardBackUrl} />
              </div>
            );
          })}

          {/* Compteur : au-delà de MAX_VISIBLE on tronque les déchirures, mais
              le joueur doit connaître le nombre RÉEL de cartes perdues. */}
          <motion.div
            style={{
              position: "absolute",
              left: anchor.left + anchor.width / 2,
              top: anchor.top - 10,
              transform: "translate(-50%, -100%)",
              color: "#e74c3c",
              fontFamily: "'Cinzel', serif",
              fontWeight: 700,
              fontSize: 22,
              textShadow: "0 2px 6px rgba(0,0,0,0.9), 0 0 14px rgba(231,76,60,0.6)",
              whiteSpace: "nowrap",
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: [0, 1, 1, 0], y: [8, -2, -6, -18] }}
            transition={{ duration: (TEAR_DURATION_MS + 300) / 1000, times: [0, 0.2, 0.7, 1] }}
          >
            −{event.count}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
