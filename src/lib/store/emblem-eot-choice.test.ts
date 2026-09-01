// EMBLÈME « au choix » en fin de tour : le sélecteur ne s'ouvrait jamais.
//
// Vu en partie avec « Disparition sous les branches » (sort à 1 mana qui pose un
// emblème « à chaque fin de tour, conférez Ombre à une créature alliée AU
// CHOIX ») : le tour se figeait, aucune créature n'était cliquable, puis l'effet
// disparaissait sans rien faire.
//
// Trois gardes différentes, toutes écrites sur le même malentendu — « un choix
// de fin de tour porte forcément un capUid ou un kw ». Un EMBLÈME n'a NI l'un NI
// l'autre : sa source est partie (c'était un sort), et c'est justement ce qui le
// définit. Il ne s'identifie que par `emblemIndex` :
//   1. le store (`pendingTriggerOverlay`) renvoyait « aucun ciblage » ⇒ pas de
//      sélecteur, alors que le moteur avait bien suspendu le tour ;
//   2. `triggerIsResolvable` le classait « rien à demander au joueur » ⇒ purgé
//      en silence par `pruneUnresolvableTriggers` ;
//   3. le repli automatique ne lui construisait pas de pool ⇒ il retombait sur
//      la première unité du plateau au lieu d'un tirage.
import { describe, expect, it, beforeEach } from "vitest";
import { useGameStore } from "./gameStore";
import { applyAction, autoResolvePendingTriggers, initRNG } from "@/lib/game/engine";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { ComposedEffect, Emblem, GameState } from "@/lib/game/types";

/** L'effet exact de la carte : Ombre à une créature alliée au choix. */
const OMBRE_AU_CHOIX: ComposedEffect = {
  content: "grant_keyword",
  grantAbilityId: "ombre",
  target: { entity: "unit", side: "ally", count: 1, location: "board", designation: "choice" },
};

const emblem = (composed: ComposedEffect): Emblem =>
  ({ composed, stacks: 1, trigger: "on_end_of_turn" });

/** P1 (joueur courant) porte l'emblème et aligne deux créatures. */
function finDeTourAvecEmbleme(): GameState {
  initRNG(7);
  const s = mkState();
  s.rngState = 7;
  s.players[0].emblems = [emblem(OMBRE_AU_CHOIX)];
  s.players[0].board.push(
    mkInstance(mkCard({ name: "Allié A", mana_cost: 2, attack: 2, health: 2 })),
    mkInstance(mkCard({ name: "Allié B", mana_cost: 3, attack: 3, health: 3 })),
  );
  return applyAction(s, { type: "end_turn" });
}

describe("emblème « au choix » en fin de tour — moteur", () => {
  it("suspend le tour sur un déclencheur identifié par emblemIndex", () => {
    const next = finDeTourAvecEmbleme();

    expect(next.endTurnPending).toBe(true);
    expect(next.pendingTriggers).toHaveLength(1);
    const t = next.pendingTriggers![0];
    expect(t.emblemIndex).toBe(0);
    // Ni capUid ni kw : c'est TOUTE la difficulté du cas.
    expect(t.capUid).toBeUndefined();
    expect(t.kw).toBeUndefined();
    // Le tour n'a pas basculé : on attend le joueur.
    expect(next.currentPlayerIndex).toBe(0);
  });

  it("n'est PAS purgé comme déclencheur orphelin", () => {
    const next = finDeTourAvecEmbleme();
    // La purge tourne dans le repli automatique : le déclencheur doit y survivre
    // et conférer Ombre, au lieu de disparaître sans effet.
    const apres = autoResolvePendingTriggers(next);

    // Le don écrit dans les mots-clés de la carte de l'instance (applyGrantedKeyword).
    const porteurs = apres.players[0].board.filter((c) => (c.card.keywords ?? []).includes("ombre" as never));
    expect(porteurs).toHaveLength(1);
    expect(apres.pendingTriggers ?? []).toHaveLength(0);
  });
});

describe("emblème « au choix » en fin de tour — store", () => {
  beforeEach(() => {
    useGameStore.setState({
      targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
      isAnimating: false, pendingIncomingActions: [], pendingTriggerId: null,
    });
  });

  it("ouvre le sélecteur de cible chez le contrôleur", () => {
    const next = finDeTourAvecEmbleme();
    useGameStore.setState({ localPlayerId: "P1" });
    useGameStore.getState().setGameState(next);

    const st = useGameStore.getState();
    expect(st.targetingMode).toBe("pending_trigger");
    // Les deux alliés sont proposés — c'est ce que le joueur ne pouvait pas cliquer.
    expect(st.validTargets.sort()).toEqual(next.players[0].board.map((c) => c.instanceId).sort());
    expect(st.pendingTriggerNeeded).toBe(1);
    // Le libellé décrit l'effet réel, lu sur l'emblème faute de source en jeu.
    expect(st.pendingTriggerPrompt).toBeTruthy();
    expect(st.pendingTriggerPrompt).not.toBe("🎯 Choisissez une cible");
  });

  it("n'ouvre rien chez l'adversaire", () => {
    const next = finDeTourAvecEmbleme();
    useGameStore.setState({ localPlayerId: "P2" });
    useGameStore.getState().setGameState(next);

    expect(useGameStore.getState().targetingMode).toBe("none");
  });
});
