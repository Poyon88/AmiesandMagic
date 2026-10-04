// Action « Trésor X » jouée directement depuis la main : la fenêtre de choix
// doit s'ouvrir sur des OBJETS, et l'objet choisi rejoindre la main.
// Cas réel : « Étincelle Captive » (Trésor 2 ?) partait sans rien proposer —
// le chemin du jeu direct ne connaissait que Sélection / Sélection magique /
// Renfort royal.
import { beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "./gameStore";
import { applyAction } from "@/lib/game/engine";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { Card, GameState } from "@/lib/game/types";

const objet = (id: number, name: string, mana: number): Card =>
  mkCard({ id, name, card_type: "item", faction: "Nains", card_alignment: "bon", rarity: "Commune", mana_cost: mana, attack: 1, health: 0 });

function table(): GameState {
  const s = mkState();
  s.factionCardPool = [
    objet(9101, "Bague", 1), objet(9102, "Gantelet", 2), objet(9103, "Heaume", 2), objet(9104, "Égide", 3),
    mkCard({ id: 9105, name: "Garde", faction: "Nains", rarity: "Commune", mana_cost: 2, attack: 1, health: 1 }),
  ];
  s.allSpellsPool = [];
  return s;
}

describe("action Trésor jouée directement", () => {
  beforeEach(() => {
    useGameStore.setState({
      targetingMode: "none", validTargets: [], selectedCardInstanceId: null, selectionCards: [],
      collectedTargetMap: {}, collectedDeckChoices: {}, deckPickerKeyword: null, deckPickerOrder: null,
      collectedSelectionChoices: {}, selectionPickerKeyword: null, pendingCreatureChain: null,
      divinationCards: [], isAnimating: false, pendingIncomingActions: [], selectedTopdeckIds: [],
    });
  });

  it("ouvre le choix sur des objets de coût ≤ 2, puis l'objet choisi arrive en main", () => {
    const s = table();
    const etincelle = mkInstance(mkCard({
      name: "Étincelle Captive", card_type: "spell", attack: null, health: null, mana_cost: 1,
      faction: "Nains", card_alignment: "bon", spell_keywords: [{ id: "tresor", amount: 2, randomX: true }] as never,
    }));
    s.players[0].hand.push(etincelle);
    s.players[0].mana = 5;
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    expect(useGameStore.getState().selectCardInHand(etincelle.instanceId)).toBeNull();
    const st = useGameStore.getState();
    expect(st.targetingMode).toBe("selection");
    expect(st.selectionCards.length).toBeGreaterThan(0);
    expect(st.selectionCards.every((k) => k.card_type === "item" && k.mana_cost <= 2)).toBe(true);

    const choisi = st.selectionCards[0];
    const action = st.selectTarget(String(choisi.id));
    expect(action).toMatchObject({ type: "play_card", cardInstanceId: etincelle.instanceId });
    const apres = applyAction(s, action!);
    expect(apres.players[0].hand.map((k) => k.card.name)).toEqual([choisi.name]);
  });
});
