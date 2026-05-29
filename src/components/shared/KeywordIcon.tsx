"use client";

import { useEffect } from "react";
import { useKeywordIconStore } from "@/lib/store/keywordIconStore";

/**
 * Renders a keyword icon — checks for DB overrides, then falls back to emoji or local image path.
 * `fill`: when true and an image is used, the image fills its parent (width/height 100%, cover).
 * Caller is responsible for sizing the wrapper.
 */
export default function KeywordIcon({
  symbol,
  size = 14,
  keyword,
  fill = false,
}: {
  symbol: string;
  size?: number;
  keyword?: string;
  fill?: boolean;
}) {
  const { overrides, loaded, fetchOverrides } = useKeywordIconStore();

  useEffect(() => {
    if (!loaded) fetchOverrides();
  }, [loaded, fetchOverrides]);

  const overrideUrl = keyword ? overrides[keyword] : undefined;
  const effectiveSymbol = overrideUrl ?? symbol;

  if (effectiveSymbol.startsWith("/") || effectiveSymbol.startsWith("http")) {
    if (fill) {
      return (
        <img
          src={effectiveSymbol}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      );
    }
    const imgSize = Math.round(size * 1.8);
    return (
      <img
        src={effectiveSymbol}
        alt=""
        style={{ width: imgSize, height: imgSize, objectFit: "contain", display: "inline-block", verticalAlign: "middle" }}
      />
    );
  }
  return <span style={{ fontSize: size, lineHeight: 1 }}>{effectiveSymbol}</span>;
}
