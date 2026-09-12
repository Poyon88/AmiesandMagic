// Modales de deck PUIS Sélection sur le même SORT : la Sélection doit encore
// poser sa question après la dernière modale de deck.
//
// Vu en partie sur « Carrefour des Destins » (Divination · Présage · Sélection
// Royale 5) : les deux modales de deck s'ouvraient, puis le sort partait
// aussitôt. Le maillon « et si la carte porte AUSSI une Sélection ? » n'existait
// que côté créature (openCreaturePickerIfNeeded) ; côté sort, l'action partait
// sans slot `selection_0` et le moteur laissait tomber la Sélection en silence.
import { describe, expect, it, beforeEach } from "vitest";
import { useGameStore } from "./gameStore";
import { applyAction } from "@/lib/game/engine";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { Card, CardInstance, GameState } from "@/lib/game/types";

function carrefour(): CardInstance {
  return mkInstance(mkCard({
    name: "Carrefour des Destins", card_type: "spell", attack: null, health: null, mana_cost: 3,
    faction: "Mercenaires",
    spell_keywords: [{ id: "divination" }, { id: "presage" }, { id: "renfort_royal", amount: 5 }] as never,
    capabilities: null,
  }));
}
function commune(name: string, mana: number): Card {
  return mkCard({ name, faction: "Mercenaires", rarity: "Commune", mana_cost: mana, attack: 1, health: 1 });
}
function table(noms: string[]): GameState {
  const s = mkState();
  s.players[0].deck = noms.map(n => mkInstance(mkCard({ name: n })));
  // Aucune édition limitée possédée ⇒ Sélection Royale retombe sur 3 communes.
  s.factionCardPool = [commune("Recrue", 1), commune("Garde", 2), commune("Vétéran", 3), commune("Champion", 4)];
  return s;
}
const nomsDe = (l: CardInstance[]) => l.map(c => c.card.name);

describe("Divination, Présage PUIS Sélection Royale sur un sort", () => {
  beforeEach(() => {
    useGameStore.setState({
      targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
      collectedTargetMap: {}, collectedDeckChoices: {}, deckPickerKeyword: null, deckPickerOrder: null,
      divinationCards: [], selectionCards: [], isAnimating: false, pendingIncomingActions: [], selectedTopdeckIds: [],
    });
  });

  it("la Sélection s'ouvre après la dernière modale de deck, et l'action porte les trois réponses", () => {
    const s = table(["A", "B", "C", "D", "E", "F"]);
    const sort = carrefour();
    s.players[0].hand.push(sort);
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    // 1) Divination, 2) Présage — comme avant.
    expect(useGameStore.getState().selectCardInHand(sort.instanceId)).toBeNull();
    let st = useGameStore.getState();
    expect(st.deckPickerKeyword).toBe("divination");
    expect(st.selectTarget("2")).toBeNull();
    st = useGameStore.getState();
    expect(st.deckPickerKeyword).toBe("presage");
    const positionDeC = nomsDe(st.divinationCards).indexOf("C");

    // 3) Au lieu de partir, le sort ouvre sa Sélection « 1 parmi 3 ».
    expect(st.selectTarget(String(positionDeC))).toBeNull();
    st = useGameStore.getState();
    expect(st.targetingMode).toBe("selection");
    expect(st.selectionCards).toHaveLength(3);

    // 4) Le joueur garde une carte : UNE action, avec les réponses de deck ET la Sélection.
    const gardee = st.selectionCards[0];
    const action = st.selectTarget(String(gardee.id));
    expect(action).toMatchObject({
      type: "play_card",
      deckChoiceIndices: { divination: 2, presage: 0 },
      divinationChoiceIndex: 0,
      targetMap: { selection_0: String(gardee.id) },
    });

    const apres = applyAction(s, action!);
    expect(apres.players[0].hand.map(c => c.card.name).sort()).toEqual(["C", gardee.name].sort());
  });
});
