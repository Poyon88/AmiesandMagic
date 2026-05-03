"use client";

// Metallic gradient frame applied as an absolutely-positioned sibling of the
// card. Shown only when zoomed in-game (hover-zoom on hand/board) — at rest
// the card stays unframed so there's no signal noise during normal play.
// Static metallic + glow only: no cursor-tracking glossy reflection (kept
// for the collection's `ExpertCardFrame`), since 12-15 cards on screen with
// dynamic effects would be too noisy in-game.
//
// Dark stops at the gradient's 0% and 100% (the corners on a 135° gradient)
// were dropped: on a thin 4-px ring those dark stops painted the four
// corners noticeably darker than the sides, producing visible "pointy"
// artefacts at the corners. The 3-stop medium→light→medium gradient keeps
// the metallic shimmer along the diagonal without darkening the corners.
const METAL: Record<string, string> = {
  "Peu Commune":
    "linear-gradient(135deg, #4caf50 0%, #c8f5cb 50%, #4caf50 100%)",
  "Rare":
    "linear-gradient(135deg, #4fc3f7 0%, #d6f0ff 50%, #4fc3f7 100%)",
  "Épique":
    "linear-gradient(135deg, #ce93d8 0%, #fbe5ff 50%, #ce93d8 100%)",
  "Légendaire":
    "linear-gradient(135deg, #d4a944 0%, #fff1c1 50%, #d4a944 100%)",
};

const GLOW: Record<string, string> = {
  "Peu Commune": "0 0 12px rgba(76,175,80,0.35)",
  "Rare": "0 0 12px rgba(79,195,247,0.35)",
  "Épique": "0 0 12px rgba(206,147,216,0.35)",
  "Légendaire": "0 0 14px rgba(212,169,68,0.45)",
};

interface Props {
  rarity: string | null | undefined;
  /** When true, the frame fades to opacity 1; otherwise it stays at 0. The
   *  element is always present in the DOM so the transition animates both
   *  directions cleanly. */
  visible: boolean;
  /** Pixel inset (negative). Frame extends `inset` px past the card edge. */
  inset?: number;
  /** Outer border-radius. Should be slightly larger than the inner card's
   *  radius so the frame ring stays visually concentric. */
  borderRadius?: number;
}

export default function RarityFrame({ rarity, visible, inset = 4, borderRadius = 14 }: Props) {
  if (!rarity || rarity === "Commune") return null;
  const metal = METAL[rarity];
  const glow = GLOW[rarity];
  if (!metal) return null;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: -inset,
        borderRadius,
        background: metal,
        boxShadow: visible ? glow : "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.15s ease-in-out, box-shadow 0.15s ease-in-out",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
