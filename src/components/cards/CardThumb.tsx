"use client";

// VIGNETTE ALLÉGÉE d'une carte, pour les grilles qui en affichent des
// centaines (éditeur de la forge : 2 600 cartes). `GameCard` coûte cher à
// l'unité — écus en `clip-path` + `filter: drop-shadow`, SVG à dégradés,
// unités `cqw` (container queries), overlay de description avec
// `backdrop-filter` rendu même caché, icônes de mots-clés masquées et
// halottées — et multiplié par une grille entière il saturait le thread
// principal d'un iPad pendant une minute.
//
// Ici : rien de tout cela. Des <div> à fond uni ou dégradé linéaire, des
// tailles en pixels dérivées de `width`, aucun filtre, aucune container query,
// aucun SVG. Le rendu COMPLET (blasons) reste réservé à la carte sélectionnée,
// que la grille rend en `GameCard`.
import Image from "next/image";
import type { Card } from "@/lib/game/types";
import { OBJET_TEINTE } from "@/lib/game/objet-theme";
import { HERALDRY, HERALDRY_FONT } from "@/components/card/CardCounters";
import { additionalCostsOf } from "@/components/card/CardTokens";
import { composedCapsOf } from "@/lib/game/composed-display";

const RARITY_DOT: Record<string, string> = {
  "Commune": "#9a9a9a",
  "Peu Commune": "#4caf50",
  "Rare": "#4fc3f7",
  "Épique": "#ce93d8",
  "Légendaire": "#ffd54f",
};

/** Glyphe texte d'un coût additionnel — la vignette n'a pas la place d'une
 *  silhouette ; le glyphe + la couleur suffisent à repérer la carte. */
const COST_GLYPH: Record<string, { glyph: string; color: string }> = {
  vie: { glyph: "♥", color: "#ff8a7a" },
  defausse: { glyph: "🃏", color: "#9fb8d6" },
  sacrifice: { glyph: "☠", color: "#c9ccd2" },
  exil: { glyph: "⊘", color: "#c9a3ff" },
  repli: { glyph: "⤴", color: "#7fd6cf" },
};

interface CardThumbProps {
  card: Card;
  width?: number;
  selected?: boolean;
  onClick?: () => void;
}

/** Nombre de capacités portées (mots-clés, mécaniques de sort, composés) :
 *  un repère de densité, pas un détail — le détail est sur la carte choisie. */
export function abilityCount(card: Card): number {
  const kw = card.keyword_instances?.length ?? card.keywords?.length ?? 0;
  const spell = card.spell_keywords?.length ?? 0;
  const composed = composedCapsOf(card.capabilities).length;
  return kw + spell + composed;
}

