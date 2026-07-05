"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import type { PowerArrowEvent } from "@/lib/store/gameStore";
import { OVERLAY, getInstanceCenter, findInstanceEl, curvedPath, overlayRect } from "@/lib/fx/overlayMotion";

interface PowerArrowOverlayProps {
  event: PowerArrowEvent | null;
  onComplete: () => void;
}

// Flèche(s) animée(s) tracée(s) de la SOURCE d'un pouvoir vers chaque cible
// touchée — même courbe / pointe que les flèches de sort, mais la queue est
// ancrée sur la créature/héros du plateau (getInstanceCenter). Un groupe par
// (source, couleur) : un pouvoir activé (tap/héros) est JAUNE ; les dégâts
// déclenchés portent leur couleur de mode (mort=rouge, retour=bleu, attaque=
// violet, fin de tour=vert). Émis dans dispatchAction → rejoué chez les deux
// joueurs. Coords DOM recalculées à chaque frame (rAF) pour suivre les cartes.
export default function PowerArrowOverlay({ event, onComplete }: PowerArrowOverlayProps) {
  const [mounted, setMounted] = useState(false);
  // Chaque flèche est indexée à plat : (groupe, cible) → un chemin + une pointe.
  const pathsRef = useRef<(SVGPathElement | null)[]>([]);
  const headsRef = useRef<(SVGPolygonElement | null)[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!event) return;
    const timer = setTimeout(onComplete, OVERLAY.displayMs);
    return () => clearTimeout(timer);
  }, [event, onComplete]);

  useEffect(() => {
    if (!event) return;
    let raf = 0;
    const loop = (t: number) => {
      const dashOffset = String(-((t * 0.05) % 21));
      const o = svgRef.current?.getBoundingClientRect();
      const ox = o?.left ?? 0;
      const oy = o?.top ?? 0;
      let flat = 0;
      for (const group of event.arrows) {
        const src = getInstanceCenter(group.sourceId);
        for (const id of group.targetIds) {
          const i = flat++;
          const path = pathsRef.current[i];
          const head = headsRef.current[i];
          const el = findInstanceEl(id);
          if (!src || !el || !path || !head) continue;
          const sx = src.x - ox;
          const sy = src.y - oy;
          const r = overlayRect(el);
          const tx = r.left + r.width / 2 - ox;
          const ty = r.top + r.height / 2 - oy;
          const { d, cx, cy } = curvedPath(sx, sy, tx, ty);
          path.setAttribute("d", d);
          path.style.strokeDashoffset = dashOffset;
          const angle = (Math.atan2(ty - cy, tx - cx) * 180) / Math.PI;
          head.setAttribute("transform", `translate(${tx}, ${ty}) rotate(${angle})`);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [event]);

  const total = event ? event.arrows.reduce((n, g) => n + g.targetIds.length, 0) : 0;
  if (!mounted || !event || total === 0) return null;

  // Aplatit (groupe, cible) en une liste d'arêtes portant chacune sa couleur,
  // dans le MÊME ordre que la boucle rAF (indices alignés sur pathsRef/headsRef).
  const edges: { color: string }[] = [];
  for (const g of event.arrows) for (let k = 0; k < g.targetIds.length; k++) edges.push({ color: g.color });

  return createPortal(
    <motion.svg
      ref={svgRef}
      key={event.timestamp}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 91,
        overflow: "visible",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: OVERLAY.displayMs / 1000, times: [0, 0.15, 0.75, 1] }}
    >
      {edges.map((e, i) => (
        <g key={i}>
          <path
            ref={(el) => { pathsRef.current[i] = el; }}
            fill="none"
            stroke={e.color}
            strokeWidth={6}
            strokeOpacity={0.95}
            strokeLinecap="round"
            strokeDasharray="14 7"
            style={{ filter: `drop-shadow(0 0 6px ${e.color})` }}
          />
          <polygon
            ref={(el) => { headsRef.current[i] = el; }}
            points="0,-12 26,0 0,12"
            fill={e.color}
            style={{ filter: `drop-shadow(0 0 4px ${e.color})` }}
          />
        </g>
      ))}
    </motion.svg>,
    document.body,
  );
}
