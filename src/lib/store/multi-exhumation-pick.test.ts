// Une carte portant PLUSIEURS Exhumations composées (une capacité par
// résurrection) doit faire choisir CHAQUE créature, l'une après l'autre.
//
// Vu avec « Légion des Damnés » (3 × Exhumation, capacités cx_0/cx_1/cx_2) :
// seule la première ouvrait le picker, les deux autres partaient sans cible et
// retombaient sur le repli déterministe du moteur (« plus hauts coûts d'abord »).
// La file `pendingComposedGraveyard.caps` enchaîne désormais les capacités.
import { describe, expect, it, beforeEach } from "vitest";
import { useGameStore } from "./gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import { getSpellTargetSlots } from "@/lib/game/engine";
import type { Card, CardInstance, GameAction } from "@/lib/game/types";

/** Sort à N Exhumations composées indépendantes (count 1 chacune), comme la
 *  forge les produit : une capacité `cx_i` par résurrection. */
function legionSpell(n: number, x = 10): Card {
  return mkCard({
    name: "Légion des Damnés", card_type: "spell", attack: null, health: null, mana_cost: 8,
    capabilities: Array.from({ length: n }, (_, i) => ({
      uid: `cx_${i}`, trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
      composed: {
        content: "exhumation", magnitude: { x },
        target: { entity: "unit", count: 1, side: "ally", location: "graveyard", designation: "choice" },
      },
    })) as never,
  });
}

function corpse(name: string, cost: number): CardInstance {
  return mkInstance(mkCard({ name, mana_cost: cost, attack: 2, health: 2 }));
}

/** `GameAction` est une union : seule la branche play_card porte un targetMap. */
function playCardTargetMap(action: GameAction | null): Record<string, string> | undefined {
  expect(action?.type).toBe("play_card");
  return action?.type === "play_card" ? action.targetMap : undefined;
}

describe("Plusieurs Exhumations composées sur une même carte", () => {
  beforeEach(() => {
    useGameStore.setState({
      targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
      pendingComposedGraveyard: null, creatureComposedCollected: [],
      isAnimating: false, pendingIncomingActions: [],
    });
  });

  it("expose un slot cimetière PAR capacité", () => {
    const slots = getSpellTargetSlots(legionSpell(3));
    expect(slots.map(s => s.slot)).toEqual(["cx_0#0", "cx_1#0", "cx_2#0"]);
    expect(slots.every(s => s.type === "friendly_graveyard_to_board")).toBe(true);
  });

  it("fait choisir les 3 résurrections l'une après l'autre", () => {
    const s = mkState();
    const [a, b, c, d] = [corpse("A", 2), corpse("B", 3), corpse("C", 1), corpse("D", 4)];
    s.players[0].graveyard = [a, b, c, d];
    const spell = mkInstance(legionSpell(3));
    s.players[0].hand.push(spell);
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    // 1er clic sur la carte → picker ouvert sur la capacité cx_0.
    useGameStore.getState().selectCardInHand(spell.instanceId);
    expect(useGameStore.getState().targetingMode).toBe("graveyard");
    expect(useGameStore.getState().pendingComposedGraveyard?.caps.map(k => k.uid))
      .toEqual(["cx_0", "cx_1", "cx_2"]);

    // Choix 1 : le picker RESTE ouvert pour la capacité suivante.
    expect(useGameStore.getState().selectTarget(a.instanceId)).toBeNull();
    expect(useGameStore.getState().targetingMode).toBe("graveyard");
    expect(useGameStore.getState().pendingComposedGraveyard?.capIndex).toBe(1);
    // Le cadavre déjà retenu n'est plus proposé (il ne quitte le cimetière qu'à
    // la résolution : sans exclusion, il serait « ressuscité » deux fois).
    expect(useGameStore.getState().validTargets).not.toContain(a.instanceId);

    // Choix 2 : idem.
    expect(useGameStore.getState().selectTarget(b.instanceId)).toBeNull();
    expect(useGameStore.getState().pendingComposedGraveyard?.capIndex).toBe(2);
    expect(useGameStore.getState().validTargets).not.toContain(b.instanceId);

    // Choix 3 : dernière capacité → l'action part avec les 3 cibles keyées.
    const targetMap = playCardTargetMap(useGameStore.getState().selectTarget(c.instanceId));
    expect(targetMap).toEqual({
      "cx_0#0": a.instanceId, "cx_1#0": b.instanceId, "cx_2#0": c.instanceId,
    });
    expect(useGameStore.getState().pendingComposedGraveyard).toBeNull();
    // D n'est pas dans le lot : avant le correctif elle remontait via le repli
    // « plus hauts coûts d'abord » du moteur. La résolution elle-même est
    // vérifiée côté moteur (composed-exhumation.test.ts) — ici le commit d'état
    // passe par la file d'animation, il n'est pas synchrone.
    expect(Object.values(targetMap!)).not.toContain(d.instanceId);
  });

  it("s'arrête proprement quand le cimetière s'épuise avant la dernière capacité", () => {
    const s = mkState();
    const [a, b] = [corpse("A", 2), corpse("B", 3)];
    s.players[0].graveyard = [a, b];
    const spell = mkInstance(legionSpell(3));
    s.players[0].hand.push(spell);
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    useGameStore.getState().selectCardInHand(spell.instanceId);
    expect(useGameStore.getState().selectTarget(a.instanceId)).toBeNull();
    // 2e choix = dernier cadavre disponible → la 3e capacité n'a plus rien à
    // proposer, l'action part sans attendre un clic impossible.
    const targetMap = playCardTargetMap(useGameStore.getState().selectTarget(b.instanceId));
    expect(targetMap).toEqual({ "cx_0#0": a.instanceId, "cx_1#0": b.instanceId });
    expect(useGameStore.getState().targetingMode).not.toBe("graveyard");
  });
});
