"use client";

import {
  useState,
  useRef,
  useLayoutEffect,
  type ReactNode,
  type MouseEvent,
  type CSSProperties,
} from "react";

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

const RUNE_COLORS: Record<string, string> = {
  "Peu Commune": "#0b1f0b",
  "Rare": "#081a2e",
  "Épique": "#1b0826",
  "Légendaire": "#2a1d05",
};

// Elder futhark glyphs — engraved along every side of the card's thickness.
const RUNE_STRING = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛋᛏᛒᛖᛗᛚᛜᛞᛟᚠᚢᚦᚨᚱᚲ";

// Card geometry. FRAME_PADDING: thickness of the metallic rim visible on the
// front face (slim now that the side runes carry most of the ornamentation).
// CARD_THICKNESS: depth of the "tranche" visible when the card tilts.
const FRAME_PADDING = 4;
const CARD_THICKNESS = 18;

interface ExpertCardFrameProps {
  rarity: string;
  children: ReactNode;
}

export default function ExpertCardFrame({ rarity, children }: ExpertCardFrameProps) {
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, mx: 50, my: 50, hovered: false });
  const faceRef = useRef<HTMLDivElement>(null);
  // Defaults match the md-size GameCard in the Collection so the edge strips
  // align correctly even before the first measurement.
  const [dims, setDims] = useState({ w: 260 + 2 * FRAME_PADDING, h: 364 + 2 * FRAME_PADDING });

  useLayoutEffect(() => {
    const el = faceRef.current;
    if (!el) return;
    const update = () => setDims({ w: el.offsetWidth, h: el.offsetHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const metal = METAL_GRADIENTS[rarity] ?? METAL_GRADIENTS["Rare"];
  const glow = EDGE_GLOW[rarity] ?? EDGE_GLOW["Rare"];
  const runeColor = RUNE_COLORS[rarity] ?? RUNE_COLORS["Rare"];

  function onMove(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    const ry = (mx - 50) * 0.55;
    const rx = (my - 50) * -0.55;
    setTilt({ rx, ry, mx, my, hovered: true });
  }

  function onLeave() {
    setTilt({ rx: 0, ry: 0, mx: 50, my: 50, hovered: false });
  }

  const T = CARD_THICKNESS;
  const W = dims.w;
  const H = dims.h;
  const runeFontSize = Math.max(9, Math.floor(T * 0.7));

  const sideBase: CSSProperties = {
    position: "absolute",
    top: "50%",
    left: "50%",
    background: metal,
    color: runeColor,
    fontFamily: "'Cinzel', serif",
    fontSize: runeFontSize,
    letterSpacing: "0.18em",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    userSelect: "none",
    pointerEvents: "none",
    textShadow: "0 1px 0 rgba(255,255,255,0.35), 0 -1px 0 rgba(0,0,0,0.45)",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35), inset 0 0 6px rgba(0,0,0,0.25)",
  };

  return (
    <div
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{
        perspective: "900px",
        display: "inline-block",
        // Use the CSS `zoom` property instead of `transform: scale()` so the
        // content (text, images, runes) is re-rasterised at the zoomed
        // resolution instead of upscaled — crucial for a sharp hover. Matches
        // the approach used for in-game HandCard zoom.
        zoom: tilt.hovered ? 1.5 : 1,
        transition: "zoom 0.2s ease-out",
        zIndex: tilt.hovered ? 20 : 1,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "relative",
          width: W,
          height: H,
          transformStyle: "preserve-3d",
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)${tilt.hovered ? ` translateZ(${T / 2}px)` : ""}`,
          transition: tilt.hovered
            ? "transform 0.08s ease-out, box-shadow 0.2s ease-out"
            : "transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.4s ease-out",
          willChange: "transform",
        }}
      >
        {/* Front face — slim metallic rim + the card art */}
        <div
          ref={faceRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            padding: FRAME_PADDING,
            borderRadius: 10,
            background: metal,
            boxShadow: `0 14px 32px rgba(0,0,0,0.55), ${glow}`,
            transform: `translateZ(${T / 2}px)`,
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
                background: `radial-gradient(circle at ${tilt.mx}% ${tilt.my}%, rgba(255,255,255,0.32), rgba(255,255,255,0) 55%)`,
                mixBlendMode: "overlay",
                opacity: tilt.hovered ? 1 : 0,
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

        {/* Back face — plain metallic so the back doesn't show through when
            the card tilts sharply. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: W,
            height: H,
            background: metal,
            borderRadius: 10,
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35)",
            transform: `rotateY(180deg) translateZ(${T / 2}px)`,
          }}
        />

        {/* Top edge — runic inscription on the thickness */}
        <div
          style={{
            ...sideBase,
            width: W,
            height: T,
            marginLeft: -W / 2,
            marginTop: -T / 2,
            transform: `rotateX(90deg) translateZ(${H / 2}px)`,
          }}
        >
          {RUNE_STRING}
        </div>

        {/* Bottom edge */}
        <div
          style={{
            ...sideBase,
            width: W,
            height: T,
            marginLeft: -W / 2,
            marginTop: -T / 2,
            transform: `rotateX(-90deg) translateZ(${H / 2}px)`,
          }}
        >
          {RUNE_STRING}
        </div>

        {/* Left edge */}
        <div
          style={{
            ...sideBase,
            width: T,
            height: H,
            marginLeft: -T / 2,
            marginTop: -H / 2,
            writingMode: "vertical-rl",
            transform: `rotateY(-90deg) translateZ(${W / 2}px) rotate(180deg)`,
          }}
        >
          {RUNE_STRING}
        </div>

        {/* Right edge */}
        <div
          style={{
            ...sideBase,
            width: T,
            height: H,
            marginLeft: -T / 2,
            marginTop: -H / 2,
            writingMode: "vertical-rl",
            transform: `rotateY(90deg) translateZ(${W / 2}px)`,
          }}
        >
          {RUNE_STRING}
        </div>
      </div>
    </div>
  );
}
