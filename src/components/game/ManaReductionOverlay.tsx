"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { ManaReductionEvent } from "@/lib/store/gameStore";

interface Props {
  event: ManaReductionEvent | null;
  onComplete: () => void;
}

const DURATION_MS = 1600;

// Résout la position (haut de carte) d'une carte de la main depuis son
// `data-instance-id`. null si la carte n'est plus dans le DOM.
function handCardAnchor(instanceId: string): { x: number; y: number } | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(`[data-instance-id="${instanceId}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // Ancré près du badge de mana (haut de la carte).
  return { x: r.left + r.width / 2, y: r.top + r.height * 0.18 };
}

interface Popup {
  key: string;
  pos: { x: number; y: number };
  amount: number;
}

// « -N » vert qui jaillit puis s'élève en fondu sur chaque carte de la main
// dont le coût en mana vient d'être réduit (Sacrifice démoniaque…).
export default function ManaReductionOverlay({ event, onComplete }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Géométries figées à l'arrivée de l'event (stables entre re-renders).
  const popups = useMemo<Popup[] | null>(() => {
    if (!event) return null;
    const out: Popup[] = [];
    for (const [instanceId, amount] of Object.entries(event.byInstance)) {
      const pos = handCardAnchor(instanceId);
      if (pos) out.push({ key: `${event.timestamp}-${instanceId}`, pos, amount });
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
          <motion.div
            key={p.key}
            style={{ position: "absolute", left: p.pos.x, top: p.pos.y, transform: "translate(-50%, -50%)" }}
            initial={{ opacity: 0, y: 6, scale: 0.4 }}
            animate={{ opacity: [0, 1, 1, 0], y: [6, -8, -22, -46], scale: [0.4, 1.25, 1.1, 1] }}
            transition={{ duration: DURATION_MS / 1000, times: [0, 0.18, 0.7, 1], ease: "easeOut" }}
          >
            <span
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: "1.9rem",
                fontWeight: 900,
                color: "#2ecc71",
                textShadow: "0 0 10px rgba(46,204,113,0.9), 0 0 4px rgba(46,204,113,0.7), 0 1px 2px #000",
                whiteSpace: "nowrap",
              }}
            >
              −{p.amount} 💧
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
