"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import type { CardInstance } from "@/lib/game/types";
import { KEYWORD_SYMBOLS, KEYWORD_LABELS } from "@/lib/game/keyword-labels";

interface MulliganOverlayProps {
  hand: CardInstance[];
  onConfirm: (selectedInstanceIds: string[]) => void;
  waitingForOpponent: boolean;
}

function MulliganCard({
  cardInstance,
  isSelected,
  onToggle,
}: {
  cardInstance: CardInstance;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const card = cardInstance.card;
  const isCreature = card.card_type === "creature";
  const [isHovered, setIsHovered] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const detailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accentColor = isCreature ? "#74b9ff" : "#ce93d8";

  const W = 200;
  const H = 280;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggle(); }}
      onMouseEnter={() => {
        setIsHovered(true);
        detailTimer.current = setTimeout(() => setShowDetails(true), 600);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowDetails(false);
        if (detailTimer.current) clearTimeout(detailTimer.current);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowDetails(prev => !prev);
        if (detailTimer.current) clearTimeout(detailTimer.current);
      }}
      style={{
        width: W, height: H, borderRadius: 12, position: "relative",
        background: isCreature
          ? "linear-gradient(160deg, #1a1a2e, #0d0d1a)"
          : "linear-gradient(160deg, #1a0a2a, #0d0d1a)",
        border: `2px solid ${isSelected ? "#e74c3c" : isHovered ? "#c8a84e" : "#3d3d5c"}`,
        boxShadow: isSelected ? "0 0 20px #e74c3c44" : isHovered ? "0 0 12px #c8a84e44" : "none",
        overflow: "hidden",
        cursor: "pointer",
        transition: "all 0.25s ease",
        transform: isSelected ? "scale(0.92)" : isHovered ? "scale(1.05)" : "none",
        opacity: isSelected ? 0.7 : 1,
      }}
    >
      {/* Full-bleed art */}
      <div style={{ position: "absolute", inset: 0 }}>
        {card.image_url ? (
          <Image
            src={card.image_url}
            alt={card.name}
            fill
            className="object-cover"
            sizes="300px"
            quality={90}
          />
        ) : (
          <div style={{
            width: "100%", height: "100%",
            background: isCreature
              ? "linear-gradient(135deg, #1a1a2e, #2a2a4599, #1a1a2e)"
              : "linear-gradient(135deg, #1a0a2a, #6c348333, #1a0a2a)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 48, opacity: 0.5 }}>{isCreature ? "⚔️" : "✨"}</span>
          </div>
        )}
      </div>

      {/* Replace overlay */}
      {isSelected && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 5,
          background: "rgba(231, 76, 60, 0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{
            background: "#0d0d1acc", color: "#e74c3c", fontWeight: 700,
            fontSize: 13, padding: "6px 14px", borderRadius: 8,
            border: "1px solid #e74c3c66",
            fontFamily: "'Cinzel', serif", letterSpacing: 1,
          }}>REMPLACER</span>
        </div>
      )}

      {/* Mana orb */}
      <div style={{
        position: "absolute", top: 8, left: 8, zIndex: 2,
        width: 28, height: 28, borderRadius: "50%",
        background: "radial-gradient(circle, #1a3a6a, #0d1f3c)",
        border: "2px solid #74b9ff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, color: "#74b9ff", fontWeight: 700,
        boxShadow: "0 0 8px #74b9ff55",
      }}>{card.mana_cost}</div>

      {/* Bottom bar */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2,
        padding: "8px 8px 6px",
        background: "linear-gradient(0deg, #0d0d1add 0%, #0d0d1a88 40%, transparent 65%)",
        display: "flex", flexDirection: "column", gap: 4,
      }}>
        {/* Name */}
        <div style={{
          fontSize: 12, color: "#e0e0e0", fontWeight: 700,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontFamily: "'Cinzel', serif",
        }}>{card.name}</div>

        {/* Keyword symbols */}
        {card.keywords.length > 0 && (
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {card.keywords.map((kw) => (
              <div key={kw} title={KEYWORD_LABELS[kw]} style={{
                width: 20, height: 20, borderRadius: 5,
                background: `${accentColor}33`, border: `1px solid ${accentColor}66`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11,
              }}>{KEYWORD_SYMBOLS[kw] || "✦"}</div>
            ))}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 8, color: "#ffffff44", textTransform: "uppercase" }}>{card.card_type}</span>
          {isCreature && (
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{
                padding: "2px 6px", borderRadius: 4,
                background: "#f1c40f18", border: "1px solid #f1c40f55",
              }}>
                <span style={{ fontSize: 14, color: "#f1c40f", fontWeight: 700 }}>{card.attack}</span>
              </div>
              <div style={{
                padding: "2px 6px", borderRadius: 4,
                background: "#e74c3c18", border: "1px solid #e74c3c55",
              }}>
                <span style={{ fontSize: 14, color: "#e74c3c", fontWeight: 700 }}>{card.health}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hover overlay (delayed) */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 3,
        background: "#0d0d1aee",
        opacity: showDetails && !isSelected ? 1 : 0,
        transition: "opacity 0.25s ease",
        pointerEvents: showDetails && !isSelected ? "auto" : "none",
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "16px 12px",
        gap: 8,
      }}>
        <div style={{
          fontSize: 13, color: accentColor, fontWeight: 700,
          textAlign: "center", fontFamily: "'Cinzel', serif",
          borderBottom: `1px solid ${accentColor}44`, paddingBottom: 6,
        }}>{card.name}</div>

        {card.keywords.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {card.keywords.map((kw) => (
              <div key={kw} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 12 }}>{KEYWORD_SYMBOLS[kw] || "✦"}</span>
                <span style={{ fontSize: 10, color: accentColor, fontWeight: 600 }}>{KEYWORD_LABELS[kw] || kw}</span>
              </div>
            ))}
          </div>
        )}

        {card.effect_text && (
          <div style={{
            padding: 6, background: `${accentColor}11`, borderRadius: 5,
            border: `1px solid ${accentColor}22`,
          }}>
            <p style={{
              margin: 0, fontSize: 10, color: "#ccc",
              lineHeight: 1.5, fontFamily: "'Crimson Text', serif",
            }}>{card.effect_text}</p>
          </div>
        )}

        {card.flavor_text && (
          <p style={{
            margin: 0, fontSize: 9, color: `${accentColor}77`,
            fontStyle: "italic", lineHeight: 1.3, fontFamily: "'Crimson Text', serif",
            textAlign: "center",
          }}>&ldquo;{card.flavor_text}&rdquo;</p>
        )}

        <div style={{
          display: "flex", justifyContent: "center", gap: 8,
          fontSize: 9, color: "#555",
        }}>
          <span>{"💧"} {card.mana_cost}</span>
          {isCreature && <><span style={{ color: "#f1c40f" }}>{"⚔"} {card.attack}</span><span style={{ color: "#e74c3c" }}>{"❤"} {card.health}</span></>}
        </div>
      </div>
    </div>
  );
}

