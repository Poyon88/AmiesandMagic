import { describe, expect, it } from "vitest";
import type { Card, GameState } from "@/lib/game/types";
import { coupsHeuristiques } from "./heuristic-bot";
import { applyAction, initializeGame } from "@/lib/game/engine";
import { objetsDe } from "@/lib/game/items";
import { isManaSpark, MANA_SPARK_FALLBACK } from "@/lib/game/mana-spark";
import { seededRand } from "./random-bot";
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

  it("l'heuristique pose puis équipe un objet quand il en a les moyens", () => {
    const epee = { id: 9001, name: "Épée", mana_cost: 1, card_type: "item", attack: 3, health: 1, equip_cost: 1, effect_text: "",
      keywords: [], keyword_instances: null, spell_keywords: null, spell_effects: null, image_url: null, faction: "neutre" } as unknown as Card;
    const soldat = creature(1, 1, 3);
    const d = (): { card: Card; quantity: number }[] => [{ card: soldat, quantity: 20 }];
    let s = initializeGame("p1", "p2", d(), d(), 0, 3, null, null, [soldat, epee], [], null);
    s = applyAction(s, { type: "mulligan", playerId: "p1", replacedInstanceIds: [] });
    s = applyAction(s, { type: "mulligan", playerId: "p2", replacedInstanceIds: [] });
    // Situation fabriquée : p1 a une créature en jeu, l'épée en main et 5 mana.
    const me = s.players[s.currentPlayerIndex];
    me.mana = me.maxMana = 5;
    me.board = [{ ...me.hand[0], hasSummoningSickness: false }];
    me.hand = [{ ...me.hand[1], card: epee, instanceId: "epee-1" }];
    const rand = seededRand(1);
    for (let i = 0; i < 4; i++) {
      const a = coupsHeuristiques(s, rand).find((x) => x.type === "play_card" || x.type === "equip_item");
      if (!a) break;
      s = applyAction(s, a);
    }
    const objet = objetsDe(s.players[s.currentPlayerIndex])[0];
    expect(objet?.equippedToInstanceId).toBe(me.board[0].instanceId);
  });

  describe("Étincelle de mana", () => {
    // p1 actif avec `mana` disponible, l'Étincelle et éventuellement une créature en main.
    const situation = (mana: number, avecCreature: boolean) => {
      const d = (): { card: Card; quantity: number }[] => [{ card: creature(2, 2, 2), quantity: 20 }];
      let s = initializeGame("p1", "p2", d(), d(), 0, 5, null, null, [MANA_SPARK_FALLBACK], [], null);
      s = applyAction(s, { type: "mulligan", playerId: "p1", replacedInstanceIds: [] });
      s = applyAction(s, { type: "mulligan", playerId: "p2", replacedInstanceIds: [] });
      const me = s.players[s.currentPlayerIndex];
      me.mana = me.maxMana = mana;
      const etincelle = { ...me.hand[0], card: MANA_SPARK_FALLBACK, instanceId: "etincelle-1" };
      me.hand = avecCreature ? [etincelle, me.hand[1]] : [etincelle];
      return s;
    };
    const premierCoup = (s: GameState) => coupsHeuristiques(s, seededRand(2))[0];

    it("est jouée quand le +1 permet de poser une carte", () => {
      const a = premierCoup(situation(1, true));
      expect(a.type).toBe("play_card");
      expect(isManaSpark(situation(1, true).players[0].hand.find((c) => a.type === "play_card" && c.instanceId === a.cardInstanceId)!.card)).toBe(true);
    });

    it("est gardée quand le +1 ne sert à rien", () => {
      expect(premierCoup(situation(1, false)).type).toBe("end_turn");
    });
  });
});
