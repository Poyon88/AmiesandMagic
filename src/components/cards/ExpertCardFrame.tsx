"use client";

import { useState, type ReactNode, type MouseEvent } from "react";

// Metallic gradient stops per rarity — each palette is built like a polished
// strip: dark edge → mid tone → bright highlight → mid tone → dark edge.
const METAL_GRADIENTS: Record<string, string> = {
  "Peu Commune":
    "linear-gradient(135deg, #1e3d1e 0%, #4caf50 25%, #c8f5cb 50%, #4caf50 75%, #1e3d1e 100%)",
  "Rare":
    "linear-gradient(135deg, #0b3a6a 0%, #4fc3f7 25%, #d6f0ff 50%, #4fc3f7 75%, #0b3a6a 100%)",
  "Épique":
    "linear-gradient(135deg, #3a1553 0%, #ce93d8 25%, #fbe5ff 50%, #ce93d8 75%, #3a1553 100%)",
  "Légendaire":
    "linear-gradient(135deg, #6a4a12 0%, #d4a944 25%, #fff1c1 50%, #d4a944 75%, #6a4a12 100%)",
};

const EDGE_GLOW: Record<string, string> = {
  "Peu Commune": "0 0 22px rgba(76,175,80,0.45)",
  "Rare": "0 0 22px rgba(79,195,247,0.45)",
  "Épique": "0 0 22px rgba(206,147,216,0.45)",
  "Légendaire": "0 0 24px rgba(212,169,68,0.55)",
};

const FRAME_PADDING = 4;

interface ExpertCardFrameProps {
  rarity: string;
  children: ReactNode;
}

// 2D variant of the rare-card frame. Renders a metallic rim + rarity glow +
// cursor-following glossy reflection without any 3D transforms — those used
// to flatten the inner card art into a low-DPR GPU texture (preserve-3d
// rasterisation) and made illustrations visibly soft on retina. Hover zoom
// uses CSS `zoom` (re-lays-out at the larger size) instead of
// `transform: scale()` so the content stays crisp when enlarged.
export default function ExpertCardFrame({ rarity, children }: ExpertCardFrameProps) {
  const [hover, setHover] = useState({ mx: 50, my: 50, hovered: false });

  const metal = METAL_GRADIENTS[rarity] ?? METAL_GRADIENTS["Rare"];
  const glow = EDGE_GLOW[rarity] ?? EDGE_GLOW["Rare"];

  function onMove(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    setHover({ mx, my, hovered: true });
  }

  function onLeave() {
    setHover({ mx: 50, my: 50, hovered: false });
  }

  return (
    <div
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{
        display: "inline-block",
        position: "relative",
        // CSS `zoom` re-rasterises the content at the zoomed size instead of
        // upscaling a fixed bitmap (which `transform: scale` would do).
        zoom: hover.hovered ? 1.5 : 1,
        transition: "zoom 0.2s ease-out",
        zIndex: hover.hovered ? 20 : 1,
      }}
    >
      <div
        style={{
          padding: FRAME_PADDING,
          borderRadius: 10,
          background: metal,
          boxShadow: `0 14px 32px rgba(0,0,0,0.55), ${glow}`,
        }}
      >
        <div style={{ position: "relative", borderRadius: 7, overflow: "hidden" }}>
          {children}
          {/* Glossy reflection that follows the cursor. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 7,
              background: `radial-gradient(circle at ${hover.mx}% ${hover.my}%, rgba(255,255,255,0.32), rgba(255,255,255,0) 55%)`,
              mixBlendMode: "overlay",
              opacity: hover.hovered ? 1 : 0,
              transition: "opacity 0.2s ease-out",
              pointerEvents: "none",
            }}
          />
          {/* Thin inner edge highlight. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 7,
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.22)",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>
    </div>
  );
}
