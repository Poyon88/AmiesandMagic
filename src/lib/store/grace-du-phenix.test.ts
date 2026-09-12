// « Grâce du Phénix Blanc » : Exhumation 6 (mot-clé) + effet composé
// « Conférer Seconde vie 1 à une unité du cimetière » (placé en premier).
//
// Vu en partie : après le choix de l'Exhumation, la modale du cimetière restait
// ouverte sans rien de sélectionnable. Deux causes : le fournisseur de cibles
// composées appliquait le plafond de coût d'Exhumation (x = 1 ici) à un
// Conférer ; et l'enchaînement mot-clé → slot composé calculait un index NaN.
import { describe, expect, it, beforeEach } from "vitest";
import { useGameStore } from "./gameStore";
import { applyAction, getComposedGraveyardTargets } from "@/lib/game/engine";
import { getCapabilities } from "@/lib/game/capability-adapter";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { Capability, CardInstance, GameState } from "@/lib/game/types";

function grace(): CardInstance {
  const base = mkCard({
    name: "Grâce du Phénix Blanc", card_type: "spell", attack: null, health: null, mana_cost: 4,
    spell_keywords: [{ id: "exhumation", amount: 6 }] as never, capabilities: null,
  });
  const compose: Capability = {
    uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", position: 0,
    composed: { content: "grant_keyword", grantAbilityId: "seconde_vie", magnitude: { x: 1 },
      target: { entity: "unit", count: 1, side: "ally", location: "graveyard", designation: "choice" } },
  };
  return mkInstance({ ...base, capabilities: [...getCapabilities(base), compose] });
}
const mort = (name: string, cost: number) => {
  const c = mkInstance(mkCard({ name, mana_cost: cost, attack: 2, health: 2 }));
  c.currentHealth = 0; c.diedOnTurn = 1; return c;
};
function table(): { s: GameState; garde: CardInstance; archer: CardInstance } {
  const s = mkState();
  const garde = mort("Garde", 3), archer = mort("Archer", 2);
  s.players[0].graveyard.push(garde, archer, mkInstance(mkCard({ name: "Sortilège", card_type: "spell", attack: null, health: null })));
  return { s, garde, archer };
}

describe("Grâce du Phénix Blanc", () => {
  beforeEach(() => {
    useGameStore.setState({
      targetingMode: "none", validTargets: [], selectedCardInstanceId: null, spellTargetSlots: [], currentTargetSlotIndex: 0,
      collectedTargetMap: {}, creatureComposedCollected: [], pendingComposedGraveyard: null,
      isAnimating: false, pendingIncomingActions: [],
    });
  });

  it("le fournisseur composé n'applique pas le plafond d'Exhumation à un Conférer", () => {
    const { s, garde, archer } = table();
    expect(getComposedGraveyardTargets(s, grace().card, "cx_0").sort()).toEqual([garde.instanceId, archer.instanceId].sort());
  });

  it("Exhumation puis Conférer : les deux choix s'enchaînent et partent ensemble", () => {
    const { s, garde, archer } = table();
    const sort = grace();
    s.players[0].hand.push(sort);
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    expect(useGameStore.getState().selectCardInHand(sort.instanceId)).toBeNull();
    let st = useGameStore.getState();
    expect(st.targetingMode).toBe("graveyard");
    expect(st.validTargets.sort()).toEqual([garde.instanceId, archer.instanceId].sort());

    // 1) Exhumation : le Garde.
    expect(st.selectTarget(garde.instanceId)).toBeNull();
    st = useGameStore.getState();
    expect(st.targetingMode).toBe("graveyard");
    expect(st.validTargets.length).toBeGreaterThan(0); // la liste n'est plus vide
    expect(st.pendingComposedGraveyard?.caps[0].uid).toBe("cx_0");

    // 2) Conférer Seconde vie : le Garde aussi. L'action porte les DEUX cibles.
    const action = st.selectTarget(garde.instanceId);
    expect(action).toMatchObject({ type: "play_card", targetMap: { kw_0: garde.instanceId, "cx_0#0": garde.instanceId } });

    const apres = applyAction(s, action!);
    const enJeu = apres.players[0].board.find(c => c.card.name === "Garde");
    expect(enJeu).toBeDefined();
    expect(getCapabilities(enJeu!.card).some(c => c.abilityId === "seconde_vie")).toBe(true);
  });
});
