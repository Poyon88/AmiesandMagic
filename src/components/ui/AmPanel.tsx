"use client";

import type { ReactNode } from "react";

/**
 * Frosted gilded panel — the default container surface for redesigned pages.
 * Optional gold L-corner ornaments give it the "framed codex page" look that
 * ties the whole site together.
 */
export default function AmPanel({
  children,
  className,
  corners = false,
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  corners?: boolean;
  glow?: boolean;
}) {
  return (
    <div
      className={`am-glass relative ${glow ? "shadow-[0_0_50px_-12px_rgba(154,107,255,0.4)]" : ""} ${className ?? ""}`}
    >
      {corners && <Corners />}
      {children}
    </div>
  );
}

function Corners() {
  const base = "absolute w-5 h-5 border-am-gold/60 pointer-events-none";
  return (
    <>
      <span className={`${base} top-2 left-2 border-t border-l rounded-tl-sm`} aria-hidden />
      <span className={`${base} top-2 right-2 border-t border-r rounded-tr-sm`} aria-hidden />
      <span className={`${base} bottom-2 left-2 border-b border-l rounded-bl-sm`} aria-hidden />
      <span className={`${base} bottom-2 right-2 border-b border-r rounded-br-sm`} aria-hidden />
    </>
  );
}
