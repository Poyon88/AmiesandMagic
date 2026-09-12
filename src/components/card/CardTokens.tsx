"use client";

// Jetons du COIN DROIT d'une carte : les cinq coûts additionnels (silhouettes
// SVG) et le compteur d'Éveil (écu renversé à jauge), empilés par <RightSlots>.
//
// Cf. BRIEF-COMPTEURS-BLASONS.md §4 à §6. Ce qui identifie un coût, c'est sa
// FORME et son ÉMAIL, pas un glyphe : à 19 px (jeton en vignette de deck) un
// glyphe ne dit plus rien, une silhouette et une couleur se lisent encore.
// Tout est en cqw (la racine de carte porte containerType: inline-size) et en
// styles inline ; les silhouettes sont des SVG inline, ce qui donne de vraies
// bordures sans pseudo-élément.
//
// Deux slots maximum à droite — l'Éveil d'abord, le coût additionnel ensuite.
// Une carte ne porte qu'UN coût additionnel : c'est une règle de design,
// posée aussi côté API (cf. /api/cards/save) ; ici on ne rend que le premier.
import React, { useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import { HERALDRY_FONT } from "./CardCounters";

export type CostType = "vie" | "defausse" | "sacrifice" | "exil" | "repli";

type Shape = {
  vb: string; from: string; to: string; sw: number; shift: string;
  d: string; extra?: ReactNode;
};

const SHAPES: Record<CostType, Shape> = {
  vie: {
    vb: "0 0 100 126", from: "#B93020", to: "#470B05", sw: 5.5, shift: "translateY(4%)",
    d: "M50 5 C57 32 88 62 88 86 a38 38 0 0 1 -76 0 C12 62 43 32 50 5 Z",
  },
  defausse: {
    vb: "0 0 100 110", from: "#4E6B8C", to: "#121D2B", sw: 5, shift: "none",
    d: "M20 6 H62 L86 30 V96 A8 8 0 0 1 78 104 H20 A8 8 0 0 1 12 96 V14 A8 8 0 0 1 20 6 Z",
    extra: <path d="M62 6 L86 30 H70 A8 8 0 0 1 62 22 Z" fill="rgba(255,255,255,.22)"
      stroke="#C9A227" strokeWidth="3" strokeLinejoin="round" />,
  },
  sacrifice: {
    vb: "0 0 100 110", from: "#7C8188", to: "#1A1E24", sw: 5, shift: "translateY(6%)",
    d: "M50 4 C76 4 90 21 90 45 C90 60 84 69 75 75 L75 90 C75 99 69 104 60 104 L40 104 "
      + "C31 104 25 99 25 90 L25 75 C16 69 10 60 10 45 C10 21 24 4 50 4 Z",
    extra: (
      <>
        <ellipse cx="31" cy="45" rx="11" ry="12" fill="rgba(0,0,0,.6)" />
        <ellipse cx="69" cy="45" rx="11" ry="12" fill="rgba(0,0,0,.6)" />
        <path d="M38 90 V104 M50 90 V104 M62 90 V104" stroke="rgba(0,0,0,.45)" strokeWidth="4" />
      </>
    ),
  },
  exil: {
    vb: "0 0 100 110", from: "#8046C4", to: "#220F3E", sw: 5, shift: "translateY(4%)",
    d: "M14 104 V52 A36 36 0 0 1 86 52 V104 Z",
  },
  repli: {
    vb: "0 0 100 110", from: "#2F8A83", to: "#0A2320", sw: 5, shift: "translateX(9%)",
    d: "M92 10 H46 L8 57 L46 104 H92 Z",
  },
};

/** Libellés (aria-label, infobulles). */
export const COST_LABEL: Record<CostType, string> = {
  vie: "vie", defausse: "défausse", sacrifice: "sacrifice", exil: "exil", repli: "repli",
};

const TOKEN_DIGIT: CSSProperties = {
  position: "relative", zIndex: 1,
  fontFamily: HERALDRY_FONT, fontWeight: 700, fontSize: "8.2cqw",
  lineHeight: 1, color: "#FFE7D6", fontVariantNumeric: "tabular-nums",
  textShadow: "0 .3cqw .7cqw rgba(0,0,0,.8)",
};

const SVG_FILL: CSSProperties = {
  position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible",
};

/** Géométrie des slots de droite, en cqw — exportée pour que ce qui doit se
 *  ranger SOUS les jetons (badge « ×N », marqueurs) sache où commence la place libre. */
export const RIGHT_SLOT = { right: 2.6, top: 2.6, width: 17, height: 18.6, step: 20.9 } as const;

/** Jeton de coût additionnel — rendu SANS position : c'est <RightSlots> qui place. */
function CostToken({ type, value }: { type: CostType; value: number }) {
  const s = SHAPES[type];
  const gid = `am-cost-${type}`;
  return (
    <>
      <svg viewBox={s.vb} aria-hidden="true" style={SVG_FILL}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={s.from} /><stop offset="1" stopColor={s.to} />
          </linearGradient>
        </defs>
        <path d={s.d} fill={`url(#${gid})`} stroke="#C9A227" strokeWidth={s.sw} strokeLinejoin="round" />
        {s.extra}
      </svg>
      <span style={{ ...TOKEN_DIGIT, transform: s.shift }}>{Math.min(99, value)}</span>
    </>
  );
}

const AWAKEN_D = "M50 4 L96 42 V104 H4 V42 Z";

/** `prefers-reduced-motion`, lu au montage : il n'y a pas de feuille CSS pour
 *  le faire. Faux côté serveur et au premier rendu. */
function useReducedMotion(): boolean {
  return useMemo(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
  }, []);
}

