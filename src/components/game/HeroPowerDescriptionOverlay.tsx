"use client";

import { useEffect } from "react";
import type { HeroDefinition } from "@/lib/game/types";

interface HeroPowerDescriptionOverlayProps {
  heroDef: HeroDefinition;
  onClose: () => void;
}

export default function HeroPowerDescriptionOverlay({
  heroDef,
  onClose,
}: HeroPowerDescriptionOverlayProps) {
  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center"
      onClick={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
        style={{
          background: "linear-gradient(160deg, #1a1a2e, #0d0d1a)",
          borderRadius: 12,
          padding: "24px 28px",
          border: "1px solid rgba(200, 168, 78, 0.4)",
          boxShadow: "0 10px 60px rgba(0,0,0,0.6), 0 0 40px rgba(200, 168, 78, 0.15)",
          maxWidth: 420,
          width: "90%",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 2,
              color: "rgba(200, 168, 78, 0.6)",
              fontFamily: "'Cinzel', serif",
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Pouvoir héroïque
          </div>
          <h3
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#c8a84e",
              fontFamily: "'Cinzel', serif",
              textShadow: "0 0 20px rgba(200, 168, 78, 0.3)",
              margin: 0,
            }}
          >
            {heroDef.powerName || "—"}
          </h3>
          <div
            style={{
              height: 1,
              width: 80,
              margin: "10px auto 0",
              background: "linear-gradient(90deg, transparent, #c8a84e, transparent)",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            fontSize: 12,
            color: "#bbb",
            fontFamily: "'Cinzel', serif",
          }}
        >
          <span>
            <span style={{ color: "#888", letterSpacing: 1 }}>Coût : </span>
            <strong style={{ color: "#4a90d9" }}>{heroDef.powerCost ?? 0}</strong> mana
          </span>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(200, 168, 78, 0.25)",
              fontSize: 10,
              letterSpacing: 1,
            }}
          >
            {heroDef.powerType === "passive" ? "Passif" : "Actif"}
          </span>
        </div>

        <p
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: "#e0e0e0",
            fontFamily: "'Crimson Text', serif",
            textAlign: "center",
            margin: 0,
            padding: "8px 0",
          }}
        >
          {heroDef.powerDescription || <em style={{ color: "#777" }}>Aucune description.</em>}
        </p>

        <button
          onClick={onClose}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            background: "rgba(200, 168, 78, 0.1)",
            border: "1px solid rgba(200, 168, 78, 0.4)",
            color: "#c8a84e",
            fontSize: 12,
            fontFamily: "'Cinzel', serif",
            cursor: "pointer",
            alignSelf: "center",
            letterSpacing: 1,
          }}
        >
          Fermer
        </button>

        <div
          style={{
            fontSize: 9,
            color: "rgba(200, 168, 78, 0.35)",
            fontFamily: "'Cinzel', serif",
            letterSpacing: 1,
            textAlign: "center",
            marginTop: 2,
          }}
        >
          Échap ou clic hors zone pour fermer
        </div>
      </div>
    </div>
  );
}
