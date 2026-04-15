"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuctionWithDetails } from "@/lib/auction/types";

const RARITY_COLORS: Record<string, string> = {
  "Commune": "#aaaaaa",
  "Peu Commune": "#4caf50",
  "Rare": "#4fc3f7",
  "Épique": "#ce93d8",
  "Légendaire": "#ffd54f",
};

function useCountdown(endDate: string) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    function update() {
      const diff = new Date(endDate).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("Terminée");
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (h > 0) setTimeLeft(`${h}h ${m}m`);
      else if (m > 0) setTimeLeft(`${m}m ${s}s`);
      else setTimeLeft(`${s}s`);
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endDate]);

  return timeLeft;
}

interface AuctionCardProps {
  auction: AuctionWithDetails;
}

export default function AuctionCard({ auction }: AuctionCardProps) {
  const router = useRouter();
  const timeLeft = useCountdown(auction.ends_at);
  const isExpired = timeLeft === "Terminée";

  const mainCard = auction.items?.[0]?.card;
  const itemCount = auction.items?.length ?? 0;
  const rarity = mainCard?.rarity ?? "";

  return (
    <div
      onClick={() => router.push(`/auction/${auction.id}`)}
      style={{
        background: "#2a2a45",
        border: "1px solid #3d3d5c",
        borderRadius: 12,
        padding: 16,
        cursor: "pointer",
        transition: "all 0.15s ease",
        opacity: isExpired ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#c8a84e";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#3d3d5c";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Card header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#e0e0e0", marginBottom: 4 }}>
            {mainCard?.name ?? "Carte inconnue"}
            {itemCount > 1 && (
              <span style={{ fontSize: 12, color: "#c8a84e", marginLeft: 6 }}>
                +{itemCount - 1} carte{itemCount > 2 ? "s" : ""}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {rarity && (
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 10,
                  background: `${RARITY_COLORS[rarity] ?? "#666"}22`,
                  color: RARITY_COLORS[rarity] ?? "#666",
                  border: `1px solid ${RARITY_COLORS[rarity] ?? "#666"}44`,
                }}
              >
                {rarity}
              </span>
            )}
            {mainCard?.faction && (
              <span style={{ fontSize: 11, color: "#999" }}>{mainCard.faction}</span>
            )}
            {mainCard?.card_type && (
              <span style={{ fontSize: 11, color: "#999" }}>
                {mainCard.card_type === "creature" ? "Créature" : "Sort"}
              </span>
            )}
          </div>
        </div>
        <div
          style={{
            fontSize: 12,
            padding: "4px 8px",
            borderRadius: 6,
            background: isExpired ? "#e74c3c22" : "#c8a84e22",
            color: isExpired ? "#e74c3c" : "#c8a84e",
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          {timeLeft}
        </div>
      </div>

      {/* Price info */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end" }}>
        <div>
          <div style={{ fontSize: 11, color: "#999", marginBottom: 2 }}>
            {auction.current_bid ? "Enchère actuelle" : "Mise de départ"}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#ffd54f", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 16 }}>🪙</span>
            {(auction.current_bid ?? auction.starting_bid).toLocaleString("fr-FR")}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          {auction.buyout_price && (
            <div style={{ fontSize: 12, color: "#4caf50" }}>
              Achat immédiat: 🪙 {auction.buyout_price.toLocaleString("fr-FR")}
            </div>
          )}
          <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
            {auction.bid_count} enchère{auction.bid_count !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* Seller */}
      <div style={{ fontSize: 11, color: "#666", marginTop: 10, borderTop: "1px solid #3d3d5c33", paddingTop: 8 }}>
        Vendeur: {auction.seller_username ?? "Système"}
      </div>
    </div>
  );
}