/** Écu d'Éveil à jauge — rendu SANS position, comme CostToken. Le chiffre
 *  décompte ce qu'il RESTE à verser (total → 0), jamais ce qui a été versé. */
function AwakenToken({ total, paid }: { total: number; paid: number }) {
  const reduce = useReducedMotion();
  const left = Math.max(0, total - paid);
  const y = 110 - 110 * Math.min(1, total > 0 ? paid / total : 0);
  const partial = paid > 0 && paid < total;
  return (
    <>
      <svg viewBox="0 0 100 110" aria-hidden="true" style={SVG_FILL}>
        <defs>
          <clipPath id="am-awaken-clip"><path d={AWAKEN_D} /></clipPath>
          <linearGradient id="am-awaken-enamel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1E3663" /><stop offset="1" stopColor="#091326" />
          </linearGradient>
          <linearGradient id="am-awaken-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFD277" /><stop offset="1" stopColor="#A8620B" />
          </linearGradient>
        </defs>
        <path d={AWAKEN_D} fill="url(#am-awaken-enamel)" />
        {/* La jauge s'anime depuis sa hauteur COURANTE (l'élément persiste,
            seuls y/height changent), jamais depuis zéro. */}
        <rect x="0" y={y} width="100" height={110 - y} fill="url(#am-awaken-fill)"
          clipPath="url(#am-awaken-clip)" opacity={0.9}
          style={reduce ? undefined : { transition: "y 240ms ease-out, height 240ms ease-out" }} />
        {partial && <rect x="0" y={y} width="100" height="2.4" fill="#FFF0C4"
          clipPath="url(#am-awaken-clip)" opacity={0.95} />}
        <path d={AWAKEN_D} fill="none" stroke="#C9A227" strokeWidth="5" strokeLinejoin="round" />
      </svg>
      <span style={{
        ...TOKEN_DIGIT, color: "#FFF1D8", transform: "translateY(5%)",
        fontSize: String(left).length > 1 ? "7cqw" : "8.2cqw",
      }}>{Math.min(99, left)}</span>
    </>
  );
}

export interface RightSlotsProps {
  awaken?: { total: number; paid: number } | null;
  cost?: { type: CostType; value: number } | null;
  /** Fusion du bouton « mettre en éveil » de la main : quand fourni, le slot
   *  d'Éveil est un bouton. Le clic ne remonte pas à la carte (qui la JOUERAIT). */
  onAwaken?: () => void;
  awakenTitle?: string;
  /** Élément rangé dans le slot SUIVANT les jetons (badge « ×N » de la
   *  collection) : il descend d'un cran par jeton présent. */
  after?: ReactNode;
}

/** Colonne de droite : l'Éveil d'abord, le coût additionnel ensuite, puis `after`.
 *  Deux jetons maximum — le troisième est ignoré, et signalé en dev. */
