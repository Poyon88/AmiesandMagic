// Un sort dont l'unique slot de cible n'a AUCUN candidat ne doit pas entrer en
// mode ciblage : la flèche s'affichait dans le vide, rien n'était cliquable, et
// le joueur restait bloqué jusqu'à « Annuler le ciblage ».
//
// Vu avec « Décret de Conquête » (confère Domination à une créature ALLIÉE)
// joué avec un plateau vide. Les branches cimetière avaient déjà ce repli ;
// la branche plateau ne l'avait pas.
import { describe, expect, it, beforeEach } from "vitest";
import { useGameStore } from "./gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { CardInstance } from "@/lib/game/types";

/** Sort conférant un mot-clé à UNE créature alliée (slot friendly_creature). */
function grantSpell(): CardInstance {
  return mkInstance(mkCard({
    name: "Décret de Conquête", card_type: "spell", attack: null, health: null, mana_cost: 1,
    keywords: ["domination"] as never,
    capabilities: [{
      uid: "grant_0", trigger: "spell_resolution", effectKind: "grant",
      abilityId: "domination", grantScope: "target",
      targets: [{ type: "friendly_creature", label: "Cible du don" }],
    }] as never,
  }));
}

describe("Sort à cible unique sans candidat", () => {
  beforeEach(() => {
    useGameStore.setState({
      targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
      isAnimating: false, pendingIncomingActions: [],
    });
  });

  it("plateau allié vide : pas de mode ciblage, la carte se joue", () => {
    const s = mkState();
    const spell = grantSpell();
    s.players[0].hand.push(spell);
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    const action = useGameStore.getState().selectCardInHand(spell.instanceId);

    const st = useGameStore.getState();
    expect(st.targetingMode).toBe("none");
    expect(st.validTargets).toEqual([]);
    // La carte est bien PARTIE au dispatch (le commit d'état passe par le
    // pipeline d'animation, d'où la vérification sur l'action émise).
    expect(action).toMatchObject({ type: "play_card", cardInstanceId: spell.instanceId });
  });

  it("avec une créature alliée : le mode ciblage s'ouvre normalement", () => {
    const s = mkState();
    const ally = mkInstance(mkCard({ name: "Allié", attack: 1, health: 1 }));
    s.players[0].board.push(ally);
    const spell = grantSpell();
    s.players[0].hand.push(spell);
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    useGameStore.getState().selectCardInHand(spell.instanceId);

    const st = useGameStore.getState();
    expect(st.targetingMode).toBe("spell");
    expect(st.validTargets).toContain(ally.instanceId);
  });
});
