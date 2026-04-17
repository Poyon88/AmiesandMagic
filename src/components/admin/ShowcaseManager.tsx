"use client";

import { useState, useEffect, useCallback } from "react";

interface CardRow {
  id: number;
  name: string;
  rarity: string;
  faction: string;
  card_type: string;
  mana_cost: number;
  image_url: string | null;
}

interface ShowcaseCard {
  id: number;
  card_id: number;
  sort_order: number;
  card: CardRow;
}

interface ShowcaseManagerProps {
  cards: CardRow[];
}

const RARITY_COLORS: Record<string, string> = {
  "Commune": "#aaaaaa",
  "Peu Commune": "#4caf50",
  "Rare": "#4fc3f7",
  "Épique": "#ce93d8",
  "Légendaire": "#ffd54f",
};

export default function ShowcaseManager({ cards }: ShowcaseManagerProps) {
  const [showcaseCards, setShowcaseCards] = useState<ShowcaseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const fetchShowcase = useCallback(async () => {
    const res = await fetch("/api/showcase");
    const data = await res.json();
    setShowcaseCards(data.cards ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchShowcase();
  }, [fetchShowcase]);

  const showcaseCardIds = new Set(showcaseCards.map(s => s.card_id));

  async function handleAdd(cardId: number) {
    setMessage(null);
    const nextOrder = showcaseCards.length;
    const res = await fetch("/api/showcase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card_id: cardId, sort_order: nextOrder }),
    });
    const data = await res.json();
    if (data.error) {
      setMessage({ text: data.error, type: "error" });
    } else {
      setMessage({ text: "Carte ajoutée au showcase", type: "success" });
      fetchShowcase();
    }
  }

  async function handleRemove(cardId: number) {
    setMessage(null);
    const res = await fetch("/api/showcase", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card_id: cardId }),
    });
    const data = await res.json();
    if (data.error) {
      setMessage({ text: data.error, type: "error" });
    } else {
      setMessage({ text: "Carte retirée du showcase", type: "success" });
      fetchShowcase();
    }
  }

  async function handleMove(cardId: number, direction: "up" | "down") {
    const idx = showcaseCards.findIndex(s => s.card_id === cardId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= showcaseCards.length) return;

    const orders = showcaseCards.map((s, i) => {
      if (i === idx) return { card_id: s.card_id, sort_order: swapIdx };
      if (i === swapIdx) return { card_id: s.card_id, sort_order: idx };
      return { card_id: s.card_id, sort_order: i };
    });

    await fetch("/api/showcase", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orders }),
    });
    fetchShowcase();
  }

  const availableCards = cards.filter(
    c => !showcaseCardIds.has(c.id) && c.image_url &&
      (!search || c.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#333", marginBottom: 24 }}>
        Showcase — Landing Page
      </h1>

      {message && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            borderRadius: 8,
            background: message.type === "success" ? "#d4edda" : "#f8d7da",
            color: message.type === "success" ? "#155724" : "#721c24",
            fontSize: 14,
          }}
        >
          {message.text}
        </div>
      )}

      {/* Current showcase */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "#333", marginBottom: 16 }}>
          Cartes en showcase ({showcaseCards.length})
        </h2>

        {loading ? (
          <div style={{ textAlign: "center", padding: 20, color: "#999" }}>Chargement...</div>
        ) : showcaseCards.length === 0 ? (
          <div style={{ textAlign: "center", padding: 20, color: "#999" }}>
            Aucune carte dans le showcase. Ajoutez des cartes ci-dessous.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {showcaseCards.map((sc, idx) => (
              <div
                key={sc.card_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  background: "#f9f9f9",
                  border: "1px solid #eee",
                  borderRadius: 8,
                }}
              >
                <span style={{ fontSize: 12, color: "#999", width: 24 }}>#{idx + 1}</span>
                {sc.card.image_url && (
                  <img
                    src={sc.card.image_url}
                    alt={sc.card.name}
                    style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, color: "#333" }}>{sc.card.name}</span>
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 11,
                      color: RARITY_COLORS[sc.card.rarity] ?? "#999",
                    }}
                  >
                    {sc.card.rarity}
                  </span>
                  <span style={{ marginLeft: 6, fontSize: 11, color: "#999" }}>{sc.card.faction}</span>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    onClick={() => handleMove(sc.card_id, "up")}
                    disabled={idx === 0}
                    style={moveBtn(idx === 0)}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => handleMove(sc.card_id, "down")}
                    disabled={idx === showcaseCards.length - 1}
                    style={moveBtn(idx === showcaseCards.length - 1)}
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => handleRemove(sc.card_id)}
                    style={{
                      padding: "4px 10px",
                      background: "#f44336",
                      border: "none",
                      borderRadius: 4,
                      color: "#fff",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    Retirer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add cards */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "#333", marginBottom: 12 }}>
          Ajouter des cartes
        </h2>
        <input
          type="text"
          placeholder="Rechercher une carte..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "1px solid #ddd",
            borderRadius: 6,
            fontSize: 14,
            marginBottom: 12,
            boxSizing: "border-box",
          }}
        />
        <div style={{ maxHeight: 350, overflow: "auto" }}>
          {availableCards.slice(0, 50).map((card) => (
            <div
              key={card.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 12px",
                borderBottom: "1px solid #f5f5f5",
              }}
            >
              {card.image_url && (
                <img
                  src={card.image_url}
                  alt={card.name}
                  style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4 }}
                />
              )}
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 500, color: "#333", fontSize: 13 }}>#{card.id} {card.name}</span>
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    color: RARITY_COLORS[card.rarity] ?? "#999",
                  }}
                >
                  {card.rarity}
                </span>
                <span style={{ marginLeft: 6, fontSize: 11, color: "#999" }}>{card.faction}</span>
              </div>
              <button
                onClick={() => handleAdd(card.id)}
                style={{
                  padding: "4px 14px",
                  background: "#4caf50",
                  border: "none",
                  borderRadius: 4,
                  color: "#fff",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Ajouter
              </button>
            </div>
          ))}
          {availableCards.length > 50 && (
            <div style={{ padding: 8, textAlign: "center", color: "#999", fontSize: 12 }}>
              {availableCards.length - 50} cartes supplémentaires — affinez votre recherche
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function moveBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "4px 8px",
    background: disabled ? "#eee" : "#e0e0e0",
    border: "none",
    borderRadius: 4,
    color: disabled ? "#ccc" : "#333",
    fontSize: 12,
    cursor: disabled ? "default" : "pointer",
  };
}
