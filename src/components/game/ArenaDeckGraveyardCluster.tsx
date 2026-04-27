"use client";

import Image from "next/image";
import type { CardInstance } from "@/lib/game/types";

interface Props {
  deckCount: number;
  cardBackUrl: string | null;
  graveyard: CardInstance[];
  /** Optional admin-uploaded fallback image used only when the graveyard is empty. */
  emptyGraveyardImageUrl: string | null;
  isOpponent: boolean;
  onGraveyardClick: () => void;
}

// Width is matched to the opponent hand-back tile (`w-32` = 128px) — that
// component is verified crisp on Chrome, so reusing the exact wrapper
// signature (Tailwind `rounded overflow-hidden`, `aspect-[5/7]`, Next
// Image with `fill` / `unoptimized` / `quality={100}`) avoids the
// sub-pixel / compositor quirks that surface when we override with custom
// inline sizing.
//
// Decoration (border, glow, count badge, label) lives on positioned sibling
// elements outside the image clip so the image's render layer stays clean.
export default function ArenaDeckGraveyardCluster({
  deckCount,
  cardBackUrl,
  graveyard,
  emptyGraveyardImageUrl,
  isOpponent,
  onGraveyardClick,
}: Props) {
  const topCard = graveyard.length > 0 ? graveyard[graveyard.length - 1].card : null;

  return (
    <div className="flex items-end gap-2">
      <DeckTile cardBackUrl={cardBackUrl} count={deckCount} isOpponent={isOpponent} />
      <GraveyardTile
        topCard={topCard}
        emptyImageUrl={emptyGraveyardImageUrl}
        count={graveyard.length}
        isOpponent={isOpponent}
        onClick={onGraveyardClick}
      />
    </div>
  );
}

interface DeckTileProps {
  cardBackUrl: string | null;
  count: number;
  isOpponent: boolean;
}

function DeckTile({ cardBackUrl, count, isOpponent }: DeckTileProps) {
  return (
    <div
      className="relative w-32 aspect-[5/7]"
      title={isOpponent ? "Pioche adverse" : "Votre pioche"}
      data-no-global-click-sfx="true"
    >
      <div className="relative w-full h-full rounded overflow-hidden">
        {cardBackUrl ? (
          <Image
            src={cardBackUrl}
            alt=""
            fill
            sizes="(min-resolution: 3dppx) 768px, (min-resolution: 2dppx) 512px, 256px"
            className="object-cover"
            quality={100}
            unoptimized
            draggable={false}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-secondary via-card-bg to-secondary flex items-center justify-center">
            <div className="w-20 h-28 rounded border border-primary/20 bg-primary/10 flex items-center justify-center">
              <span className="text-primary/40 text-xl font-bold">A&amp;M</span>
            </div>
          </div>
        )}
      </div>
      <FrameOverlay isOpponent={isOpponent} />
      <TopLabel label="Pioche" isOpponent={isOpponent} />
      <CountBadge count={count} />
    </div>
  );
}

interface GraveyardTileProps {
  topCard: CardInstance["card"] | null;
  emptyImageUrl: string | null;
  count: number;
  isOpponent: boolean;
  onClick: () => void;
}

function GraveyardTile({ topCard, emptyImageUrl, count, isOpponent, onClick }: GraveyardTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-no-global-click-sfx="true"
      title={isOpponent ? "Cimetière adverse" : "Votre cimetière"}
      className="relative w-32 aspect-[5/7] p-0 bg-transparent border-0 cursor-pointer"
    >
      <div className="relative w-full h-full rounded overflow-hidden">
        {topCard && topCard.image_url ? (
          <>
            <Image
              src={topCard.image_url}
              alt={topCard.name}
              fill
              sizes="(min-resolution: 3dppx) 768px, (min-resolution: 2dppx) 512px, 256px"
              className="object-cover"
              quality={100}
              unoptimized
              draggable={false}
            />
            {/* Bottom dim + name overlay */}
            <div
              className="absolute left-0 right-0 bottom-0 text-center pointer-events-none"
              style={{
                padding: "22px 5px 6px",
                background:
                  "linear-gradient(0deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 55%, transparent 100%)",
              }}
            >
              <div
                style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#fff",
                  textShadow: "0 1px 3px rgba(0,0,0,0.95)",
                  letterSpacing: 0.4,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  lineHeight: 1.1,
                }}
              >
                {topCard.name}
              </div>
            </div>
          </>
        ) : emptyImageUrl ? (
          <Image
            src={emptyImageUrl}
            alt=""
            fill
            sizes="(min-resolution: 3dppx) 768px, (min-resolution: 2dppx) 512px, 256px"
            className="object-cover"
            quality={100}
            unoptimized
            draggable={false}
            style={{ opacity: 0.65 }}
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background:
                "radial-gradient(circle at center, rgba(155, 89, 182, 0.25), transparent 70%)",
              fontSize: 50,
              opacity: 0.5,
            }}
          >
            🪦
          </div>
        )}
      </div>
      <FrameOverlay isOpponent={isOpponent} />
      <TopLabel label="Cimetière" isOpponent={isOpponent} />
      <CountBadge count={count} />
    </button>
  );
}

function FrameOverlay({ isOpponent }: { isOpponent: boolean }) {
  const accent = isOpponent ? "rgba(231, 76, 60, 0.55)" : "rgba(155, 89, 182, 0.55)";
  const accentSoft = isOpponent ? "rgba(231, 76, 60, 0.25)" : "rgba(155, 89, 182, 0.25)";
  return (
    <div
      aria-hidden
      className="absolute inset-0 rounded pointer-events-none"
      style={{
        border: `2px solid ${accent}`,
        boxShadow: `0 0 10px ${accentSoft}, 0 6px 14px rgba(0,0,0,0.5)`,
      }}
    />
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <div
      className="absolute -bottom-2 -right-2 flex items-center justify-center"
      style={{
        minWidth: 34,
        height: 34,
        padding: "0 8px",
        borderRadius: 999,
        background: "rgba(0, 0, 0, 0.92)",
        border: "2px solid rgba(200, 168, 78, 0.85)",
        boxShadow: "0 2px 6px rgba(0,0,0,0.7)",
        fontFamily: "'Cinzel', serif",
        fontSize: 17,
        fontWeight: 800,
        color: "#fff",
        textShadow: "0 1px 2px rgba(0,0,0,0.9)",
      }}
    >
      {count}
    </div>
  );
}

function TopLabel({ label, isOpponent }: { label: string; isOpponent: boolean }) {
  return (
    <div
      className="absolute top-0 left-0 right-0 text-center pointer-events-none"
      style={{
        padding: "4px 5px 9px",
        background: "linear-gradient(180deg, rgba(0,0,0,0.7), transparent)",
        fontFamily: "'Cinzel', serif",
        fontSize: 11,
        letterSpacing: 1.4,
        color: isOpponent ? "#f5b7b1" : "#d7bde2",
        textShadow: "0 1px 2px rgba(0,0,0,0.95)",
        textTransform: "uppercase",
      }}
    >
      {label}
    </div>
  );
}
