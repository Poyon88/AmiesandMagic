// Cycle éternel : la créature recyclée revient EN JEU quand on la pioche — elle
// ne doit donc pas coûter la pioche du tour. Le joueur tire une carte de
// REMPLACEMENT dans la foulée, sinon recycler une unité revenait à sauter sa
// pioche (l'unité arrive, mais la main ne se remplit pas).
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { MAX_BOARD_SIZE } from "./constants";
import type { CardInstance, GameState } from "./types";

/** Créature marquée « recyclée » (état posé par Cycle éternel à la mort). */
function recycled(name: string): CardInstance {
  const c = mkInstance(mkCard({ name, attack: 1, health: 1 }));
  c.cycleEternelAutoPlay = true;
  return c;
}

const handNames = (s: GameState) => s.players[1].hand.map((c) => c.card.name);
const boardNames = (s: GameState) => s.players[1].board.map((c) => c.card.name);

/** Fin de tour de J1 → début de tour de J2, qui pioche. */
function passTurnToP2(s: GameState): GameState {
  return applyAction(s, { type: "end_turn" });
}

describe("Cycle éternel — pioche de remplacement", () => {
  it("la créature recyclée entre en jeu ET une carte de remplacement est piochée", () => {
    const s = mkState();
    s.players[1].deck = [recycled("Recyclée"), mkInstance(mkCard({ name: "Remplacement" }))];

    const next = passTurnToP2(s);

    expect(boardNames(next)).toContain("Recyclée");
    expect(handNames(next)).toEqual(["Remplacement"]);
    expect(next.players[1].deck).toHaveLength(0);
  });

  it("deux recyclées d'affilée : les deux entrent en jeu, une seule carte en main", () => {
    const s = mkState();
    s.players[1].deck = [recycled("A"), recycled("B"), mkInstance(mkCard({ name: "Remplacement" }))];

    const next = passTurnToP2(s);

    expect(boardNames(next).sort()).toEqual(["A", "B"]);
    expect(handNames(next)).toEqual(["Remplacement"]);
  });

  it("deck épuisé après la recyclée : pas de remplacement, fatigue appliquée", () => {
    const s = mkState();
    s.players[1].deck = [recycled("Recyclée")];
    const hpBefore = s.players[1].hero.hp;

    const next = passTurnToP2(s);

    expect(boardNames(next)).toContain("Recyclée");
    expect(handNames(next)).toEqual([]);
    // La pioche de remplacement tombe dans le vide → dégâts de fatigue.
    expect(next.players[1].hero.hp).toBeLessThan(hpBefore);
  });

  it("plateau plein : la recyclée va en main comme une carte normale, sans pioche en plus", () => {
    const s = mkState();
    for (let i = 0; i < MAX_BOARD_SIZE; i++) s.players[1].board.push(mkInstance(mkCard({ name: `Occupant${i}` })));
    s.players[1].deck = [recycled("Recyclée"), mkInstance(mkCard({ name: "Suivante" }))];

    const next = passTurnToP2(s);

    expect(handNames(next)).toEqual(["Recyclée"]);
    expect(next.players[1].deck.map((c) => c.card.name)).toEqual(["Suivante"]);
  });
});
