"use client";

// Banc du MENU D'ACTIVATION : une créature à trois pouvoirs activables (un
// mot-clé « tap », deux effets composés) posée sur un plateau construit sur
// place, rendue par le VRAI BoardCreature branché sur le store. Le pouvoir
// choisi est réellement appliqué au state local — la créature s'engage.
import { useEffect, useState } from "react";
import BoardCreature from "@/components/game/BoardCreature";
import { useGameStore } from "@/lib/store/gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { Capability, ComposedEffect, GameAction, GameState, KeywordInstance } from "@/lib/game/types";

const cap = (uid: string, composed: ComposedEffect): Capability =>
  ({ uid, trigger: "on_activation", effectKind: "immediate", abilityId: "_composed", composed });

function etatDeDepart(): GameState {
  const s = mkState();
  const c = mkInstance(mkCard({
    id: 999001, name: "Archiviste polyvalente", mana_cost: 3, attack: 2, health: 4,
    keywords: ["afflux"],
    keyword_instances: [{ id: "afflux", mode: "tap", x: 2 }] as KeywordInstance[],
    capabilities: [
      cap("pioche", { content: "draw_cards", magnitude: { x: 1 } }),
      cap("soin", { content: "heal", magnitude: { x: 3 }, target: { entity: "unit", count: "all", side: "ally", location: "board", designation: "automatic" } } as ComposedEffect),
    ],
  }));
  c.hasSummoningSickness = false;
  s.players[0].board.push(c);
  s.players[0].mana = 1;
  s.players[0].deck.push(mkInstance(mkCard({ name: "Carte du deck" })));
  return s;
}

export default function ActivationLab() {
  const [journal, setJournal] = useState<string[]>([]);
  const gameState = useGameStore((s) => s.gameState);
  useEffect(() => {
    useGameStore.setState({ gameState: etatDeDepart(), localPlayerId: "P1" });
  }, []);
  const creature = gameState?.players[0].board[0];
  const onAction = (a: GameAction | null) => {
    if (a) setJournal((j) => [...j, JSON.stringify(a)]);
  };
  return (
    <div style={{ marginTop: 40 }}>
      <h2 style={{ fontSize: 14, color: "#999" }}>Menu d&apos;activation (3 pouvoirs)</h2>
      <button type="button" onClick={() => { useGameStore.setState({ gameState: etatDeDepart() }); setJournal([]); }}
        style={{ margin: "8px 0", padding: "4px 10px", border: "1px solid #888", borderRadius: 4, color: "#ddd" }}>
        Réinitialiser
      </button>
      <div style={{ paddingTop: 200, paddingLeft: 140, minHeight: 360 }}>
        {creature && <BoardCreature creature={creature} isOwn onAction={onAction} />}
      </div>
      <div style={{ fontSize: 11, color: "#bbb", fontFamily: "monospace" }}>
        mana : {gameState?.players[0].mana} · main : {gameState?.players[0].hand.length} · engagée : {String(creature?.tapped)}
        {journal.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}
