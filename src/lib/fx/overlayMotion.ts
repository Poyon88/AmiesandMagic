// Shared animation vocabulary for the full-screen spell / hero-power / effect
// overlays. Before this module every overlay re-declared its own easings,
// display durations, DOM-center resolver and quadratic-bezier math — with
// subtly divergent magic numbers. Centralising them keeps the overlays feeling
// like one coherent system and makes the whole set tunable from one place.
//
// Pure module (no JSX) — the shared presentational primitives that consume
// these constants live in `@/components/game/OverlayPrimitives`.

import type { Transition } from "framer-motion";

// ---- Easing vocabulary -----------------------------------------------------
export const EASE = {
  // The reveal card's multi-segment curve: punchy back-out pop, smooth hold,
  // ease-in exit. Shared verbatim by SpellCast and HeroPower.
  cardReveal: ["backOut", "easeInOut", "easeIn"] as const,
  out: "easeOut" as const,
};

// ---- Timing (seconds unless suffixed Ms) -----------------------------------
export const OVERLAY = {
  /** Reveal card display window. Kept in lockstep with the store's
   *  OVERLAY_PRE_IMPACT_MS pacing (Lot 1): the card's motion is done well
   *  before this, so the tail is a short fade, not a long static hold. */
  displayMs: 2000,
  /** Container cross-fade in/out. */
  containerFade: 0.25,
};

// ---- Reveal card (SpellCast + HeroPower shared this byte-for-byte) ----------
export const cardRevealInitial = { scale: 0.5, opacity: 0, y: 30 };
export const cardRevealAnimate = {
  scale: [0.5, 1.06, 1, 1, 0.97],
  opacity: [0, 1, 1, 1, 0],
  y: [30, 0, 0, -8, -30],
};
export const cardRevealTransition: Transition = {
  duration: OVERLAY.displayMs / 1000,
  // Fade-out starts at 0.6 (was 0.82): the card popped, settled, then used to
  // sit motionless for ~1.7s. Compressed so the reveal reads as a beat.
  times: [0, 0.16, 0.26, 0.6, 1],
  ease: EASE.cardReveal as unknown as Transition["ease"],
};

// ---- Card motion springs (shared by BoardCreature + HandCard) --------------
// One source of truth so a card obeys the same physics in hand and on board.
// (Values preserved from their original per-component definitions.)
export const SPRINGS: Record<"boardSettle" | "handEntry" | "summon", Transition> = {
  /** Board creature settle — governs animate transitions and reconciled moves. */
  boardSettle: { type: "spring", stiffness: 280, damping: 22, mass: 1.3 },
  /** Hand-card draw-in — a touch snappier and bouncier than the board. */
  handEntry: { type: "spring", stiffness: 320, damping: 20, mass: 1.1 },
  /** Effect-summon materialisation — snappier & lighter (slight overshoot) so
   *  the creature lands WITH the portal flash instead of drifting in after it. */
  summon: { type: "spring", stiffness: 420, damping: 26, mass: 0.9 },
};

// ---- Card cascade reveals (graveyard / discard) ----------------------------
// Graveyard and discard overlays fan a row of cards in with the same timing
// signature — a back-out pop, a hold, then an ease-in exit, staggered per card.
// They keep their own layout and thematic filter (grey-out vs burn); only this
// shared cadence is centralised.
export const CASCADE_EASE: Transition["ease"] = ["backOut", "linear", "easeIn"];
export const CASCADE_STAGGER = 0.08;

// ---- DOM anchor resolution (was duplicated across 4 overlays) ---------------
// A combat / spell target is ALWAYS an on-board creature (or a hero), never a
// hand card. But the same `instanceId` can be present in BOTH the hand and the
// board at the same instant — an instance keeps its id across zones, and framer
// keeps a just-played card mounted through its hand exit animation. A plain
// `querySelector` returns whichever copy is first in the DOM, so the resolver
// could lock a targeting arrow onto the HAND copy (visibly the wrong creature)
// while the engine correctly applies the effect on the board. This was most
// visible on iPad, where slower rendering / touch timing widens that overlap
// window. Hand cards are tagged `data-hand-card="true"`, so we skip them.
export function findInstanceEl(id: string): Element | null {
  const matches = document.querySelectorAll(`[data-instance-id="${id}"]`);
  if (matches.length > 1) {
    for (const el of matches) {
      if (el.getAttribute("data-hand-card") !== "true") return el;
    }
  }
  return matches[0] ?? document.querySelector(`[data-target-id="${id}"]`);
}

