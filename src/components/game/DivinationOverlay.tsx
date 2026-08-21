"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CardInstance } from "@/lib/game/types";
import GameCard from "@/components/cards/GameCard";
import { useGameStore } from "@/lib/store/gameStore";

interface DivinationOverlayProps {
  cards: CardInstance[];
  onChoose: (index: number) => void;
  onCancel: () => void;
}

/** Durée d'affichage de la réponse avant que l'action ne parte, en ms. */
const PRESAGE_REVEAL_MS = 1400;

export default function DivinationOverlay({ cards, onChoose, onCancel }: DivinationOverlayProps) {
  const t = useTranslations("game");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const tokenTemplates = useGameStore((s) => s.tokenTemplates);
  // PRÉSAGE — la table de permutation n'est posée QUE par lui : sa présence est
  // donc le signal fiable qu'on est dans ce picker, sans avoir à retrouver la
  // carte source (qui peut venir de la main, d'un tap ou d'un sort).
  const deckPickerOrder = useGameStore((s) => s.deckPickerOrder);
  const isPresage = deckPickerOrder !== null;
  // APPRENTISSAGE — la même modale sert à choisir un sort de la MAIN à
  // mémoriser. Le drapeau du store la distingue des pickers de deck.
  const isApprentissage = useGameStore((s) => s.learnPickerFor !== null);
  // Position AFFICHÉE de la carte qui était réellement au sommet du deck.
  const bonneReponse = deckPickerOrder ? deckPickerOrder.indexOf(0) : -1;
  const [choix, setChoix] = useState<number | null>(null);
  // The picker is shared between Divination (chosen card → top of deck) and
  // Traque du destin (chosen card → hand, rest shuffled to bottom). Branch on
  // the keyword of the card currently being summoned so the title/subtitle
  // describe what tapping a card will actually do.
  const isTraqueDuDestin = useGameStore((s) => {
    const id = s.selectedCardInstanceId;
    if (!id || !s.gameState) return false;
    for (const p of s.gameState.players) {
      const inst = p.hand.find((c) => c.instanceId === id);
      if (inst) return inst.card.keywords.includes("traque_du_destin" as import("@/lib/game/types").Keyword);
    }
    return false;
  });
  const title = isApprentissage
    ? t('apprentissage_title')
    : isPresage
      ? t('presage_title')
      : isTraqueDuDestin ? t('divination_traque_title') : t('divination_title');
  const subtitle = isApprentissage
    ? t('apprentissage_subtitle')
    : isPresage
    ? (choix === null
        ? t('presage_subtitle')
        : choix === bonneReponse ? t('presage_hit') : t('presage_miss'))
    : isTraqueDuDestin ? t('divination_traque_subtitle') : t('divination_subtitle');

  // Présage annonce la réponse AVANT d'envoyer l'action : sans ce temps mort, le
  // joueur voit sa carte arriver (ou pas) sans jamais savoir laquelle il fallait
  // désigner. L'information ne coûte rien — le deck est remélangé dans la foulée.
  const choisir = (i: number) => {
    if (!isPresage) return onChoose(i);
    if (choix !== null) return; // réponse en cours d'affichage : plus de clic
    setChoix(i);
    setTimeout(() => onChoose(i), PRESAGE_REVEAL_MS);
  };

  /** Bordure d'une carte : la bonne réponse en vert, la désignation ratée en
   *  rouge, le survol en violet. */
  const bordure = (i: number): string => {
    if (choix !== null && i === bonneReponse) return "#22c55e";
    if (choix === i) return "#ef4444";
    return hoveredIndex === i ? "#a855f7" : "transparent";
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        {/* Title */}
        <div style={{
          fontSize: 20, fontWeight: 700, color: "#fff",
          fontFamily: "'Cinzel', serif", textAlign: "center",
          textShadow: "0 2px 8px rgba(0,0,0,0.5)",
        }}>
          {title}
        </div>
        <p style={{ fontSize: 14, color: "#bbb", textAlign: "center", fontFamily: "'Crimson Text', serif", marginTop: -12 }}>
          {subtitle}
        </p>

        {/* Cards */}
        <div style={{ display: "flex", gap: 20, justifyContent: "center" }}>
          {cards.map((cardInstance, i) => (
            <div
              key={cardInstance.instanceId}
              onClick={() => choisir(i)}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{
                cursor: choix !== null ? "default" : "pointer",
                transform: hoveredIndex === i && choix === null ? "translateY(-12px) scale(1.05)" : "none",
                transition: "all 0.2s ease",
                borderRadius: 12,
                border: `2px solid ${bordure(i)}`,
                boxShadow: bordure(i) === "transparent" ? "0 4px 12px rgba(0,0,0,0.3)" : `0 0 20px ${bordure(i)}66`,
              }}
            >
              <GameCard card={cardInstance.card} size="md" tokens={tokenTemplates} />
            </div>
          ))}
        </div>

        {/* Annuler — JAMAIS pour Présage : pouvoir refermer la modale
            reviendrait à regarder les 3 cartes gratuitement puis à rejouer,
            exactement le « scouting » que la règle anti-annulation de Sélection
            interdit déjà. */}
        {!isPresage && <button
          onClick={onCancel}
          style={{
            padding: "8px 24px", borderRadius: 8,
            background: "#333", border: "1px solid #555", color: "#aaa",
            fontSize: 13, fontFamily: "'Cinzel', serif", cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          {t('action_cancel')}
        </button>}
      </div>
    </div>
  );
}
