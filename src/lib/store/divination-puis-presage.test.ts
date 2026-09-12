// Divination PUIS Présage sur la même carte : la modale de Présage doit
// révéler le deck tel que Divination vient de le laisser.
//
// Vu en partie sur « Carrefour des Destins » (Divination · Présage · Sélection
// Royale 5) : la carte remontée par Divination, pourtant désignée dans la
// modale de Présage, n'était pas gagnée. La seconde modale se bâtissait sur le
// deck BRUT (d'avant le remontage) ; l'index désigné, appliqué par le moteur
// APRÈS la Divination, visait une autre carte.
import { describe, expect, it, beforeEach } from "vitest";
import { useGameStore } from "./gameStore";
import { applyAction, deckAfterCreuser, deckAfterDivination } from "@/lib/game/engine";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { CardInstance, GameState } from "@/lib/game/types";

function carrefour(): CardInstance {
  return mkInstance(mkCard({
    name: "Carrefour des Destins", card_type: "spell", attack: null, health: null, mana_cost: 3,
    spell_keywords: [{ id: "divination" }, { id: "presage" }] as never,
    capabilities: null,
  }));
}
function table(noms: string[]): GameState {
  const s = mkState();
  s.players[0].deck = noms.map(n => mkInstance(mkCard({ name: n })));
  return s;
}
const nomsDe = (l: CardInstance[]) => l.map(c => c.card.name);

describe("Divination puis Présage — la seconde modale voit le deck remonté", () => {
  beforeEach(() => {
    useGameStore.setState({
      targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
      collectedTargetMap: {}, collectedDeckChoices: {}, deckPickerKeyword: null, deckPickerOrder: null,
      divinationCards: [], isAnimating: false, pendingIncomingActions: [], selectedTopdeckIds: [],
    });
  });

  it("Présage révèle C, D, E après une Divination qui a remonté C — et C est gagnée", () => {
    const s = table(["A", "B", "C", "D", "E", "F"]);
    const sort = carrefour();
    s.players[0].hand.push(sort);
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    // 1) Divination : les trois du dessus, dans l'ordre réel.
    expect(useGameStore.getState().selectCardInHand(sort.instanceId)).toBeNull();
    let st = useGameStore.getState();
    expect(st.targetingMode).toBe("divination");
    expect(st.deckPickerKeyword).toBe("divination");
    expect(nomsDe(st.divinationCards)).toEqual(["A", "B", "C"]);

    // 2) Le joueur remonte C (position 2). La modale de Présage s'ouvre sur
    //    le deck REMONTÉ : C, D, E (dans le désordre).
    expect(st.selectTarget("2")).toBeNull();
    st = useGameStore.getState();
    expect(st.targetingMode).toBe("divination");
    expect(st.deckPickerKeyword).toBe("presage");
    expect([...nomsDe(st.divinationCards)].sort()).toEqual(["C", "D", "E"]);

    // 3) Il reconnaît C et la désigne : elle part en main.
    const positionDeC = nomsDe(st.divinationCards).indexOf("C");
    const action = st.selectTarget(String(positionDeC));
    expect(action?.type).toBe("play_card");
    // Le dispatch du store touche le DOM (animations) : on applique l'action
    // renvoyée au moteur, comme les autres tests du store.
    expect(action).toMatchObject({ deckChoiceIndices: { divination: 2, presage: 0 } });
    const apres = applyAction(s, action!);
    expect(apres.players[0].hand.map(c => c.card.name)).toEqual(["C"]);
  });
});

describe("helpers purs — même résultat que les résolveurs du moteur", () => {
  it("deckAfterDivination : la désignée dessus, les deux autres au fond dans l'ordre", () => {
    expect(deckAfterDivination(["A", "B", "C", "D"], 2)).toEqual(["C", "D", "A", "B"]);
    expect(deckAfterDivination(["A", "B"], 1)).toEqual(["B", "A"]);
    expect(deckAfterDivination([], 0)).toEqual([]);
  });
  it("deckAfterCreuser : la carte du fond désignée passe dessus", () => {
    // Fond = [C, D, E] montré dans cet ordre ; indice 1 = D.
    expect(deckAfterCreuser(["A", "B", "C", "D", "E"], 3, 1)).toEqual(["D", "A", "B", "C", "E"]);
    expect(deckAfterCreuser(["A", "B"], 0, 0)).toEqual(["A", "B"]);
  });
});
