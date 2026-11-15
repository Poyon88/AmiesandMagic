// MALÉDICTION d'une carte EN MAIN (« Nom gravé sur la cloche » : maudit une
// unité ennemie en main au hasard). L'exil ne balayait que les plateaux.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { cartesMaudites, creaturesMaudites } from "./malediction";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, GameAction, GameState } from "./types";

const MAUDIRE: Capability = {
  uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", position: 0, targets: [],
  composed: { content: "malediction", magnitude: { x: 0 }, target: { side: "enemy", count: 1, entity: "unit", location: "hand", designation: "random" } },
} as Capability;

function lancer(): { s: GameState; cible: string } {
  const s = mkState();
  s.players[0].mana = 10;
  const cible = mkInstance(mkCard({ name: "Visée", mana_cost: 2, attack: 1, health: 2 }));
  s.players[1].hand.push(cible);
  for (const p of s.players) for (let i = 0; i < 6; i++) p.deck.push(mkInstance(mkCard({ name: "Pioche", card_type: "spell", mana_cost: 9, attack: null, health: null })));
  const sort = mkInstance(mkCard({ name: "Cloche", card_type: "spell", mana_cost: 0, attack: null, health: null, capabilities: [MAUDIRE] }));
  s.players[0].hand.push(sort);
  return { s: applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId } as GameAction), cible: cible.instanceId };
}
const fin = (s: GameState) => applyAction(s, { type: "end_turn" } as GameAction);
const partout = (s: GameState, id: string) =>
  s.players.flatMap((p) => [...p.hand, ...p.board, ...p.graveyard, ...p.deck]).some((c) => c.instanceId === id);

describe("Malédiction d'une carte en main", () => {
  it("la carte est maudite à la résolution, et encore là pendant le tour adverse", () => {
    const { s, cible } = lancer();
    expect(s.players[0].maledictions).toContain(cible);
    expect(partout(fin(s), cible)).toBe(true);
  });

  it("gardée en main : exilée à la fin du prochain tour adverse", () => {
    const { s, cible } = lancer();
    expect(partout(fin(fin(s)), cible)).toBe(false);
  });

  it("jouée entre-temps : exilée du plateau au même moment", () => {
    const { s, cible } = lancer();
    let st = fin(s);
    st.players[1].mana = 10;
    st = applyAction(st, { type: "play_card", cardInstanceId: cible } as GameAction);
    expect(st.players[1].board.some((c) => c.instanceId === cible)).toBe(true);
    expect(partout(fin(st), cible)).toBe(false);
  });

  it("le marqueur suit la carte : en main, sur le plateau, au cimetière", () => {
    const { s, cible } = lancer();
    expect(cartesMaudites(s).has(cible)).toBe(true);     // en main
    expect(creaturesMaudites(s).has(cible)).toBe(false); // pas (encore) en jeu
    let st = fin(s);
    st.players[1].mana = 10;
    st = applyAction(st, { type: "play_card", cardInstanceId: cible } as GameAction);
    expect(creaturesMaudites(st).has(cible)).toBe(true);
    // Tuée avant l'exil : elle garde sa malédiction au cimetière…
    const morte = structuredClone(st);
    const i = morte.players[1].board.findIndex((c) => c.instanceId === cible);
    morte.players[1].graveyard.push(...morte.players[1].board.splice(i, 1));
    expect(cartesMaudites(morte).has(cible)).toBe(true);
    // … et en est exilée au même moment.
    const apres = fin(morte);
    expect(partout(apres, cible)).toBe(false);
    expect(cartesMaudites(apres).size).toBe(0);
  });
});
