"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/store/gameStore";
import {
  type Particle,
  type ImpactEmit,
  subscribe,
  emitImpact,
  paletteFor,
  isBigHit,
  directionalDebris,
  sparkBurst,
  embers,
  shockwaveSprite,
  risingMotes,
  haloRing,
  arcaneConverge,
  deathShards,
  ashFall,
  soulRise,
} from "@/lib/fx/impactFx";

// Pool size — a hit emits ~40-90 particles; 700 comfortably covers several
// overlapping hits (Fureur chains, multi-target) without per-emit allocation.
const POOL_SIZE = 700;
const MAX_DPR = 2; // Retina can report 2-3; cap to spare additive fill-rate.

function makePool(): Particle[] {
  const pool: Particle[] = new Array(POOL_SIZE);
  for (let i = 0; i < POOL_SIZE; i++) {
    pool[i] = {
      active: false,
      kind: "spark",
      x: 0, y: 0, vx: 0, vy: 0,
      age: 0, life: 0, size: 0,
      drag: 0, gravity: 0,
      r: 0, g: 0, b: 0, alpha: 0,
    };
  }
  return pool;
}

/**
 * Full-screen additive Canvas particle layer for combat impacts. Mounted once,
 * body-fixed (sibling of DamageOverlay) so the shaking/overflow/zoom board
 * wrapper can't clip or rescale it. A single rAF loop that SLEEPS when no
 * particle is alive and re-arms on the next emit. Driven by `damageEvents`
 * (deterministic on both clients) via the impactFx emitter — visual randomness
 * never feeds game state.
 */
