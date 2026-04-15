"use client";

import { useState, useEffect, useCallback } from "react";
import type { AuctionWithDetails, AuctionFilters, AuctionSettings } from "@/lib/auction/types";
import AuctionCard from "./AuctionCard";
import CreateAuctionModal from "./CreateAuctionModal";
import MyAuctions from "./MyAuctions";

interface AuctionHouseProps {
  userId: string;
}

const SORT_OPTIONS = [
  { value: "ending_soon", label: "Fin imminente" },
  { value: "price_asc", label: "Prix croissant" },
  { value: "price_desc", label: "Prix décroissant" },
  { value: "newest", label: "Plus récentes" },
];

export default function AuctionHouse({ userId }: AuctionHouseProps) {
  const [auctions, setAuctions] = useState<AuctionWithDetails[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AuctionSettings | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"browse" | "my">("browse");

  const [filters, setFilters] = useState<AuctionFilters>({
    sort: "ending_soon",
    page: 1,
    limit: 20,
  });

  const [search, setSearch] = useState("");
  const [faction, setFaction] = useState("");
  const [rarity, setRarity] = useState("");
  const [cardType, setCardType] = useState("");

  const fetchAuctions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("status", "active");
    if (filters.sort) params.set("sort", filters.sort);
    if (filters.page) params.set("page", String(filters.page));
    if (filters.limit) params.set("limit", String(filters.limit));
    if (search) params.set("search", search);
    if (faction) params.set("faction", faction);
    if (rarity) params.set("rarity", rarity);
    if (cardType) params.set("cardType", cardType);

    const res = await fetch(`/api/auctions?${params}`);
    const data = await res.json();
    if (data.auctions) {
      setAuctions(data.auctions);
      setTotal(data.total);
    }
    setLoading(false);
  }, [filters, search, faction, rarity, cardType]);

  useEffect(() => {
    fetch("/api/auctions/settings")
      .then((r) => r.json())
      .then((d) => setSettings(d.settings));
  }, []);

  useEffect(() => {
    fetchAuctions();
  }, [fetchAuctions]);

  const totalPages = Math.ceil(total / (filters.limit ?? 20));

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#c8a84e", fontFamily: "var(--font-cinzel), serif", margin: 0 }}>
            Hôtel des Enchères
          </h1>
          <p style={{ color: "#999", fontSize: 14, margin: "4px 0 0" }}>
            Achetez et vendez des cartes
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href="/"
            style={{
              padding: "8px 16px",
              background: "#2a2a45",
              border: "1px solid #3d3d5c",
              borderRadius: 8,
              color: "#e0e0e0",
              textDecoration: "none",
              fontSize: 14,
            }}
          >
            Menu
          </a>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: "8px 20px",
              background: "#c8a84e",
              border: "none",
              borderRadius: 8,
              color: "#1a1a2e",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Vendre une carte
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "1px solid #3d3d5c" }}>
        {[
          { key: "browse" as const, label: "Parcourir" },
          { key: "my" as const, label: "Mes Enchères" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "10px 24px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid #c8a84e" : "2px solid transparent",
              color: activeTab === tab.key ? "#c8a84e" : "#999",
              fontWeight: activeTab === tab.key ? 600 : 400,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "my" ? (
        <MyAuctions userId={userId} />
      ) : (
        <>
          {/* Filters */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setFilters((f) => ({ ...f, page: 1 }));
              }}
              style={{
                padding: "8px 12px",
                background: "#2a2a45",
                border: "1px solid #3d3d5c",
                borderRadius: 6,
                color: "#e0e0e0",
                fontSize: 13,
                flex: "1 1 200px",
                minWidth: 150,
              }}
            />
            <select
              value={faction}
              onChange={(e) => {
                setFaction(e.target.value);
                setFilters((f) => ({ ...f, page: 1 }));
              }}
              style={selectStyle}
            >
              <option value="">Toutes factions</option>
              {["Lumière", "Ténèbres", "Nature", "Feu", "Eau", "Terre", "Air", "Neutre"].map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <select
              value={rarity}
              onChange={(e) => {
                setRarity(e.target.value);
                setFilters((f) => ({ ...f, page: 1 }));
              }}
              style={selectStyle}
            >
              <option value="">Toutes raretés</option>
              {["Commune", "Peu Commune", "Rare", "Épique", "Légendaire"].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select
              value={cardType}
              onChange={(e) => {
                setCardType(e.target.value);
                setFilters((f) => ({ ...f, page: 1 }));
              }}
              style={selectStyle}
            >
              <option value="">Tous types</option>
              <option value="creature">Créature</option>
              <option value="spell">Sort</option>
            </select>
            <select
              value={filters.sort}
              onChange={(e) =>
                setFilters((f) => ({ ...f, sort: e.target.value as AuctionFilters["sort"], page: 1 }))
              }
              style={selectStyle}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Auction grid */}
          {loading ? (
            <div style={{ textAlign: "center", padding: 60, color: "#999" }}>Chargement...</div>
          ) : auctions.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: "#999" }}>
              Aucune enchère trouvée
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 16,
              }}
            >
              {auctions.map((auction) => (
                <AuctionCard key={auction.id} auction={auction} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 24 }}>
              <button
                disabled={filters.page === 1}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                style={paginationBtnStyle(filters.page === 1)}
              >
                Précédent
              </button>
              <span style={{ color: "#999", lineHeight: "36px", fontSize: 14 }}>
                Page {filters.page} / {totalPages}
              </span>
              <button
                disabled={filters.page === totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                style={paginationBtnStyle(filters.page === totalPages)}
              >
                Suivant
              </button>
            </div>
          )}
        </>
      )}

      {showCreateModal && settings && (
        <CreateAuctionModal
          userId={userId}
          settings={settings}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            fetchAuctions();
          }}
        />
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "#2a2a45",
  border: "1px solid #3d3d5c",
  borderRadius: 6,
  color: "#e0e0e0",
  fontSize: 13,
  minWidth: 130,
};

function paginationBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 16px",
    background: disabled ? "#1a1a2e" : "#2a2a45",
    border: "1px solid #3d3d5c",
    borderRadius: 6,
    color: disabled ? "#666" : "#e0e0e0",
    cursor: disabled ? "default" : "pointer",
    fontSize: 13,
  };
}
