"use client";

import { useState, useEffect } from "react";
import type { AuctionSettings } from "@/lib/auction/types";

interface CardOption {
  kind: "card" | "board";
  id: number; // card_id for cards, board_id for boards
  name: string;
  rarity: string;
  faction: string | null;
  card_type: string | null;
  mana_cost: number | null;
  source_type: "collection" | "print" | "board_print";
  source_id?: number;
  print_number?: number;
  max_prints?: number;
}

interface CreateAuctionModalProps {
  userId: string;
  settings: AuctionSettings;
  onClose: () => void;
  onCreated: () => void;
}

const DURATION_LABELS: Record<number, string> = {
  1: "1 minute",
  60: "1 heure",
  360: "6 heures",
  720: "12 heures",
  1440: "24 heures",
};

export default function CreateAuctionModal({ userId, settings, onClose, onCreated }: CreateAuctionModalProps) {
  const [cards, setCards] = useState<CardOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [startingBid, setStartingBid] = useState("100");
  const [buyoutPrice, setBuyoutPrice] = useState("");
  const [duration, setDuration] = useState(settings.allowed_durations[0] ?? 1440);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Fetch user's sellable cards
  useEffect(() => {
    async function load() {
      const res = await fetch("/api/auctions/my-cards");
      const data = await res.json();

      const items: CardOption[] = (data.items ?? []).map((item: Record<string, unknown>) => {
        const isBoard = item.kind === "board" || item.source_type === "board_print";
        return {
          kind: isBoard ? "board" : "card",
          id: (isBoard ? item.board_id : item.card_id) as number,
          name: item.name as string,
          rarity: item.rarity as string,
          faction: (item.faction as string | null) ?? null,
          card_type: (item.card_type as string | null) ?? null,
          mana_cost: (item.mana_cost as number | null) ?? null,
          source_type: item.source_type as "collection" | "print" | "board_print",
          source_id: item.source_id as number | undefined,
          print_number: item.print_number as number | undefined,
          max_prints: item.max_prints as number | undefined,
        };
      });

      setCards(items);
      setLoading(false);
    }
    load();
  }, [userId]);

  function toggleCard(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else if (next.size < settings.max_items_per_lot) next.add(key);
    setSelected(next);
  }

  function cardKey(c: CardOption) {
    if (c.source_type === "print") return `print-${c.source_id}`;
    if (c.source_type === "board_print") return `bprint-${c.source_id}`;
    return `coll-${c.id}`;
  }

  async function handleSubmit() {
    setError("");
    if (selected.size === 0) {
      setError("Sélectionnez au moins une carte");
      return;
    }

    const bid = parseInt(startingBid);
    if (!bid || bid <= 0) {
      setError("Mise de départ invalide");
      return;
    }

    const buyout = buyoutPrice ? parseInt(buyoutPrice) : undefined;
    if (buyout !== undefined && buyout <= bid) {
      setError("Le prix d'achat immédiat doit être supérieur à la mise de départ");
      return;
    }

    const selectedCards = cards.filter((c) => selected.has(cardKey(c)));
    const items = selectedCards.map((c) => ({
      card_id: c.kind === "card" ? c.id : null,
      board_id: c.kind === "board" ? c.id : null,
      source_type: c.source_type,
      source_id: c.source_id,
      quantity: 1,
    }));

    setSubmitting(true);
    const res = await fetch("/api/auctions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        starting_bid: bid,
        buyout_price: buyout,
        duration_minutes: duration,
      }),
    });

    const data = await res.json();
    if (data.error) {
      setError(data.error);
      setSubmitting(false);
    } else {
      onCreated();
    }
  }

  const filteredCards = search
    ? cards.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : cards;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#1a1a2e",
          border: "1px solid #3d3d5c",
          borderRadius: 16,
          padding: 24,
          width: "90%",
          maxWidth: 700,
          maxHeight: "85vh",
          overflow: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#c8a84e", margin: 0, fontFamily: "var(--font-cinzel), serif" }}>
            Créer une enchère
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#999", fontSize: 20, cursor: "pointer" }}
          >
            x
          </button>
        </div>

        {/* Card selection */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: "#999", marginBottom: 8 }}>
            Sélectionnez les cartes à vendre ({selected.size}/{settings.max_items_per_lot} max)
          </div>
          <input
            type="text"
            placeholder="Rechercher une carte..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "#2a2a45",
              border: "1px solid #3d3d5c",
              borderRadius: 6,
              color: "#e0e0e0",
              fontSize: 13,
              marginBottom: 8,
              boxSizing: "border-box",
            }}
          />

          {loading ? (
            <div style={{ color: "#999", padding: 20, textAlign: "center" }}>Chargement...</div>
          ) : (
            <div style={{ maxHeight: 250, overflow: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {filteredCards.length === 0 ? (
                <div style={{ color: "#666", padding: 10, textAlign: "center" }}>Aucune carte disponible</div>
              ) : (
                filteredCards.map((card) => {
                  const key = cardKey(card);
                  const isSelected = selected.has(key);
                  return (
                    <div
                      key={key}
                      onClick={() => toggleCard(key)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 12px",
                        background: isSelected ? "#c8a84e22" : "#2a2a45",
                        border: `1px solid ${isSelected ? "#c8a84e" : "#3d3d5c"}`,
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      <div>
                        <span style={{ color: "#e0e0e0", fontWeight: 500 }}>{card.name}</span>
                        <span style={{ color: "#999", marginLeft: 8, fontSize: 11 }}>
                          {card.rarity}{card.kind === "board" ? " · Plateau" : card.faction ? ` — ${card.faction}` : ""}
                        </span>
                        {(card.source_type === "print" || card.source_type === "board_print") && (
                          <span style={{ color: "#c8a84e", marginLeft: 6, fontSize: 11 }}>
                            #{card.print_number}/{card.max_prints}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 4,
                          border: `2px solid ${isSelected ? "#c8a84e" : "#3d3d5c"}`,
                          background: isSelected ? "#c8a84e" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#1a1a2e",
                          fontWeight: 700,
                          fontSize: 14,
                        }}
                      >
                        {isSelected ? "✓" : ""}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Pricing */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: "#999", display: "block", marginBottom: 4 }}>
              Mise de départ (or)
            </label>
            <input
              type="number"
              value={startingBid}
              onChange={(e) => setStartingBid(e.target.value)}
              min={1}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#999", display: "block", marginBottom: 4 }}>
              Achat immédiat (optionnel)
            </label>
            <input
              type="number"
              value={buyoutPrice}
              onChange={(e) => setBuyoutPrice(e.target.value)}
              placeholder="Aucun"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Duration */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: "#999", display: "block", marginBottom: 6 }}>Durée</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {settings.allowed_durations.map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                style={{
                  padding: "8px 16px",
                  background: duration === d ? "#c8a84e" : "#2a2a45",
                  border: `1px solid ${duration === d ? "#c8a84e" : "#3d3d5c"}`,
                  borderRadius: 6,
                  color: duration === d ? "#1a1a2e" : "#e0e0e0",
                  fontWeight: duration === d ? 600 : 400,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {DURATION_LABELS[d] ?? `${d}min`}
              </button>
            ))}
          </div>
        </div>

        {/* Commission info */}
        <div style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>
          Commission: {settings.commission_rate}% sera prélevé sur le montant de la vente
        </div>

        {error && (
          <div style={{ padding: 10, background: "#e74c3c22", border: "1px solid #e74c3c44", borderRadius: 6, color: "#e74c3c", fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "12px",
              background: "#2a2a45",
              border: "1px solid #3d3d5c",
              borderRadius: 8,
              color: "#e0e0e0",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || selected.size === 0}
            style={{
              flex: 2,
              padding: "12px",
              background: submitting || selected.size === 0 ? "#666" : "#c8a84e",
              border: "none",
              borderRadius: 8,
              color: "#1a1a2e",
              fontWeight: 600,
              fontSize: 14,
              cursor: submitting || selected.size === 0 ? "default" : "pointer",
            }}
          >
            {submitting ? "Création..." : `Mettre en vente (${selected.size} carte${selected.size > 1 ? "s" : ""})`}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "#2a2a45",
  border: "1px solid #3d3d5c",
  borderRadius: 6,
  color: "#e0e0e0",
  fontSize: 14,
  boxSizing: "border-box",
};
