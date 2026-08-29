"use client";

import { useEffect, useState } from "react";
import { titleFontScale } from "@/lib/game/card-title";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { AuctionWithDetails } from "@/lib/auction/types";
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
        // Fond assombri, aligné sur les panneaux du reste du site (.am-glass).
        // Le précédent, plus clair, avalait le bord doré : un or à 30 %
        // d'opacité ne se voit que sur une surface sombre.
        background: "linear-gradient(160deg, rgba(34,28,56,0.92) 0%, rgba(15,13,26,0.96) 100%)",
        // Bord doré franc — c'est lui qui doit encadrer la vignette. Le liseré
        // intérieur lui donne l'épaisseur d'un cadre sans épaissir le trait.
        border: "1px solid rgba(216,178,90,0.55)",
        boxShadow: "inset 0 0 0 1px rgba(216,178,90,0.10), var(--am-shadow-sm)",
        borderRadius: 12,
        padding: 16,
        opacity: isExpired ? 0.6 : 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        // Hauteur pleine : les panneaux d'une même rangée s'alignent, quel que
        // soit le nombre de lignes du nom (cf. la réserve de deux lignes plus
        // bas). Sans cela, un nom long allongeait un seul panneau.
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* Item visual */}
      <div style={{ position: "relative", width: 180, height: 252, flexShrink: 0 }}>
        {mainCard ? (
          <GameCard
            card={mainCard}
            size="sm"
            forceRarityFrame
            // Numéro d'exemplaire de la série limitée. Absent sur une enchère
            // système, qui ne porte pas encore de tirage attribué.
            printNumber={mainItem?.print_number ?? undefined}
            maxPrints={mainItem?.max_prints ?? undefined}
          />
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
        style={{
          width: "100%", cursor: "pointer",
          // Occupe la hauteur restante et pousse la ligne « Vendeur » en bas :
          // les pieds de panneau s'alignent d'une carte à l'autre.
          flex: 1, display: "flex", flexDirection: "column",
        }}
      >
        {/* Time remaining */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
          {/* Deux lignes RÉSERVÉES, occupées ou non. C'est ce qui met le prix
              à la même hauteur sur toute la rangée : sans cette réserve, un nom
              qui passe à la ligne décale tout ce qui suit. */}
          <div style={{
            // La réserve de deux lignes est en `em` : elle suit donc la
            // réduction, et la rangée reste alignée quelle que soit l'échelle.
            fontSize: 13 * titleFontScale(itemName), color: "#e0e0e0", fontWeight: 600,
            minHeight: "2.6em", lineHeight: 1.3,
            display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2,
            overflow: "hidden",
          }}>
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
              <GoldCoin size={15} />
              {(auction.current_bid ?? auction.starting_bid).toLocaleString("fr-FR")}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            {auction.buyout_price && (
              <div style={{ fontSize: 11, color: "#4caf50" }}>
                {t("buyout_short")} <GoldCoin size={11} /> {auction.buyout_price.toLocaleString("fr-FR")}
              </div>
            )}
            <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
              {t("bid_count", { count: auction.bid_count })}
            </div>
          </div>
        </div>

        {/* Seller */}
        <div style={{ fontSize: 10, color: "#666", marginTop: "auto", paddingTop: 8, borderTop: "1px solid rgba(216,178,90,0.22)" }}>
          {t("seller")} {auction.seller_username ?? t("system")}
        </div>
      </div>
    </div>
  );
}
