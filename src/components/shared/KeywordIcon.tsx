"use client";

import { useEffect } from "react";
import { useKeywordIconStore } from "@/lib/store/keywordIconStore";

/**
 * Renders a keyword icon — checks for DB overrides, then falls back to emoji or local image path.
 * `fill`: when true and an image is used, the image fills its parent (width/height 100%, cover).
 * Caller is responsible for sizing the wrapper.
 */
// Recolour the icon into a flat green or white silhouette. `brightness(0)`
// first flattens any source (emoji or image) to black, then the invert/sepia/
// hue chain tints it. Used to show spell-conferred keywords: green = granted to
// all allies, white = granted to a single targeted creature.
const TINT_FILTERS: Record<"green" | "white", string> = {
  green: "brightness(0) saturate(100%) invert(52%) sepia(64%) saturate(466%) hue-rotate(86deg) brightness(95%) contrast(85%)",
  white: "brightness(0) invert(1)",
};

export default function KeywordIcon({
  symbol,
  size = 14,
  keyword,
  fill = false,
  tint,
}: {
  symbol: string;
  size?: number;
  keyword?: string;
  fill?: boolean;
  tint?: "green" | "white";
}) {
  const { overrides, loaded, fetchOverrides } = useKeywordIconStore();

  useEffect(() => {
    if (!loaded) fetchOverrides();
  }, [loaded, fetchOverrides]);

  const overrideUrl = keyword ? overrides[keyword] : undefined;
  const effectiveSymbol = overrideUrl ?? symbol;
  const tintFilter = tint ? TINT_FILTERS[tint] : undefined;

  if (effectiveSymbol.startsWith("/") || effectiveSymbol.startsWith("http")) {
    if (fill) {
      return (
        <img
          src={effectiveSymbol}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", filter: tintFilter }}
        />
      );
    }
    const imgSize = Math.round(size * 1.8);
    return (
      <img
        src={effectiveSymbol}
        alt=""
        style={{ width: imgSize, height: imgSize, objectFit: "contain", display: "inline-block", verticalAlign: "middle", filter: tintFilter }}
      />
    );
  }
  return <span style={{ fontSize: size, lineHeight: 1, filter: tintFilter, display: tintFilter ? "inline-block" : undefined }}>{effectiveSymbol}</span>;
}
