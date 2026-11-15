"use client";

// MALÉDICTION — le moment où une créature est maudite. Sans animation, rien ne
// se passait à l'écran : la créature restait intacte un tour entier, puis
// disparaissait. Ici un sceau violet se referme sur elle, puis laisse la
// pastille de malédiction (BoardCreature) prendre le relais.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { MaledictionEvent } from "@/lib/store/gameStore";
import { CASCADE_STAGGER, lent } from "@/lib/fx/overlayMotion";

const DUREE_MS = lent(1500);
const TEINTE = "168, 85, 247";

export default function MaledictionOverlay({ event, onComplete }: { event: MaledictionEvent | null; onComplete: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!event) return;
    const total = DUREE_MS + (event.ids.length - 1) * CASCADE_STAGGER * 1000 + 200;
    const timer = setTimeout(onComplete, total);
    return () => clearTimeout(timer);
  }, [event, onComplete]);

  // Position de chaque victime, lue une fois à la réception de l'événement.
  const places = useMemo(() => {
    if (!event || typeof document === "undefined") return [];
    return event.ids.map((id) => {
      const el = document.querySelector(`[data-instance-id="${id}"]`) as HTMLElement | null;
      const r = el?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, taille: Math.max(r.width, r.height) } : null;
    });
  }, [event]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {event && (
        <motion.div
          key={event.timestamp}
          style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 92 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: lent(0.2) }}
        >
          {places.map((p, i) => {
            if (!p) return null;
            const delay = CASCADE_STAGGER * i;
            const d = p.taille * 1.15;
            return (
              <div key={`${event.timestamp}-${i}`} style={{ position: "absolute", left: p.x, top: p.y }}>
                {/* Voile sombre qui tombe sur la créature */}
                <motion.div
                  style={{
                    position: "absolute", left: -d / 2, top: -d / 2, width: d, height: d, borderRadius: "50%",
                    background: `radial-gradient(circle, rgba(${TEINTE}, 0.55) 0%, rgba(40, 10, 70, 0.45) 45%, transparent 70%)`,
                  }}
                  initial={{ opacity: 0, scale: 1.6 }}
                  animate={{ opacity: [0, 1, 0.8, 0], scale: [1.6, 1, 1, 0.9] }}
                  transition={{ duration: DUREE_MS / 1000, times: [0, 0.3, 0.7, 1], ease: "easeOut", delay }}
                />
                {/* Sceau : un anneau qui se referme en tournant */}
                <motion.div
                  style={{
                    position: "absolute", left: -d / 2, top: -d / 2, width: d, height: d, borderRadius: "50%",
                    border: `3px solid rgba(${TEINTE}, 0.95)`,
                    boxShadow: `0 0 22px rgba(${TEINTE}, 0.8), inset 0 0 18px rgba(${TEINTE}, 0.5)`,
                  }}
                  initial={{ opacity: 0, scale: 2, rotate: 0 }}
                  animate={{ opacity: [0, 1, 1, 0], scale: [2, 0.85, 0.8, 0.6], rotate: -200 }}
                  transition={{ duration: DUREE_MS / 1000, times: [0, 0.35, 0.75, 1], ease: "easeInOut", delay }}
                />
                {/* Le crâne de la malédiction */}
                <motion.div
                  style={{
                    position: "absolute", left: -30, top: -34, width: 60, textAlign: "center", fontSize: 44, lineHeight: 1,
                    filter: `drop-shadow(0 0 10px rgba(${TEINTE}, 1)) drop-shadow(0 2px 4px rgba(0,0,0,0.9))`,
                  }}
                  initial={{ opacity: 0, scale: 0.3, y: -24 }}
                  animate={{ opacity: [0, 1, 1, 0], scale: [0.3, 1.25, 1, 0.5], y: [-24, 0, 0, 10] }}
                  transition={{ duration: DUREE_MS / 1000, times: [0, 0.3, 0.7, 1], ease: "easeOut", delay: delay + lent(0.1) }}
                >
                  💀
                </motion.div>
              </div>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
