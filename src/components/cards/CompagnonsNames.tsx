"use client";

// Liste des COMPAGNONS d'une carte : leurs noms, et le verso de chacun au survol.
//
// Le descriptif de la capacité disait « ses compagnons (cartes liées, choisies à
// la création) » — exact, mais le joueur ne pouvait pas savoir DE QUI il s'agit
// sans les avoir vus entrer dans son deck.
//
// Composant PARTAGÉ, et c'est le point : le bloc de descriptions est
// réimplémenté cinq fois (GameCard, HandCard, BoardCreature, SpellCastOverlay,
// MulliganOverlay). Écrire la liste dans chacun aurait été la cinquième copie
// d'un motif qui a déjà dérivé plusieurs fois ici.
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import GameCard from "./GameCard";
import { useCardText } from "@/components/game/CardTextProvider";
import { useLinkedCards } from "./useLinkedCards";
import { overlayRect } from "@/lib/fx/overlayMotion";
import type { Card } from "@/lib/game/types";

interface Props {
  /** Ids des cartes liées, tels que la capacité les porte (Compagnons). */
  ids?: number[];
  /** Cartes DÉJÀ résolues — Apprentissage garde le sort mémorisé dans l'état de
   *  la partie, il n'y a donc rien à aller chercher. Passer par `ids` ferait
   *  une requête inutile, et pire : un sort mémorisé peut être un exemplaire
   *  précis, que son seul id ne suffirait pas à distinguer. */
  cards?: Card[];
  /** Échelle du bloc hôte, pour que les pastilles suivent la taille du verso. */
  scale?: number;
  /** Emoji de la pastille — 🐾 pour les compagnons, 📖 pour un sort appris. */
  icon?: string;
}

export default function CompagnonsNames({ ids, cards, scale = 1, icon = "🐾" }: Props) {
  // Le hook est appelé inconditionnellement (règle des hooks) ; sans `ids` il
  // renvoie une liste vide et ne déclenche aucune requête.
  const resolues = useLinkedCards(ids);
  const cartes = cards?.length ? cards : resolues;
  const { localizeName } = useCardText();
  const [survolee, setSurvolee] = useState<Card | null>(null);
  const [ancre, setAncre] = useState<{ x: number; y: number } | null>(null);
  const refs = useRef(new Map<number, HTMLElement>());

  // Rien à dire tant que rien n'est résolu : hors partie, la requête est en vol
  // au premier rendu. Mieux vaut le texte générique seul qu'une liste vide ou
  // des points de suspension qui clignotent.
  if (cartes.length === 0) return null;

  const montrer = (c: Card) => {
    const el = refs.current.get(c.id);
    if (!el) return;
    const r = overlayRect(el);
    // Aperçu ancré AU-DESSUS de la pastille, centré : le verso est haut, et le
    // survol se fait souvent en bas d'écran (main du joueur).
    setAncre({ x: r.left + r.width / 2, y: r.top });
    setSurvolee(c);
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 * scale, marginTop: 3 * scale }}>
      {cartes.map((c) => (
        <span
          key={c.id}
          ref={(el) => { if (el) refs.current.set(c.id, el); }}
          onMouseEnter={() => montrer(c)}
          onMouseLeave={() => setSurvolee(null)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 3 * scale,
            padding: `${1.5 * scale}px ${6 * scale}px`,
            borderRadius: 999,
            border: "1px solid rgba(230, 180, 90, 0.55)",
            background: "rgba(230, 180, 90, 0.12)",
            color: "#e6b45a",
            fontSize: 11 * scale,
            fontFamily: "'Crimson Text',serif",
            whiteSpace: "nowrap",
            cursor: "help",
          }}
        >
          <span aria-hidden="true">{icon}</span>
          {localizeName(c)}
        </span>
      ))}

      {survolee && ancre && typeof document !== "undefined" && createPortal(
        <div
          style={{
            position: "fixed",
            left: ancre.x,
            top: ancre.y - 8,
            transform: "translate(-50%, -100%)",
            zIndex: 200, // au-dessus des versos et des modales de choix
            pointerEvents: "none",
            filter: "drop-shadow(0 10px 26px rgba(0,0,0,0.75))",
          }}
        >
          {/* `showDetails` : c'est le VERSO qu'on veut montrer, pas l'illustration. */}
          <GameCard card={survolee} size="md" showDetails disableHoverZoom forceRarityFrame />
        </div>,
        document.body,
      )}
    </div>
  );
}
