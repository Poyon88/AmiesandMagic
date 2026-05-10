"use client";

import { useEffect, useState } from "react";

/**
 * Full-screen overlay shown when a phone is held in portrait. The game board
 * is locked to a 16:9 landscape ratio, so portrait mode would compress it to
 * a sliver — instead we ask the user to rotate. Tablets in portrait
 * (>= 900 px wide) are allowed through since they fit the layout fine.
 *
 * iOS Safari doesn't support `screen.orientation.lock()`, so we don't try —
 * we just observe the viewport and render this overlay when needed.
 */
export default function OrientationLock() {
  const [isPortraitPhone, setIsPortraitPhone] = useState(false);

  useEffect(() => {
    const update = () => {
      const portrait =
        typeof window !== "undefined" &&
        window.matchMedia("(orientation: portrait)").matches;
      const narrow =
        typeof window !== "undefined" && window.innerWidth < 900;
      setIsPortraitPhone(portrait && narrow);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  if (!isPortraitPhone) return null;

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#0d0d1a",
        color: "#e0e0e0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: 32,
        textAlign: "center",
        fontFamily: "var(--font-cinzel), serif",
      }}
    >
      <div
        aria-hidden
        style={{
          fontSize: 64,
          animation: "amg-rotate-hint 2.4s ease-in-out infinite",
        }}
      >
        📱
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>
        Tournez votre téléphone
      </div>
      <div style={{ fontSize: 14, opacity: 0.75, maxWidth: 320, lineHeight: 1.5 }}>
        Armies & Magic se joue en mode paysage. Mettez votre appareil à
        l&apos;horizontale pour continuer.
      </div>
      <style>{`
        @keyframes amg-rotate-hint {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(90deg); }
        }
      `}</style>
    </div>
  );
}
