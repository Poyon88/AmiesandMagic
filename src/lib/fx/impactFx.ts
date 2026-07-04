// Combat FX foundation — shared by the Canvas particle layer (ImpactFxLayer),
// the screen-shake hook and the damage-number popup so all channels read the
// same "hit". Pure & framework-free: a tiny module-level pub/sub emitter plus
// allocation-free particle recipes. NOTHING here touches game state — visual
// randomness (Math.random) is cosmetic only and never feeds the engine, so
// multiplayer determinism is unaffected.

import type { CombatEventType } from "@/lib/game/types";

// --- Shared thresholds (single source of truth) -----------------------------
// Mirrors the thresholds the screen-shake hook used to own locally. Damage at
// or above BIG_HIT_THRESHOLD gets the "cinematic" treatment (denser burst,
// longer hit-stop, crit number). Below SHAKE_THRESHOLD: no shake, sparkle only.
export const SHAKE_THRESHOLD = 3;
export const BIG_HIT_THRESHOLD = 6;

export function isBigHit(amount: number): boolean {
  return amount >= BIG_HIT_THRESHOLD;
}

// --- Palette (mirrors DamageOverlay.config families) ------------------------
// RGB tuples so the Canvas can blend them additively. Kept in the same colour
// family as the DOM popups so canvas glow + DOM number read as one effect.
type RGB = [number, number, number];

interface Palette {
  ember: RGB; // slow, warm body of the burst
  spark: RGB; // fast, hot leading edge
  ring: RGB; // shockwave ring
}

const PALETTES: Record<string, Palette> = {
  // Combat damage — warm orange embers, white-hot sparks, red shockwave.
  damage: { ember: [251, 146, 60], spark: [255, 240, 210], ring: [239, 68, 68] },
  heal: { ember: [74, 222, 128], spark: [220, 255, 230], ring: [34, 197, 94] },
  poison: { ember: [34, 197, 94], spark: [190, 255, 200], ring: [22, 163, 74] },
  // Stat boost — warm golden, graceful and ascending (not violent).
  buff: { ember: [251, 191, 36], spark: [255, 245, 210], ring: [234, 179, 8] },
  // Capability acquired — arcane violet body, gold-white sparks, amethyst ring.
  empower: { ember: [192, 132, 252], spark: [255, 240, 200], ring: [168, 85, 247] },
  // Death — cold ash-grey shards, faint ember soul, dark ring.
  death: { ember: [148, 137, 130], spark: [230, 220, 210], ring: [120, 110, 105] },
  // Poisoned death — toxic green dissolve.
  death_poison: { ember: [74, 160, 90], spark: [190, 255, 200], ring: [34, 120, 60] },
  // Summon — a bright sky-cyan portal with gold sparks (materialisation).
  summon: { ember: [56, 189, 248], spark: [255, 245, 210], ring: [125, 211, 252] },
  // Spell cast — arcane violet release.
  spell: { ember: [168, 85, 247], spark: [233, 213, 255], ring: [192, 132, 252] },
  // Countered / fizzled spell — red.
  spell_red: { ember: [239, 68, 68], spark: [254, 202, 202], ring: [248, 113, 113] },
  // Hero power — golden amber channel.
  heropower: { ember: [234, 179, 8], spark: [254, 240, 138], ring: [250, 204, 21] },
};

// Emitter type — DamageEvent's CombatEventType plus the standalone FX types
// "death"/"summon" (their own store fields) and "cast"/"cast_hit" (emitted
// imperatively by the spell & hero-power overlays).
export type ImpactType = CombatEventType | "death" | "summon" | "cast" | "cast_hit";

// Accepts any palette key (ImpactType plus internal variants like
// "death_poison" / "spell_red" / "heropower"); unknown keys fall back to the
// damage palette.
export function paletteFor(type: string): Palette {
  return PALETTES[type] ?? PALETTES.damage;
}

// --- Emitter (imperative reuse seam) ----------------------------------------
export interface ImpactEmit {
  x: number;
  y: number;
  amount: number;
  type: ImpactType;
  /** Normalised strike direction (target − attacker). 0,0 ⇒ radial burst. */
  dirX: number;
  dirY: number;
  big: boolean;
  /** Death only: toxic-green dissolve vs ash. */
  poisoned?: boolean;
  /** Override palette key (e.g. "spell_red", "heropower") regardless of type. */
  paletteKey?: string;
}

type Listener = (e: ImpactEmit) => void;
const listeners = new Set<Listener>();

/** Subscribe a renderer to impact emits. Returns an unsubscribe fn. */
export function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Fire an impact — any caller (damage bridge today, spells later) can emit. */
export function emitImpact(e: ImpactEmit): void {
  for (const l of listeners) l(e);
}

// --- Particle model ---------------------------------------------------------
export type ParticleKind = "spark" | "ember" | "ring";

export interface Particle {
  active: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number; // seconds
  life: number; // total lifetime in seconds
  size: number; // px (radius for spark/ember, base radius for ring)
  drag: number; // velocity damping per second (0 = none)
  gravity: number; // px/s² applied to vy (negative = rise)
  r: number;
  g: number;
  b: number;
  alpha: number; // peak alpha
}

