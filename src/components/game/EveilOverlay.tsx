"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { EveilEntry, GameAction } from "@/lib/game/types";
import GameCard from "@/components/cards/GameCard";
import { getTokenManaCost } from "@/lib/game/abilities";
import { eveilArrivalBlocker, maxEveilPayment } from "@/lib/game/engine";
import { useGameStore } from "@/lib/store/gameStore";
import { EVEIL_TEINTE, EVEIL_GLYPHE } from "@/lib/game/eveil-theme";

interface Props {
  /** Camp affiché. Le sien : on peut payer. Celui de l'adversaire : on regarde. */
  entries: EveilEntry[];
  title: string;
  /** false ⇒ zone de l'adversaire, ou pas notre tour : lecture seule. */
  payable: boolean;
  onClose: () => void;
  /** Remonte l'action produite pour que le parent la diffuse à l'adversaire. */
  onAction: (action: GameAction | null) => void;
}

// La zone d'ÉVEIL dépliée : une carte par ligne, avec ce qu'il lui reste à
// payer et le bouton qui verse un point.
//
// Le bouton dit TOUJOURS pourquoi il est gris. C'est le point sensible du
// mécanisme : après plusieurs tours d'attente, un dernier clic refusé sans
// explication serait la pire frustration que cette capacité puisse produire.
// Les raisons viennent du moteur (`eveilArrivalBlocker`), pas d'un calcul
// recopié ici — un écart entre les deux ferait mentir l'écran.
export default function EveilOverlay({ entries, title, payable, onClose, onAction }: Props) {
  const t = useTranslations("game");

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-secondary rounded-xl border border-card-border max-w-3xl w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-card-border">
          <h2 className="text-lg font-bold text-foreground">
            {title} ({t("card_count", { count: entries.length })})
          </h2>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-background border border-card-border rounded-lg text-sm text-foreground/60 hover:text-foreground transition-colors"
          >
            {t("action_close")}
          </button>
        </div>

        <div className="px-4 pt-3 text-xs text-foreground/50 text-center">
          {t("eveil_hint")}
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {entries.map((entry) => (
            <LigneEveil
              key={entry.instance.instanceId}
              entry={entry}
              payable={payable}
              onAction={onAction}
              onClose={onClose}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface LigneProps {
  entry: EveilEntry;
  payable: boolean;
  onAction: (action: GameAction | null) => void;
  onClose: () => void;
}

// Une carte en éveil, avec son compteur et de quoi verser.
//
// Extrait en composant à part parce que le sélecteur de montant a un ÉTAT
// PROPRE par carte : un `useState` dans la boucle de la modale aurait été un
// hook conditionnel, et un état unique partagé aurait fait sauter le montant
// d'une carte à l'autre.
function LigneEveil({ entry, payable, onAction, onClose }: LigneProps) {
  const t = useTranslations("game");
  const gameState = useGameStore(s => s.gameState);
  const payEveilPoint = useGameStore(s => s.payEveilPoint);

  const id = entry.instance.instanceId;
  const dernier = entry.remaining === 1;
  // Le blocage n'a de sens que sur le DERNIER point : les versements
  // intermédiaires ne demandent que du mana.
  const blocage = gameState && dernier ? eveilArrivalBlocker(gameState, id) : null;
  const max = gameState ? maxEveilPayment(gameState, id) : 0;
  const peut = payable && (dernier ? !blocage : max >= 1);

  // Montant choisi. Par défaut 1 : verser est irréversible et le mana ne se
  // récupère pas — le geste le plus sûr doit être celui qu'on obtient sans rien
  // décider. Le bouton « max » est là pour ceux qui veulent tout donner.
  const [choisi, setChoisi] = useState(1);
  // Le maximum BOUGE à chaque versement (mana dépensé, compteur qui baisse). On
  // recadre donc AU RENDU plutôt que de resynchroniser l'état dans un effet :
  // un état recopié d'un autre finit toujours par rester en arrière d'un
  // rendu — ici, le bouton se serait grisé sur une valeur devenue impossible,
  // sans que rien ne l'explique.
  const montant = Math.min(Math.max(1, choisi), Math.max(1, max));

  const verser = (n?: number) => {
    const action = payEveilPoint(id, n ?? montant);
    // Le DERNIER point ouvre parfois un picker (coûts additionnels, ciblage) :
    // la modale doit s'effacer pour le laisser voir, même si aucune action
    // n'est encore partie. On ferme donc dans tous les cas.
    onAction(action);
    onClose();
  };

  const btn = (actif: boolean) => ({
    padding: "10px 18px",
    borderRadius: 10,
    fontFamily: "'Cinzel', serif" as const,
    fontWeight: 700,
    fontSize: 14,
    color: actif ? "#1c1206" : "#7a7a7a",
    background: actif ? EVEIL_TEINTE : "rgba(255,255,255,0.06)",
    border: `1px solid ${actif ? EVEIL_TEINTE : "rgba(255,255,255,0.12)"}`,
    cursor: actif ? ("pointer" as const) : ("not-allowed" as const),
    boxShadow: actif ? `0 0 14px ${EVEIL_TEINTE}66` : "none",
  });

  const pas = (label: string, delta: number, actif: boolean) => (
    <button
      type="button"
      aria-label={label}
      disabled={!actif}
      onClick={() => setChoisi(Math.min(max, Math.max(1, montant + delta)))}
      style={{
        width: 30, height: 30, borderRadius: 8,
        border: `1px solid ${actif ? EVEIL_TEINTE : "rgba(255,255,255,0.12)"}`,
        background: "rgba(0,0,0,0.35)",
        color: actif ? EVEIL_TEINTE : "#6a6a6a",
        fontSize: 18, lineHeight: 1, fontWeight: 700,
        cursor: actif ? "pointer" : "not-allowed",
      }}
    >{label}</button>
  );

  return (
    <div
      className="flex items-center gap-4 rounded-lg p-3"
      style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${EVEIL_TEINTE}44` }}
    >
      <GameCard
        card={entry.instance.card}
        size="sm"
        disableHoverZoom
        effectiveManaCost={getTokenManaCost(entry.instance.card)}
      />
      <div className="flex-1 flex flex-col gap-1">
        <div style={{ color: EVEIL_TEINTE, fontFamily: "'Cinzel', serif", fontSize: 20, fontWeight: 800 }}>
          {EVEIL_GLYPHE} {t("eveil_remaining", { count: entry.remaining })}
        </div>
        {/* Ce qui arrive au dernier point, dit AVANT de l'atteindre : le joueur
            doit pouvoir préparer le plateau et les coûts. */}
        <div className="text-xs text-foreground/50">
          {dernier ? t("eveil_next_arrives") : t("eveil_next_point")}
        </div>
        {payable && blocage && (
          <div className="text-xs" style={{ color: "#e8a0a0" }}>
            {t(`eveil_blocked_${blocage}`)}
          </div>
        )}
        {/* Pourquoi un versement ne peut jamais TOUT payer : le dernier point
            est l'entrée en jeu, et c'est là qu'on choisit cibles, place et
            coûts additionnels. Dit ici, sinon le plafond à `restant − 1`
            passerait pour un bug. */}
        {payable && !dernier && max >= 1 && max === entry.remaining - 1 && (
          <div className="text-xs text-foreground/40">{t("eveil_max_hint")}</div>
        )}
      </div>

      {payable && !dernier && max > 1 && (
        <div className="flex items-center gap-2">
          {pas("−", -1, montant > 1)}
          <div style={{
            minWidth: 34, textAlign: "center",
            fontFamily: "'Cinzel', serif", fontSize: 20, fontWeight: 800,
            color: EVEIL_TEINTE,
          }}>{montant}</div>
          {pas("+", +1, montant < max)}
          <button
            type="button"
            onClick={() => setChoisi(max)}
            style={{
              padding: "6px 10px", borderRadius: 8,
              border: `1px solid ${EVEIL_TEINTE}66`,
              background: "rgba(0,0,0,0.35)", color: EVEIL_TEINTE,
              fontSize: 11, fontFamily: "'Cinzel', serif", cursor: "pointer",
            }}
          >{t("eveil_max", { count: max })}</button>
        </div>
      )}

      {payable && (
        <button type="button" disabled={!peut} onClick={() => verser()} style={btn(peut)}>
          {dernier ? t("eveil_play_now") : t("eveil_pay_n", { count: montant })}
        </button>
      )}
    </div>
  );
}
