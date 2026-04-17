"use client";

import { useEffect } from "react";
import { useKeywordIconStore } from "@/lib/store/keywordIconStore";

/** Renders a keyword icon — checks for DB overrides, then falls back to emoji or local image path */
export default function KeywordIcon({ symbol, size = 14, keyword }: { symbol: string; size?: number; keyword?: string }) {
  const { overrides, loaded, fetchOverrides } = useKeywordIconStore();

  useEffect(() => {
    if (!loaded) fetchOverrides();
  }, [loaded, fetchOverrides]);

  // Check for DB override
  const overrideUrl = keyword ? overrides[keyword] : undefined;
  const effectiveSymbol = overrideUrl ?? symbol;

  if (effectiveSymbol.startsWith("/") || effectiveSymbol.startsWith("http")) {
    const imgSize = Math.round(size * 1.8);
    return <img src={effectiveSymbol} alt="" style={{ width: imgSize, height: imgSize, objectFit: "contain", display: "inline-block", verticalAlign: "middle" }} />;
  }
  return <span style={{ fontSize: size, lineHeight: 1 }}>{effectiveSymbol}</span>;
}
