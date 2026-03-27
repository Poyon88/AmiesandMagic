"use client";

/** Renders a keyword icon — emoji string or image path (starts with "/") */
export default function KeywordIcon({ symbol, size = 14 }: { symbol: string; size?: number }) {
  if (symbol.startsWith("/")) {
    const imgSize = Math.round(size * 1.8);
    return <img src={symbol} alt="" style={{ width: imgSize, height: imgSize, objectFit: "contain", display: "inline-block", verticalAlign: "middle" }} />;
  }
  return <span style={{ fontSize: size, lineHeight: 1 }}>{symbol}</span>;
}