/** A slot allocator the layer passes in — returns a pooled, reset Particle. */
export type Acquire = () => Particle | null;

const TAU = Math.PI * 2;

// --- Recipes (allocation-free: configure pooled particles in place) ---------
// Each recipe writes into slots obtained from `acquire`. Intensity scales with
// the hit amount; `big` hits get denser/longer bursts. dirX/dirY are the
// normalised strike vector (0,0 ⇒ radial).

/** Fast hot sparks shooting along the strike vector, past the target. */
export function directionalDebris(
  acquire: Acquire,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  intensity: number,
  big: boolean,
  pal: Palette,
): void {
  const count = Math.round((big ? 16 : 9) + intensity * 1.4);
  const hasDir = dirX !== 0 || dirY !== 0;
  const baseAngle = hasDir ? Math.atan2(dirY, dirX) : 0;
  // Tight cone along the strike when directional; full circle otherwise.
  const spread = hasDir ? 0.9 : TAU;
  for (let i = 0; i < count; i++) {
    const p = acquire();
    if (!p) return;
    const angle = hasDir
      ? baseAngle + (Math.random() - 0.5) * spread
      : Math.random() * TAU;
    const speed = (220 + Math.random() * 320) * (big ? 1.25 : 1);
    p.kind = "spark";
    p.x = x;
    p.y = y;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    // Negative birth offset (0–50ms) so the shards spray out over time rather
    // than popping as one instantaneous starburst.
    p.age = -(Math.random() * 0.05);
    p.life = 0.28 + Math.random() * 0.32;
    p.size = 2 + Math.random() * 2.5;
    p.drag = 4.5;
    p.gravity = 320;
    p.r = pal.spark[0];
    p.g = pal.spark[1];
    p.b = pal.spark[2];
    p.alpha = 0.5;
  }
}

/** Radial spray of warm embers — the body/volume of the burst. */
export function sparkBurst(
  acquire: Acquire,
  x: number,
  y: number,
  intensity: number,
  big: boolean,
  pal: Palette,
): void {
  const count = Math.round((big ? 22 : 12) + intensity * 1.6);
  for (let i = 0; i < count; i++) {
    const p = acquire();
    if (!p) return;
    const angle = Math.random() * TAU;
    const speed = 60 + Math.random() * 200;
    p.kind = "ember";
    p.x = x;
    p.y = y;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.age = 0;
    p.life = 0.5 + Math.random() * 0.6;
    p.size = 2.5 + Math.random() * 3.5;
    p.drag = 3;
    p.gravity = 60;
    p.r = pal.ember[0];
    p.g = pal.ember[1];
    p.b = pal.ember[2];
    p.alpha = 0.45;
  }
}

/** A few slow rising embers that linger — adds depth after the flash. */
export function embers(
  acquire: Acquire,
  x: number,
  y: number,
  intensity: number,
  big: boolean,
  pal: Palette,
): void {
  const count = Math.round((big ? 8 : 4) + intensity * 0.4);
  for (let i = 0; i < count; i++) {
    const p = acquire();
    if (!p) return;
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.4; // upward-ish
    const speed = 30 + Math.random() * 70;
    p.kind = "ember";
    p.x = x + (Math.random() - 0.5) * 24;
    p.y = y + (Math.random() - 0.5) * 24;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.age = 0;
    p.life = 0.8 + Math.random() * 0.7;
    p.size = 2 + Math.random() * 2;
    p.drag = 1.5;
    p.gravity = -40; // rise
    p.r = pal.ember[0];
    p.g = pal.ember[1];
    p.b = pal.ember[2];
    p.alpha = 0.4;
  }
}

/** One expanding shockwave ring at the impact point. */
export function shockwaveSprite(
  acquire: Acquire,
  x: number,
  y: number,
  big: boolean,
  pal: Palette,
): void {
  const p = acquire();
  if (!p) return;
  p.kind = "ring";
  p.x = x;
  p.y = y;
  p.vx = 0;
  p.vy = 0;
  p.age = 0;
  p.life = big ? 0.5 : 0.38;
  p.size = big ? 18 : 12; // base radius; expands over life
  p.drag = 0;
  p.gravity = 0;
  p.r = pal.ring[0];
  p.g = pal.ring[1];
  p.b = pal.ring[2];
  p.alpha = big ? 0.7 : 0.5;
}

// --- Boost recipes (graceful/arcane — NOT violent) --------------------------

/** Ascending golden motes — the body of a stat-boost (+X/+Y). Rises from the
 *  unit, gentle and warm, the opposite of the combat burst. */
export function risingMotes(
  acquire: Acquire,
  x: number,
  y: number,
  intensity: number,
  pal: Palette,
): void {
  const count = Math.round(10 + intensity * 1.4);
  for (let i = 0; i < count; i++) {
    const p = acquire();
    if (!p) return;
    p.kind = "ember";
    p.x = x + (Math.random() - 0.5) * 70;
    p.y = y + (Math.random() - 0.2) * 40;
    p.vx = (Math.random() - 0.5) * 28;
    p.vy = -(45 + Math.random() * 75); // rise
    p.age = 0;
    p.life = 0.7 + Math.random() * 0.7;
    p.size = 2 + Math.random() * 2.6;
    p.drag = 1.1;
    p.gravity = -22; // keep accelerating upward
    p.r = pal.ember[0];
    p.g = pal.ember[1];
    p.b = pal.ember[2];
    p.alpha = 0.42;
  }
}

