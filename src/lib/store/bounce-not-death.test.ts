// Une créature RENVOYÉE EN MAIN n'est pas morte : elle ne doit déclencher ni
// l'animation de mort, ni le fantôme de Cycle éternel filant vers le deck.
//
// Le store dérivait les morts de « présente sur l'ancien plateau, absente du
// nouveau » — ce qui attrape aussi les renvois en main. Le moteur, lui, ne
// recyclait rien : seule l'ANIMATION mentait, en annonçant un Cycle éternel qui
// n'avait pas eu lieu.
import { describe, expect, it, beforeEach } from "vitest";
import { useGameStore } from "./gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { CardInstance } from "@/lib/game/types";

/** Sort qui renvoie une créature ciblée en main (Remontée). */
function bounceSpell(): CardInstance {
  return mkInstance(mkCard({
    name: "Retour", card_type: "spell", attack: null, health: null, mana_cost: 1,
    spell_keywords: [{ id: "remontee" }] as never,
  }));
}

function cycler(): CardInstance {
  const c = mkInstance(mkCard({ name: "Recycleuse", attack: 1, health: 3, keywords: ["cycle_eternel"] as never }));
  c.hasSummoningSickness = false;
  return c;
}

describe("Renvoi en main ≠ mort", () => {
  beforeEach(() => {
    useGameStore.setState({
      targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
      isAnimating: false, pendingIncomingActions: [], deathEvents: [], cycleEternelEvent: null,
    });
  });

  it("ne joue ni animation de mort ni fantôme Cycle éternel", () => {
    const s = mkState();
    const victim = cycler();
    s.players[1].board.push(victim);
    const spell = bounceSpell();
    s.players[0].hand.push(spell);
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    useGameStore.getState().dispatchAction({
      type: "play_card", cardInstanceId: spell.instanceId, targetInstanceId: victim.instanceId,
    });

    // Sans le correctif, ce chemin construisait les FX de mort du renvoyé —
    // il touchait alors le DOM (getElementCenter) et échouait ici même.
    const st = useGameStore.getState();
    expect(st.cycleEternelEvent).toBeNull();
    expect(st.deathEvents.some((e) => e.instanceId === victim.instanceId)).toBe(false);
  });
});