export default function ImpactFxLayer() {
  const damageEvents = useGameStore((s) => s.damageEvents);
  const deathEvents = useGameStore((s) => s.deathEvents);
  const summonEvents = useGameStore((s) => s.summonEvents);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- Render engine: pool + rAF, lives for the component lifetime ----------
  const poolRef = useRef<Particle[] | null>(null);
  const cursorRef = useRef(0);
  const liveRef = useRef(0);
  const runningRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const reducedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    poolRef.current = makePool();
    const pool = poolRef.current;

    // Honour reduced-motion / coarse pointer: suppress the canvas burst
    // entirely (mobile/touch already runs reduced animations elsewhere).
    const reducedMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarseMq = window.matchMedia("(pointer: coarse)");
    const updateReduced = () => {
      reducedRef.current = reducedMq.matches || coarseMq.matches;
    };
    updateReduced();
    reducedMq.addEventListener("change", updateReduced);
    coarseMq.addEventListener("change", updateReduced);

    // DPR-aware sizing. CSS size = viewport; backing store = ×dpr (capped).
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS px
    };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);

    const acquire = (): Particle => {
      const p = pool[cursorRef.current];
      cursorRef.current = (cursorRef.current + 1) % POOL_SIZE;
      if (!p.active) {
        p.active = true;
        liveRef.current++;
      }
      // (if stomping a still-active slot, liveRef stays correct — slot remains
      //  active, just reinitialised; a rare pop only under extreme load.)
      return p;
    };

    const spawn = (e: ImpactEmit) => {
      if (reducedRef.current) return;
      const intensity = Math.min(e.amount, 12);
      if (e.type === "death") {
        // The unit comes apart — shards fall, ash settles, soul rises.
        const pal = paletteFor(e.poisoned ? "death_poison" : "death");
        deathShards(acquire, e.x, e.y, pal);
        ashFall(acquire, e.x, e.y, pal);
        soulRise(acquire, e.x, e.y, pal);
        haloRing(acquire, e.x, e.y, pal);
        arm();
        return;
      }
      if (e.type === "summon") {
        // Materialisation — energy gathers inward, a portal ring swells, and
        // motes rise as the unit forms.
        const pal = paletteFor("summon");
        arcaneConverge(acquire, e.x, e.y, 6, pal);
        risingMotes(acquire, e.x, e.y, 7, pal);
        haloRing(acquire, e.x, e.y, pal);
        arm();
        return;
      }
      if (e.type === "cast") {
        // Spell / hero-power RELEASE at the card — energy radiates outward so
        // it frames the card rather than covering it.
        const pal = paletteFor(e.paletteKey ?? "spell");
        haloRing(acquire, e.x, e.y, pal);
        sparkBurst(acquire, e.x, e.y, 6, false, pal);
        risingMotes(acquire, e.x, e.y, 5, pal);
        arm();
        return;
      }
      if (e.type === "cast_hit") {
        // Spell ARRIVAL on a target — energy gathers in just before the impact.
        const pal = paletteFor(e.paletteKey ?? "spell");
        arcaneConverge(acquire, e.x, e.y, 7, pal);
        haloRing(acquire, e.x, e.y, pal);
        arm();
        return;
      }
      const pal = paletteFor(e.type);
      if (e.type === "buff") {
        // Stat boost — graceful ascending gold, no violent burst.
        haloRing(acquire, e.x, e.y, pal);
        risingMotes(acquire, e.x, e.y, intensity, pal);
      } else if (e.type === "empower") {
        // Capability acquired — arcane implosion, then a rising flourish.
        arcaneConverge(acquire, e.x, e.y, intensity, pal);
        haloRing(acquire, e.x, e.y, pal);
        risingMotes(acquire, e.x, e.y, 4, pal);
      } else {
        // Combat damage — directional shockwave + debris.
        shockwaveSprite(acquire, e.x, e.y, e.big, pal);
        sparkBurst(acquire, e.x, e.y, intensity, e.big, pal);
        directionalDebris(acquire, e.x, e.y, e.dirX, e.dirY, intensity, e.big, pal);
        embers(acquire, e.x, e.y, intensity, e.big, pal);
      }
      arm();
    };

    const frame = (now: number) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = now;

      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter"; // additive bloom

      for (let i = 0; i < POOL_SIZE; i++) {
        const p = pool[i];
        if (!p.active) continue;
        p.age += dt;
        if (p.age >= p.life) {
          p.active = false;
          liveRef.current--;
          continue;
        }
        const t = p.age / p.life; // 0→1
        // Integrate motion (skip for static rings).
        if (p.kind !== "ring") {
          const damp = Math.max(0, 1 - p.drag * dt);
          p.vx *= damp;
          p.vy = p.vy * damp + p.gravity * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }

        if (p.kind === "ring") {
          const expand = 1 + t * 5;
          const radius = p.size * expand;
          ctx.globalAlpha = p.alpha * (1 - t);
          ctx.strokeStyle = `rgb(${p.r},${p.g},${p.b})`;
          ctx.lineWidth = Math.max(0.5, (1 - t) * 4);
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          // Soft glowing dot via radial gradient — accumulates into bloom.
          const a = p.alpha * (1 - t);
          const radius = p.size * (p.kind === "spark" ? 1 - t * 0.6 : 1);
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 2.2);
          grad.addColorStop(0, `rgba(${p.r},${p.g},${p.b},${a})`);
          grad.addColorStop(1, `rgba(${p.r},${p.g},${p.b},0)`);
          ctx.globalAlpha = 1;
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      if (liveRef.current > 0 && document.visibilityState === "visible") {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        // Sleep — one last clear so no stale glow lingers, then stop the loop.
        ctx.clearRect(0, 0, w, h);
        runningRef.current = false;
        rafRef.current = null;
      }
    };

    const arm = () => {
      if (runningRef.current) return;
      runningRef.current = true;
      lastTimeRef.current = performance.now();
      rafRef.current = requestAnimationFrame(frame);
    };

    // Pause/resume on tab visibility so a backgrounded tab never spins.
    const onVisibility = () => {
      if (document.visibilityState === "visible" && liveRef.current > 0) arm();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const unsub = subscribe(spawn);

    return () => {
      unsub();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      reducedMq.removeEventListener("change", updateReduced);
      coarseMq.removeEventListener("change", updateReduced);
    };
  }, []);

  // --- Bridge: damageEvents → emitImpact (dedup like useScreenShake) ---------
  const lastSigRef = useRef("");
  useEffect(() => {
    const signature = damageEvents
      .map((e) => `${e.targetId}:${e.amount}:${e.type ?? "damage"}:${e.delayMs ?? 0}`)
      .join("|");
    if (signature === lastSigRef.current) return;
    lastSigRef.current = signature;
    if (damageEvents.length === 0) return;

    const FX_TYPES = new Set(["damage", "buff", "empower"]);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const ev of damageEvents) {
      const evType = ev.type ?? "damage";
      if (!FX_TYPES.has(evType)) continue;
      if (ev.x < -9000) continue; // target node was gone — nothing to draw
      const emit = () => {
        const hasSrc = ev.srcX != null && ev.srcY != null && ev.srcX > -9000;
        let dirX = 0;
        let dirY = 0;
        if (hasSrc) {
          const dx = ev.x - (ev.srcX as number);
          const dy = ev.y - (ev.srcY as number);
          const len = Math.hypot(dx, dy) || 1;
          dirX = dx / len;
          dirY = dy / len;
        }
        emitImpact({
          x: ev.x,
          y: ev.y,
          amount: ev.amount,
          type: ev.type ?? "damage",
          dirX,
          dirY,
          big: isBigHit(ev.amount),
        });
      };
      const delay = ev.delayMs ?? 0;
      if (delay <= 0) emit();
      else timers.push(setTimeout(emit, delay));
    }
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [damageEvents]);

  // --- Bridge: deathEvents → emitImpact("death") ----------------------------
  const lastDeathSigRef = useRef("");
  useEffect(() => {
    const signature = deathEvents.map((e) => `${e.instanceId}:${e.poisoned}`).join("|");
    if (signature === lastDeathSigRef.current) return;
    lastDeathSigRef.current = signature;
    if (deathEvents.length === 0) return;
    for (const ev of deathEvents) {
      if (ev.x < -9000) continue; // node was already gone — nothing to draw
      emitImpact({
        x: ev.x,
        y: ev.y,
        amount: 0,
        type: "death",
        dirX: 0,
        dirY: 0,
        big: false,
        poisoned: ev.poisoned,
      });
    }
  }, [deathEvents]);

  // --- Bridge: summonEvents → emitImpact("summon") --------------------------
  // The creatures mount in the same render that set summonEvents, so resolve
  // each one's centre from the DOM. A short delay lets the entry spring carry
  // it toward its resting spot before the portal bursts there.
  const lastSummonSigRef = useRef("");
  useEffect(() => {
    const signature = summonEvents.join("|");
    if (signature === lastSummonSigRef.current) return;
    lastSummonSigRef.current = signature;
    if (summonEvents.length === 0) return;

    const ids = [...summonEvents];
    const timer = setTimeout(() => {
      for (const id of ids) {
        const el = document.querySelector(`[data-instance-id="${id}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        emitImpact({
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
          amount: 0,
          type: "summon",
          dirX: 0,
          dirY: 0,
          big: false,
        });
      }
    }, 110);
    return () => clearTimeout(timer);
  }, [summonEvents]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 99, // just below DamageOverlay's 100 → number stays crisp on top
      }}
    />
  );
}
