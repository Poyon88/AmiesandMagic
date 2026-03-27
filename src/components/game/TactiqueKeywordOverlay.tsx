"use client";

import { useState } from "react";
import { KEYWORD_SYMBOLS } from "@/lib/game/keyword-labels";
import { KEYWORD_LABELS } from "@/lib/game/keyword-labels";
import type { Keyword } from "@/lib/game/types";
import KeywordIcon from "@/components/shared/KeywordIcon";

interface TactiqueKeywordOverlayProps {
  keywords: string[];
  maxSelections: number;
  onConfirm: (selected: string[]) => void;
  onCancel: () => void;
}

export default function TactiqueKeywordOverlay({ keywords, maxSelections, onConfirm, onCancel }: TactiqueKeywordOverlayProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (kw: string) => {
    if (selected.includes(kw)) {
      setSelected(prev => prev.filter(k => k !== kw));
    } else if (selected.length < maxSelections) {
      setSelected(prev => [...prev, kw]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
      <div style={{
        background: "#1a1a2e", borderRadius: 12, padding: 24,
        border: "1px solid #2ecc7166", boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
        maxWidth: 400, width: "90%",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#2ecc71", fontFamily: "'Cinzel',serif" }}>
            📋 Tactique
          </div>
          <p style={{ fontSize: 13, color: "#bbb", fontFamily: "'Crimson Text',serif", marginTop: 4 }}>
            Choisissez {maxSelections} capacité{maxSelections > 1 ? "s" : ""} à transférer
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {keywords.map(kw => {
            const isSelected = selected.includes(kw);
            const gameKw = kw as Keyword;
            const label = KEYWORD_LABELS[gameKw] || kw;
            const symbol = KEYWORD_SYMBOLS[gameKw] || "✦";
            return (
              <button
                key={kw}
                onClick={() => toggle(kw)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                  background: isSelected ? "#2ecc7122" : "#ffffff08",
                  border: `1px solid ${isSelected ? "#2ecc71" : "#333"}`,
                  transition: "all 0.15s",
                }}
              >
                <KeywordIcon symbol={symbol} size={18} />
                <span style={{ fontSize: 14, color: isSelected ? "#2ecc71" : "#ccc", fontWeight: isSelected ? 700 : 400, fontFamily: "'Cinzel',serif" }}>
                  {label}
                </span>
                {isSelected && <span style={{ marginLeft: "auto", color: "#2ecc71", fontSize: 16 }}>✓</span>}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 20px", borderRadius: 8,
              background: "#333", border: "1px solid #555", color: "#aaa",
              fontSize: 13, fontFamily: "'Cinzel',serif", cursor: "pointer",
            }}
          >
            Annuler
          </button>
          <button
            onClick={() => selected.length > 0 && onConfirm(selected)}
            style={{
              padding: "8px 20px", borderRadius: 8,
              background: selected.length > 0 ? "#2ecc71" : "#333",
              border: "1px solid #2ecc71",
              color: selected.length > 0 ? "#fff" : "#666",
              fontSize: 13, fontFamily: "'Cinzel',serif", cursor: selected.length > 0 ? "pointer" : "default",
              fontWeight: 700,
            }}
          >
            Confirmer ({selected.length}/{maxSelections})
          </button>
        </div>
      </div>
    </div>
  );
}
