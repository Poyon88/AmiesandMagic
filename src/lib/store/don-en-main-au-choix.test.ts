// « Conférer à une unité de la main, au choix » : aucun sélecteur n'existait, le
// moteur retombait sur la première unité de la main (Disciple au Scalpel d'Ivoire).
import { describe, expect, it, beforeEach, vi } from "vitest";
import { useGameStore } from "./gameStore";
import { applyAction } from "@/lib/game/engine";
import { getCapabilities } from "@/lib/game/capability-adapter";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { Capability, Card, CardInstance, TargetSpec } from "@/lib/game/types";

const cible: TargetSpec = { entity: "unit", count: 1, side: "ally", location: "hand", designation: "choice" };
const don = (trigger: Capability["trigger"]): Capability => ({
  uid: "cx_0", trigger, effectKind: "immediate", abilityId: "_composed", position: 0,
  composed: { content: "grant_keyword", grantAbilityId: "mutation", grantTrigger: "on_play", magnitude: { x: 4 }, target: cible },
});
const creature = (name: string) => mkInstance(mkCard({ name, mana_cost: 2, attack: 2, health: 2 }));
const aMutation = (c: Card) => getCapabilities(c).some(k => k.abilityId === "mutation");

function partie(lanceur: CardInstance) {
  const s = mkState();
  const premiere = creature("Première"), seconde = creature("Seconde");
  const action = mkInstance(mkCard({ name: "Un sort", card_type: "spell", attack: null, health: null }));
  s.players[0].mana = 10;
  s.players[0].hand.push(premiere, lanceur, action, seconde);
  useGameStore.setState({ gameState: s, localPlayerId: "P1" });
  return { s, premiere, seconde };
}

describe("don à une unité de la main, au choix", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { querySelectorAll: () => [], querySelector: () => null });
    useGameStore.setState({
      targetingMode: "none", validTargets: [], selectedCardInstanceId: null, spellTargetSlots: [], currentTargetSlotIndex: 0,
      collectedTargetMap: {}, creatureComposedCollected: [], pendingComposedGraveyard: null,
      isAnimating: false, pendingIncomingActions: [],
    });
  });

  it("créature : propose les unités de la main hors elle-même et confère à la carte choisie", () => {
    const base = mkCard({ name: "Disciple", mana_cost: 2, attack: 2, health: 1, capabilities: [don("on_play")] });
    const disciple = mkInstance(base);
    const { s, premiere, seconde } = partie(disciple);

    expect(useGameStore.getState().playCardDirect(disciple.instanceId, 0)).toBeNull();
    const st = useGameStore.getState();
    expect(st.targetingMode).toBe("graveyard");
    expect([...st.validTargets].sort()).toEqual([premiere.instanceId, seconde.instanceId].sort());

    const action = st.selectTarget(seconde.instanceId);
    expect(action).toMatchObject({ type: "play_card" });
    const apres = applyAction(s, action!);
    const main = apres.players[0].hand;
    expect(aMutation(main.find(c => c.card.name === "Seconde")!.card)).toBe(true);
    expect(aMutation(main.find(c => c.card.name === "Première")!.card)).toBe(false);
  });

  it("sort : même choix, sans se désigner lui-même", () => {
    const base = mkCard({
      name: "Don", card_type: "spell", attack: null, health: null, mana_cost: 2,
      capabilities: [don("spell_resolution")],
    });
    const sort = mkInstance(base);
    const { s, premiere, seconde } = partie(sort);

    expect(useGameStore.getState().selectCardInHand(sort.instanceId)).toBeNull();
    const st = useGameStore.getState();
    expect(st.targetingMode).toBe("graveyard");
    expect([...st.validTargets].sort()).toEqual([premiere.instanceId, seconde.instanceId].sort());

    const action = st.selectTarget(premiere.instanceId);
    const apres = applyAction(s, action!);
    expect(aMutation(apres.players[0].hand.find(c => c.card.name === "Première")!.card)).toBe(true);
    expect(aMutation(apres.players[0].hand.find(c => c.card.name === "Seconde")!.card)).toBe(false);
  });
});
