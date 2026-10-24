// « Parchemin Retrouvé » (Sélection magique 5 « ? » · Afflux 3 · Seconde vie 3)
// lancé depuis la MAIN : la Sélection magique doit ouvrir sa modale.
import { describe, expect, it, beforeEach } from "vitest";
import { useGameStore } from "./gameStore";
import { applyAction } from "@/lib/game/engine";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { Card } from "@/lib/game/types";

const action = (name: string, cout: number): Card =>
  mkCard({ name, card_type: "spell", faction: "Mercenaires", rarity: "Commune", mana_cost: cout, attack: null, health: null });

describe("Parchemin Retrouvé depuis la main", () => {
  beforeEach(() => {
    useGameStore.setState({
      targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
      collectedTargetMap: {}, collectedDeckChoices: {}, deckPickerKeyword: null, deckPickerOrder: null,
      collectedSelectionChoices: {}, selectionPickerKeyword: null,
      divinationCards: [], selectionCards: [], isAnimating: false, pendingIncomingActions: [], selectedTopdeckIds: [],
    });
  });

  it("ouvre la Sélection magique", () => {
    const s = mkState();
    s.allSpellsPool = [action("S1", 1), action("S2", 2), action("S3", 3), action("S4", 4), action("S5", 5)];
    const parchemin = mkInstance(mkCard({
      id: 1010, name: "Parchemin Retrouvé", card_type: "spell", attack: null, health: null, mana_cost: 3, faction: "Mercenaires",
      spell_keywords: [{ id: "selection_magique", amount: 5, randomX: true }, { id: "afflux", amount: 3 }, { id: "seconde_vie", amount: 3 }] as never,
      capabilities: [
        { uid: "sk_0", params: { x: 5, randomX: true }, targets: [], trigger: "spell_resolution", abilityId: "selection_magique", effectKind: "immediate" },
        { uid: "sk_1", params: { x: 3 }, targets: [], trigger: "spell_resolution", abilityId: "afflux", effectKind: "immediate" },
        { uid: "sk_2", params: { x: 3 }, targets: [], trigger: "spell_resolution", abilityId: "seconde_vie", effectKind: "immediate" },
      ] as never,
    }));
    s.players[0].hand = [parchemin];
    s.players[0].deck = ["A", "B", "C", "D", "E"].map((n) => mkInstance(mkCard({ name: n })));
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    const r = useGameStore.getState().selectCardInHand(parchemin.instanceId);
    const st = useGameStore.getState();
    expect(r).toBeNull();
    expect(st.targetingMode).toBe("selection");
    const prise = st.selectionCards[0];
    const a = st.selectTarget(String(prise.id));
    const apres = applyAction(s, a!);
    expect(apres.players[0].hand.map((c) => c.card.name)).toContain(prise.name);
  });
});
