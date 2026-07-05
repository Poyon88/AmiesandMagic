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

// Flèche animée tracée de la créature qui active un pouvoir vers chaque cible
// touchée — même courbe / pointe que les flèches de sort (SpellTargetArrows),
// mais la queue est ancrée sur la CRÉATURE du plateau (getInstanceCenter) au
// lieu d'une carte-panneau. Émis dans dispatchAction → rejoué chez les deux
// joueurs. Coords DOM recalculées à chaque frame (rAF) pour suivre les cartes.
export default function PowerArrowOverlay({ event, onComplete }: PowerArrowOverlayProps) {
  const [mounted, setMounted] = useState(false);
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
      // Dashes flow toward the target — reads as energy streaming to the
      // victim. Period matches strokeDasharray "14 7".
      const dashOffset = String(-((t * 0.05) % 21));
      const src = getInstanceCenter(event.sourceId);
      if (src) {
        // The SVG is position:fixed; measure its own box so all points are
        // expressed relative to it (no-op on desktop, self-correcting on
        // iPad where the fixed origin isn't viewport 0,0 — cf. SpellTargetArrows).
        const o = svgRef.current?.getBoundingClientRect();
        const ox = o?.left ?? 0;
        const oy = o?.top ?? 0;
        const sx = src.x - ox;
        const sy = src.y - oy;
        event.targetIds.forEach((id, i) => {
          const el = findInstanceEl(id);
          const path = pathsRef.current[i];
          const head = headsRef.current[i];
          if (!el || !path || !head) return;
          const r = overlayRect(el);
          const tx = r.left + r.width / 2 - ox;
          const ty = r.top + r.height / 2 - oy;
          const { d, cx, cy } = curvedPath(sx, sy, tx, ty);
          path.setAttribute("d", d);
          path.style.strokeDashoffset = dashOffset;
          const angle = (Math.atan2(ty - cy, tx - cx) * 180) / Math.PI;
          head.setAttribute("transform", `translate(${tx}, ${ty}) rotate(${angle})`);
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [event]);

  if (!mounted || !event || event.targetIds.length === 0) return null;

  const color = event.color;

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
      {event.targetIds.map((_, i) => (
        <g key={i}>
          <path
            ref={(el) => { pathsRef.current[i] = el; }}
            fill="none"
            stroke={color}
            strokeWidth={6}
            strokeOpacity={0.95}
            strokeLinecap="round"
            strokeDasharray="14 7"
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
          <polygon
            ref={(el) => { headsRef.current[i] = el; }}
            points="0,-12 26,0 0,12"
            fill={color}
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
          />
        </g>
      ))}
    </motion.svg>,
    document.body,
  );
}
