// Tempête : chaque éclair frappe la cible de SA goutte, et son « -1 » s'affiche
// à l'IMPACT.
//
// Audit animations du 2026-11-02 : les éclairs étaient reconstruits depuis les
// dégâts AGRÉGÉS par cible (A, A, B, B) alors que les popups suivaient l'ordre
// réel des gouttes (A, B, A, B) ; et tous les chiffres partaient avant le
// premier impact (popups tous les 140 ms dès t=0, éclairs arrivant à 260 ms et
// au-delà).
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { useGameStore, type TempeteEvent } from "./gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import { TEMPETE_BOLT_MS } from "@/lib/fx/overlayMotion";
import type { DamageEvent, GameState } from "@/lib/game/types";

if (typeof globalThis.document === "undefined") {
  (globalThis as unknown as { document: unknown }).document = {
    querySelectorAll: () => [] as unknown as NodeListOf<Element>,
    querySelector: () => null,
  };
}

function partie(): GameState {
  const s = mkState();
  s.players[0].mana = 10;
  // Endurantes : personne ne meurt, les 6 gouttes se répartissent sur deux cibles.
  s.players[1].board = [
    mkInstance(mkCard({ name: "A", attack: 1, health: 20 })),
    mkInstance(mkCard({ name: "B", attack: 1, health: 20 })),
  ];
  s.players[0].hand = [mkInstance(mkCard({
    name: "Orage", card_type: "spell", attack: null, health: null, mana_cost: 1,
    spell_keywords: [{ id: "tempete", amount: 6 }] as never,
  }))];
  return s;
}

function jouer(s: GameState): { tempete: TempeteEvent | null; lots: DamageEvent[][] } {
  let tempete: TempeteEvent | null = null;
  const lots: DamageEvent[][] = [];
  useGameStore.setState({
    gameState: s, localPlayerId: s.players[0].id,
    isAnimating: false, pendingIncomingActions: [],
    damageEvents: [], deathEvents: [], spellCastEvent: null, tempeteEvent: null,
    targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
  });
  let dernier: DamageEvent[] | null = null;
  const desabonner = useGameStore.subscribe((st) => {
    if (st.tempeteEvent && !tempete) tempete = st.tempeteEvent;
    if (st.damageEvents !== dernier && st.damageEvents.length > 0) lots.push(st.damageEvents);
    dernier = st.damageEvents;
  });
  useGameStore.getState().dispatchAction({ type: "play_card", cardInstanceId: s.players[0].hand[0].instanceId });
  vi.runAllTimers();
  desabonner();
  return { tempete, lots };
}

describe("Tempête — éclairs calés sur les gouttes", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("un éclair par goutte, dans l'ordre des popups, et chaque « -1 » à l'arrivée de son éclair", () => {
    const { tempete, lots } = jouer(partie());

    expect(tempete).not.toBeNull();
    const t = tempete as unknown as TempeteEvent;
    expect(t.targetIds).toHaveLength(6);
    expect(t.delaysMs).toHaveLength(6);

    const points = lots.flat()
      .filter((e) => e.type === "damage" && e.amount === 1 && t.targetIds.includes(e.targetId))
      .sort((a, b) => (a.delayMs ?? 0) - (b.delayMs ?? 0));
    expect(points).toHaveLength(6);
    // Même ordre de cibles que le tirage du moteur…
    expect(points.map((p) => p.targetId)).toEqual(t.targetIds);
    // …et chaque chiffre apparaît quand son éclair touche.
    points.forEach((p, i) => expect(p.delayMs).toBe(t.delaysMs![i] + TEMPETE_BOLT_MS));
  });
});
