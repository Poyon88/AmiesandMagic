// Sort à DEUX Sélections (« Sentence des Trois Vérités » : Sélection 3 ·
// Sélection magique 3) : la seconde modale doit s'ouvrir après la première,
// et l'action porter une réponse par créneau. Seule la première s'ouvrait, et
// le moteur rejouait sa carte pour la Sélection magique.
import { describe, expect, it, beforeEach } from "vitest";
import { useGameStore } from "./gameStore";
import { applyAction } from "@/lib/game/engine";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { Card } from "@/lib/game/types";

const unite = (name: string): Card =>
  mkCard({ name, faction: "Mercenaires", rarity: "Commune", mana_cost: 3, attack: 1, health: 1 });
const action = (name: string): Card =>
  mkCard({ name, card_type: "spell", faction: "Mercenaires", rarity: "Commune", mana_cost: 3, attack: null, health: null });

describe("sort à deux Sélections", () => {
  beforeEach(() => {
    useGameStore.setState({
      targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
      collectedTargetMap: {}, collectedDeckChoices: {}, deckPickerKeyword: null, deckPickerOrder: null,
      collectedSelectionChoices: {}, selectionPickerKeyword: null,
      divinationCards: [], selectionCards: [], isAnimating: false, pendingIncomingActions: [], selectedTopdeckIds: [],
    });
  });

  it("ouvre Sélection puis Sélection magique, et donne une carte de chaque", () => {
    const s = mkState();
    s.factionCardPool = [unite("U1"), unite("U2"), unite("U3")];
    s.allSpellsPool = [action("S1"), action("S2"), action("S3")];
    const sort = mkInstance(mkCard({
      name: "Sentence", card_type: "spell", attack: null, health: null, mana_cost: 2, faction: "Mercenaires",
      spell_keywords: [{ id: "selection", amount: 3 }, { id: "selection_magique", amount: 3 }] as never,
      capabilities: null,
    }));
    s.players[0].hand = [sort];
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    expect(useGameStore.getState().selectCardInHand(sort.instanceId)).toBeNull();
    let st = useGameStore.getState();
    expect(st.targetingMode).toBe("selection");
    expect(st.selectionPickerKeyword).toBe("selection");
    const unitePrise = st.selectionCards[0];

    expect(st.selectTarget(String(unitePrise.id))).toBeNull();
    st = useGameStore.getState();
    expect(st.selectionPickerKeyword).toBe("selection_magique");
    const actionPrise = st.selectionCards[0];
    expect(actionPrise.card_type).toBe("spell");

    const a = st.selectTarget(String(actionPrise.id));
    expect(a).toMatchObject({
      type: "play_card",
      targetMap: { selection_0: String(unitePrise.id), selection_magique_0: String(actionPrise.id) },
    });
    const apres = applyAction(s, a!);
    expect(apres.players[0].hand.map((c) => c.card.name).sort()).toEqual([unitePrise.name, actionPrise.name].sort());
  });
});
