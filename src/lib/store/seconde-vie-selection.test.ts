// « Souvenir Préservé » (Sélection magique 2 · Seconde vie 1) relancé depuis
// le CIMETIÈRE : la Sélection magique doit encore ouvrir sa modale et donner
// sa carte. Vu en partie : coût de Seconde vie payé, aucune Sélection.
import { describe, expect, it, beforeEach } from "vitest";
import { useGameStore } from "./gameStore";
import { applyAction } from "@/lib/game/engine";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { Card } from "@/lib/game/types";

const action = (name: string, cout: number): Card =>
  mkCard({ name, card_type: "spell", faction: "Mercenaires", rarity: "Commune", mana_cost: cout, attack: null, health: null });

describe("Seconde vie d'un sort à Sélection", () => {
  beforeEach(() => {
    useGameStore.setState({
      targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
      collectedTargetMap: {}, collectedDeckChoices: {}, deckPickerKeyword: null, deckPickerOrder: null,
      collectedSelectionChoices: {}, selectionPickerKeyword: null,
      divinationCards: [], selectionCards: [], isAnimating: false, pendingIncomingActions: [], selectedTopdeckIds: [],
    });
  });

  function etat() {
    const s = mkState();
    s.allSpellsPool = [action("S1", 1), action("S2", 2), action("S3", 1), action("S4", 2)];
    const souvenir = mkInstance(mkCard({
      name: "Souvenir", card_type: "spell", attack: null, health: null, mana_cost: 1, faction: "Mercenaires",
      spell_keywords: [{ id: "selection_magique", amount: 2, randomX: true }, { id: "seconde_vie", amount: 1 }] as never,
      // Capacités telles qu'en base (id 1000).
      capabilities: [
        { uid: "sk_0", params: { x: 2, randomX: true }, targets: [], trigger: "spell_resolution", abilityId: "selection_magique", effectKind: "immediate" },
        { uid: "sk_1", params: { x: 1 }, targets: [], trigger: "spell_resolution", abilityId: "seconde_vie", effectKind: "immediate" },
      ] as never,
    }));
    s.players[0].hand = [];
    s.players[0].graveyard = [souvenir];
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });
    return { s, souvenir };
  }

  it("relancé du cimetière, ouvre la Sélection magique et donne la carte", () => {
    const { s, souvenir } = etat();
    const r = useGameStore.getState().selectCardInHand(souvenir.instanceId);
    const st = useGameStore.getState();
    expect(r).toBeNull();
    expect(st.targetingMode).toBe("selection");
    const prise = st.selectionCards[0];
    const a = st.selectTarget(String(prise.id));
    expect(a).toMatchObject({ type: "play_card", targetMap: { selection_magique_0: String(prise.id) } });
    const apres = applyAction(s, { ...a!, fromGraveyard: true } as never);
    expect(apres.players[0].hand.map((c) => c.card.name)).toContain(prise.name);
  });

  // Vu en partie (action 48 puis 49) : Souvenir joué DEPUIS LA MAIN, sa
  // Sélection répondue, puis relancé par Seconde vie. La réponse de la pose
  // précédente restait dans le store (le chemin animé ne la vidait pas) : la
  // Sélection se croyait répondue, aucune modale, sort parti sans choix.
  it("une réponse restée d'une pose précédente ne court-circuite pas la modale", () => {
    const { souvenir } = etat();
    useGameStore.setState({ collectedSelectionChoices: { selection_magique: 2950 } });
    expect(useGameStore.getState().selectCardInHand(souvenir.instanceId)).toBeNull();
    expect(useGameStore.getState().targetingMode).toBe("selection");
  });
});
