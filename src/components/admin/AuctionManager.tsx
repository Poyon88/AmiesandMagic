"use client";

import { useState, useEffect, useCallback } from "react";
import type { AuctionSettings, AuctionWithDetails } from "@/lib/auction/types";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "#c8a84e" },
  ended_sold: { label: "Vendue", color: "#2ecc71" },
  ended_unsold: { label: "Invendue", color: "#e74c3c" },
  cancelled: { label: "Annulée", color: "#999" },
};

interface CardRow {
  id: number;
  name: string;
  rarity: string;
  faction: string;
  card_type: string;
  mana_cost: number;
}

const DURATION_LABELS: Record<number, string> = {
  1: "1 minute",
  60: "1 heure",
  360: "6 heures",
  720: "12 heures",
  1440: "24 heures",
};

interface PrintInfo {
  print_id: number;
  print_number: number;
  max_prints: number;
}

interface AuctionManagerProps {
  cards: CardRow[];
  firstAvailablePrint: Record<number, PrintInfo>;
}

export default function AuctionManager({ cards, firstAvailablePrint }: AuctionManagerProps) {
  const [settings, setSettings] = useState<AuctionSettings | null>(null);
  const [auctions, setAuctions] = useState<AuctionWithDetails[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);

  // Settings form state
  const [commissionRate, setCommissionRate] = useState("");
  const [minBidIncrement, setMinBidIncrement] = useState("");
  const [maxItemsPerLot, setMaxItemsPerLot] = useState("");
  const [marketplaceOpen, setMarketplaceOpen] = useState(true);

  // Create auction form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [cardSearch, setCardSearch] = useState("");
  const [selectedCardIds, setSelectedCardIds] = useState<Set<number>>(new Set());
  const [createStartingBid, setCreateStartingBid] = useState("100");
  const [createBuyoutPrice, setCreateBuyoutPrice] = useState("");
  const [createDuration, setCreateDuration] = useState(1440);
  const [createLoading, setCreateLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auctions/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) {
          setSettings(d.settings);
          setCommissionRate(String(d.settings.commission_rate));
          setMinBidIncrement(String(d.settings.min_bid_increment));
          setMaxItemsPerLot(String(d.settings.max_items_per_lot));
          setMarketplaceOpen(d.settings.is_marketplace_open);
        }
      });
  }, []);

  const fetchAuctions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    params.set("page", String(page));
    params.set("limit", "20");

    const res = await fetch(`/api/auctions/admin?${params}`);
    const data = await res.json();
    if (data.auctions) {
      setAuctions(data.auctions);
      setTotal(data.total);
    }
    setLoading(false);
  }, [statusFilter, page]);

  useEffect(() => {
    fetchAuctions();
  }, [fetchAuctions]);

  function toggleCard(cardId: number) {
    const next = new Set(selectedCardIds);
    if (next.has(cardId)) next.delete(cardId);
    else if (next.size < (settings?.max_items_per_lot ?? 10)) next.add(cardId);
    setSelectedCardIds(next);
  }

  async function handleCreateAuction() {
    if (selectedCardIds.size === 0) {
      setMessage({ text: "Sélectionnez au moins une carte", type: "error" });
      return;
    }
    const bid = parseInt(createStartingBid);
    if (!bid || bid <= 0) {
      setMessage({ text: "Mise de départ invalide", type: "error" });
      return;
    }
    const buyout = createBuyoutPrice ? parseInt(createBuyoutPrice) : undefined;
    if (buyout !== undefined && buyout <= bid) {
      setMessage({ text: "Le prix d'achat immédiat doit être supérieur à la mise de départ", type: "error" });
      return;
    }

    setCreateLoading(true);
    setMessage(null);
    // Use available prints when possible, fallback to admin source
    const items = Array.from(selectedCardIds).map((card_id) => {
      const print = firstAvailablePrint[card_id];
      if (print) {
        return {
          card_id,
          source_type: "print" as const,
          source_id: print.print_id,
          quantity: 1,
        };
      }
      return {
        card_id,
        source_type: "admin" as const,
        quantity: 1,
      };
    });

    const res = await fetch("/api/auctions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        starting_bid: bid,
        buyout_price: buyout,
        duration_minutes: createDuration,
      }),
    });
    const data = await res.json();
    if (data.error) {
      setMessage({ text: data.error, type: "error" });
    } else {
      setMessage({ text: "Enchère créée avec succès", type: "success" });
      setSelectedCardIds(new Set());
      setCreateStartingBid("100");
      setCreateBuyoutPrice("");
      setShowCreateForm(false);
      fetchAuctions();
    }
    setCreateLoading(false);
  }

  const filteredCards = cardSearch
    ? cards.filter((c) => c.name.toLowerCase().includes(cardSearch.toLowerCase()))
    : cards;

  async function handleSaveSettings() {
    setSettingsLoading(true);
    setMessage(null);
    const res = await fetch("/api/auctions/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commission_rate: parseFloat(commissionRate),
        min_bid_increment: parseInt(minBidIncrement),
        max_items_per_lot: parseInt(maxItemsPerLot),
        is_marketplace_open: marketplaceOpen,
      }),
    });
    const data = await res.json();
    if (data.error) {
      setMessage({ text: data.error, type: "error" });
    } else {
      setSettings(data.settings);
      setMessage({ text: "Paramètres sauvegardés", type: "success" });
    }
    setSettingsLoading(false);
  }

  async function handleForceCancel(auctionId: string) {
    if (!confirm("Voulez-vous vraiment annuler cette enchère ?")) return;
    setMessage(null);
    const res = await fetch("/api/auctions/admin", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auctionId }),
    });
    const data = await res.json();
    if (data.error) {
      setMessage({ text: data.error, type: "error" });
    } else {
      setMessage({ text: "Enchère annulée", type: "success" });
      fetchAuctions();
    }
  }

  async function handleSettle() {
    setMessage(null);
    const res = await fetch("/api/auctions/settle", { method: "POST" });
    const data = await res.json();
    if (data.error) {
      setMessage({ text: data.error, type: "error" });
    } else {
      setMessage({ text: `${data.settled} enchère(s) clôturée(s) sur ${data.total}`, type: "success" });
      fetchAuctions();
    }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#333", marginBottom: 24 }}>
        Gestion des Enchères
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

      {/* Settings Panel */}
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
          Paramètres du marché
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Commission (%)</label>
            <input
              type="number"
              value={commissionRate}
              onChange={(e) => setCommissionRate(e.target.value)}
              style={adminInputStyle}
              step="0.5"
              min="0"
              max="50"
            />
          </div>
          <div>
            <label style={labelStyle}>Incrément minimum</label>
            <input
              type="number"
              value={minBidIncrement}
              onChange={(e) => setMinBidIncrement(e.target.value)}
              style={adminInputStyle}
              min="1"
            />
          </div>
          <div>
            <label style={labelStyle}>Max objets par lot</label>
            <input
              type="number"
              value={maxItemsPerLot}
              onChange={(e) => setMaxItemsPerLot(e.target.value)}
              style={adminInputStyle}
              min="1"
              max="50"
            />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={marketplaceOpen}
              onChange={(e) => setMarketplaceOpen(e.target.checked)}
            />
            <span style={{ fontSize: 14, color: "#333" }}>Marché ouvert</span>
          </label>
          <button
            onClick={handleSaveSettings}
            disabled={settingsLoading}
            style={{
              padding: "8px 20px",
              background: settingsLoading ? "#ccc" : "#4caf50",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              fontWeight: 600,
              fontSize: 13,
              cursor: settingsLoading ? "default" : "pointer",
            }}
          >
            {settingsLoading ? "..." : "Sauvegarder"}
          </button>
          <button
            onClick={handleSettle}
            style={{
              padding: "8px 20px",
              background: "#ff9800",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            Clôturer les enchères expirées
          </button>
        </div>
      </div>

      {/* Create Auction Panel */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showCreateForm ? 16 : 0 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#333", margin: 0 }}>
            Créer une enchère système
          </h2>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            style={{
              padding: "8px 20px",
              background: showCreateForm ? "#999" : "#2196f3",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {showCreateForm ? "Fermer" : "Nouvelle enchère"}
          </button>
        </div>

        {showCreateForm && (
          <div>
            {/* Card selection */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>
                Sélectionner les cartes ({selectedCardIds.size}/{settings?.max_items_per_lot ?? 10} max)
              </label>
              <input
                type="text"
                placeholder="Rechercher une carte..."
                value={cardSearch}
                onChange={(e) => setCardSearch(e.target.value)}
                style={{ ...adminInputStyle, marginBottom: 8 }}
              />
              <div style={{ maxHeight: 250, overflow: "auto", border: "1px solid #eee", borderRadius: 6 }}>
                  {filteredCards.slice(0, 100).map((card) => {
                    const isSelected = selectedCardIds.has(card.id);
                    return (
                      <div
                        key={card.id}
                        onClick={() => toggleCard(card.id)}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "8px 12px",
                          background: isSelected ? "#e3f2fd" : "transparent",
                          borderBottom: "1px solid #f5f5f5",
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        <div>
                          <span style={{ color: "#bbb", fontSize: 11, marginRight: 6 }}>#{card.id}</span>
                          <span style={{ fontWeight: 500, color: "#333" }}>{card.name}</span>
                          <span style={{ color: "#999", marginLeft: 8, fontSize: 11 }}>
                            {card.rarity} — {card.faction} — {card.card_type === "creature" ? "Créature" : "Sort"} — Mana: {card.mana_cost}
                          </span>
                          {firstAvailablePrint[card.id] ? (
                            <span style={{ color: "#2196f3", marginLeft: 8, fontSize: 11, fontWeight: 600 }}>
                              Exemplaire #{firstAvailablePrint[card.id].print_number}/{firstAvailablePrint[card.id].max_prints}
                            </span>
                          ) : (
                            <span style={{ color: "#e74c3c", marginLeft: 8, fontSize: 11 }}>
                              Aucun exemplaire disponible
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 3,
                            border: `2px solid ${isSelected ? "#2196f3" : "#ccc"}`,
                            background: isSelected ? "#2196f3" : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {isSelected ? "✓" : ""}
                        </div>
                      </div>
                    );
                  })}
                  {filteredCards.length > 100 && (
                    <div style={{ padding: 8, textAlign: "center", color: "#999", fontSize: 12 }}>
                      {filteredCards.length - 100} cartes supplémentaires — affinez votre recherche
                    </div>
                  )}
                </div>
            </div>

            {/* Pricing & Duration */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Mise de départ (or)</label>
                <input
                  type="number"
                  value={createStartingBid}
                  onChange={(e) => setCreateStartingBid(e.target.value)}
                  min={1}
                  style={adminInputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Achat immédiat (optionnel)</label>
                <input
                  type="number"
                  value={createBuyoutPrice}
                  onChange={(e) => setCreateBuyoutPrice(e.target.value)}
                  placeholder="Aucun"
                  style={adminInputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Durée</label>
                <select
                  value={createDuration}
                  onChange={(e) => setCreateDuration(parseInt(e.target.value))}
                  style={adminInputStyle}
                >
                  {(settings?.allowed_durations ?? [1440]).map((d) => (
                    <option key={d} value={d}>{DURATION_LABELS[d] ?? `${d}min`}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleCreateAuction}
              disabled={createLoading || selectedCardIds.size === 0}
              style={{
                padding: "10px 24px",
                background: createLoading || selectedCardIds.size === 0 ? "#ccc" : "#4caf50",
                border: "none",
                borderRadius: 6,
                color: "#fff",
                fontWeight: 600,
                fontSize: 14,
                cursor: createLoading || selectedCardIds.size === 0 ? "default" : "pointer",
              }}
            >
              {createLoading ? "Création..." : `Mettre en vente (${selectedCardIds.size} carte${selectedCardIds.size > 1 ? "s" : ""})`}
            </button>
          </div>
        )}
      </div>

      {/* Auction list */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#333", margin: 0 }}>
            Enchères ({total})
          </h2>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            style={{
              padding: "6px 12px",
              border: "1px solid #ddd",
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            <option value="">Tous les statuts</option>
            <option value="active">Active</option>
            <option value="ended_sold">Vendue</option>
            <option value="ended_unsold">Invendue</option>
            <option value="cancelled">Annulée</option>
          </select>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 30, color: "#999" }}>Chargement...</div>
        ) : auctions.length === 0 ? (
          <div style={{ textAlign: "center", padding: 30, color: "#999" }}>Aucune enchère</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #eee" }}>
                <th style={thStyle}>Cartes</th>
                <th style={thStyle}>Vendeur</th>
                <th style={thStyle}>Mise actuelle</th>
                <th style={thStyle}>Enchères</th>
                <th style={thStyle}>Fin</th>
                <th style={thStyle}>Statut</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {auctions.map((auction) => {
                const mainCard = auction.items?.[0]?.card;
                const statusInfo = STATUS_LABELS[auction.status] ?? { label: auction.status, color: "#999" };
                return (
                  <tr key={auction.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={tdStyle}>
                      {mainCard?.name ?? "?"}
                      {(auction.items?.length ?? 0) > 1 && (
                        <span style={{ color: "#999", marginLeft: 4 }}>
                          +{(auction.items?.length ?? 0) - 1}
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>{auction.seller_username ?? "Système"}</td>
                    <td style={tdStyle}>
                      {(auction.current_bid ?? auction.starting_bid).toLocaleString("fr-FR")} or
                    </td>
                    <td style={tdStyle}>{auction.bid_count}</td>
                    <td style={tdStyle}>
                      {new Date(auction.ends_at).toLocaleString("fr-FR")}
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 10,
                          fontSize: 11,
                          background: `${statusInfo.color}22`,
                          color: statusInfo.color,
                        }}
                      >
                        {statusInfo.label}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {auction.status === "active" && (
                        <button
                          onClick={() => handleForceCancel(auction.id)}
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
                          Annuler
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              style={adminPaginationStyle(page === 1)}
            >
              Précédent
            </button>
            <span style={{ lineHeight: "32px", fontSize: 13, color: "#666" }}>
              {page} / {totalPages}
            </span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              style={adminPaginationStyle(page === totalPages)}
            >
              Suivant
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#666",
  marginBottom: 4,
};

const adminInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #ddd",
  borderRadius: 6,
  fontSize: 14,
  boxSizing: "border-box",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  color: "#666",
  fontWeight: 600,
  fontSize: 12,
};

const tdStyle: React.CSSProperties = {
  padding: "10px",
  color: "#333",
};

function adminPaginationStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "6px 14px",
    background: disabled ? "#f0f0f0" : "#fff",
    border: "1px solid #ddd",
    borderRadius: 6,
    color: disabled ? "#ccc" : "#333",
    cursor: disabled ? "default" : "pointer",
    fontSize: 13,
  };
}
