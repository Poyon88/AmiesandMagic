"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { AuctionWithDetails } from "@/lib/auction/types";
import GameCard from "@/components/cards/GameCard";

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
      if (h > 0) setTimeLeft(`${h}h ${m}m`);
      else if (m > 0) setTimeLeft(`${m}m ${s}s`);
      else setTimeLeft(`${s}s`);
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endDate, endedLabel]);

  return timeLeft;
}

interface AuctionCardProps {
  auction: AuctionWithDetails;
}

export default function AuctionCard({ auction }: AuctionCardProps) {
  const router = useRouter();
  const t = useTranslations("auction");
  const timeLeft = useCountdown(auction.ends_at, t("ended"));
  const isExpired = timeLeft === t("ended");

  const mainItem = auction.items?.[0];
  const mainCard = mainItem?.card ?? null;
  const mainBoard = mainItem?.board ?? null;
  const mainCardBack = mainItem?.card_back ?? null;
  const itemCount = auction.items?.length ?? 0;
  const itemName = mainCard?.name ?? mainBoard?.name ?? mainCardBack?.name ?? t("unknown_item");

  return (
    <div
      style={{
        background: "#2a2a45",
        border: "1px solid #3d3d5c",
        borderRadius: 12,
        padding: 16,
        opacity: isExpired ? 0.6 : 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      {/* Item visual */}
      <div style={{ position: "relative", width: 180, height: 252, flexShrink: 0 }}>
        {mainCard ? (
          <GameCard card={mainCard} size="sm" />
        ) : mainBoard ? (
          <div
            style={{
              width: "100%", height: "100%", borderRadius: 10,
              backgroundImage: `url('${mainBoard.image_url}')`,
              backgroundSize: "cover", backgroundPosition: "center",
              border: "2px solid #3d3d5c", position: "relative", overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(0,0,0,0.85), transparent 50%)" }} />
            <div style={{ position: "absolute", bottom: 8, left: 8, right: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{mainBoard.name}</div>
              <div style={{ fontSize: 10, color: "#ccc" }}>{mainBoard.rarity ?? "Commune"} · {t("board")}</div>
            </div>
          </div>
        ) : mainCardBack ? (
          <div
            style={{
              width: "100%", height: "100%", borderRadius: 10,
              backgroundImage: `url('${mainCardBack.image_url}')`,
              backgroundSize: "cover", backgroundPosition: "center",
              border: "2px solid #8b5cf6", position: "relative", overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(0,0,0,0.85), transparent 50%)" }} />
            <div style={{ position: "absolute", bottom: 8, left: 8, right: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{mainCardBack.name}</div>
              <div style={{ fontSize: 10, color: "#ccc" }}>{mainCardBack.rarity ?? "Commune"} · {t("card_back")}</div>
            </div>
          </div>
        ) : null}
        {itemCount > 1 && (
          <div
            style={{
              position: "absolute",
              top: 4,
              right: -8,
              background: "#c8a84e",
              color: "#1a1a2e",
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: 10,
              zIndex: 25,
            }}
          >
            {t("extra_items", { count: itemCount - 1 })}
          </div>
        )}
      </div>

      {/* Auction info — clickable to navigate */}
      <div
        onClick={() => router.push(`/auction/${auction.id}`)}
        style={{ width: "100%", cursor: "pointer" }}
      >
        {/* Time remaining */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 13, color: "#e0e0e0", fontWeight: 600 }}>
            {itemName}
          </div>
          <div
            style={{
              fontSize: 11,
              padding: "3px 8px",
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
            <div style={{ fontSize: 10, color: "#999", marginBottom: 2 }}>
              {auction.current_bid ? t("current_bid") : t("starting_bid")}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#ffd54f", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 14 }}>🪙</span>
              {(auction.current_bid ?? auction.starting_bid).toLocaleString("fr-FR")}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            {auction.buyout_price && (
              <div style={{ fontSize: 11, color: "#4caf50" }}>
                {t("buyout_short")} 🪙 {auction.buyout_price.toLocaleString("fr-FR")}
              </div>
            )}
            <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
              {t("bid_count", { count: auction.bid_count })}
            </div>
          </div>
        </div>

        {/* Seller */}
        <div style={{ fontSize: 10, color: "#666", marginTop: 8, borderTop: "1px solid #3d3d5c33", paddingTop: 6 }}>
          {t("seller")} {auction.seller_username ?? t("system")}
        </div>
      </div>
    </div>
  );
}
