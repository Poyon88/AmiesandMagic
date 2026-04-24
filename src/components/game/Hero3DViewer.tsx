"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Stage, useGLTF } from "@react-three/drei";
import { Color, Group, Mesh, MeshStandardMaterial } from "three";
import type { HeroState } from "@/lib/game/types";

// ─── Props ───────────────────────────────────────────────────────────────

interface Hero3DViewerProps {
  hero: HeroState;
  isOpponent: boolean;
  isValidTarget?: boolean;
  damageAmount?: number | null;
  /** Called on any left click (not only valid-target clicks). */
  onClick?: () => void;
  /** Called on a double-click (~ 280ms window). Native dblclick does NOT
   *  suppress the two onClick calls that precede it — consumers should make
   *  their onClick idempotent. */
  onDoubleClick?: () => void;
  /** Called on right-click; default browser menu is suppressed. */
  onContextMenu?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Extra halo color when the hero power is available (not just target). */
  powerReadyHalo?: "gold" | "blue" | null;
}

// ─── Model + visual state ────────────────────────────────────────────────
//
// Renders the GLB with a tint that reflects gameplay state:
//   - neutral (idle)      : no emissive override
//   - hovered target      : pulsing gold halo (isValidTarget = true)
//   - hovered (no target) : stable gold rim via ambient hover prop
//   - taking damage       : red flash + x-shake (via group transform)
//
// Materials are cached on mount so we can restore the original emissive
// values every frame instead of paying an allocation.

interface ModelProps {
  url: string;
  isValidTarget: boolean;
  isHovered: boolean;
  damageAmount: number | null;
}

function HeroModel({ url, isValidTarget, isHovered, damageAmount }: ModelProps) {
  const gltf = useGLTF(url);
  const groupRef = useRef<Group>(null);
  const cachedMats = useRef<{ mat: MeshStandardMaterial; orig: Color }[]>([]);
  const damageStart = useRef<number>(0);
  const prevDamage = useRef<number | null>(null);

  useEffect(() => {
    const cache: { mat: MeshStandardMaterial; orig: Color }[] = [];
    gltf.scene.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m && "emissive" in m) {
          const sm = m as MeshStandardMaterial;
          cache.push({ mat: sm, orig: sm.emissive.clone() });
        }
      }
    });
    cachedMats.current = cache;
    return () => {
      for (const c of cache) c.mat.emissive.copy(c.orig);
    };
  }, [gltf.scene]);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;

    // Detect damage transition (null → value) and kick off the flash/shake
    if (damageAmount != null && prevDamage.current == null) {
      damageStart.current = performance.now();
    }
    prevDamage.current = damageAmount;

    // Baseline transform — gentle idle sway on Y so the hero feels alive.
    // Amplitude ~0.18 rad (~10°), period ~5s.
    const tNow = performance.now() / 1000;
    g.position.x = 0;
    g.position.y = 0;
    g.rotation.y = Math.sin(tNow * 0.7) * 0.18;

    // Damage shake (0.45s)
    if (damageAmount != null) {
      const elapsed = (performance.now() - damageStart.current) / 1000;
      if (elapsed < 0.45) {
        const decay = 1 - elapsed / 0.45;
        g.position.x = Math.sin(elapsed * 50) * 0.08 * decay;
      }
    }

    // Emissive tint per state
    const gold = new Color(1.0, 0.75, 0.25);
    const red = new Color(1.0, 0.2, 0.2);
    const now = performance.now() / 1000;
    for (const c of cachedMats.current) {
      // Start from original
      c.mat.emissive.copy(c.orig);
      if (damageAmount != null) {
        const elapsed = (performance.now() - damageStart.current) / 1000;
        if (elapsed < 0.2) {
          const k = 1 - elapsed / 0.2;
          c.mat.emissive.lerp(red, 0.75 * k);
          continue;
        }
      }
      if (isValidTarget) {
        const pulse = 0.4 + 0.3 * Math.sin(now * 4);
        c.mat.emissive.lerp(gold, pulse);
      } else if (isHovered) {
        c.mat.emissive.lerp(gold, 0.2);
      }
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={gltf.scene} />
    </group>
  );
}

// ─── Main viewer ─────────────────────────────────────────────────────────

