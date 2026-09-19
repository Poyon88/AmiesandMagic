// Une créature qui porte PLUSIEURS Sélections « 1 parmi 3 » à l'entrée doit
// poser toutes ses questions, et gagner une carte par mot-clé.
//
// Vu en partie sur « Voyante des Quatre Horizons » (Sélection 3 · Sélection
// magique 3 · Sélection Royale 5) : seul le premier sélecteur s'ouvrait
// (if / else if côté store) et l'action ne portait qu'un `selectionCardId` —
// les deux autres capacités restaient muettes.
import { describe, expect, it, beforeEach } from "vitest";
import { useGameStore } from "./gameStore";
import { applyAction } from "@/lib/game/engine";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { Card, CardInstance, GameState } from "@/lib/game/types";

function voyante(): CardInstance {
  return mkInstance(mkCard({
    name: "Voyante des Quatre Horizons", mana_cost: 0, attack: 2, health: 4, faction: "Mercenaires",
    keywords: ["selection", "selection_magique", "renfort_royal"] as never,
    keyword_instances: [{ id: "selection", x: 3 }, { id: "selection_magique", x: 3 }, { id: "renfort_royal", x: 5 }] as never,
  }));
}
const commune = (name: string, mana: number, over: Partial<Card> = {}): Card =>
  mkCard({ name, faction: "Mercenaires", rarity: "Commune", mana_cost: mana, attack: 1, health: 1, ...over });
const sortCommun = (name: string, mana: number): Card =>
  mkCard({ name, faction: "Mercenaires", rarity: "Commune", mana_cost: mana, card_type: "spell", attack: null, health: null });

function table(): GameState {
  const s = mkState();
  // Coût EXACT : chaque amplitude de la Voyante (3, 3, 5) doit trouver son
  // compte dans le vivier, sinon le sélecteur ne s'ouvre pas.
  s.factionCardPool = [commune("Recrue", 1), commune("Garde", 2), commune("Vétéran", 3), commune("Sage", 3), commune("Champion", 5)];
  s.allSpellsPool = [sortCommun("Étincelle", 1), sortCommun("Éclair", 3), sortCommun("Brume", 3), sortCommun("Orage", 5)];
  return s;
}

describe("créature à trois Sélections", () => {
  beforeEach(() => {
    useGameStore.setState({
      targetingMode: "none", validTargets: [], selectedCardInstanceId: null, selectionCards: [],
      collectedTargetMap: {}, collectedDeckChoices: {}, deckPickerKeyword: null, deckPickerOrder: null,
      collectedSelectionChoices: {}, selectionPickerKeyword: null, pendingCreatureChain: null,
      divinationCards: [], isAnimating: false, pendingIncomingActions: [], selectedTopdeckIds: [],
    });
  });

  it("ouvre trois sélecteurs dans l'ordre d'auteur, puis une seule action avec les trois réponses", () => {
    const s = table();
    const c = voyante();
    s.players[0].hand.push(c);
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    // 1) Sélection 3 : des créatures de coût EXACTEMENT 3.
    expect(useGameStore.getState().selectCardInHand(c.instanceId)).toBeNull();
    let st = useGameStore.getState();
    expect(st.targetingMode).toBe("selection");
    expect(st.selectionPickerKeyword).toBe("selection");
    expect(st.selectionCards.every(k => k.card_type === "creature" && k.mana_cost === 3)).toBe(true);
    const premiere = st.selectionCards[0];

    // 2) Sélection magique 3 : des sorts de coût EXACTEMENT 3.
    expect(st.selectTarget(String(premiere.id))).toBeNull();
    st = useGameStore.getState();
    expect(st.targetingMode).toBe("selection");
    expect(st.selectionPickerKeyword).toBe("selection_magique");
    expect(st.selectionCards.every(k => k.card_type === "spell" && k.mana_cost === 3)).toBe(true);
    const deuxieme = st.selectionCards[0];

    // 3) Sélection Royale 5 (repli communes, aucune limitée possédée).
    expect(st.selectTarget(String(deuxieme.id))).toBeNull();
    st = useGameStore.getState();
    expect(st.targetingMode).toBe("selection");
    expect(st.selectionPickerKeyword).toBe("renfort_royal");
    const troisieme = st.selectionCards[0];

    // 4) UNE action, trois réponses ; le champ historique porte la première.
    const action = st.selectTarget(String(troisieme.id));
    expect(action).toMatchObject({
      type: "play_card",
      selectionCardId: premiere.id,
      selectionCardIds: { selection: premiere.id, selection_magique: deuxieme.id, renfort_royal: troisieme.id },
    });

    // 5) Le moteur ajoute UNE carte par mot-clé.
    const apres = applyAction(s, action!);
    expect(apres.players[0].hand.map(k => k.card.name).sort())
      .toEqual([premiere.name, deuxieme.name, troisieme.name].sort());
    expect(apres.players[0].board.map(k => k.card.name)).toEqual(["Voyante des Quatre Horizons"]);
  });

  it("action ancienne à un seul selectionCardId : une seule carte gagnée, pas trois", () => {
    const s = table();
    const c = voyante();
    s.players[0].hand.push(c);
    const apres = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId, selectionCardId: s.factionCardPool![0].id });
    expect(apres.players[0].hand).toHaveLength(1);
  });
});
