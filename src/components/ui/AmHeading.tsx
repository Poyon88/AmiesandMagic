"use client";

import type { ReactNode } from "react";

/**
 * Section heading in foil gold with an optional eyebrow and a diamond-centred
 * decorative rule beneath. Shared across every redesigned page so headings
 * read identically everywhere.
 */
export default function AmHeading({
  eyebrow,
  children,
  subtitle,
  align = "center",
  as: Tag = "h2",
  className,
}: {
  eyebrow?: string;
  children: ReactNode;
  subtitle?: ReactNode;
  align?: "center" | "left";
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  const alignCls = align === "center" ? "text-center items-center" : "text-left items-start";
  return (
    <div className={`flex flex-col ${alignCls} ${className ?? ""}`}>
      {eyebrow && (
        <span
          className="font-display text-[10px] md:text-xs tracking-[0.32em] uppercase text-am-arcane-bright/80 mb-3"
        >
          {eyebrow}
        </span>
      )}
      <Tag
        className="am-foil-text font-display font-bold leading-tight"
        style={{
          fontSize:
            Tag === "h1"
              ? "clamp(34px, 6vw, 60px)"
              : Tag === "h2"
                ? "clamp(26px, 4vw, 44px)"
                : "clamp(20px, 2.6vw, 30px)",
          letterSpacing: "0.04em",
        }}
      >
        {children}
      </Tag>
      <div
        className={`am-rule-diamond mt-5 ${align === "center" ? "w-40" : "w-28"}`}
      />
      {subtitle && (
        <p
          className={`font-serif italic text-am-ink-soft mt-4 max-w-2xl ${align === "center" ? "mx-auto" : ""}`}
          style={{ fontSize: "clamp(15px, 1.7vw, 19px)" }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
