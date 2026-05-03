"use client";

import type { GameAction } from "@/lib/game/types";
import { useGameStore } from "@/lib/store/gameStore";

interface Props {
  // Called with the dispatched action when confirmation produces one. Lets
  // the parent forward it through the multiplayer broadcast pipeline.
  onConfirmedAction?: (action: GameAction | null) => void;
}

// Bandeau non-modal qui s'affiche pendant le mode "cost_payment".
// Le joueur clique sur les cartes de sa main / créatures de son board pour
// les sélectionner ; cet overlay ne fait que résumer l'état et exposer les
// boutons Confirmer / Annuler. La sélection elle-même est gérée par
// HandCard et BoardCreature via toggleDiscardSelection / toggleSacrificeSelection.
export default function CostPaymentOverlay({ onConfirmedAction }: Props) {
  const targetingMode = useGameStore(s => s.targetingMode);
  const pendingCostCard = useGameStore(s => s.pendingCostCard);
  const selectedDiscardIds = useGameStore(s => s.selectedDiscardIds);
  const selectedSacrificeIds = useGameStore(s => s.selectedSacrificeIds);
  const confirmCostPayment = useGameStore(s => s.confirmCostPayment);
  const cancelCostPayment = useGameStore(s => s.cancelCostPayment);
  const gameState = useGameStore(s => s.gameState);

  if (targetingMode !== "cost_payment" || !pendingCostCard) return null;

  const player = gameState?.players[gameState.currentPlayerIndex];
  const card = player?.hand.find(c => c.instanceId === pendingCostCard.instanceId);
  const cardName = card?.card.name ?? "carte";

  const discardOk = selectedDiscardIds.length === pendingCostCard.discardNeeded;
  const sacrificeOk = selectedSacrificeIds.length === pendingCostCard.sacrificeNeeded;
  const canConfirm = discardOk && sacrificeOk;

  return (
    <div style={{
      position: "fixed",
      bottom: 100,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 95,
      background: "#1a1a2eee",
      border: "1px solid #c8a84e66",
      borderRadius: 12,
      padding: "14px 20px",
      boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      minWidth: 320,
      pointerEvents: "auto",
    }}>
      <div style={{
        textAlign: "center",
        fontSize: 15, fontWeight: 700, color: "#c8a84e",
        fontFamily: "'Cinzel',serif",
      }}>
        Payez les coûts de {cardName}
      </div>

      {pendingCostCard.discardNeeded > 0 && (
        <div style={{
          fontSize: 13, color: discardOk ? "#2ecc71" : "#bbb",
          fontFamily: "'Crimson Text',serif",
          textAlign: "center",
        }}>
          🃏 Défausser {pendingCostCard.discardNeeded} carte{pendingCostCard.discardNeeded > 1 ? "s" : ""}
          {" — "}
          <strong>{selectedDiscardIds.length}/{pendingCostCard.discardNeeded}</strong>
        </div>
      )}

      {pendingCostCard.sacrificeNeeded > 0 && (
        <div style={{
          fontSize: 13, color: sacrificeOk ? "#2ecc71" : "#bbb",
          fontFamily: "'Crimson Text',serif",
          textAlign: "center",
        }}>
          ☠ Sacrifier {pendingCostCard.sacrificeNeeded} créature{pendingCostCard.sacrificeNeeded > 1 ? "s" : ""}
          {" — "}
          <strong>{selectedSacrificeIds.length}/{pendingCostCard.sacrificeNeeded}</strong>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 4 }}>
        <button
          onClick={cancelCostPayment}
          style={{
            padding: "6px 16px", borderRadius: 8,
            background: "#333", border: "1px solid #555", color: "#bbb",
            fontSize: 12, fontFamily: "'Cinzel',serif", cursor: "pointer",
          }}
        >
          Annuler
        </button>
        <button
          onClick={() => {
            if (!canConfirm) return;
            const action = confirmCostPayment();
            if (action && onConfirmedAction) onConfirmedAction(action);
          }}
          disabled={!canConfirm}
          style={{
            padding: "6px 16px", borderRadius: 8,
            background: canConfirm ? "#c8a84e" : "#333",
            border: `1px solid ${canConfirm ? "#c8a84e" : "#555"}`,
            color: canConfirm ? "#0d0d1a" : "#666",
            fontSize: 12, fontFamily: "'Cinzel',serif", fontWeight: 700,
            cursor: canConfirm ? "pointer" : "not-allowed",
          }}
        >
          Confirmer
        </button>
      </div>
    </div>
  );
}
