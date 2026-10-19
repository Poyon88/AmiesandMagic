// Sélection « à l'attaque » (Acheteur des Étals Dorés) : la modale s'ouvrait,
// mais aucun clic ne passait. Le verrou de l'attaque suspendue (seule la
// reprise ou la fin de tour) s'appliquait AUSSI pendant le choix, et refusait
// donc la résolution qui devait le lever — repli automatique compris.
import { describe, expect, it, vi } from "vitest";
import { useGameStore } from "./gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { Card, Keyword } from "@/lib/game/types";

// Environnement `node` : document vide, cf. death-wave-order.test.ts.
if (typeof globalThis.document === "undefined") {
  (globalThis as unknown as { document: unknown }).document = {
    querySelectorAll: () => [] as unknown as NodeListOf<Element>,
    querySelector: () => null,
  };
}

const commune = (id: number) =>
  mkCard({ id, name: `Commune-${id}`, faction: "Mercenaires", rarity: "Commune", card_type: "creature", attack: 1, health: 1 });

describe("Sélection à l'attaque — store", () => {
  it("le choix passe pendant la suspension, puis la reprise joue le combat", async () => {
    vi.useFakeTimers();
    const s = mkState();
    s.factionCardPool = [commune(911), commune(912)];
    const acheteur = mkInstance(mkCard({
      name: "Acheteur", attack: 4, health: 2, mana_cost: 0, faction: undefined,
      keywords: ["selection"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "selection" as Keyword, mode: "attack", x: 0 }],
    }));
    acheteur.hasSummoningSickness = false;
    s.players[0].board.push(acheteur);
    const pv = s.players[1].hero.hp;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useGameStore.setState({ gameState: s, localPlayerId: s.players[0].id, isAnimating: false, targetingMode: "none" } as any);

    const store = () => useGameStore.getState();
    expect(store().dispatchAction({ type: "attack", attackerInstanceId: acheteur.instanceId, targetInstanceId: "enemy_hero" })).not.toBeNull();
    await vi.advanceTimersByTimeAsync(30000);
    expect(store().gameState?.attaqueSuspendue).toBeDefined();
    expect(store().targetingMode).toBe("selection");

    const choisie = store().selectionCards[0].id;
    expect(store().selectTarget(String(choisie)), "le clic sur une carte est accepté").not.toBeNull();
    await vi.advanceTimersByTimeAsync(30000);
    expect(store().gameState?.pendingTriggers ?? []).toHaveLength(0);
    expect(store().gameState?.players[0].hand.map(c => c.card.id)).toEqual([choisie]);

    // Choix tranché : le verrou reprend — seule la reprise passe.
    expect(store().dispatchAction({ type: "attack", attackerInstanceId: acheteur.instanceId, targetInstanceId: "enemy_hero" })).toBeNull();
    expect(store().dispatchAction({ type: "attack", attackerInstanceId: acheteur.instanceId, targetInstanceId: "enemy_hero", reprise: true })).not.toBeNull();
    await vi.advanceTimersByTimeAsync(30000);
    expect(store().gameState?.attaqueSuspendue).toBeUndefined();
    expect(store().gameState?.players[1].hero.hp).toBe(pv - 4);
    vi.useRealTimers();
  });
});
