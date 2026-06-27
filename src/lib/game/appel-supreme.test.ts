// Appel Suprême : récupère en MAIN la CRÉATURE de la race fixée au coût en mana
// le plus élevé restante dans le deck ; tirage au hasard (RNG seedée) en cas
// d'égalité. Côté créature (Invocation) ET côté sort. Sorts de la race ignorés.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameAction, GameState } from "./types";

const RACE = "Orcs";

/** Deck du joueur 0 : créatures Orcs coûts [3,5,5,2], un SORT Orcs coût 7
 *  (doit être ignoré), une créature d'une autre race coût 9 (filtrée). */
function seedDeck(s: GameState) {
  s.players[0].deck.push(
    mkInstance(mkCard({ name: "Orc-3", mana_cost: 3, race: RACE, card_type: "creature" })),
    mkInstance(mkCard({ name: "Orc-5a", mana_cost: 5, race: RACE, card_type: "creature" })),
    mkInstance(mkCard({ name: "Orc-5b", mana_cost: 5, race: RACE, card_type: "creature" })),
    mkInstance(mkCard({ name: "Orc-2", mana_cost: 2, race: RACE, card_type: "creature" })),
    mkInstance(mkCard({ name: "Sort-Orc-7", mana_cost: 7, race: RACE, card_type: "spell", attack: null, health: null })),
    mkInstance(mkCard({ name: "Humain-9", mana_cost: 9, race: "Humains", card_type: "creature" })),
  );
}

const isOrc5 = (name: string) => name === "Orc-5a" || name === "Orc-5b";

describe("Appel Suprême", () => {
  it("créature (Invocation) : récupère en main une créature Orcs coût 5 (plus haut), sort ignoré", () => {
    const s = mkState();
    s.rngState = 7;
    seedDeck(s);
    const summoner = mkInstance(
      mkCard({ name: "Invocateur", mana_cost: 2, race: "Humains", card_type: "creature",
        keyword_instances: [{ id: "appel_supreme", race: RACE }] }),
    );
    s.players[0].hand.push(summoner);

    const next = applyAction(s, { type: "play_card", cardInstanceId: summoner.instanceId } as GameAction);

    const fetched = next.players[0].hand.filter(c => isOrc5(c.card.name));
    expect(fetched).toHaveLength(1); // exactement une des deux coût-5
    // retirée du deck
    expect(next.players[0].deck.some(c => c.instanceId === fetched[0].instanceId)).toBe(false);
    // le sort Orcs coût 7 (plus cher mais pas une créature) reste dans le deck
    expect(next.players[0].deck.some(c => c.card.name === "Sort-Orc-7")).toBe(true);
    // la créature d'une autre race n'est jamais prise
    expect(next.players[0].hand.some(c => c.card.name === "Humain-9")).toBe(false);
  });

  it("sort : même comportement via spell_keywords", () => {
    const s = mkState();
    s.rngState = 7;
    seedDeck(s);
    const spell = mkInstance(
      mkCard({ name: "Sort Appel Suprême", mana_cost: 3, card_type: "spell", attack: null, health: null,
        spell_keywords: [{ id: "appel_supreme", race: RACE }] }),
    );
    s.players[0].hand.push(spell);

    const next = applyAction(s, { type: "play_card", cardInstanceId: spell.instanceId } as GameAction);

    expect(next.players[0].hand.filter(c => isOrc5(c.card.name))).toHaveLength(1);
    expect(next.players[0].deck.some(c => c.card.name === "Sort-Orc-7")).toBe(true);
  });

  it("tie-break déterministe : même seed → même créature choisie", () => {
    const run = () => {
      const s = mkState();
      s.rngState = 42;
      seedDeck(s);
      const summoner = mkInstance(
        mkCard({ name: "Invocateur", mana_cost: 2, card_type: "creature",
          keyword_instances: [{ id: "appel_supreme", race: RACE }] }),
      );
      s.players[0].hand.push(summoner);
      const next = applyAction(s, { type: "play_card", cardInstanceId: summoner.instanceId } as GameAction);
      return next.players[0].hand.find(c => isOrc5(c.card.name))!.card.name;
    };
    expect(run()).toBe(run()); // déterministe
  });

  it("no-op : aucune créature de la race dans le deck", () => {
    const s = mkState();
    s.rngState = 7;
    s.players[0].deck.push(mkInstance(mkCard({ name: "Humain-9", mana_cost: 9, race: "Humains", card_type: "creature" })));
    const summoner = mkInstance(
      mkCard({ name: "Invocateur", mana_cost: 2, card_type: "creature",
        keyword_instances: [{ id: "appel_supreme", race: RACE }] }),
    );
    s.players[0].hand.push(summoner);

    const next = applyAction(s, { type: "play_card", cardInstanceId: summoner.instanceId } as GameAction);

    expect(next.players[0].deck.some(c => c.card.name === "Humain-9")).toBe(true);
    expect(next.players[0].hand.some(c => c.card.race === RACE)).toBe(false);
  });
});
