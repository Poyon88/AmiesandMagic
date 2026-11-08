// « Fracture de l'Âme » : Exécution (cible sur le plateau) puis Exhumation
// composée au choix dans le cimetière ADVERSE.
//
// Vu en partie : après l'Exécution, la modale s'ouvrait sans rien de
// sélectionnable. L'enchaînement plateau → créneau composé (`cx_0#0`) lisait le
// créneau comme un mot-clé : index NaN, liste vide.
import { describe, expect, it, beforeEach, vi } from "vitest";
import { useGameStore } from "./gameStore";
import { applyAction } from "@/lib/game/engine";
import { getCapabilities } from "@/lib/game/capability-adapter";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { Capability, CardInstance } from "@/lib/game/types";

const compose: Capability = {
  uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", position: 1,
  composed: { content: "exhumation", magnitude: { x: 5, randomX: true },
    target: { entity: "unit", count: 1, side: "enemy", location: "graveyard", designation: "choice" } },
};
const fracture = (): CardInstance => {
  const base = mkCard({
    name: "Fracture de l'Âme", card_type: "spell", attack: null, health: null, mana_cost: 5,
    spell_keywords: [{ id: "execution" }] as never, capabilities: null,
  });
  return mkInstance({ ...base, capabilities: [...getCapabilities(base), compose] });
};
const creature = (name: string, cost = 3) => mkInstance(mkCard({ name, mana_cost: cost, attack: 2, health: 2 }));

describe("Fracture de l'Âme", () => {
  beforeEach(() => {
    // Le dispatch localise les éléments du plateau pour ses animations.
    vi.stubGlobal("document", { querySelectorAll: () => [], querySelector: () => null });
    useGameStore.setState({
      targetingMode: "none", validTargets: [], selectedCardInstanceId: null, spellTargetSlots: [], currentTargetSlotIndex: 0,
      collectedTargetMap: {}, creatureComposedCollected: [], pendingComposedGraveyard: null,
      isAnimating: false, pendingIncomingActions: [],
    });
  });

  it("propose le cimetière adverse après l'Exécution et ressuscite la carte choisie", () => {
    const s = mkState();
    const sort = fracture();
    const victime = creature("Victime");
    const mienne = creature("Ma morte");
    const adverse = creature("Morte adverse");
    s.players[0].mana = 10;
    s.players[0].hand.push(sort);
    s.players[0].graveyard.push(mienne);
    s.players[1].board.push(victime);
    s.players[1].graveyard.push(adverse);
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    expect(useGameStore.getState().selectCardInHand(sort.instanceId)).toBeNull();
    let st = useGameStore.getState();
    expect(st.validTargets).toContain(victime.instanceId);

    expect(st.selectTarget(victime.instanceId)).toBeNull();
    st = useGameStore.getState();
    expect(st.targetingMode).toBe("graveyard");
    expect(st.validTargets).toEqual([adverse.instanceId]);

    const action = st.selectTarget(adverse.instanceId);
    expect(action).toMatchObject({
      type: "play_card",
      targetMap: { "cx_0#0": adverse.instanceId },
    });
    const apres = applyAction(s, action!);
    expect(apres.players[0].board.some(c => c.card.name === "Morte adverse")).toBe(true);
    expect(apres.players[1].graveyard.some(c => c.card.name === "Morte adverse")).toBe(false);
  });

  it("X au hasard reste un plafond : la carte choisie au plafond revient quel que soit le tirage", () => {
    for (let graine = 1; graine <= 20; graine++) {
      const s = mkState();
      s.rngState = graine * 7919;
      const sort = fracture();
      const victime = creature("Victime");
      const chere = creature("Morte au plafond", 5);
      s.players[0].mana = 10;
      s.players[0].hand.push(sort);
      s.players[1].board.push(victime);
      s.players[1].graveyard.push(chere);
      const apres = applyAction(s, {
        type: "play_card", cardInstanceId: sort.instanceId,
        targetMap: { kw_0: victime.instanceId, "cx_0#0": chere.instanceId },
      });
      expect(apres.players[0].board.some(c => c.card.name === "Morte au plafond")).toBe(true);
    }
  });

  it("joue le sort sans modale quand aucune carte adverse n'est éligible", () => {
    const s = mkState();
    const sort = fracture();
    const victime = creature("Victime");
    s.players[0].mana = 10;
    s.players[0].hand.push(sort);
    s.players[0].graveyard.push(creature("Ma morte"));
    s.players[1].board.push(victime);
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    useGameStore.getState().selectCardInHand(sort.instanceId);
    useGameStore.getState().selectTarget(victime.instanceId);
    expect(useGameStore.getState().targetingMode).not.toBe("graveyard");
    expect(useGameStore.getState().pendingComposedGraveyard).toBeNull();
  });
});
