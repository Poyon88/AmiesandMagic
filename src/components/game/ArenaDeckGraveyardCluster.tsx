"use client";

import { useState } from "react";
import Image from "next/image";
import type { CardInstance } from "@/lib/game/types";
import GameCard from "@/components/cards/GameCard";

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

// Number of "ghost cards" stamped behind the front tile via box-shadow so a
// pile reads like a pile. Bigger piles show more layers up to 3. Below 2 we
// don't show anything — a single card isn't a stack.
function pileDepth(count: number): number {
  if (count <= 1) return 0;
  if (count < 5) return 1;
  if (count < 15) return 2;
  return 3;
}

// Builds a layered box-shadow string that draws stacked card silhouettes
// behind the front tile. Each step pushes a flat shadow down + right. The
// final shadow is the regular drop shadow under the whole pile.
function buildPileShadow(count: number, accentSoft: string): string {
  const depth = pileDepth(count);
  const stack: string[] = [];
  // Render farthest layer first so it sits at the bottom of the painted
  // shadow stack — closer layers paint over farther ones.
  for (let step = depth; step >= 1; step--) {
    const offset = step * 4; // px
    const tone = 28 + step * 8; // 36 / 44 / 52 — slightly lighter the deeper
    stack.push(`${offset}px ${offset}px 0 -1px rgb(${tone}, ${tone - 4}, ${tone + 4})`);
    // Subtle highlight on the top edge of each ghost layer for relief.
    stack.push(`${offset}px ${offset - 1}px 0 -1px rgba(255,255,255,0.05)`);
  }
  stack.push(`0 0 10px ${accentSoft}`);
  stack.push(`${depth * 4 + 2}px ${depth * 4 + 6}px 14px rgba(0,0,0,0.55)`);
  return stack.join(", ");
}

function DeckTile({ cardBackUrl, count, isOpponent }: DeckTileProps) {
  // Hover-preview of the card back at a larger size — same right-side anchor
  // as the graveyard preview for consistency. No right-click toggle here:
  // the back has no description side, only the art.
  const [hovered, setHovered] = useState(false);
  const accentSoft = isOpponent ? "rgba(231, 76, 60, 0.25)" : "rgba(155, 89, 182, 0.25)";
  const pileShadow = buildPileShadow(count, accentSoft);

  return (
    <div
      className="relative w-32 aspect-[5/7]"
      title={isOpponent ? "Pioche adverse" : "Votre pioche"}
      data-no-global-click-sfx="true"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="relative w-full h-full rounded-lg overflow-hidden"
        style={{ boxShadow: pileShadow }}
      >
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

      {hovered && cardBackUrl && (
        <div
          style={{
            position: "fixed",
            right: 32,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 60,
            pointerEvents: "none",
            // Match GameCard size="lg" footprint (340 × 476) for visual parity
            // with the graveyard hover preview.
            width: 340,
            height: 476,
            borderRadius: 14,
            overflow: "hidden",
            border: "2px solid rgba(200, 168, 78, 0.6)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
          }}
        >
          <Image
            src={cardBackUrl}
            alt=""
            fill
            sizes="512px"
            className="object-cover"
            quality={100}
            unoptimized
            draggable={false}
          />
        </div>
      )}
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
  // Hover-preview of the top card directly on the board, before the player
  // even opens the full graveyard modal. The preview is rendered in a fixed
  // viewport-anchored container so it doesn't get clipped by any overflow on
  // the surrounding board layout. Right-click toggles the preview between
  // the card art and the description overlay (same pattern used inside
  // GraveyardOverlay).
  const [hovered, setHovered] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const accentSoft = isOpponent ? "rgba(231, 76, 60, 0.25)" : "rgba(155, 89, 182, 0.25)";
  const pileShadow = buildPileShadow(count, accentSoft);

  return (
    // Rendered as a <div> rather than a <button> on purpose: Chrome applies
    // `appearance: button` user-agent styling which can promote the element
    // to a compositor layer and downsample any images inside. The deck tile
    // (also a <div>) renders crisply, so we mirror that exactly.
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        setHovered(false);
        setShowDetails(false);
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setShowDetails(false);
      }}
      onContextMenu={(e) => {
        if (!topCard) return;
        e.preventDefault();
        setShowDetails((prev) => !prev);
      }}
      data-no-global-click-sfx="true"
      title={isOpponent ? "Cimetière adverse" : "Votre cimetière"}
      className="relative w-32 aspect-[5/7] cursor-pointer"
    >
      <div
        className="relative w-full h-full rounded-lg overflow-hidden"
        style={{ boxShadow: pileShadow }}
      >
        {topCard && topCard.image_url ? (
          // Card art is full-resolution (≥1024px). Chrome downsamples this
          // poorly into a 128px tile (Firefox is fine). Drop `unoptimized`
          // so Next.js serves a 256px variant — Chrome only does a 2×
          // downsample, which it handles cleanly.
          <Image
            src={topCard.image_url}
            alt={topCard.name}
            fill
            sizes="256px"
            className="object-cover"
            quality={75}
            draggable={false}
          />
        ) : emptyImageUrl ? (
          <Image
            src={emptyImageUrl}
            alt=""
            fill
            sizes="256px"
            className="object-cover"
            quality={75}
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
      {/* Name overlay sits OUTSIDE the image clip wrapper as a positioned
          sibling — it has no effect on the image rasterization (we tested
          by removing it). The actual sharpness fix is letting Next.js
          serve a 256px-sized variant on the <Image> above. */}
      {topCard && topCard.image_url && (
        <div
          className="absolute left-0 right-0 bottom-0 text-center pointer-events-none overflow-hidden"
          style={{
            padding: "22px 5px 6px",
            background:
              "linear-gradient(0deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 55%, transparent 100%)",
            borderBottomLeftRadius: 8,
            borderBottomRightRadius: 8,
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
      )}
      <FrameOverlay isOpponent={isOpponent} />
      <TopLabel label="Cimetière" isOpponent={isOpponent} />
      <CountBadge count={count} />

      {hovered && topCard && (
        <div
          style={{
            position: "fixed",
            // Anchored to the right side of the viewport so the preview never
            // overlaps the player's hand (centered) or covers the tile itself.
            // Same anchor as GraveyardOverlay's preview for visual consistency.
            right: 32,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 60,
            pointerEvents: "none",
            filter: "drop-shadow(0 12px 32px rgba(0,0,0,0.6))",
          }}
        >
          <GameCard
            card={topCard}
            size="lg"
            disableHoverZoom
            showDetails={showDetails}
          />
        </div>
      )}
    </div>
  );
}

function FrameOverlay({ isOpponent }: { isOpponent: boolean }) {
  const accent = isOpponent ? "rgba(231, 76, 60, 0.55)" : "rgba(155, 89, 182, 0.55)";
  const accentSoft = isOpponent ? "rgba(231, 76, 60, 0.25)" : "rgba(155, 89, 182, 0.25)";
  return (
    <div
      aria-hidden
      className="absolute inset-0 rounded-lg pointer-events-none"
      style={{
        border: `2px solid ${accent}`,
        boxShadow: `0 0 10px ${accentSoft}`,
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
      className="absolute top-0 left-0 right-0 text-center pointer-events-none rounded-t-lg overflow-hidden"
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
