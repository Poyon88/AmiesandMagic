// Le parcours RÉEL du coût de RETRAITE, côté interface : jouer la carte ouvre
// le paiement, désigner N créatures du plateau, confirmer.
//
// Le moteur a ses propres tests (retreat-cost.test.ts) ; ceux-ci couvrent ce
// qu'il ne voit pas : l'ouverture du paiement, la désignation et la
// transmission des créatures jusqu'à l'action diffusée.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { useGameStore } from "./gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { CardInstance } from "@/lib/game/types";

const creature = (name: string, extra: Record<string, unknown> = {}) =>
  mkInstance(mkCard({ name, mana_cost: 1, attack: 1, health: 1, ...extra }));

function poser(carte: CardInstance, plateau: CardInstance[]) {
  const s = mkState();
  s.players[0].board.push(...plateau);
  s.players[0].hand.push(carte);
  useGameStore.setState({
    gameState: s, localPlayerId: s.players[0].id,
    targetingMode: "none", pendingCostCard: null,
    selectedDiscardIds: [], selectedSacrificeIds: [], selectedTopdeckIds: [], selectedRetreatIds: [],
    isAnimating: false, pendingIncomingActions: [],
  });
}

describe("coût de retraite — le paiement", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("jouer la carte ouvre le paiement au lieu de partir directement", () => {
    const carte = creature("Payeuse", { retreat_cost: 1 });
    poser(carte, [creature("A")]);
    expect(useGameStore.getState().playCardDirect(carte.instanceId)).toBeNull();
    expect(useGameStore.getState().targetingMode).toBe("cost_payment");
    expect(useGameStore.getState().pendingCostCard?.retreatNeeded).toBe(1);
  });

  it("la désignation est plafonnée à N et se retire au second clic", () => {
    const a = creature("A"), b = creature("B"), carte = creature("Payeuse", { retreat_cost: 1 });
    poser(carte, [a, b]);
    useGameStore.getState().playCardDirect(carte.instanceId);
    const st = () => useGameStore.getState();
    st().toggleRetreatSelection(a.instanceId);
    st().toggleRetreatSelection(b.instanceId);
    expect(st().selectedRetreatIds).toEqual([a.instanceId]);
    st().toggleRetreatSelection(a.instanceId);
    expect(st().selectedRetreatIds).toEqual([]);
  });

  it("une créature Ancrée n'est pas désignable", () => {
    const a = creature("A", { keywords: ["ancre"] }), b = creature("B"), carte = creature("Payeuse", { retreat_cost: 1 });
    poser(carte, [a, b]);
    useGameStore.getState().playCardDirect(carte.instanceId);
    useGameStore.getState().toggleRetreatSelection(a.instanceId);
    expect(useGameStore.getState().selectedRetreatIds).toEqual([]);
  });

  it("la confirmation attend le compte exact, puis les créatures partent dans l'action", () => {
    const a = creature("A"), carte = creature("Payeuse", { retreat_cost: 1 });
    poser(carte, [a]);
    useGameStore.getState().playCardDirect(carte.instanceId);
    expect(useGameStore.getState().confirmCostPayment()).toBeNull();
    useGameStore.getState().toggleRetreatSelection(a.instanceId);
    const action = useGameStore.getState().confirmCostPayment();
    expect(action).not.toBeNull();
    const envoyee = useGameStore.getState().dispatchAction(action!);
    expect(envoyee).toMatchObject({ retreatInstanceIds: [a.instanceId] });
  });

  it("annuler vide la sélection", () => {
    const a = creature("A"), carte = creature("Payeuse", { retreat_cost: 1 });
    poser(carte, [a]);
    useGameStore.getState().playCardDirect(carte.instanceId);
    useGameStore.getState().toggleRetreatSelection(a.instanceId);
    useGameStore.getState().cancelCostPayment();
    expect(useGameStore.getState().selectedRetreatIds).toEqual([]);
    expect(useGameStore.getState().targetingMode).toBe("none");
  });
});
