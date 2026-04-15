"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AuctionWithDetails } from "@/lib/auction/types";

interface MyAuctionsProps {
  userId: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "#c8a84e" },
  ended_sold: { label: "Vendue", color: "#2ecc71" },
  ended_unsold: { label: "Invendue", color: "#e74c3c" },
  cancelled: { label: "Annulée", color: "#999" },
};

export default function MyAuctions({ userId }: MyAuctionsProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"selling" | "bidding">("selling");
  const [sellerAuctions, setSellerAuctions] = useState<AuctionWithDetails[]>([]);
  const [bidderAuctions, setBidderAuctions] = useState<AuctionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      // Fetch all auctions where user is seller
      const sellerRes = await fetch("/api/auctions/admin");
      // Since the admin endpoint requires admin role, we'll use the main endpoint
      // and filter client-side, or create a dedicated endpoint
      // For now, fetch active + ended and filter
      const statuses = ["active", "ended_sold", "ended_unsold", "cancelled"];
      const allAuctions: AuctionWithDetails[] = [];

      for (const status of statuses) {
        const res = await fetch(`/api/auctions?status=${status}&limit=50`);
        const data = await res.json();
        if (data.auctions) allAuctions.push(...data.auctions);
      }

      setSellerAuctions(allAuctions.filter((a) => a.seller_id === userId));
      setBidderAuctions(allAuctions.filter((a) => a.current_bidder_id === userId));
      setLoading(false);
    }
    load();
  }, [userId]);

  const currentList = tab === "selling" ? sellerAuctions : bidderAuctions;

  return (
    <div>
      {/* Sub tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setTab("selling")}
          style={{
            padding: "8px 16px",
            background: tab === "selling" ? "#c8a84e" : "#2a2a45",
            border: `1px solid ${tab === "selling" ? "#c8a84e" : "#3d3d5c"}`,
            borderRadius: 6,
            color: tab === "selling" ? "#1a1a2e" : "#e0e0e0",
            fontWeight: tab === "selling" ? 600 : 400,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Mes ventes ({sellerAuctions.length})
        </button>
        <button
          onClick={() => setTab("bidding")}
          style={{
            padding: "8px 16px",
            background: tab === "bidding" ? "#c8a84e" : "#2a2a45",
            border: `1px solid ${tab === "bidding" ? "#c8a84e" : "#3d3d5c"}`,
            borderRadius: 6,
            color: tab === "bidding" ? "#1a1a2e" : "#e0e0e0",
            fontWeight: tab === "bidding" ? 600 : 400,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Mes enchères ({bidderAuctions.length})
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Chargement...</div>
      ) : currentList.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
          {tab === "selling" ? "Vous n'avez aucune vente" : "Vous n'avez enchéri sur rien"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {currentList.map((auction) => {
            const mainCard = auction.items?.[0]?.card;
            const statusInfo = STATUS_LABELS[auction.status] ?? { label: auction.status, color: "#999" };
            return (
              <div
                key={auction.id}
                onClick={() => router.push(`/auction/${auction.id}`)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 16px",
                  background: "#2a2a45",
                  border: "1px solid #3d3d5c",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#c8a84e";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#3d3d5c";
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>
                    {mainCard?.name ?? "Carte inconnue"}
                    {(auction.items?.length ?? 0) > 1 && (
                      <span style={{ fontSize: 12, color: "#c8a84e", marginLeft: 6 }}>
                        +{(auction.items?.length ?? 0) - 1}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                    {auction.bid_count} enchère{auction.bid_count !== 1 ? "s" : ""} — Fin:{" "}
                    {new Date(auction.ends_at).toLocaleString("fr-FR")}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#ffd54f" }}>
                    🪙 {(auction.current_bid ?? auction.starting_bid).toLocaleString("fr-FR")}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 10,
                      background: `${statusInfo.color}22`,
                      color: statusInfo.color,
                    }}
                  >
                    {statusInfo.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