/** A soft halo ring that swells around the unit — used by boost & empower as a
 *  gentler counterpart to the combat shockwave. */
export function haloRing(
  acquire: Acquire,
  x: number,
  y: number,
  pal: Palette,
): void {
  const p = acquire();
  if (!p) return;
  p.kind = "ring";
  p.x = x;
  p.y = y;
  p.vx = 0;
  p.vy = 0;
  p.age = 0;
  p.life = 0.6;
  p.size = 16;
  p.drag = 0;
  p.gravity = 0;
  p.r = pal.ring[0];
  p.g = pal.ring[1];
  p.b = pal.ring[2];
  p.alpha = 0.5;
}

/** Arcane "power gathering" — sparks spawn on a ring around the unit and
 *  implode toward its centre, reading as a rune sealing in. The climax (rising
 *  motes + halo) is layered by the caller. */
export function arcaneConverge(
  acquire: Acquire,
  x: number,
  y: number,
  intensity: number,
  pal: Palette,
): void {
  const count = Math.round(16 + intensity);
  const radius = 58;
  for (let i = 0; i < count; i++) {
    const p = acquire();
    if (!p) return;
    const angle = (i / count) * TAU + (Math.random() - 0.5) * 0.3;
    const speed = 90 + Math.random() * 70;
    p.kind = "spark";
    p.x = x + Math.cos(angle) * radius;
    p.y = y + Math.sin(angle) * radius;
    p.vx = -Math.cos(angle) * speed; // inward
    p.vy = -Math.sin(angle) * speed;
    p.age = 0;
    p.life = 0.4 + Math.random() * 0.22;
    p.size = 1.8 + Math.random() * 2;
    p.drag = 1.4;
    p.gravity = 0;
    p.r = pal.spark[0];
    p.g = pal.spark[1];
    p.b = pal.spark[2];
    p.alpha = 0.5;
  }
}

// --- Death recipes (the unit comes apart) -----------------------------------

/** Shards flung outward and down — the body breaking apart. Heavier gravity &
 *  drag than combat debris so they arc and fall rather than spray. */
export function deathShards(
  acquire: Acquire,
  x: number,
  y: number,
  pal: Palette,
): void {
  const count = 18;
  for (let i = 0; i < count; i++) {
    const p = acquire();
    if (!p) return;
    const angle = Math.random() * TAU;
    const speed = 70 + Math.random() * 170;
    p.kind = "spark";
    p.x = x + (Math.random() - 0.5) * 30;
    p.y = y + (Math.random() - 0.5) * 40;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed - 40; // slight initial upward pop
    p.age = -(Math.random() * 0.05); // staggered emission (see directionalDebris)
    p.life = 0.55 + Math.random() * 0.5;
    p.size = 2.5 + Math.random() * 3;
    p.drag = 2.2;
    p.gravity = 520; // fall
    p.r = pal.spark[0];
    p.g = pal.spark[1];
    p.b = pal.spark[2];
    p.alpha = 0.5;
  }
}

/** Slow drifting motes that sink and fade — settling ash/dust. */
export function ashFall(
  acquire: Acquire,
  x: number,
  y: number,
  pal: Palette,
): void {
  const count = 14;
  for (let i = 0; i < count; i++) {
    const p = acquire();
    if (!p) return;
    p.kind = "ember";
    p.x = x + (Math.random() - 0.5) * 60;
    p.y = y + (Math.random() - 0.5) * 50;
    p.vx = (Math.random() - 0.5) * 24;
    p.vy = 18 + Math.random() * 40; // drift down
    p.age = 0;
    p.life = 0.9 + Math.random() * 0.8;
    p.size = 2 + Math.random() * 2.4;
    p.drag = 1.2;
    p.gravity = 60;
    p.r = pal.ember[0];
    p.g = pal.ember[1];
    p.b = pal.ember[2];
    p.alpha = 0.38;
  }
}

/** A few bright motes rising and fading — the soul leaving the body. */
export function soulRise(
  acquire: Acquire,
  x: number,
  y: number,
  pal: Palette,
): void {
  const count = 5;
  for (let i = 0; i < count; i++) {
    const p = acquire();
    if (!p) return;
    p.kind = "ember";
    p.x = x + (Math.random() - 0.5) * 22;
    p.y = y + (Math.random() - 0.3) * 20;
    p.vx = (Math.random() - 0.5) * 14;
    p.vy = -(55 + Math.random() * 55); // rise
    p.age = 0;
    p.life = 0.8 + Math.random() * 0.6;
    p.size = 2.4 + Math.random() * 2;
    p.drag = 1;
    p.gravity = -30;
    p.r = pal.spark[0];
    p.g = pal.spark[1];
    p.b = pal.spark[2];
    p.alpha = 0.5;
  }
}