export function RightSlots({ awaken, cost, onAwaken, awakenTitle, after }: RightSlotsProps) {
  const items: { key: string; node: ReactNode; button?: boolean }[] = [];
  if (awaken?.total) items.push({ key: "aw", node: <AwakenToken total={awaken.total} paid={awaken.paid} />, button: !!onAwaken });
  if (cost?.value) items.push({ key: "ct", node: <CostToken type={cost.type} value={cost.value} /> });
  if (items.length > 2 && process.env.NODE_ENV !== "production") {
    console.warn("[card] plus de deux jetons dans le coin droit — les suivants sont ignorés");
  }
  const shown = items.slice(0, 2);
  const slotStyle = (i: number): CSSProperties => ({
    position: "absolute", right: `${RIGHT_SLOT.right}cqw`, top: `${RIGHT_SLOT.top + i * RIGHT_SLOT.step}cqw`,
    width: `${RIGHT_SLOT.width}cqw`, height: `${RIGHT_SLOT.height}cqw`,
    display: "grid", placeItems: "center", zIndex: 3,
  });
  return (
    <>
      {shown.map(({ key, node, button }, i) => button ? (
        <button
          key={key}
          type="button"
          title={awakenTitle}
          onClick={(e) => { e.stopPropagation(); onAwaken?.(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ ...slotStyle(i), zIndex: 6, background: "transparent", border: "none", padding: 0, cursor: "pointer", pointerEvents: "auto" }}
        >{node}</button>
      ) : (
        <div key={key} style={{ ...slotStyle(i), pointerEvents: "none" }}>{node}</div>
      ))}
      {after != null && (
        <div style={{ ...slotStyle(shown.length), pointerEvents: "none" }}>{after}</div>
      )}
    </>
  );
}

// ─── Lecture du modèle de données ────────────────────────────────────────────
// Le dépôt porte CINQ colonnes indépendantes (life_cost, discard_cost,
// sacrifice_cost, exile_cost, topdeck_cost) : la règle « un seul coût
// additionnel » est appliquée à la sauvegarde (API). Ici, par sûreté, on ne
// rend que le premier dans l'ordre ci-dessous et on signale le reste en dev.
type CostColumns = {
  life_cost?: number | null; discard_cost?: number | null; sacrifice_cost?: number | null;
  exile_cost?: number | null; topdeck_cost?: number | null; eveil_cost?: number | null;
};

const COST_COLUMNS: [CostType, keyof CostColumns][] = [
  ["vie", "life_cost"], ["defausse", "discard_cost"], ["sacrifice", "sacrifice_cost"],
  ["exil", "exile_cost"], ["repli", "topdeck_cost"],
];

/** Tous les coûts additionnels non nuls d'une carte, dans l'ordre canonique. */
export function additionalCostsOf(card: CostColumns): { type: CostType; value: number }[] {
  const out: { type: CostType; value: number }[] = [];
  for (const [type, col] of COST_COLUMNS) {
    const v = card[col] ?? 0;
    if (v > 0) out.push({ type, value: v });
  }
  return out;
}

/** LE coût additionnel affiché (le premier ; les autres sont une erreur de données). */
export function additionalCostOf(card: CostColumns, sourceName?: string): { type: CostType; value: number } | undefined {
  const all = additionalCostsOf(card);
  if (all.length > 1 && process.env.NODE_ENV !== "production") {
    console.warn(`[card] « ${sourceName ?? "?"} » déclare ${all.length} coûts additionnels — un seul est autorisé, seul « ${all[0].type} » est affiché.`);
  }
  return all[0];
}

/** Compteur d'Éveil d'une carte : `total` = son coût d'éveil, `paid` = points
 *  déjà versés (0 en main ; la zone d'éveil connaît le reste). */
export function awakenOf(card: CostColumns, paid = 0): { total: number; paid: number } | undefined {
  const total = card.eveil_cost ?? 0;
  return total > 0 ? { total, paid: Math.max(0, Math.min(total, paid)) } : undefined;
}

/** Fragments d'accessibilité pour la colonne de droite. */
export function rightSlotsAriaParts(card: CostColumns, awaken?: { total: number; paid: number } | null): string[] {
  const parts: string[] = [];
  const c = additionalCostOf(card);
  if (c) parts.push(`${COST_LABEL[c.type]} ${c.value}`);
  if (awaken?.total) parts.push(`Éveil : ${Math.max(0, awaken.total - awaken.paid)} mana restants sur ${awaken.total}`);
  return parts;
}
