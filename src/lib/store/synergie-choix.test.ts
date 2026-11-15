// SYNERGIE — parcours de choix côté store : une créature Synergie arrive, le
// store ouvre le choix pour son propriétaire (aucune cible à surligner), et la
// capacité cliquée part dans l'action `resolve_pending_trigger`.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { useGameStore } from "./gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { Keyword, KeywordInstance } from "@/lib/game/types";

if (typeof globalThis.document === "undefined") {
  (globalThis as unknown as { document: unknown }).document = {
    querySelectorAll: () => [] as unknown as NodeListOf<Element>,
    querySelector: () => null,
  };
}

describe("Synergie — choix dans le store", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("jouer la créature ouvre le choix ; cliquer une capacité la grave", () => {
    const s = mkState();
    s.players[0].mana = 10;
    const carte = mkInstance(mkCard({
      name: "Tisseuse", mana_cost: 0, attack: 1, health: 3,
      keywords: ["synergie"] as unknown as Keyword[],
      keyword_instances: [{ id: "synergie" as Keyword, x: 2 }] as KeywordInstance[],
    }));
    s.players[0].hand = [carte];
    useGameStore.setState({
      gameState: s, localPlayerId: s.players[0].id,
      isAnimating: false, pendingIncomingActions: [],
      damageEvents: [], deathEvents: [], spellCastEvent: null,
      targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
    });

    useGameStore.getState().dispatchAction({ type: "play_card", cardInstanceId: carte.instanceId });
    vi.runAllTimers();
    let st = useGameStore.getState();
    expect(st.gameState!.pendingTriggers?.[0]?.kw).toBe("synergie");
    expect(st.targetingMode).toBe("pending_trigger");
    expect(st.validTargets).toEqual([]);

    const action = st.selectTarget("impact");
    expect(action).toMatchObject({ type: "resolve_pending_trigger", abilityId: "impact" });
    vi.runAllTimers();
    st = useGameStore.getState();
    expect(st.gameState!.players[0].board[0].synergieAbilityId).toBe("impact");
    expect(st.gameState!.pendingTriggers ?? []).toHaveLength(0);
  });
});
