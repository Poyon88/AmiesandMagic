"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { EpargneGainEvent } from "@/lib/store/gameStore";
import { overlayRect } from "@/lib/fx/overlayMotion";

import GoldCoin from "@/components/shared/GoldCoin";
interface Props {
  event: EpargneGainEvent | null;
  onComplete: () => void;
  /** Quel compteur a bougé : pilote l'ancre DOM (`data-<kind>-badge`) et
   *  l'icône du « +N ». Le mouvement est le même pour les deux. */
  kind?: "epargne" | "foi" | "conquete" | "exploration" | "invention";
}

const DURATION_MS = 1500;

/** Position du médaillon d'un compteur dans l'orbite du héros. L'orbite est
 *  montée en DOUBLE (héros 2D / 3D) et un exemplaire caché mesure 0×0 : on
 *  retient le premier qui a une surface réelle, sinon le popup atterrirait dans le coin
 *  haut-gauche. `overlayRect` (et non getBoundingClientRect) car le plateau est
 *  sous un `zoom` CSS que Safari ne répercute pas sur les coordonnées. */
function epargneBadgeAnchor(kind: "epargne" | "foi" | "conquete" | "exploration" | "invention", side: "mine" | "theirs"): { x: number; y: number } | null {
  if (typeof document === "undefined") return null;
  const els = document.querySelectorAll(`[data-${kind}-badge="${side}"]`);
  for (const el of Array.from(els)) {
    const r = overlayRect(el);
    if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  // Repli sur l'orbite du héros, côté plateau. Les compteurs n'y sont visibles
  // qu'au-dessus de 0 : le TOUT PREMIER gain fait apparaître le médaillon dans
  // le rendu même où le popup cherche son ancre, et un gain d'Exploration qui
  // tombe pile sur le palier le remet à 0 (médaillon déjà démonté) — c'est
  // justement le gain qui fait piocher, le plus important à montrer.
  for (const el of Array.from(document.querySelectorAll(`[data-hero-orbit="${side}"]`))) {
    const r = overlayRect(el);
    if (r.width > 0 && r.height > 0) {
      return { x: side === "mine" ? r.left - 30 : r.left + r.width + 30, y: r.top + r.height * 0.72 };
    }
  }
  return null;
}

interface Popup {
  key: string;
  pos: { x: number; y: number };
  amount: number;
}

// « +N pièces » doré qui jaillit du losange d'Épargne et s'élève en fondu, avec une
// onde dorée sur le badge. Sans ce repère, une Épargne « fin de tour » créditait
// le compteur en silence, hors du regard du joueur (qui suit le plateau, pas la
// barre de mana) : le gain passait complètement inaperçu.
export default function EpargneGainOverlay({ event, onComplete, kind = "epargne" }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Géométrie figée à l'arrivée de l'event (stable entre re-renders).
  const popups = useMemo<Popup[] | null>(() => {
    if (!event) return null;
    const out: Popup[] = [];
    for (const [side, amount] of Object.entries(event.bySide) as ["mine" | "theirs", number][]) {
      const pos = epargneBadgeAnchor(kind, side);
      if (pos) out.push({ key: `${event.timestamp}-${side}`, pos, amount });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.timestamp]);

  useEffect(() => {
    if (!event) return;
    const t = setTimeout(onComplete, DURATION_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.timestamp]);

  if (!mounted || !popups || popups.length === 0) return null;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 120 }}>
      <AnimatePresence>
        {popups.map((p) => (
          <div key={p.key}>
            {/* Onde dorée : signale QUEL badge a bougé, le « +N » seul pouvant
                être lu comme un gain de mana sur une barre voisine. */}
            <motion.div
              style={{
                position: "absolute", left: p.pos.x, top: p.pos.y,
                width: 40, height: 40, borderRadius: "50%",
                transform: "translate(-50%, -50%)",
                border: "2px solid var(--am-gold-bright, #ffd76a)",
              }}
              initial={{ opacity: 0.9, scale: 0.8 }}
              animate={{ opacity: 0, scale: 2.4 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
            <motion.div
              style={{ position: "absolute", left: p.pos.x, top: p.pos.y, transform: "translate(-50%, -50%)" }}
              initial={{ opacity: 0, y: 4, scale: 0.4 }}
              animate={{ opacity: [0, 1, 1, 0], y: [4, -10, -24, -46], scale: [0.4, 1.25, 1.1, 1] }}
              transition={{ duration: DURATION_MS / 1000, times: [0, 0.18, 0.7, 1], ease: "easeOut" }}
            >
              <span
                style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: "1.7rem",
                  fontWeight: 900,
                  color: "#ffd76a",
                  textShadow: "0 0 10px rgba(255,215,106,0.9), 0 0 4px rgba(255,215,106,0.7), 0 1px 2px #000",
                  whiteSpace: "nowrap",
                }}
              >
                +{p.amount} {kind === "foi" ? "✨" : kind === "conquete" ? "🚩" : kind === "exploration" ? "🧭" : kind === "invention" ? "⚙️" : <GoldCoin size={16} />}
              </span>
            </motion.div>
          </div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
