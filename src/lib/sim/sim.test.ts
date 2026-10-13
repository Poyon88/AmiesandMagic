import { describe, expect, it } from "vitest";
import type { Card } from "@/lib/game/types";
import { coupsHeuristiques } from "./heuristic-bot";
import { politiqueAleatoire, simulerPartie, type DeckSim, type Politique } from "./simulate";

let id = 1;
const creature = (mana: number, attack: number, health: number, keywords: string[] = []): Card => ({
  id: id++, name: `C${id}`, mana_cost: mana, card_type: "creature", attack, health, effect_text: "",
  keywords, keyword_instances: null, spell_keywords: null, spell_effects: null, image_url: null, faction: "neutre",
} as unknown as Card);

const lib = [creature(1, 1, 2), creature(2, 2, 3), creature(3, 3, 3, ["taunt"]), creature(4, 4, 5), creature(5, 5, 5, ["charge"]), creature(2, 3, 1)];
const deck = (label: string): DeckSim => ({ label, hero: null, cards: lib.map((card) => ({ card, quantity: 8 })) });
const pools = { factionCardPool: lib, allSpellsPool: [], tokens: [] };
const heur: Politique = (s, r) => coupsHeuristiques(s, r);

describe("simulation de parties", () => {
  it("deux bots aléatoires finissent la partie, sans incident", () => {
    for (let seed = 1; seed <= 3; seed++) {
      const r = simulerPartie(deck("a"), deck("b"), seed, pools);
      expect(r.fin).toBe("victoire");
      expect(r.incidents.filter((i) => i.kind !== "refus")).toEqual([]);
    }
  });

  it("une partie se rejoue à l'identique depuis sa graine", () => {
    const a = simulerPartie(deck("a"), deck("b"), 7, pools, [heur, politiqueAleatoire]);
    const b = simulerPartie(deck("a"), deck("b"), 7, pools, [heur, politiqueAleatoire]);
    expect([b.winner, b.actions, b.tours]).toEqual([a.winner, a.actions, a.tours]);
  });

  it("l'heuristique bat nettement le hasard", () => {
    let gains = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const heurEn = seed % 2;
      const r = simulerPartie(deck("a"), deck("b"), 100 + seed, pools, heurEn === 0 ? [heur, politiqueAleatoire] : [politiqueAleatoire, heur]);
      if (r.winner === heurEn) gains++;
    }
    expect(gains).toBeGreaterThanOrEqual(5);
  });
});
