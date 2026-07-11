// Cataclysme X : inflige X dégâts à TOUTES les créatures des deux camps
// (alliées ET ennemies, la source comprise). Côté sort (résolution) et côté
// créature (invocation). On exerce le vrai flux applyAction(play_card).
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameAction, SpellKeywordInstance } from "./types";

function play(state: ReturnType<typeof mkState>, ci: ReturnType<typeof mkInstance>): GameAction {
  state.players[0].hand.push(ci);
  return { type: "play_card", cardInstanceId: ci.instanceId };
}

describe("Cataclysme X — sort", () => {
  it("inflige X à toutes les créatures des DEUX plateaux ; héros intacts", () => {
    const s = mkState();
    const allies = [6, 6].map((hp, i) => mkInstance(mkCard({ name: `A${i}`, attack: 1, health: hp })));
    const enemies = [6, 6].map((hp, i) => mkInstance(mkCard({ name: `E${i}`, attack: 1, health: hp })));
    allies.forEach(a => s.players[0].board.push(a));
    enemies.forEach(e => s.players[1].board.push(e));
    const heroBefore = [s.players[0].hero.hp, s.players[1].hero.hp];

    const spell = mkInstance(mkCard({
      name: "Cataclysme", card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "cataclysme", amount: 2 }] as SpellKeywordInstance[],
    }));
    const next = applyAction(s, play(s, spell));

    for (const c of [...next.players[0].board, ...next.players[1].board]) {
      if (c.card.name.startsWith("A") || c.card.name.startsWith("E")) {
        expect(c.currentHealth).toBe(4); // 6 - 2, les deux camps
      }
    }
    expect([next.players[0].hero.hp, next.players[1].hero.hp]).toEqual(heroBefore);
  });

  it("plateaux vides → no-op (pas de crash)", () => {
    const s = mkState();
    const spell = mkInstance(mkCard({
      name: "Cataclysme", card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "cataclysme", amount: 3 }] as SpellKeywordInstance[],
    }));
    expect(() => applyAction(s, play(s, spell))).not.toThrow();
  });
});

describe("Cataclysme X — créature (invocation)", () => {
  it("frappe les deux camps, la SOURCE comprise (auto-dégâts)", () => {
    const s = mkState();
    const ally = mkInstance(mkCard({ name: "Allie", attack: 1, health: 4 }));
    const enemy = mkInstance(mkCard({ name: "Ennemi", attack: 1, health: 4 }));
    s.players[0].board.push(ally);
    s.players[1].board.push(enemy);

    // Porteuse 2/2, Cataclysme X=3 (via keyword_instances + effect_text).
    const bearer = mkInstance(mkCard({
      name: "Porteur", mana_cost: 3, attack: 2, health: 2,
      keywords: ["cataclysme"],
      keyword_instances: [{ id: "cataclysme", x: 3 }],
      effect_text: "[Cataclysme 3]",
    }));
    const next = applyAction(s, play(s, bearer));

    // Allié et ennemi : 4 - 3 = 1 PV.
    expect(next.players[0].board.find(c => c.card.name === "Allie")!.currentHealth).toBe(1);
    expect(next.players[1].board.find(c => c.card.name === "Ennemi")!.currentHealth).toBe(1);
    // La source (2 PV) prend 3 → morte : absente du plateau, présente au cimetière.
    expect(next.players[0].board.some(c => c.card.name === "Porteur")).toBe(false);
    expect(next.players[0].graveyard.some(c => c.card.name === "Porteur")).toBe(true);
  });

  it("X dérivé du bracket effect_text si pas de keyword_instances", () => {
    const s = mkState();
    const enemy = mkInstance(mkCard({ name: "Ennemi", attack: 1, health: 9 }));
    s.players[1].board.push(enemy);
    const bearer = mkInstance(mkCard({
      name: "Porteur", mana_cost: 3, attack: 5, health: 9,
      keywords: ["cataclysme"], effect_text: "[Cataclysme 2]",
    }));
    const next = applyAction(s, play(s, bearer));
    expect(next.players[1].board.find(c => c.card.name === "Ennemi")!.currentHealth).toBe(7); // 9 - 2
  });
});
