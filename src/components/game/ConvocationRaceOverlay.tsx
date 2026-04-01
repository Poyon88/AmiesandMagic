"use client";

import type { TokenTemplate } from "@/lib/game/types";

interface ConvocationRaceOverlayProps {
  templates: TokenTemplate[];
  onSelect: (race: string) => void;
  onCancel: () => void;
}

export default function ConvocationRaceOverlay({ templates, onSelect, onCancel }: ConvocationRaceOverlayProps) {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
      <div style={{
        background: "#1a1a2e", borderRadius: 12, padding: 24,
        border: "1px solid #f1c40f66", boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
        maxWidth: 500, width: "90%",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#f1c40f", fontFamily: "'Cinzel',serif" }}>
            📣 Convocation
          </div>
          <p style={{ fontSize: 13, color: "#bbb", fontFamily: "'Crimson Text',serif", marginTop: 4 }}>
            Choisissez la race du token à invoquer
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, maxHeight: 400, overflowY: "auto" }}>
          {templates.map(t => (
            <button
              key={t.id}
              onClick={() => onSelect(t.race)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                padding: 10, borderRadius: 8, cursor: "pointer",
                background: "#ffffff08",
                border: "1px solid #333",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "#f1c40f";
                e.currentTarget.style.background = "#f1c40f18";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "#333";
                e.currentTarget.style.background = "#ffffff08";
              }}
            >
              {t.image_url ? (
                <img src={t.image_url} alt={t.name} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6 }} />
              ) : (
                <div style={{ width: 64, height: 64, background: "#ffffff10", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>⚔️</div>
              )}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#f1c40f", fontFamily: "'Cinzel',serif", textAlign: "center" }}>
                {t.name}
              </div>
              <div style={{ fontSize: 9, color: "#888" }}>{t.race}</div>
            </button>
          ))}
        </div>

        <button
          onClick={onCancel}
          style={{
            padding: "8px 20px", borderRadius: 8, cursor: "pointer",
            background: "#ffffff08", border: "1px solid #555",
            color: "#999", fontFamily: "'Cinzel',serif", fontSize: 11,
            transition: "all 0.15s",
          }}
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
