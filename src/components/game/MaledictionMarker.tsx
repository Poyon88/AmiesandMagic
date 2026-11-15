"use client";

// MARQUEUR DE MALÉDICTION hors plateau — carte en MAIN ou au CIMETIÈRE promise
// à l'exil. Sur le plateau, BoardCreature porte déjà le sien. Le composant lit
// le store lui-même : ses hôtes (HandCard mémoïsée, tuiles du cimetière) n'ont
// rien à recalculer quand une malédiction tombe ou se lève.
import KeywordIcon from "@/components/shared/KeywordIcon";
import { KEYWORD_SYMBOLS } from "@/lib/game/keyword-labels";
import { cartesMaudites } from "@/lib/game/malediction";
import { useGameStore } from "@/lib/store/gameStore";
import type { Keyword } from "@/lib/game/types";

const VIOLET = "#a855f7";

export default function MaledictionMarker({ instanceId, radius = 10 }: { instanceId: string; radius?: number }) {
  const maudite = useGameStore((s) => cartesMaudites(s.gameState).has(instanceId));
  if (!maudite) return null;
  return (
    <>
      <div
        data-malediction-marker="true"
        style={{
          position: "absolute", inset: 0, zIndex: 6, pointerEvents: "none", borderRadius: radius,
          boxShadow: "inset 0 0 14px 3px rgba(168, 85, 247, 0.75), 0 0 10px rgba(168, 85, 247, 0.55)",
          animation: "paralyze-pulse 2s ease-in-out infinite",
        }}
      />
      <div
        title="Maudit — exilé à la fin du prochain tour adverse"
        style={{
          position: "absolute", top: 30, right: 4, zIndex: 7,
          width: 20, height: 20, borderRadius: "50%",
          background: "#1a0f2e", border: `1px solid ${VIOLET}`,
          boxShadow: `0 0 6px ${VIOLET}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <KeywordIcon symbol={KEYWORD_SYMBOLS["malediction" as Keyword]} keyword={"malediction" as Keyword} size={11} />
      </div>
    </>
  );
}