// Element box in fixed-overlay (viewport) coordinates, corrected for a CSS
// `zoom` that the browser may not have baked into getBoundingClientRect. Board
// and hand cards render at `zoom: 1.41` (and carry `data-zoom` so the factor is
// read reliably).
//
// Chrome bakes the zoom into the rect: `rect.width` ≈ 1.41× the unzoomed layout
// width (`offsetWidth`), and the rect is already in painted/viewport space.
//
// Safari/iPad instead returns the rect in the element's PRE-zoom coordinate
// space (`rect.width` ≈ `offsetWidth`, ratio ~1). The painted box — which is
// what position:fixed overlays and touch input use — is that rect scaled by the
// zoom about the VIEWPORT ORIGIN (measured on-device: rect [240,439,120,168] at
// zoom 1.41 paints as [338,619,169,237], and a tap landed inside it). So both
// position AND size get multiplied. Detected via the ratio, so Chrome (ratio
// ~1.41) is a strict no-op.
export function overlayRect(el: Element): { left: number; top: number; width: number; height: number } {
  const r = el.getBoundingClientRect();
  const he = el as HTMLElement;
  const zoom =
    parseFloat(el.getAttribute("data-zoom") ?? "") ||
    parseFloat(getComputedStyle(he).zoom || "") ||
    1;
  if (zoom !== 1 && he.offsetWidth > 0 && Math.abs(r.width / he.offsetWidth - 1) < 0.15) {
    return { left: r.left * zoom, top: r.top * zoom, width: r.width * zoom, height: r.height * zoom };
  }
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export function getInstanceCenter(id: string): { x: number; y: number } | null {
  const el = findInstanceEl(id);
  if (!el) return null;
  const b = overlayRect(el);
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}

// ---- Curved targeting path (was duplicated 3× with divergent constants) -----
// One source of truth so live targeting arrows and the spell-cast arrows curve
// identically (previously 0.25/100 vs 0.22/90 — visibly inconsistent).
export function curvedPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  opts: { strength?: number; max?: number } = {},
): { d: string; cx: number; cy: number } {
  const { strength = 0.22, max = 90 } = opts;
  const midX = (sx + tx) / 2;
  const midY = (sy + ty) / 2;
  const dist = Math.hypot(tx - sx, ty - sy);
  const curve = Math.min(dist * strength, max);
  const cy = midY - curve;
  return { d: `M ${sx} ${sy} Q ${midX} ${cy} ${tx} ${ty}`, cx: midX, cy };
}

// ---- Deterministic sparkle geometry ----------------------------------------
// Replaces the per-render `Math.random()` the overlays used (which reshuffled
// on every re-render and diverged between networked clients). A cheap hash of
// the index gives stable-yet-varied radii, computed once per sparkle.
export function sparkleRadius(i: number, base: number, spread: number): number {
  const h = Math.sin(i * 12.9898) * 43758.5453;
  const frac = h - Math.floor(h); // 0..1, deterministic per index
  return base + frac * spread;
}

export function sparkleDuration(i: number, base: number, spread: number): number {
  const h = Math.sin(i * 78.233) * 12543.1234;
  const frac = h - Math.floor(h);
  return base + frac * spread;
}

// General deterministic pseudo-random in [0,1) from an index + channel seed.
// Same inputs → same output on every client and every re-render — unlike
// Math.random, which reshuffles between renders, diverges between networked
// clients, AND is rejected by the react-hooks/purity rule when called in
// render (including inside useMemo). `seed` decorrelates independent quantities
// (radius vs size vs hue) drawn for the same index; `frac(i, s)`-style usage.
export function hashRandom(i: number, seed: number): number {
  const h = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return h - Math.floor(h);
}
