"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import type { ActionHistoryEntry } from "@/lib/store/gameStore";
import GameCard from "@/components/cards/GameCard";
import CardArt from "@/components/cards/CardArt";
import { getTokenManaCost } from "@/lib/game/abilities";
import useLongPress, { LONG_PRESS_RESET_STYLE } from "@/hooks/useLongPress";
import { useHeroText } from "@/i18n/useHeroText";
import { useCardText } from "./CardTextProvider";
import { HERO_IMAGES } from "./HeroPowerOverlay";

/**
 * Bande d'historique — les dernières actions (sorts, combats, morts, pouvoirs)
 * en vignettes empilées sur le bord GAUCHE, la plus récente en haut. Survol
 * (ou appui long sur tablette) → carte en grand + résumé de l'action.
 *
 * Rendue HORS du wrapper `data-board-scale` de GameBoard : `position: fixed`
 * y garde son sens (le transform du wrapper en ferait sinon le bloc conteneur)
 * et on échappe entièrement aux corrections `overlayRect`/`zoom` iPad.
 *
 * z-30 volontaire : les overlays plein écran (z-50) doivent la recouvrir.
 */
export default function ActionHistoryStrip({ entries }: { entries: ActionHistoryEntry[] }) {
  const t = useTranslations("game");
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) return null;

  // Plus récent en haut : le store append en queue, on inverse ici.
  const ordered = [...entries].reverse();
  // Replié (défaut) : seule la dernière action reste visible, pour ne pas
  // occuper toute la hauteur en permanence. Le reste s'ouvre à la demande.
  const visible = expanded ? ordered : ordered.slice(0, 1);
  const hidden = ordered.length - visible.length;

  return (
    <div
      style={{
        position: "fixed",
        left: 8,
        // Ancré en haut (et non centré) : déplier ne doit pas faire glisser la
        // dernière action sous le curseur — la liste pousse vers le bas.
        top: "12%",
        maxHeight: "80vh",
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 6,
        // Le conteneur ne doit jamais intercepter un clic destiné au plateau ;
        // seules les vignettes et le bouton réactivent les événements pointeur.
        pointerEvents: "none",
      }}
    >
      <AnimatePresence initial={false}>
        {visible.map((entry) => (
          <HistoryTile key={entry.id} entry={entry} />
        ))}
      </AnimatePresence>

      {(hidden > 0 || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          title={expanded ? t("history_collapse") : t("history_expand", { count: hidden })}
          data-no-global-click-sfx="true"
          style={{
            ...LONG_PRESS_RESET_STYLE,
            pointerEvents: "auto",
            width: TILE_W,
            // Cible tactile confortable sans grossir la bande.
            minHeight: 26,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            borderRadius: 5,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(10, 10, 20, 0.85)",
            color: "#ddd",
            fontSize: 11,
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          <span style={{ display: "inline-block", transform: expanded ? "rotate(180deg)" : "none" }}>⌄</span>
          {!expanded && hidden > 0 && <span>{hidden}</span>}
        </button>
      )}
    </div>
  );
}

// Sélecteur de variante emoji (U+FE0F) sur ⚔ : sans lui, Safari/Chrome rendent
// le glyphe en présentation TEXTE, soit une minuscule croix illisible.
const KIND_BADGE: Record<ActionHistoryEntry["kind"], string> = {
  spell: "🔮",
  attack: "⚔️",
  death: "💀",
  bounce: "🔼",
  power: "✨",
  hero_power: "👑",
};

const TILE_W = 66;

function HistoryTile({ entry }: { entry: ActionHistoryEntry }) {
  const t = useTranslations("game");
  const { localizeName } = useCardText();
  const heroText = useHeroText();
  const [hovered, setHovered] = useState(false);
  // Face description de l'aperçu (clic droit / 2ᵉ appui long), comme sur la
  // tuile de cimetière.
  const [showDetails, setShowDetails] = useState(false);
  // Équivalent tactile : 1er appui long = aperçu, 2ᵉ = bascule description,
  // 3ᵉ = fermeture. On couvre ainsi les deux faces sans souris.
  const longPress = useLongPress(() => {
    if (!hovered) { setHovered(true); return; }
    if (!showDetails) { setShowDetails(true); return; }
    setHovered(false);
    setShowDetails(false);
  });

  const isEnemy = entry.side === "enemy";
  const accent = isEnemy ? "rgba(231, 76, 60, 0.75)" : "rgba(155, 89, 182, 0.75)";
  const accentSoft = isEnemy ? "rgba(231, 76, 60, 0.3)" : "rgba(155, 89, 182, 0.3)";
  // Un pouvoir déclenché porte la couleur de son mode (mort/retour/attaque/fin
  // de tour), la même que la flèche source→cible tracée par PowerArrowOverlay.
  const borderColor = entry.kind === "power" && entry.modeColor ? entry.modeColor : accent;

  const heroLike = entry.hero
    ? {
        id: entry.hero.heroId,
        name: entry.hero.heroName,
        power_name: entry.hero.powerName,
        power_description: entry.hero.powerDescription,
      }
    : null;

  const sourceName = entry.card
    ? localizeName(entry.card)
    : heroLike
      ? heroText.heroName(heroLike)
      : "";

  const targetName = entry.targetCard
    ? localizeName(entry.targetCard)
    : entry.targetIsHero
      ? entry.targetIsHero === "friendly"
        ? t("history_hero_friendly")
        : t("history_hero_enemy")
      : null;

  let summary: string;
  switch (entry.kind) {
    case "spell":
      summary = entry.countered
        ? t("history_spell_countered", { source: sourceName })
        : targetName
          ? t("history_spell_on", { source: sourceName, target: targetName })
          : t("history_spell", { source: sourceName });
      break;
    case "attack":
      summary = targetName
        ? t("history_attack", { source: sourceName, target: targetName })
        : t("history_attack_alone", { source: sourceName });
      break;
    case "death":
      summary = t("history_death", { source: sourceName });
      break;
    case "bounce":
      summary = t("history_bounce", { source: sourceName });
      break;
    case "power":
      summary = targetName
        ? t("history_power", { source: sourceName, target: targetName })
        : t("history_power_alone", { source: sourceName });
      break;
    case "hero_power":
      summary = t("history_hero_power", {
        hero: sourceName,
        power: (heroLike && heroText.powerName(heroLike)) ?? "",
      });
      break;
  }

  const heroImage = entry.hero
    ? entry.hero.powerImageUrl || HERO_IMAGES[entry.hero.race] || null
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -24, scale: 0.85 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -16, scale: 0.9 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      style={{
        ...LONG_PRESS_RESET_STYLE,
        position: "relative",
        width: TILE_W,
        aspectRatio: "5 / 7",
        borderRadius: 5,
        border: `1.5px solid ${borderColor}`,
        boxShadow: `0 0 8px ${accentSoft}, 0 3px 8px rgba(0,0,0,0.5)`,
        background: "rgba(10, 10, 20, 0.9)",
        overflow: "hidden",
        cursor: "help",
        pointerEvents: "auto",
      }}
      data-no-global-click-sfx="true"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        // Le prochain survol repart sur l'illustration, pas sur la description.
        setShowDetails(false);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setHovered(true);
        setShowDetails((v) => !v);
      }}
      {...longPress.handlers}
    >
      {entry.card ? (
        // CardArt pose lui-même `relative` sur sa racine (nécessaire au
        // <Image fill>) : lui passer `absolute inset-0` ne marche PAS, la
        // classe `relative` gagne et la div se replie à 0 de haut → vignette
        // vide. On positionne donc un wrapper et on lui donne 100 % × 100 %.
        <div style={{ position: "absolute", inset: 0 }}>
          <CardArt card={entry.card} className="w-full h-full" />
        </div>
      ) : heroImage ? (
        <Image src={heroImage} alt="" fill className="object-cover" unoptimized />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xl">👑</div>
      )}

      {/* Une mort est un événement subi : on la grise pour la distinguer au
          premier coup d'œil d'une carte jouée. */}
      {entry.kind === "death" && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
      )}

      <div
        style={{
          position: "absolute",
          top: 2,
          left: 3,
          fontSize: 12,
          lineHeight: 1,
          textShadow: "0 1px 3px rgba(0,0,0,0.95)",
        }}
      >
        {KIND_BADGE[entry.kind]}
      </div>

      {entry.amount != null && (
        <div
          style={{
            position: "absolute",
            bottom: 1,
            right: 2,
            fontSize: 10,
            fontWeight: 700,
            color: "#ff6b6b",
            textShadow: "0 1px 3px rgba(0,0,0,0.95)",
          }}
        >
          -{entry.amount}
        </div>
      )}

      {hovered && (
        <div
          style={{
            position: "fixed",
            // Ancré à GAUCHE : les aperçus cimetière / pioche sortent à droite
            // (right: 32), aucun recouvrement possible.
            left: 32,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 60,
            pointerEvents: "none",
            filter: "drop-shadow(0 12px 32px rgba(0,0,0,0.6))",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          {entry.card ? (
            <GameCard
              card={entry.card}
              size="lg"
              disableHoverZoom
              forceRarityFrame
              effectiveManaCost={getTokenManaCost(entry.card)}
              showDetails={showDetails}
            />
          ) : (
            <div
              style={{
                width: 340,
                borderRadius: 10,
                border: `1px solid ${accent}`,
                background: "rgba(10, 10, 20, 0.95)",
                padding: 16,
                textAlign: "center",
              }}
            >
              {heroImage && (
                <div style={{ position: "relative", width: "100%", height: 180, marginBottom: 10 }}>
                  <Image src={heroImage} alt="" fill className="object-contain" unoptimized />
                </div>
              )}
              <div style={{ color: "#fff", fontWeight: 700, marginBottom: 4 }}>
                {(heroLike && heroText.powerName(heroLike)) ?? ""}
              </div>
              <div style={{ color: "#ccc", fontSize: 13, lineHeight: 1.4 }}>
                {(heroLike && heroText.powerDesc(heroLike)) ?? ""}
              </div>
            </div>
          )}

          <div
            style={{
              maxWidth: 340,
              background: "rgba(10, 10, 20, 0.92)",
              border: `1px solid ${accent}`,
              borderRadius: 8,
              padding: "6px 10px",
              color: "#e6e6e6",
              fontSize: 13,
              fontFamily: "'Crimson Text', serif",
              textAlign: "center",
            }}
          >
            {summary}
            {entry.amount != null && (
              <span style={{ color: "#ff8a8a" }}> — {t("history_amount", { amount: entry.amount })}</span>
            )}
            {entry.extraTargets != null && entry.extraTargets > 0 && (
              <div style={{ color: "#999", fontSize: 11 }}>
                {t("history_extra_targets", { count: entry.extraTargets })}
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
