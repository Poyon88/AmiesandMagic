"use client";

import { segmentsAllumes } from "./orbit-geometry";

/** Anneau-JAUGE autour d'un médaillon : `total` segments, `allumes` dorés. */
export function SegmentRing({ size, total, allumes, epaisseur = 3 }: {
  size: number; total: number; allumes: number; epaisseur?: number;
}) {
  if (total <= 0) return null;
  const r = size / 2 - epaisseur / 2 - 0.5;
  const c = size / 2;
  // Jour entre segments, en degrés — réduit quand il y en a beaucoup (Foi : 10).
  const jour = total >= 8 ? 7 : 10;
  const arc = 360 / total - jour;
  const point = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180; // 0° = midi
    return `${c + r * Math.cos(a)} ${c + r * Math.sin(a)}`;
  };
  const allumesN = segmentsAllumes(allumes, total);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
      {Array.from({ length: total }, (_, i) => {
        const debut = i * (360 / total) + jour / 2;
        const d = `M ${point(debut)} A ${r} ${r} 0 0 1 ${point(debut + arc)}`;
        const on = i < allumesN;
        return (
          <path key={i} d={d} fill="none" strokeLinecap="butt" strokeWidth={epaisseur}
            stroke={on ? "var(--am-gold-bright)" : "color-mix(in srgb, var(--am-gold-deep) 40%, transparent)"}
            style={on ? { filter: "drop-shadow(0 0 2px rgba(244,224,154,0.6))" } : undefined} />
        );
      })}
    </svg>
  );
}

/** Petit écu chiffré en coin d'un médaillon (valeur exacte : la jauge seule
 *  ne se compte pas d'un coup d'œil à 10 segments). */
export function EcuChiffre({ valeur, couleur = "#1a2e5c" }: { valeur: number | string; couleur?: string }) {
  return (
    <span
      style={{
        position: "absolute", right: -5, top: -6, width: 18, height: 21,
        display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 3,
        background: couleur,
        border: "1.5px solid var(--am-gold)",
        clipPath: "polygon(0 0, 100% 0, 100% 68%, 50% 100%, 0 68%)",
        fontFamily: "var(--font-cinzel), serif", fontSize: 11, fontWeight: 900,
        color: "var(--am-gold-bright)", lineHeight: 1, pointerEvents: "none",
      }}
    >
      {valeur}
    </span>
  );
}

export interface MedallionProps {
  size: number;
  /** Couleur du médaillon (variable CSS `--orbit-*`). */
  teinte: string;
  /** Jauge : segments et valeur ; `total` 0 ⇒ pas d'anneau. */
  total: number;
  valeur: number;
  /** Chiffre de l'écu en coin ; absent ⇒ pas d'écu. */
  ecu?: number | string;
  children: React.ReactNode;
  /** Dépensable MAINTENANT : halo pulsé et curseur. */
  actif?: boolean;
  onClick?: () => void;
  ariaLabel: string;
  /** Ancre DOM des animations de gain (`data-<kind>-badge`). */
  dataAttrs?: Record<string, string | undefined>;
  bulle: { attacher: (el: HTMLElement | null) => void; consume: () => boolean; handlers: Record<string, unknown> };
}

/** Médaillon rond de compteur : disque teinté, icône dorée, anneau-jauge. */
export default function CounterMedallion({
  size, teinte, total, valeur, ecu, children, actif = false, onClick, ariaLabel, dataAttrs, bulle,
}: MedallionProps) {
  const { attacher, handlers: poignees, consume } = bulle;
  const disque = size - 10;
  return (
    <button
      type="button"
      ref={attacher}
      {...poignees}
      {...dataAttrs}
      aria-label={ariaLabel}
      disabled={!actif}
      onClick={actif && onClick ? () => { if (consume()) return; onClick(); } : undefined}
      className={`relative transition-transform ${actif ? "cursor-pointer hover:scale-110" : "cursor-default"}`}
      style={{ width: size, height: size, touchAction: "manipulation", WebkitTouchCallout: "none" }}
    >
      <SegmentRing size={size} total={total} allumes={valeur} />
      <span
        className="absolute flex items-center justify-center rounded-full"
        style={{
          left: 5, top: 5, width: disque, height: disque,
          background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${teinte} 70%, white 30%), ${teinte} 55%, color-mix(in srgb, ${teinte} 60%, black 40%))`,
          border: "2px solid var(--am-gold)",
          color: "var(--am-gold-bright)",
          animation: actif ? "orbit-ready 1.6s ease-in-out infinite" : undefined,
          boxShadow: actif ? undefined : "0 2px 6px rgba(0,0,0,0.55)",
        }}
      >
        {children}
      </span>
      {ecu != null && <EcuChiffre valeur={ecu} />}
    </button>
  );
}

/** MACHINE : engrenage doré à moyeu d'acier, jauge de 6 Inventions. */
export function MachineGear({ size, inventions, total, actif, onClick, ariaLabel, dataAttrs, bulle }: Omit<MedallionProps, "teinte" | "valeur" | "children" | "ecu"> & { inventions: number }) {
  const { attacher, handlers: poignees, consume } = bulle;
  const g = size - 10; // l'engrenage, dans l'anneau
  const c = g / 2;
  const dents = 10;
  const rExt = g / 2 - 1;
  const rInt = rExt - 4;
  const pts: string[] = [];
  for (let i = 0; i < dents * 2; i++) {
    const r = i % 2 === 0 ? rExt : rInt;
    for (const off of [-0.32, 0.32]) {
      const a = ((i + 0.5 + off) / (dents * 2)) * Math.PI * 2;
      pts.push(`${c + r * Math.cos(a)},${c + r * Math.sin(a)}`);
    }
  }
  return (
    <button
      type="button"
      ref={attacher}
      {...poignees}
      {...dataAttrs}
      aria-label={ariaLabel}
      disabled={!actif}
      onClick={actif && onClick ? () => { if (consume()) return; onClick(); } : undefined}
      className={`relative transition-transform ${actif ? "cursor-pointer hover:scale-110" : "cursor-help"}`}
      style={{ width: size, height: size, touchAction: "manipulation", WebkitTouchCallout: "none", borderRadius: "50%", animation: actif ? "orbit-ready 1.6s ease-in-out infinite" : undefined }}
    >
      <SegmentRing size={size} total={total} allumes={inventions} />
      <svg width={g} height={g} viewBox={`0 0 ${g} ${g}`} aria-hidden
        style={{ position: "absolute", left: 5, top: 5, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.6))" }}>
        <defs>
          <radialGradient id="orbit-gear-hub" cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#9a9a9a" />
            <stop offset="100%" stopColor="#2a2a2a" />
          </radialGradient>
        </defs>
        <polygon points={pts.join(" ")} fill="var(--am-gold)" stroke="var(--am-gold-deep)" strokeWidth={1} />
        <circle cx={c} cy={c} r={rInt - 5} fill="url(#orbit-gear-hub)" stroke="var(--am-gold-deep)" strokeWidth={1.5} />
      </svg>
      <EcuChiffre valeur={inventions} />
    </button>
  );
}