export default function CardThumb({ card, width = 180, selected = false, onClick }: CardThumbProps) {
  const w = width;
  const h = Math.round(w * 1.4);
  const s = w / 180;
  const isCreature = card.card_type === "creature";
  const isItem = card.card_type === "item";
  const cadreDroit = isCreature || isItem;
  const border = selected ? "#c8a84e" : isCreature ? "#3d3d5c" : isItem ? OBJET_TEINTE : "#6c3483";
  const accent = isCreature ? "#74b9ff" : "#ce93d8";
  const cost = additionalCostsOf(card)[0];
  const eveil = card.eveil_cost ?? 0;
  const n = abilityCount(card);
  const rarityDot = card.rarity ? RARITY_DOT[card.rarity] : undefined;
  const atk = card.attack ?? 0;
  const hp = card.health ?? 0;

  const badge = (bg: string, extra?: React.CSSProperties): React.CSSProperties => ({
    display: "flex", alignItems: "center", justifyContent: "center",
    minWidth: 24 * s, height: 22 * s, padding: `0 ${5 * s}px`,
    borderRadius: 5 * s, background: bg,
    border: `${Math.max(1, 1.5 * s)}px solid ${HERALDRY.goldStat}`,
    color: HERALDRY.inkNeutral, fontFamily: HERALDRY_FONT, fontWeight: 700,
    fontSize: 12 * s, lineHeight: 1, fontVariantNumeric: "tabular-nums",
    ...extra,
  });

  return (
    <div
      role={onClick ? "button" : undefined}
      onClick={onClick}
      title={card.name}
      style={{
        position: "relative", width: w, height: h, flexShrink: 0,
        borderRadius: cadreDroit ? 10 * s : 4 * s,
        border: `2px solid ${border}`,
        boxShadow: selected ? "0 0 0 2px #c8a84e88" : undefined,
        background: isCreature ? "#141428" : "#180c26",
        overflow: "hidden", cursor: onClick ? "pointer" : "default",
        // Aucun effet au survol : la grille peut en contenir des milliers.
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {card.image_url ? (
        <Image
          src={card.image_url}
          alt=""
          fill
          sizes={`${w}px`}
          unoptimized
          style={{ objectFit: "cover" }}
        />
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 * s, opacity: 0.35 }}>
          {isCreature ? "⚔️" : isItem ? "⚒" : "✨"}
        </div>
      )}

      {/* Bandeau de titre */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        padding: `${4 * s}px ${34 * s}px ${10 * s}px`,
        background: "linear-gradient(180deg, #0d0d1add 0%, #0d0d1a88 55%, transparent 100%)",
      }}>
        <div style={{
          color: "#d8b25a", fontFamily: "'Cinzel', serif", fontWeight: 700,
          fontSize: 11 * s, lineHeight: 1.15, textAlign: "center",
          overflow: "hidden", textOverflow: "ellipsis",
          display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2,
          textShadow: "0 1px 2px #000",
        }}>{card.name || "—"}</div>
      </div>

      {/* Coût en mana (haut gauche) */}
      {card.mana_cost > 0 && (
        <div style={{ position: "absolute", top: 5 * s, left: 5 * s }}>
          <div style={badge(HERALDRY.enamelCost, { border: `${Math.max(1, 1.5 * s)}px solid ${HERALDRY.goldCost}` })}>{card.mana_cost}</div>
        </div>
      )}

      {/* Coût additionnel + Éveil (haut droite) */}
      {(cost || eveil > 0) && (
        <div style={{ position: "absolute", top: 5 * s, right: 5 * s, display: "flex", flexDirection: "column", gap: 3 * s, alignItems: "flex-end" }}>
          {eveil > 0 && <div style={badge("linear-gradient(175deg,#1E3663,#091326)", { color: "#FFD277" })}>◆{eveil}</div>}
          {cost && (
            <div style={badge("#0d0d1acc", { color: COST_GLYPH[cost.type]?.color ?? "#fff" })}>
              {COST_GLYPH[cost.type]?.glyph ?? "•"}{cost.value}
            </div>
          )}
        </div>
      )}

      {/* Bas : rareté + nombre de capacités à gauche, ATK / PV à droite */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: `${12 * s}px ${5 * s}px ${5 * s}px`,
        background: "linear-gradient(0deg, #0d0d1add 0%, #0d0d1a88 55%, transparent 100%)",
        display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 4 * s,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 * s, minWidth: 0 }}>
          {rarityDot && <span style={{ width: 8 * s, height: 8 * s, borderRadius: "50%", background: rarityDot, flexShrink: 0 }} />}
          {n > 0 && (
            <span style={{ color: accent, fontFamily: HERALDRY_FONT, fontWeight: 700, fontSize: 10 * s, textShadow: "0 1px 2px #000", whiteSpace: "nowrap" }}>
              ✦ {n}
            </span>
          )}
        </div>
        {cadreDroit && (
          <div style={{ display: "flex", gap: 3 * s }}>
            <div style={badge(HERALDRY.enamelAtk)}>{isItem ? `+${atk}` : atk}</div>
            <div style={badge(HERALDRY.enamelHp)}>{isItem ? `+${hp}` : hp}</div>
          </div>
        )}
      </div>
    </div>
  );
}
