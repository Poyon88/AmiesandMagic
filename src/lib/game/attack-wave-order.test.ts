// Décision d'ordre des deux vagues d'une attaque.
//
// Signalé sur « Louve kiptchake » (« Se renvoie en main » à l'attaque) : on la
// voyait repartir en main, PUIS un lunge sans personne pour le porter. La vague
// de pouvoir est jouée avant le lunge — bon ordre pour un pouvoir qui frappe,
// mauvais pour un pouvoir qui retire l'attaquant lui-même.
import { describe, expect, it } from "vitest";
import { attackerRemovedItself } from "./attack-wave-order";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameState } from "./types";

/** État intermédiaire où `presents` sont sur le plateau du joueur 0. */
function inter(presents: string[]): GameState {
  const s = mkState();
  for (const id of presents) {
    const c = mkInstance(mkCard({ name: id, attack: 1, health: 1 }));
    c.instanceId = id;
    s.players[0].board.push(c);
  }
  return s;
}

describe("attackerRemovedItself", () => {
  it("vrai quand l'attaquant a quitté les deux plateaux", () => {
    expect(attackerRemovedItself(inter(["autre"]), "louve")).toBe(true);
  });

  it("faux quand il est toujours là (pouvoir ordinaire)", () => {
    expect(attackerRemovedItself(inter(["louve", "autre"]), "louve")).toBe(false);
  });

  it("faux s'il est passé sur l'AUTRE plateau : il reste visible", () => {
    const s = inter([]);
    const vole = mkInstance(mkCard({ name: "Volée", attack: 1, health: 1 }));
    vole.instanceId = "louve";
    s.players[1].board.push(vole);
    expect(attackerRemovedItself(s, "louve")).toBe(false);
  });

  it("faux sans vague de pouvoir : rien à réordonner", () => {
    expect(attackerRemovedItself(null, "louve")).toBe(false);
    expect(attackerRemovedItself(undefined, "louve")).toBe(false);
  });

  it("faux sans attaquant identifié", () => {
    expect(attackerRemovedItself(inter([]), null)).toBe(false);
    expect(attackerRemovedItself(inter([]), undefined)).toBe(false);
  });

  it("plateau vide des deux côtés : l'attaquant est bien parti", () => {
    expect(attackerRemovedItself(inter([]), "louve")).toBe(true);
  });
});
