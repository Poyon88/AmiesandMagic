// Holy Light (Guérison 8, cible « unité alliée ou votre héros ») partait SANS
// cible : le store filtrait ses créneaux cliquables avec une liste recopiée qui
// ignorait `friendly_any`, donc lançait le sort directement — aucun soin. Vu en
// partie (plateau allié vide, héros à 12 PV).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "./gameStore";
import { applyAction } from "@/lib/game/engine";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";

describe("Guérison : le héros allié est une cible", () => {
  beforeEach(() => {
    useGameStore.setState({ targetingMode: "none", validTargets: [], selectedCardInstanceId: null, collectedTargetMap: {}, isAnimating: false, pendingIncomingActions: [] });
  });

  it("plateau vide : le héros est proposé, et le soin l'atteint", () => {
    const s = mkState();
    s.players[0].hero.hp = 12;
    const holy = mkInstance(mkCard({
      id: 57, name: "Holy Light", card_type: "spell", mana_cost: 3, attack: null, health: null,
      spell_keywords: [{ id: "guerison", amount: 8, attack: 1, health: 1 }] as never,
      // Telles qu'en base (id 57).
      capabilities: [{ uid: "sk_0", params: { x: 8, attack: 1, health: 1 }, targets: [{ type: "any", label: "Guérison X" }],
        trigger: "spell_resolution", abilityId: "guerison", effectKind: "immediate" }] as never,
    }));
    s.players[0].hand = [holy];
    s.players[0].mana = 3;
    useGameStore.setState({ gameState: s, localPlayerId: s.players[0].id });

    expect(useGameStore.getState().selectCardInHand(holy.instanceId)).toBeNull();
    expect(useGameStore.getState().validTargets).toContain("friendly_hero");

    // selectTarget dispatche : le pipeline d'animation lit le DOM.
    (globalThis as unknown as { document: unknown }).document ??= { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null };
    vi.useFakeTimers();
    const a = useGameStore.getState().selectTarget("friendly_hero");
    expect(a).toMatchObject({ type: "play_card" });
    vi.useRealTimers();
    const apres = applyAction(s, a!);
    expect(apres.players[0].hero.hp).toBe(20);
  });
});
