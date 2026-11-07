// VAMPIRISME X à l'entrée en jeu : le X réglé fait foi, le vol est plafonné par
// les PV de chaque cible.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { describeKeyword } from "./keyword-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameAction, GameState } from "./types";

const vampire = (cout: number, extra: Record<string, unknown>) => mkInstance(mkCard({
  name: "Duc", mana_cost: cout, attack: 1, health: 2, keywords: ["vampirisme"] as never, ...extra,
}));
const ennemie = (health: number) => mkInstance(mkCard({ name: `E${health}`, attack: 1, health }));
const regle = (x: number, toutes = false) => ({
  keyword_instances: [{ id: "vampirisme", x, ...(toutes ? { targetScope: "all_enemies" } : {}) }],
  capabilities: [{ uid: "cw_0", targets: [], trigger: "on_play", effectKind: "immediate", abilityId: "vampirisme", params: { x }, ...(toutes ? { targetScope: "all_enemies" } : {}) }],
});

function jouer(c: CardInstance, ennemies: CardInstance[], cible?: string): GameState {
  const s = mkState();
  s.players[1].board.push(...ennemies);
  s.players[0].hand.push(c);
  return applyAction(s, { type: "play_card", cardInstanceId: c.instanceId, targetInstanceId: cible } as GameAction);
}

describe("Vampirisme X à l'entrée en jeu", () => {
  it("X réglé sans texte d'effet : il est respecté", () => {
    const e = ennemie(9);
    const st = jouer(vampire(2, regle(4)), [e], e.instanceId);
    expect(st.players[1].board[0].currentHealth).toBe(5);
    expect(st.players[0].board[0].currentHealth).toBe(6);
  });

  it("le vol est plafonné par les PV de la cible", () => {
    const e = ennemie(1);
    const st = jouer(vampire(2, regle(3)), [e], e.instanceId);
    expect(st.players[0].board[0].currentHealth).toBe(3);
  });

  it("portée « toutes » : 1 + 1 + 2 PV pour Vampirisme 2", () => {
    const st = jouer(vampire(6, regle(2, true)), [ennemie(1), ennemie(1), ennemie(5)]);
    expect(st.players[0].board[0].currentHealth).toBe(6);
    expect(st.players[1].board.map((c) => c.currentHealth)).toEqual([3]);
  });

  it("carte ancienne : texte d'effet, puis moitié du coût", () => {
    const a = ennemie(9);
    expect(jouer(vampire(8, { effect_text: "[Vampirisme 1]" }), [a], a.instanceId).players[1].board[0].currentHealth).toBe(8);
    const b = ennemie(9);
    expect(jouer(vampire(6, {}), [b], b.instanceId).players[1].board[0].currentHealth).toBe(6);
  });

  it("le texte annonce un maximum", () => {
    expect(describeKeyword("vampirisme", { card: mkCard({ keywords: ["vampirisme"] as never }), x: 2 })).toContain("jusqu'à 2 PV");
  });
});

// Novice du Banquet rouge : Vampirisme 1 en fin de tour. Sans choix de cible,
// le vol vise une créature ennemie au hasard, JAMAIS le héros adverse.
describe("Vampirisme sans cible désignée (fin de tour)", () => {
  const novice = () => mkInstance(mkCard({
    name: "Novice", mana_cost: 1, attack: 1, health: 1, keywords: ["vampirisme"] as never,
    keyword_instances: [{ id: "vampirisme", mode: "end_of_turn", x: 1 }],
    capabilities: [{ uid: "cw_0", targets: [], trigger: "on_end_of_turn", effectKind: "immediate", abilityId: "vampirisme", params: { x: 1 } }],
  } as never));

  function finDeTour(ennemies: CardInstance[], avecNovice = true): GameState {
    const s = mkState();
    if (avecNovice) s.players[0].board.push(novice());
    s.players[1].board.push(...ennemies);
    return applyAction(s, { type: "end_turn" } as GameAction);
  }

  it("draine une créature ennemie, le héros adverse n'est pas touché", () => {
    // Témoin : même fin de tour sans le Novice (la pioche à vide coûte des PV).
    const s0 = finDeTour([ennemie(5)], false);
    const st = finDeTour([ennemie(5)]);
    expect(st.players[1].hero.hp).toBe(s0.players[1].hero.hp);
    expect(st.players[0].hero.hp).toBe(s0.players[0].hero.hp);
    expect(st.players[1].board[0].currentHealth).toBe(4);
    expect(st.players[0].board[0].currentHealth).toBe(2);
  });

  it("aucune créature ennemie : rien ne se passe", () => {
    const s0 = finDeTour([], false);
    const st = finDeTour([]);
    expect(st.players[1].hero.hp).toBe(s0.players[1].hero.hp);
    expect(st.players[0].hero.hp).toBe(s0.players[0].hero.hp);
    expect(st.players[0].board[0].currentHealth).toBe(1);
  });
});