export default function Hero3DViewer({
  hero,
  isOpponent,
  isValidTarget = false,
  damageAmount = null,
  onClick,
  onDoubleClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
  powerReadyHalo = null,
}: Hero3DViewerProps) {
  const [hovered, setHovered] = useState(false);
  const glbUrl = hero.heroDefinition?.glbUrl ?? null;

  if (!glbUrl) return null; // caller should pick the 2D fallback

  const interactive = !!(onClick || onDoubleClick || onContextMenu);

  function handleClickCapture(e: React.MouseEvent) {
    if (!onClick) return;
    e.stopPropagation();
    onClick();
  }
  function handleDoubleClickCapture(e: React.MouseEvent) {
    if (!onDoubleClick) return;
    e.stopPropagation();
    onDoubleClick();
  }
  function handleContextMenu(e: React.MouseEvent) {
    if (!onContextMenu) return;
    e.preventDefault();
    e.stopPropagation();
    onContextMenu();
  }

  function handleEnter() {
    setHovered(true);
    onMouseEnter?.();
  }
  function handleLeave() {
    setHovered(false);
    onMouseLeave?.();
  }

  // Halo color precedence: targeting > power-ready > none
  let haloFilter = "none";
  if (isValidTarget) haloFilter = "drop-shadow(0 0 18px rgba(255,200,80,0.55))";
  else if (powerReadyHalo === "blue") haloFilter = "drop-shadow(0 0 14px rgba(74,144,217,0.6))";
  else if (powerReadyHalo === "gold") haloFilter = "drop-shadow(0 0 14px rgba(200,168,78,0.55))";

  return (
    <div
      data-target-id={isOpponent ? "enemy_hero" : "friendly_hero"}
      onClick={handleClickCapture}
      onDoubleClick={handleDoubleClickCapture}
      onContextMenu={handleContextMenu}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className={`relative ${interactive ? "cursor-pointer" : ""}`}
      style={{
        // Scales with the viewport: 40 vmin is ~40% of the smaller dimension,
        // clamped so the hero never collapses below 180px nor exceeds 440px.
        // This keeps the figurine readable on both phones and large desktops
        // without extra media queries.
        width: "clamp(180px, 40vmin, 440px)",
        height: "clamp(213px, 47vmin, 520px)",
        filter: haloFilter,
        transition: "filter 0.25s ease",
        touchAction: "manipulation",
      }}
    >
      <Canvas
        camera={{ position: [0, 0.1, 2.4], fov: 38 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent", touchAction: "manipulation" }}
      >
        <Suspense fallback={null}>
          <Stage
            environment="studio"
            intensity={0.45}
            shadows={false}
            adjustCamera={1.2}
          >
            <HeroModel
              url={glbUrl}
              isValidTarget={isValidTarget}
              isHovered={hovered}
              damageAmount={damageAmount}
            />
          </Stage>
          {/* HP overlay below the model — pure number, no frame, drop-shadow
              for legibility over any board background. */}
          <Html
            position={[0, -1.35, 0]}
            center
            style={{ pointerEvents: "none", userSelect: "none" }}
            zIndexRange={[10, 0]}
          >
            <div
              className={hero.hp <= 10 ? "text-accent" : "text-white"}
              style={{
                fontFamily: "var(--font-cinzel), serif",
                fontSize: 32,
                fontWeight: 800,
                letterSpacing: 1,
                lineHeight: 1,
                whiteSpace: "nowrap",
                textShadow:
                  "0 2px 6px rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,0.8), 0 0 1px rgba(0,0,0,1)",
              }}
            >
              {hero.hp}
            </div>
          </Html>
        </Suspense>
      </Canvas>

      {/* Armor badge — DOM overlay in the bottom-right corner */}
      {hero.armor > 0 && (
        <div className="absolute bottom-3 right-3 w-7 h-7 rounded-full bg-yellow-600 border-2 border-yellow-400 flex items-center justify-center shadow-md z-10">
          <span className="text-[11px] font-bold text-white">{hero.armor}</span>
        </div>
      )}

      {/* Damage preview badge */}
      {damageAmount != null && damageAmount > 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-accent text-white text-xs font-bold shadow-lg z-10 animate-pulse">
          −{damageAmount}
        </div>
      )}
    </div>
  );
}
