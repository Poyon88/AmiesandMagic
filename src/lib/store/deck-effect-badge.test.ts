// Le badge des effets « deck » doit s'afficher pour TOUTE action, pas seulement
// celles qui piochent.
//
// Signalé : « l'animation Fortifier ne se déclenche pas avec le pouvoir du
// héros ». La cause était plus large — le badge était posé DANS `phaseDraws`,
// laquelle n'est programmée que `if (hasDraws)`. Il ne s'affichait donc que
// lorsque l'action piochait aussi une carte : jamais sur un pouvoir de héros, ni
// même sur la simple pose d'une créature à Fortifier.
//
// Il a désormais sa propre phase, toujours programmée — après la pioche quand il
// y en a une, pour que le compteur de la pile ait déjà bougé.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { useGameStore } from "./gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { Capability, CardInstance, KeywordInstance } from "@/lib/game/types";

/** Créature 1/1 appliquant Fortifier +2/+2 à son entrée en jeu. Ne pioche PAS —
 *  c'est tout l'intérêt : l'action ne déclenche aucune phase de pioche. */
function fortifieur(): CardInstance {
  return mkInstance(mkCard({
    name: "Fortifieur", mana_cost: 1, attack: 1, health: 1,
    keywords: ["fortifier"] as never,
    keyword_instances: [{ id: "fortifier", x: 2, y: 2 }] as unknown as KeywordInstance[],
    capabilities: [
      { uid: "cw_0", params: { x: 2, y: 2 }, targets: [], trigger: "on_play", abilityId: "fortifier", effectKind: "immediate" },
    ] as unknown as Capability[],
  }));
}

describe("Badge des effets « deck » — sans pioche", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.setState({
      targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
      isAnimating: false, pendingIncomingActions: [], deckEffectEvent: null,
    });
  });
  afterEach(() => vi.useRealTimers());

  it("poser une créature à Fortifier affiche le badge, sans aucune pioche", () => {
    const s = mkState();
    s.players[0].mana = 10;
    // Une créature dans le deck pour que Fortifier ait une cible…
    s.players[0].deck = [mkInstance(mkCard({ name: "Cible", attack: 2, health: 2 }))];
    const f = fortifieur();
    s.players[0].hand.push(f);
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    useGameStore.getState().dispatchAction({ type: "play_card", cardInstanceId: f.instanceId });

    // Le badge arrive par une phase différée : on déroule les minuteries.
    expect(useGameStore.getState().deckEffectEvent).toBeNull();
    vi.runAllTimers();

    const ev = useGameStore.getState().deckEffectEvent;
    expect(ev, "le badge doit être posé même sans pioche").not.toBeNull();
    expect(ev!.abilityId).toBe("fortifier");
    expect([ev!.x, ev!.y]).toEqual([2, 2]);
    expect(ev!.isLocal).toBe(true);
  });

  it("aucun badge quand l'effet est un NO-OP (deck sans créature)", () => {
    const s = mkState();
    s.players[0].mana = 10;
    s.players[0].deck = [
      mkInstance(mkCard({ name: "Sort", card_type: "spell", attack: null, health: null, mana_cost: 2 })),
    ];
    const f = fortifieur();
    s.players[0].hand.push(f);
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    useGameStore.getState().dispatchAction({ type: "play_card", cardInstanceId: f.instanceId });
    vi.runAllTimers();

    expect(useGameStore.getState().deckEffectEvent).toBeNull();
  });
});