export default function MulliganOverlay({
  hand,
  onConfirm,
  waitingForOpponent,
}: MulliganOverlayProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleCard(instanceId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(instanceId)) {
        next.delete(instanceId);
      } else {
        next.add(instanceId);
      }
      return next;
    });
  }

  if (waitingForOpponent) {
    return (
      <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">{"⏳"}</div>
          <p className="text-foreground/70 text-lg">
            En attente de l&apos;adversaire...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center">
      <div className="text-center max-w-4xl px-6">
        <h1 className="text-2xl font-bold text-foreground mb-2">Mulligan</h1>
        <p className="text-foreground/50 mb-8 text-sm">
          Sélectionnez les cartes à remplacer, puis confirmez.
        </p>

        <div className="flex justify-center gap-5 mb-10">
          {hand.map((cardInstance) => (
            <MulliganCard
              key={cardInstance.instanceId}
              cardInstance={cardInstance}
              isSelected={selected.has(cardInstance.instanceId)}
              onToggle={() => toggleCard(cardInstance.instanceId)}
            />
          ))}
        </div>

        <button
          onClick={() => onConfirm(Array.from(selected))}
          className="px-8 py-3 bg-primary hover:bg-primary-dark text-background font-bold rounded-xl text-lg transition-colors"
        >
          {selected.size === 0 ? "Garder tout" : `Remplacer ${selected.size} carte${selected.size > 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}
