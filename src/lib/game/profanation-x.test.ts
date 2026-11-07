// PROFANATION X : exile jusqu'à X cartes, +1/+1 par carte réellement exilée.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { describeKeyword } from "./keyword-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameAction, GameState } from "./types";

function jouer(cimetiere: number, cout: number, extra: Record<string, unknown>): GameState {
  const s = mkState();
  s.players[0].graveyard = Array.from({ length: cimetiere }, (_, i) => mkInstance(mkCard({ name: `M${i}` })));
  const c = mkInstance(mkCard({ name: "P", mana_cost: cout, attack: 1, health: 1, keywords: ["profanation"] as never, ...extra }));
  s.players[0].hand.push(c);
  return applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as GameAction);
}
const regle = { keyword_instances: [{ id: "profanation", x: 5 }] };

describe("Profanation X à l'entrée en jeu", () => {
  it("X réglé dans la forge, sans texte d'effet : il est respecté", () => {
    const st = jouer(7, 2, regle);
    expect(st.players[0].graveyard).toHaveLength(2);
    expect(st.players[0].board[0].currentAttack).toBe(6);
  });

  it("moins de cartes que X : tout est exilé, +1/+1 par carte", () => {
    const st = jouer(3, 4, regle);
    expect(st.players[0].graveyard).toHaveLength(0);
    expect(st.players[0].board[0].currentAttack).toBe(4);
    expect(st.players[0].board[0].currentHealth).toBe(4);
  });

  it("cimetière vide : jouable, sans bonus", () => {
    const st = jouer(0, 4, regle);
    expect(st.players[0].board[0].currentAttack).toBe(1);
  });

  it("carte ancienne : texte d'effet, puis moitié du coût", () => {
    expect(jouer(9, 2, { effect_text: "[Profanation 3]" }).players[0].graveyard).toHaveLength(6);
    expect(jouer(9, 6, {}).players[0].graveyard).toHaveLength(6);
  });

  it("le texte annonce un maximum et un gain par carte", () => {
    const d = describeKeyword("profanation", { card: mkCard({ keywords: ["profanation"] as never }), x: 5 });
    expect(d).toContain("jusqu'à 5 cartes");
    expect(d).toContain("+1/+1 par carte exilée");
  });
});
