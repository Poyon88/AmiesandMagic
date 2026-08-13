// Un sort portant À LA FOIS une cible et un picker de deck doit demander la
// cible D'ABORD.
//
// Signalé en partie avec « Corde tendue » (Impact 2 + Creuser 3) : aucune
// possibilité de cibler l'Impact, et l'effet ne partait pas.
//
// Cause : dans `selectCardInHand`, la branche CREUSER était placée AVANT le bloc
// de ciblage des sorts et sortait par `return null`. Le picker de deck s'ouvrait
// donc immédiatement, la cible n'était jamais collectée, et l'action finale
// partait sans `targetMap` — l'Impact se résolvait sans cible, c'est-à-dire pas
// du tout, en silence. Le commentaire du bloc de ciblage annonçait pourtant
// l'ordre voulu (« runs BEFORE the selection-style pickers below ») : Creuser
// était simplement au-dessus.
import { describe, expect, it, beforeEach } from "vitest";
import { useGameStore } from "./gameStore";
import { applyAction } from "@/lib/game/engine";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { CardInstance, GameState } from "@/lib/game/types";

/** « Corde tendue » telle qu'elle est en base : Impact 2 (ciblé) + Creuser 3. */
function cordeTendue(): CardInstance {
  return mkInstance(mkCard({
    name: "Corde tendue", card_type: "spell", attack: null, health: null, mana_cost: 1,
    spell_keywords: [
      { id: "impact", amount: 2 },
      { id: "creuser", amount: 3 },
    ] as never,
    capabilities: [
      { uid: "sk_0", params: { x: 2 }, targets: [{ type: "any", label: "Impact X" }], trigger: "spell_resolution", abilityId: "impact", effectKind: "immediate" },
      { uid: "sk_1", params: { x: 3 }, targets: [], trigger: "spell_resolution", abilityId: "creuser", effectKind: "immediate" },
    ] as never,
  }));
}

/** Sort à Creuser SEUL, pour vérifier qu'on n'a pas cassé le cas simple. */
function clefIntendant(): CardInstance {
  return mkInstance(mkCard({
    name: "Clef de l'Intendant", card_type: "spell", attack: null, health: null, mana_cost: 1,
    spell_keywords: [
      { id: "creuser", amount: 3 },
      { id: "inspiration", amount: 1 },
    ] as never,
    capabilities: [
      { uid: "sk_0", params: { x: 3 }, targets: [], trigger: "spell_resolution", abilityId: "creuser", effectKind: "immediate" },
      { uid: "sk_1", params: { x: 1 }, targets: [], trigger: "spell_resolution", abilityId: "inspiration", effectKind: "immediate" },
    ] as never,
  }));
}

/** Table avec un deck garni (Creuser puise dans le FOND) et une cible ennemie. */
function table(): { s: GameState; ennemi: CardInstance } {
  const s = mkState();
  for (let i = 0; i < 6; i++) {
    s.players[0].deck.push(mkInstance(mkCard({ name: `Deck${i}` })));
  }
  const ennemi = mkInstance(mkCard({ name: "Ennemi", attack: 1, health: 9 }));
  s.players[1].board.push(ennemi);
  return { s, ennemi };
}

describe("Corde tendue — la cible avant le picker de deck", () => {
  beforeEach(() => {
    useGameStore.setState({
      targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
      collectedTargetMap: {}, divinationCards: [],
      isAnimating: false, pendingIncomingActions: [],
    });
  });

  it("le clic sur la carte ouvre le CIBLAGE, pas le picker de deck", () => {
    const { s, ennemi } = table();
    const sort = cordeTendue();
    s.players[0].hand.push(sort);
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    const action = useGameStore.getState().selectCardInHand(sort.instanceId);

    const st = useGameStore.getState();
    expect(st.targetingMode).toBe("spell"); // et non "divination"
    expect(st.validTargets).toContain(ennemi.instanceId);
    expect(st.validTargets).toContain("enemy_hero");
    expect(action).toBeNull(); // rien n'est encore joué
  });

  it("après le choix de la cible, le picker de deck s'ouvre en emportant la cible", () => {
    const { s } = table();
    const sort = cordeTendue();
    s.players[0].hand.push(sort);
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });
    useGameStore.getState().selectCardInHand(sort.instanceId);

    const action = useGameStore.getState().selectTarget("enemy_hero");

    const st = useGameStore.getState();
    // Le picker prend le relais…
    expect(st.targetingMode).toBe("divination");
    expect(st.divinationCards.length).toBeGreaterThan(0);
    // …et la cible collectée est conservée pour le dispatch final.
    expect(st.collectedTargetMap).toEqual({ kw_0: "enemy_hero" });
    expect(action).toBeNull(); // pas encore dispatché
  });

});

// Le dispatch final touche le DOM (animations) et l'environnement de test est
// « node », sans jsdom : on vérifie donc le CONTRAT côté moteur, qui est le vrai
// juge. C'est lui qui doit résoudre les deux moitiés d'une même action — sans le
// `targetMap`, l'Impact repartait à vide, ce qui EST le bug d'origine.
describe("Corde tendue — le moteur résout les deux moitiés d'une seule action", () => {
  it("cible ET choix de deck sont honorés ensemble", () => {
    const { s } = table();
    const sort = cordeTendue();
    s.players[0].hand.push(sort);
    s.players[0].mana = 10;
    const pvAvant = s.players[1].hero.hp;
    const fond = s.players[0].deck.slice(-3).map((c) => c.card.name);

    const st = applyAction(s, {
      type: "play_card",
      cardInstanceId: sort.instanceId,
      targetMap: { kw_0: "enemy_hero" },
      divinationChoiceIndex: 1,
    });

    // Impact 2 sur le héros adverse…
    expect(st.players[1].hero.hp).toBe(pvAvant - 2);
    // …et Creuser 3 remonte bien la 2e carte du fond sur le dessus du deck.
    expect(st.players[0].deck[0].card.name).toBe(fond[1]);
  });

  it("sans targetMap, l'Impact ne fait rien — le symptôme rapporté", () => {
    const { s } = table();
    const sort = cordeTendue();
    s.players[0].hand.push(sort);
    s.players[0].mana = 10;
    const pvAvant = s.players[1].hero.hp;

    const st = applyAction(s, {
      type: "play_card",
      cardInstanceId: sort.instanceId,
      divinationChoiceIndex: 1,
    });

    expect(st.players[1].hero.hp).toBe(pvAvant);
  });
});

describe("Creuser SEUL — le cas simple reste inchangé", () => {
  beforeEach(() => {
    useGameStore.setState({
      targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
      collectedTargetMap: {}, divinationCards: [],
      isAnimating: false, pendingIncomingActions: [],
    });
  });

  it("un sort sans cible ouvre le picker de deck immédiatement", () => {
    const { s } = table();
    const sort = clefIntendant();
    s.players[0].hand.push(sort);
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    useGameStore.getState().selectCardInHand(sort.instanceId);

    const st = useGameStore.getState();
    expect(st.targetingMode).toBe("divination");
    expect(st.divinationCards.length).toBeGreaterThan(0);
  });
});
