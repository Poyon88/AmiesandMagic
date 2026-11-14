"use client";

// Créature renforcée ALORS QU'ELLE EST AU CIMETIÈRE (ex. « à la fin du tour, au
// cimetière : +1/+1 »). Sans annonce, rien ne bougeait à l'écran : la carte
// grossissait dans une pile fermée et le joueur ne le découvrait qu'en la
// ranimant. Ici la carte se soulève au-dessus de la pile de son propriétaire,
// affiche son gain et ses nouvelles valeurs, puis retombe dans la pile.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { GraveyardBuffEvent } from "@/lib/store/gameStore";
import { CASCADE_STAGGER, lent } from "@/lib/fx/overlayMotion";
import { useCardText } from "./CardTextProvider";

const DISPLAY_MS = lent(2000);
const CARD_W = 92;
const CARD_H = 130;

const signe = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export default function GraveyardBuffOverlay({ event, onComplete }: { event: GraveyardBuffEvent | null; onComplete: () => void }) {
  const { localizeName } = useCardText();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const entries = useMemo(() => event?.entries ?? [], [event]);

  useEffect(() => {
    if (!event) return;
    const total = DISPLAY_MS + (event.entries.length - 1) * CASCADE_STAGGER * 1000 + 200;
    const timer = setTimeout(onComplete, total);
    return () => clearTimeout(timer);
  }, [event, onComplete]);

  // Position de chaque pile, lue une fois à la réception de l'événement.
  const places = useMemo(() => {
    if (typeof document === "undefined") return [];
    const parCamp = { my: 0, opponent: 0 };
    return entries.map((e) => {
      const camp = e.ownerIsLocal ? "my" : "opponent";
      const el = document.querySelector(`[data-graveyard-pile="${camp}"]`) as HTMLElement | null;
      const r = el?.getBoundingClientRect();
      const pile = r
        ? { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        : { x: window.innerWidth - 120, y: e.ownerIsLocal ? window.innerHeight - 160 : 160 };
      // Plusieurs cartes du même camp : en éventail, vers l'intérieur de l'écran.
      const rang = parCamp[camp]++;
      const versCentre = pile.x > window.innerWidth / 2 ? -1 : 1;
      return {
        pile,
        dx: versCentre * (CARD_W * 0.9 + rang * (CARD_W + 10)),
        // La carte s'élève vers le milieu du terrain, jamais hors de l'écran.
        dy: e.ownerIsLocal ? -CARD_H * 0.75 : CARD_H * 0.75,
      };
    });
  }, [entries]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {event && entries.length > 0 && (
        <motion.div
          key={event.timestamp}
          style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 92 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: lent(0.2) }}
        >
          {entries.map((e, i) => {
            const p = places[i];
            if (!p) return null;
            const gain = e.attack >= 0 && e.health >= 0;
            const teinte = gain ? "110, 231, 150" : "248, 113, 113";
            const delay = CASCADE_STAGGER * i;
            return (
              <motion.div
                key={`${event.timestamp}-${i}`}
                style={{
                  position: "absolute",
                  left: p.pile.x - CARD_W / 2,
                  top: p.pile.y - CARD_H / 2,
                  width: CARD_W,
                  height: CARD_H,
                }}
                initial={{ x: 0, y: 0, scale: 0.35, opacity: 0 }}
                animate={{
                  x: [0, p.dx, p.dx, 0],
                  y: [0, p.dy, p.dy, 0],
                  scale: [0.35, 1, 1, 0.35],
                  opacity: [0, 1, 1, 0],
                }}
                transition={{ duration: DISPLAY_MS / 1000, times: [0, 0.22, 0.78, 1], ease: "easeInOut", delay }}
              >
                {/* La carte, voilée comme une carte du cimetière */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 8,
                    overflow: "hidden",
                    border: `2px solid rgba(${teinte}, 0.85)`,
                    boxShadow: `0 0 18px 3px rgba(${teinte}, 0.55), 0 8px 20px rgba(0,0,0,0.7)`,
                    background: e.card.image_url
                      ? `url('${e.card.image_url}') center/cover no-repeat, linear-gradient(160deg, #1a0a2a, #0d0d1a)`
                      : "linear-gradient(160deg, #1a0a2a, #0d0d1a)",
                    filter: "grayscale(0.45) brightness(0.85)",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "linear-gradient(180deg, rgba(6,6,18,0.3) 0%, rgba(6,6,18,0.05) 45%, rgba(6,6,18,0.88) 100%)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      alignItems: "center",
                      padding: "4px 6px 6px",
                      gap: 2,
                    }}
                  >
                    <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "#fff", fontFamily: "'Cinzel', serif", textShadow: "0 1px 2px rgba(0,0,0,0.95)", textAlign: "center", lineHeight: 1.15 }}>
                      {localizeName(e.card)}
                    </div>
                    {/* Nouvelles valeurs */}
                    <div style={{ fontSize: "0.8rem", fontWeight: 800, color: `rgb(${teinte})`, fontVariantNumeric: "tabular-nums", textShadow: "0 1px 3px rgba(0,0,0,0.95)" }}>
                      {e.card.attack ?? 0} / {e.card.health ?? 0}
                    </div>
                  </div>
                </div>

                {/* Halo qui pulse au moment du gain */}
                <motion.div
                  style={{ position: "absolute", inset: -6, borderRadius: 12, border: `2px solid rgba(${teinte}, 0.9)` }}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: [0, 0.9, 0], scale: [0.9, 1.18, 1.3] }}
                  transition={{ duration: lent(0.8), delay: delay + lent(0.45), ease: "easeOut" }}
                />

                {/* Le gain qui s'élève */}
                <motion.div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: -8,
                    transform: "translateX(-50%)",
                    whiteSpace: "nowrap",
                    fontFamily: "'Cinzel', serif",
                    fontSize: "1.35rem",
                    fontWeight: 900,
                    color: `rgb(${teinte})`,
                    textShadow: `0 0 12px rgba(${teinte}, 0.9), 0 2px 4px rgba(0,0,0,0.95)`,
                  }}
                  initial={{ opacity: 0, y: 10, scale: 0.6 }}
                  animate={{ opacity: [0, 1, 1, 0], y: [10, -18, -24, -40], scale: [0.6, 1.15, 1, 0.9] }}
                  transition={{ duration: lent(1.3), times: [0, 0.25, 0.7, 1], delay: delay + lent(0.4), ease: "easeOut" }}
                >
                  {signe(e.attack)}/{signe(e.health)}
                </motion.div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
