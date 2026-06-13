"use client";

/**
 * Full-bleed atmospheric backdrop for the redesigned out-of-game pages.
 * Layers an arcane gradient mesh, a film-grain texture and a centring
 * vignette so flat sections gain depth without per-page styling. Renders
 * fixed behind content (z -1); the page just needs a transparent body.
 */
export default function AmAtmosphere({ withVignette = true }: { withVignette?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`am-mesh am-grain ${withVignette ? "am-vignette" : ""} fixed inset-0 z-[-1] pointer-events-none`}
    />
  );
}
