"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { AuctionWithDetails, AuctionBid } from "@/lib/auction/types";
import GameCard from "@/components/cards/GameCard";

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
      if (h > 0) setTimeLeft(`${h}h ${m}m ${s}s`);
      else if (m > 0) setTimeLeft(`${m}m ${s}s`);
      else setTimeLeft(`${s}s`);
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endDate]);

  return timeLeft;
}

interface AuctionDetailProps {
  auctionId: string;
  userId: string;
}

export default function AuctionDetail({ auctionId, userId }: AuctionDetailProps) {
  const router = useRouter();
  const [auction, setAuction] = useState<AuctionWithDetails & { bids?: AuctionBid[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState("");
  const [bidding, setBidding] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchAuction = useCallback(async () => {
    const res = await fetch(`/api/auctions/${auctionId}`);
    const data = await res.json();
    if (data.auction) {
      setAuction(data.auction);
      // Pre-fill next minimum bid
      const minBid = data.auction.current_bid
        ? data.auction.current_bid + 1
        : data.auction.starting_bid;
      setBidAmount(String(minBid));
    }
    setLoading(false);
  }, [auctionId]);

  useEffect(() => {
    fetchAuction();
  }, [fetchAuction]);

  const timeLeft = useCountdown(auction?.ends_at ?? new Date().toISOString());
  const isExpired = timeLeft === "Terminée";
  const isSeller = auction?.seller_id === userId;
  const isCurrentBidder = auction?.current_bidder_id === userId;

  async function handleBid(isBuyout = false) {
    if (!auction) return;
    setError("");
    setSuccess("");
    setBidding(true);

    const amount = isBuyout ? auction.buyout_price! : parseInt(bidAmount);
    if (!amount || amount <= 0) {
      setError("Montant invalide");
      setBidding(false);
      return;
    }

    const res = await fetch(`/api/auctions/${auctionId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, is_buyout: isBuyout }),
    });

    const data = await res.json();
    if (data.error) {
      setError(data.error);
    } else {
      setSuccess(isBuyout ? "Achat immédiat réussi !" : "Enchère placée !");
      fetchAuction();
    }
    setBidding(false);
  }

  async function handleCancel() {
    setError("");
    const res = await fetch(`/api/auctions/${auctionId}`, { method: "DELETE" });
    const data = await res.json();
    if (data.error) {
      setError(data.error);
    } else {
      router.push("/auction");
    }
  }

  if (loading) {
    return <div style={{ textAlign: "center", padding: 60, color: "#999" }}>Chargement...</div>;
  }

  if (!auction) {
    return <div style={{ textAlign: "center", padding: 60, color: "#e74c3c" }}>Enchère introuvable</div>;
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      {/* Back button */}
      <button
        onClick={() => router.push("/auction")}
        style={{
          padding: "6px 12px",
          background: "transparent",
          border: "1px solid #3d3d5c",
          borderRadius: 6,
          color: "#999",
          fontSize: 13,
          cursor: "pointer",
          marginBottom: 20,
        }}
      >
        Retour aux enchères
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Left: items */}
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#c8a84e", margin: "0 0 16px", fontFamily: "var(--font-cinzel), serif" }}>
            {auction.items.length > 1 ? "Lot de cartes" : auction.items[0]?.card?.name ?? "Carte"}
          </h2>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {auction.items.map((item) => (
              <div key={item.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                {item.card && (
                  <GameCard card={item.card} size="md" count={item.quantity > 1 ? item.quantity : undefined} />
                )}
                <div style={{ fontSize: 11, color: "#666" }}>
                  {item.source_type === "print" ? "Édition limitée" : item.source_type === "admin" ? "Système" : "Collection"}
                </div>
              </div>
            ))}
          </div>

          {/* Seller info */}
          <div style={{ marginTop: 16, fontSize: 13, color: "#999" }}>
            Vendeur: <span style={{ color: "#e0e0e0" }}>{auction.seller_username ?? "Système"}</span>
            {auction.seller_type === "admin" && (
              <span style={{ marginLeft: 6, fontSize: 11, color: "#c8a84e" }}>ADMIN</span>
            )}
          </div>
        </div>

        {/* Right: bidding */}
        <div>
          {/* Status */}
          <div
            style={{
              background: "#2a2a45",
              border: "1px solid #3d3d5c",
              borderRadius: 10,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: "#999" }}>
                  {auction.current_bid ? "Enchère actuelle" : "Mise de départ"}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#ffd54f", display: "flex", alignItems: "center", gap: 6 }}>
                  🪙 {(auction.current_bid ?? auction.starting_bid).toLocaleString("fr-FR")}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: "#999" }}>Temps restant</div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    color: isExpired ? "#e74c3c" : "#c8a84e",
                  }}
                >
                  {timeLeft}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 13, color: "#999", marginBottom: 4 }}>
              {auction.bid_count} enchère{auction.bid_count !== 1 ? "s" : ""} — Commission: {auction.commission_rate}%
            </div>

            {isCurrentBidder && !isExpired && (
              <div style={{ fontSize: 13, color: "#4caf50", marginTop: 8 }}>
                Vous êtes le meilleur enchérisseur
              </div>
            )}

            {auction.status !== "active" && (
              <div style={{ fontSize: 14, fontWeight: 600, color: auction.status === "ended_sold" ? "#4caf50" : "#e74c3c", marginTop: 8 }}>
                {auction.status === "ended_sold" ? "Vendue" : auction.status === "ended_unsold" ? "Invendue" : "Annulée"}
              </div>
            )}
          </div>

          {/* Bid form */}
          {auction.status === "active" && !isExpired && !isSeller && (
            <div
              style={{
                background: "#2a2a45",
                border: "1px solid #3d3d5c",
                borderRadius: 10,
                padding: 20,
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  type="number"
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  min={auction.current_bid ? auction.current_bid + 1 : auction.starting_bid}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    background: "#1a1a2e",
                    border: "1px solid #3d3d5c",
                    borderRadius: 6,
                    color: "#e0e0e0",
                    fontSize: 16,
                  }}
                />
                <button
                  onClick={() => handleBid(false)}
                  disabled={bidding}
                  style={{
                    padding: "10px 20px",
                    background: bidding ? "#666" : "#c8a84e",
                    border: "none",
                    borderRadius: 6,
                    color: "#1a1a2e",
                    fontWeight: 600,
                    cursor: bidding ? "default" : "pointer",
                  }}
                >
                  {bidding ? "..." : "Enchérir"}
                </button>
              </div>

              {auction.buyout_price && (
                <button
                  onClick={() => handleBid(true)}
                  disabled={bidding}
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: bidding ? "#666" : "#2ecc71",
                    border: "none",
                    borderRadius: 6,
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: bidding ? "default" : "pointer",
                  }}
                >
                  Achat immédiat — 🪙 {auction.buyout_price.toLocaleString("fr-FR")}
                </button>
              )}
            </div>
          )}

          {/* Cancel button for seller */}
          {isSeller && auction.status === "active" && auction.bid_count === 0 && (
            <button
              onClick={handleCancel}
              style={{
                width: "100%",
                padding: "10px",
                background: "#e74c3c22",
                border: "1px solid #e74c3c44",
                borderRadius: 6,
                color: "#e74c3c",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
                marginBottom: 16,
              }}
            >
              Annuler l'enchère
            </button>
          )}

          {error && (
            <div style={{ padding: 10, background: "#e74c3c22", border: "1px solid #e74c3c44", borderRadius: 6, color: "#e74c3c", fontSize: 13, marginBottom: 10 }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ padding: 10, background: "#2ecc7122", border: "1px solid #2ecc7144", borderRadius: 6, color: "#2ecc71", fontSize: 13, marginBottom: 10 }}>
              {success}
            </div>
          )}

          {/* Bid history */}
          <div
            style={{
              background: "#2a2a45",
              border: "1px solid #3d3d5c",
              borderRadius: 10,
              padding: 16,
            }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0", margin: "0 0 12px" }}>
              Historique des enchères
            </h3>
            {!auction.bids?.length ? (
              <div style={{ fontSize: 13, color: "#666" }}>Aucune enchère pour le moment</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {auction.bids.map((bid) => (
                  <div
                    key={bid.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 10px",
                      background: "#1a1a2e",
                      borderRadius: 6,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: bid.bidder_id === userId ? "#c8a84e" : "#e0e0e0" }}>
                      {bid.bidder_username ?? "Anonyme"}
                      {bid.is_buyout && <span style={{ color: "#2ecc71", marginLeft: 4 }}>(Achat immédiat)</span>}
                    </span>
                    <span style={{ color: "#ffd54f", fontWeight: 600 }}>
                      🪙 {bid.amount.toLocaleString("fr-FR")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
