"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { AuctionWithDetails, AuctionBid } from "@/lib/auction/types";
import GameCard from "@/components/cards/GameCard";

import GoldCoin from "@/components/shared/GoldCoin";
function useCountdown(endDate: string, endedLabel: string) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    function update() {
      const diff = new Date(endDate).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft(endedLabel);
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
  }, [endDate, endedLabel]);

  return timeLeft;
}

interface AuctionDetailProps {
  auctionId: string;
  userId: string;
}

export default function AuctionDetail({ auctionId, userId }: AuctionDetailProps) {
  const router = useRouter();
  const t = useTranslations("auction");
  const [auction, setAuction] = useState<AuctionWithDetails & { bids?: AuctionBid[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState("");
  const [bidding, setBidding] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  // Incrément minimum du marché. Le pré-remplissage utilisait « +1 » en dur :
  // dès que l'administrateur relève l'incrément, il proposait un montant que le
  // serveur refuse.
  const [minIncrement, setMinIncrement] = useState(1);
  // Le pré-remplissage n'a lieu qu'au PREMIER chargement. Les rafraîchissements
  // qui suivent ne doivent pas écraser ce que le joueur est en train de taper.
  const prefilled = useRef(false);

  const fetchAuction = useCallback(async () => {
    const res = await fetch(`/api/auctions/${auctionId}`);
    const data = await res.json();
    if (data.auction) {
      setAuction(data.auction);
      if (!prefilled.current) {
        prefilled.current = true;
        const minBid = data.auction.current_bid
          ? data.auction.current_bid + minIncrement
          : data.auction.starting_bid;
        setBidAmount(String(minBid));
      }
    }
    setLoading(false);
  }, [auctionId, minIncrement]);

  useEffect(() => {
    fetchAuction();
  }, [fetchAuction]);

  useEffect(() => {
    fetch("/api/auctions/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.settings?.min_bid_increment && setMinIncrement(d.settings.min_bid_increment))
      .catch(() => { /* on garde 1 : le serveur refusera et dira le bon montant */ });
  }, []);

  // ─── Rafraîchissement pendant que d'autres enchérissent ───────────────────
  //
  // Sans cela, la page reste sur l'instantané de son chargement : elle ignore
  // les mises des autres, et surtout elle ignore que la fin a été REPOUSSÉE par
  // la prolongation anti-sniping. Un joueur voyait donc « Terminée » sur une
  // enchère encore ouverte — c'est exactement ce qui a été constaté.
  //
  // Cadence adaptative plutôt que fixe : dans la dernière minute, tout se joue,
  // et découvrir une surenchère six secondes trop tard revient à ne pas la
  // découvrir. Loin de la fin, sonder aussi souvent ne servirait qu'à charger
  // le serveur.
  const auctionEndsAt = auction?.ends_at;
  const auctionStatus = auction?.status;
  useEffect(() => {
    if (!auctionEndsAt || auctionStatus !== "active") return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    function planifier() {
      const restant = new Date(auctionEndsAt!).getTime() - Date.now();
      // Une enchère dont l'échéance est passée peut encore être prolongée par
      // une mise de dernière seconde : on continue de sonder un moment plutôt
      // que de conclure trop vite.
      const delai = restant < 90_000 ? 2_000 : 6_000;
      timer = setTimeout(async () => {
        if (stopped) return;
        await fetchAuction();
        if (!stopped) planifier();
      }, delai);
    }
    planifier();
    return () => { stopped = true; clearTimeout(timer); };
  }, [auctionEndsAt, auctionStatus, fetchAuction]);

  const timeLeft = useCountdown(auction?.ends_at ?? new Date().toISOString(), t("ended"));
  const isExpired = timeLeft === t("ended");
  const isSeller = auction?.seller_id === userId;
  const isCurrentBidder = auction?.current_bidder_id === userId;

  async function handleBid(isBuyout = false) {
    if (!auction) return;
    setError("");
    setSuccess("");
    setBidding(true);

    const amount = isBuyout ? auction.buyout_price! : parseInt(bidAmount);
    if (!amount || amount <= 0) {
      setError(t("invalid_amount"));
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
      setSuccess(isBuyout ? t("buyout_success") : t("bid_placed"));
      // Sa propre mise est le seul moment où réécrire le champ est légitime :
      // la valeur qu'il contenait vient d'être consommée.
      prefilled.current = false;
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
    return <div style={{ textAlign: "center", padding: 60, color: "#999" }}>{t("loading")}</div>;
  }

  if (!auction) {
    return <div style={{ textAlign: "center", padding: 60, color: "#e74c3c" }}>{t("not_found")}</div>;
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
        {t("back_to_auctions")}
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Left: items */}
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#c8a84e", margin: "0 0 16px", fontFamily: "var(--font-cinzel), serif" }}>
            {auction.items.length > 1
              ? t("lot")
              : auction.items[0]?.card?.name
                ?? auction.items[0]?.board?.name
                ?? auction.items[0]?.card_back?.name
                ?? t("item")}
          </h2>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {auction.items.map((item) => (
              <div key={item.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                {item.card ? (
                  <GameCard
                    card={item.card}
                    size="md"
                    count={item.quantity > 1 ? item.quantity : undefined}
                    forceRarityFrame
                    printNumber={item.print_number ?? undefined}
                    maxPrints={item.max_prints ?? undefined}
                  />
                ) : item.board ? (
                  <div style={{
                    width: 260, height: 146, borderRadius: 10, overflow: "hidden",
                    backgroundImage: `url('${item.board.image_url}')`,
                    backgroundSize: "cover", backgroundPosition: "center",
                    border: "2px solid #3d3d5c", position: "relative",
                  }}>
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(0,0,0,0.85), transparent 55%)" }} />
                    <div style={{ position: "absolute", bottom: 8, left: 10, right: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{item.board.name}</div>
                      <div style={{ fontSize: 11, color: "#ddd" }}>
                        {item.board.rarity ?? "Commune"}
                        {item.board.max_prints ? ` · ${t("copies", { count: item.board.max_prints })}` : ""}
                      </div>
                    </div>
                  </div>
                ) : item.card_back ? (
                  <div style={{
                    width: 180, height: 252, borderRadius: 10, overflow: "hidden",
                    backgroundImage: `url('${item.card_back.image_url}')`,
                    backgroundSize: "cover", backgroundPosition: "center",
                    border: "2px solid #8b5cf6", position: "relative",
                  }}>
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(0,0,0,0.85), transparent 55%)" }} />
                    <div style={{ position: "absolute", bottom: 8, left: 10, right: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{item.card_back.name}</div>
                      <div style={{ fontSize: 11, color: "#ddd" }}>
                        {item.card_back.rarity ?? "Commune"}
                        {item.card_back.max_prints ? ` · ${t("copies", { count: item.card_back.max_prints })}` : ""}
                      </div>
                    </div>
                  </div>
                ) : null}
                <div style={{ fontSize: 11, color: "#666" }}>
                  {item.source_type === "print" ? t("source_print")
                    : item.source_type === "board_print" ? t("source_board_print")
                    : item.source_type === "card_back_print" ? t("source_card_back_print")
                    : item.source_type === "admin" ? t("source_admin")
                    : t("source_collection")}
                </div>
              </div>
            ))}
          </div>

          {/* Seller info */}
          <div style={{ marginTop: 16, fontSize: 13, color: "#999" }}>
            {t("seller")} <span style={{ color: "#e0e0e0" }}>{auction.seller_username ?? t("system")}</span>
            {auction.seller_type === "admin" && (
              <span style={{ marginLeft: 6, fontSize: 11, color: "#c8a84e" }}>{t("admin_badge")}</span>
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
                  {auction.current_bid ? t("current_bid") : t("starting_bid")}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#ffd54f", display: "flex", alignItems: "center", gap: 6 }}>
                  <GoldCoin size={26} /> {(auction.current_bid ?? auction.starting_bid).toLocaleString("fr-FR")}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: "#999" }}>{t("time_left")}</div>
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
              {t("bid_count", { count: auction.bid_count })} — {t("commission", { rate: auction.commission_rate })}
            </div>

            {isCurrentBidder && !isExpired && (
              <div style={{ fontSize: 13, color: "#4caf50", marginTop: 8 }}>
                {t("highest_bidder")}
              </div>
            )}

            {auction.status !== "active" && (
              <div style={{ fontSize: 14, fontWeight: 600, color: auction.status === "ended_sold" ? "#4caf50" : "#e74c3c", marginTop: 8 }}>
                {auction.status === "ended_sold" ? t("status_sold") : auction.status === "ended_unsold" ? t("status_unsold") : t("status_cancelled")}
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
                    padding: "12px 12px",
                    background: "#1a1a2e",
                    border: "1px solid #3d3d5c",
                    borderRadius: 6,
                    color: "#e0e0e0",
                    fontSize: 16,
                    minHeight: 44,
                  }}
                />
                <button
                  onClick={() => handleBid(false)}
                  disabled={bidding}
                  style={{
                    padding: "12px 20px",
                    background: bidding ? "#666" : "#c8a84e",
                    border: "none",
                    borderRadius: 6,
                    color: "#1a1a2e",
                    fontWeight: 600,
                    cursor: bidding ? "default" : "pointer",
                    minHeight: 44,
                  }}
                >
                  {bidding ? "..." : t("bid_button")}
                </button>
              </div>

              {auction.buyout_price && (
                <button
                  onClick={() => handleBid(true)}
                  disabled={bidding}
                  style={{
                    width: "100%",
                    padding: "12px",
                    background: bidding ? "#666" : "#2ecc71",
                    border: "none",
                    borderRadius: 6,
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: bidding ? "default" : "pointer",
                    minHeight: 44,
                  }}
                >
                  {t("buyout_immediate")} — <GoldCoin size={13} /> {auction.buyout_price.toLocaleString("fr-FR")}
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
              {t("cancel_auction")}
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
              {t("bid_history")}
            </h3>
            {!auction.bids?.length ? (
              <div style={{ fontSize: 13, color: "#666" }}>{t("no_bids_yet")}</div>
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
                      {bid.bidder_username ?? t("anonymous")}
                      {bid.is_buyout && <span style={{ color: "#2ecc71", marginLeft: 4 }}>{t("buyout_tag")}</span>}
                    </span>
                    <span style={{ color: "#ffd54f", fontWeight: 600 }}>
                      <GoldCoin size={13} /> {bid.amount.toLocaleString("fr-FR")}
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
