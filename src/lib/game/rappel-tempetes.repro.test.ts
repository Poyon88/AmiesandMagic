// REPRO + non-régression : "Rappel des Tempêtes" (id 354) — Exhumation X=4
// (friendly_graveyard_to_board) + Remontée (any_creature).
//
// Bug : sur un sort à deux cibles dont la DERNIÈRE est saisie en mode "spell",
// gameStore.selectTarget réécrivait toujours le slot kw_0 et jetait les cibles
// déjà collectées → la cible cimetière (kw_0) était perdue et l'Exhumation ne
// ressuscitait rien, alors que la Remontée fonctionnait. Terrain quasi vide.
//
// Ce test pilote le store (cause réelle), pas seulement le moteur.
import { describe, expect, it } from "vitest";
import { useGameStore } from "../store/gameStore";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameAction } from "./types";

// Capabilities iso-DB (carte backfillée, ordre = [exhumation, remontee]).
const RAPPEL_TEMPETES_CAPS = [
  {
    uid: "sk_0",
    params: { x: 4 },
    targets: [{ type: "friendly_graveyard_to_board", label: "Exhumation X" }],
    trigger: "spell_resolution",
    abilityId: "exhumation",
    effectKind: "immediate",
  },
  {
    uid: "sk_1",
    targets: [{ type: "any_creature", label: "Remontée" }],
    trigger: "spell_resolution",
    abilityId: "remontee",
    effectKind: "immediate",
  },
];

function setup() {
  const s = mkState();
  // P0 : créature alliée coût 4 au cimetière (cible Exhumation).
  const buried = mkInstance(
    mkCard({ name: "Élémentaire insaisissable", mana_cost: 4, attack: 3, health: 3, card_type: "creature" }),
  );
  s.players[0].graveyard.push(buried);
  // P1 : créature adverse sur le terrain (cible Remontée).
  const enemy = mkInstance(mkCard({ name: "Ennemi", mana_cost: 2, attack: 2, health: 2 }));
  s.players[1].board.push(enemy);
  // P0 : le sort en main, modèle iso-DB.
  const spell = mkInstance(
    mkCard({
      name: "Rappel des Tempêtes",
      mana_cost: 4,
      card_type: "spell",
      attack: null,
      health: null,
      spell_keywords: [{ id: "exhumation", amount: 4 }, { id: "remontee" }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capabilities: RAPPEL_TEMPETES_CAPS as any,
    }),
  );
  s.players[0].hand.push(spell);
  return { s, buried, enemy, spell };
}

describe("Rappel des Tempêtes — store multi-cible (Exhumation + Remontée)", () => {
  it("construit targetMap {kw_0: cimetière, kw_1: terrain} et ressuscite la cible", () => {
    const { s, buried, enemy, spell } = setup();

    // On capture l'action finale sans déclencher applyAction/animations.
    let dispatched: GameAction | null = null;
    useGameStore.setState({
      gameState: s,
      localPlayerId: "P1",
      isAnimating: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dispatchAction: ((a: GameAction) => { dispatched = a; return a; }) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const store = useGameStore.getState();
    store.selectCardInHand(spell.instanceId); // → ciblage cimetière (kw_0)
    store.selectTarget(buried.instanceId);    // kw_0 = cimetière, transition vers Remontée
    store.selectTarget(enemy.instanceId);     // kw_1 = terrain → dispatch

    expect(dispatched).toBeTruthy();
    const action = dispatched!;
    expect(action.type).toBe("play_card");
    // Le cœur du bug : les DEUX cibles doivent survivre, sur les bons slots.
    expect((action as { targetMap?: Record<string, string> }).targetMap).toEqual({
      kw_0: buried.instanceId,
      kw_1: enemy.instanceId,
    });

    // Et en l'appliquant pour de vrai : la créature revient en jeu, l'ennemi est remonté.
    const next = applyAction(s, action);
    expect(next.players[0].board.some((c) => c.card.name === "Élémentaire insaisissable")).toBe(true);
    expect(next.players[0].graveyard.some((c) => c.card.name === "Élémentaire insaisissable")).toBe(false);
    expect(next.players[1].board.find((c) => c.instanceId === enemy.instanceId)).toBeUndefined();
  });
});
