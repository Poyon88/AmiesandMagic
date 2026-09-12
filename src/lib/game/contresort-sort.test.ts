// Contresort — forme SORT : le sort arme un contre chez son lanceur
// (PlayerState.contresort), consommé par le prochain sort adverse.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameState, SpellKeywordInstance } from "./types";

function sortContresort(): CardInstance {
  return mkInstance(mkCard({
    name: "Mur de silence", card_type: "spell", attack: null, health: null, mana_cost: 2,
    spell_keywords: [{ id: "contresort" }] as SpellKeywordInstance[],
  }));
}
function sortImpact(): CardInstance {
  return mkInstance(mkCard({
    name: "Éclair", card_type: "spell", attack: null, health: null, mana_cost: 1,
    spell_keywords: [{ id: "impact", amount: 2 }] as SpellKeywordInstance[],
  }));
}
function lancer(s: GameState, joueur: 0 | 1, sort: CardInstance, target = "enemy_hero"): GameState {
  s.currentPlayerIndex = joueur;
  s.players[joueur].hand.push(sort);
  return applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId, targetMap: { target_0: target } });
}

describe("Contresort — forme sort", () => {
  it("arme un contre chez le lanceur", () => {
    const s = mkState();
    const next = lancer(s, 0, sortContresort());
    expect(next.players[0].contresort).toBe(1);
    expect(next.players[0].graveyard.map(c => c.card.name)).toContain("Mur de silence");
  });

  it("le prochain sort adverse est annulé et consomme le contre", () => {
    let s = lancer(mkState(), 0, sortContresort());
    const pv = s.players[0].hero.hp;
    s = lancer(s, 1, sortImpact());
    expect(s.players[0].hero.hp).toBe(pv);            // aucun effet
    expect(s.players[0].contresort).toBe(0);           // consommé
    expect(s.players[1].graveyard.map(c => c.card.name)).toContain("Éclair");
    // Le sort SUIVANT passe.
    s = lancer(s, 1, sortImpact());
    expect(s.players[0].hero.hp).toBe(pv - 2);
  });

  it("deux sorts Contresort annulent les deux prochains sorts adverses", () => {
    let s = lancer(mkState(), 0, sortContresort());
    s = lancer(s, 0, sortContresort());
    expect(s.players[0].contresort).toBe(2);
    const pv = s.players[0].hero.hp;
    s = lancer(s, 1, sortImpact());
    s = lancer(s, 1, sortImpact());
    expect(s.players[0].hero.hp).toBe(pv);
    s = lancer(s, 1, sortImpact());
    expect(s.players[0].hero.hp).toBe(pv - 2);
  });

  it("le contre armé par un sort est consommé AVANT la garde d'une unité", () => {
    let s = lancer(mkState(), 0, sortContresort());
    const garde = mkInstance(mkCard({ name: "Gardien", attack: 1, health: 3, keywords: ["contresort"] as never }));
    garde.contresortActive = true;
    s.players[0].board.push(garde);
    s = lancer(s, 1, sortImpact());
    expect(s.players[0].contresort).toBe(0);
    expect(s.players[0].board.find(c => c.card.name === "Gardien")!.contresortActive).toBe(true);
  });

  it("un sort Contresort peut lui-même être contré : il n'arme rien", () => {
    const s = mkState();
    const garde = mkInstance(mkCard({ name: "Gardien", attack: 1, health: 3, keywords: ["contresort"] as never }));
    garde.contresortActive = true;
    s.players[1].board.push(garde);
    const next = lancer(s, 0, sortContresort());
    expect(next.players[0].contresort ?? 0).toBe(0);
    expect(next.players[1].board[0].contresortActive).toBe(false);
  });
});
