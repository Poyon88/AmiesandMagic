// Une CONCESSION reçue en pleine animation.
//
// `dispatchAction` programme ses phases par minuteries, et rien ne les annulait.
// Le chemin `concede` posait bien l'état terminé, mais les phases encore en vol
// réécrivaient `gameState` derrière lui : l'écran de victoire revenait à un état
// intermédiaire sans vainqueur, puis `phaseUnlock` dépilait la file des actions
// reçues sur une partie finie. Les phases sont désormais liées à une époque
// (`schedule`) que la concession — comme toute adoption d'état — fait avancer.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { useGameStore } from "./gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { GameState } from "@/lib/game/types";

// Environnement `node` : cf. death-wave-order.test.ts.
if (typeof globalThis.document === "undefined") {
  (globalThis as unknown as { document: unknown }).document = {
    querySelectorAll: () => [] as unknown as NodeListOf<Element>,
    querySelector: () => null,
  };
}

/** P0 lance un sort de dégâts sur la créature de P1 : overlay, impact, mort —
 *  une séquence à plusieurs phases, donc plusieurs minuteries en vol. */
function partie(): GameState {
  const s = mkState();
  s.players[0].mana = 10;
  s.players[1].board = [mkInstance(mkCard({ name: "Cible", mana_cost: 2, attack: 1, health: 1 }))];
  s.players[0].hand = [mkInstance(mkCard({
    name: "Trait de Feu", card_type: "spell", attack: null, health: null, mana_cost: 1,
    keywords: ["impact"] as never,
    keyword_instances: [{ id: "impact", x: 5 } as never],
    spell_keywords: [{ id: "impact", amount: 5 }] as never,
  }))];
  return s;
}

function lancerLeSort(s: GameState) {
  useGameStore.setState({
    gameState: s, localPlayerId: s.players[0].id,
    isAnimating: false, pendingIncomingActions: [],
    damageEvents: [], deathEvents: [], spellCastEvent: null,
    targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
  });
  useGameStore.getState().dispatchAction({
    type: "play_card",
    cardInstanceId: s.players[0].hand[0].instanceId,
    targetInstanceId: s.players[1].board[0].instanceId,
  });
}

describe("concession pendant une animation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("le scénario est bien animé — sinon le test ne prouverait rien", () => {
    lancerLeSort(partie());
    expect(useGameStore.getState().isAnimating).toBe(true);
    expect(vi.getTimerCount()).toBeGreaterThan(1);
    vi.runAllTimers();
  });

  it("l'état reste terminé, avec le bon vainqueur, une fois toutes les minuteries écoulées", () => {
    const s = partie();
    const [p0, p1] = [s.players[0].id, s.players[1].id];
    lancerLeSort(s);
    // Au milieu de la séquence : des phases ont joué, d'autres attendent.
    vi.advanceTimersByTime(300);
    expect(useGameStore.getState().isAnimating).toBe(true);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    // L'adversaire (P1) concède.
    useGameStore.getState().dispatchAction({ type: "concede", playerId: p1 });
    const apresConcession = useGameStore.getState().gameState!;
    expect(apresConcession.phase).toBe("finished");
    expect(apresConcession.winner).toBe(p0);

    vi.runAllTimers();

    const fin = useGameStore.getState();
    expect(fin.gameState!.phase).toBe("finished");
    expect(fin.gameState!.winner).toBe(p0);
    // Aucune phase tardive n'a réécrit l'état posé par la concession.
    expect(fin.gameState).toBe(apresConcession);
    expect(fin.isAnimating).toBe(false);
  });

  it("la file des actions reçues n'est pas dépilée sur la partie terminée", () => {
    const s = partie();
    lancerLeSort(s);
    vi.advanceTimersByTime(300);
    useGameStore.getState().dispatchAction({ type: "concede", playerId: s.players[1].id });
    const apresConcession = useGameStore.getState().gameState;
    // Une action arrive encore par le réseau après la concession.
    useGameStore.setState({ pendingIncomingActions: [{ type: "end_turn" }] });

    vi.runAllTimers();

    expect(useGameStore.getState().pendingIncomingActions).toHaveLength(1);
    expect(useGameStore.getState().gameState).toBe(apresConcession);
  });

  it("un état adopté en cours de séquence n'est pas réécrit et ne fige pas le verrou", () => {
    const s = partie();
    lancerLeSort(s);
    vi.advanceTimersByTime(300);
    const adopte = partie();
    useGameStore.getState().setGameState(adopte);

    vi.runAllTimers();

    expect(useGameStore.getState().gameState).toBe(adopte);
    expect(useGameStore.getState().isAnimating).toBe(false);
  });

  it("une action non interrompue va au bout comme avant", () => {
    const s = partie();
    lancerLeSort(s);
    vi.runAllTimers();

    const fin = useGameStore.getState();
    expect(fin.isAnimating).toBe(false);
    expect(fin.gameState!.phase).not.toBe("finished");
    expect(fin.gameState!.players[1].board).toHaveLength(0);
    expect(fin.gameState!.players[0].hand).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
