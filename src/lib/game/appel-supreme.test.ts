// Appel Suprême : met en MAIN la carte (créature OU sort) au coût le plus élevé
// du deck — au hasard (RNG semée) en cas d'égalité. Plus de race depuis le
// 2026-09-13 : une race héritée sur une instance est ignorée. Côté créature
// (entrée en jeu), côté sort, et en pouvoir de héros.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameAction, GameState } from "./types";

/** Deck du joueur 0 : créatures [3, 5, 5, 2], un SORT coût 7 (le plus cher :
 *  c'est LUI qui doit sortir), une créature coût 9 d'une autre race dans un
 *  second jeu de tests. */
function seedDeck(s: GameState, avecHumain9 = false) {
  s.players[0].deck.push(
    mkInstance(mkCard({ name: "Orc-3", mana_cost: 3, race: "Orcs", card_type: "creature" })),
    mkInstance(mkCard({ name: "Orc-5a", mana_cost: 5, race: "Orcs", card_type: "creature" })),
    mkInstance(mkCard({ name: "Orc-5b", mana_cost: 5, race: "Orcs", card_type: "creature" })),
    mkInstance(mkCard({ name: "Orc-2", mana_cost: 2, race: "Orcs", card_type: "creature" })),
    mkInstance(mkCard({ name: "Sort-7", mana_cost: 7, race: "Orcs", card_type: "spell", attack: null, health: null })),
  );
  if (avecHumain9) s.players[0].deck.push(mkInstance(mkCard({ name: "Humain-9", mana_cost: 9, race: "Humains", card_type: "creature" })));
}

describe("Appel Suprême (curé, sans race)", () => {
  it("créature à l'entrée : la carte la plus chère du deck rejoint la main, sort compris", () => {
    const s = mkState(); s.rngState = 7; seedDeck(s);
    const summoner = mkInstance(mkCard({ name: "Invocateur", mana_cost: 2, race: "Humains", keyword_instances: [{ id: "appel_supreme" }] }));
    s.players[0].hand.push(summoner);

    const next = applyAction(s, { type: "play_card", cardInstanceId: summoner.instanceId } as GameAction);

    expect(next.players[0].hand.map(c => c.card.name)).toEqual(["Sort-7"]);
    expect(next.players[0].deck.some(c => c.card.name === "Sort-7")).toBe(false);
  });

  it("une race héritée sur l'instance est IGNORÉE : c'est la plus chère toutes races confondues", () => {
    const s = mkState(); s.rngState = 7; seedDeck(s, true);
    const summoner = mkInstance(mkCard({ name: "Invocateur", mana_cost: 2, keyword_instances: [{ id: "appel_supreme", race: "Orcs" }] }));
    s.players[0].hand.push(summoner);

    const next = applyAction(s, { type: "play_card", cardInstanceId: summoner.instanceId } as GameAction);

    expect(next.players[0].hand.map(c => c.card.name)).toEqual(["Humain-9"]);
  });

  it("sort : même comportement via spell_keywords", () => {
    const s = mkState(); s.rngState = 7; seedDeck(s, true);
    const spell = mkInstance(mkCard({ name: "Sort Appel Suprême", mana_cost: 3, card_type: "spell", attack: null, health: null, spell_keywords: [{ id: "appel_supreme" }] }));
    s.players[0].hand.push(spell);

    const next = applyAction(s, { type: "play_card", cardInstanceId: spell.instanceId } as GameAction);

    expect(next.players[0].hand.map(c => c.card.name)).toEqual(["Humain-9"]);
  });

  it("égalité : tirage déterministe (même graine → même carte)", () => {
    const run = () => {
      const s = mkState(); s.rngState = 42;
      s.players[0].deck.push(
        mkInstance(mkCard({ name: "A-5", mana_cost: 5 })),
        mkInstance(mkCard({ name: "B-5", mana_cost: 5 })),
        mkInstance(mkCard({ name: "C-2", mana_cost: 2 })),
      );
      const summoner = mkInstance(mkCard({ name: "Invocateur", mana_cost: 2, keyword_instances: [{ id: "appel_supreme" }] }));
      s.players[0].hand.push(summoner);
      const next = applyAction(s, { type: "play_card", cardInstanceId: summoner.instanceId } as GameAction);
      return next.players[0].hand[0].card.name;
    };
    expect(["A-5", "B-5"]).toContain(run());
    expect(run()).toBe(run());
  });

  it("pouvoir de héros (spell_trigger) : plus besoin de race", () => {
    const s = mkState(); s.rngState = 7; seedDeck(s, true); s.players[0].mana = 5;
    s.players[0].hero.heroDefinition = {
      id: 1, name: "Héros", race: "Humains", powerName: "Appel Suprême", powerCost: 2, powerDescription: "",
      powerEffect: { mode: "spell_trigger", keywordId: "appel_supreme" },
    };
    const next = applyAction(s, { type: "hero_power" } as GameAction);
    expect(next.players[0].hand.map(c => c.card.name)).toEqual(["Humain-9"]);
  });

  it("deck vide : no-op", () => {
    const s = mkState();
    const summoner = mkInstance(mkCard({ name: "Invocateur", mana_cost: 2, keyword_instances: [{ id: "appel_supreme" }] }));
    s.players[0].hand.push(summoner);
    const next = applyAction(s, { type: "play_card", cardInstanceId: summoner.instanceId } as GameAction);
    expect(next.players[0].hand).toHaveLength(0);
  });
});

// Forme COMPOSÉE : filtre de pool (race / faction / clan / mot-clé) + plafond X.
describe("Appel Suprême (composé, filtrable)", () => {
  const sortCompose = (pool?: Record<string, string>, x = 0) => mkInstance(mkCard({
    name: "Convocation", card_type: "spell", attack: null, health: null,
    capabilities: [{ uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
      composed: { content: "appel_supreme", magnitude: { x }, ...(pool ? { pool } : {}) } }] as never,
  }));

  it("race : la plus chère DE CETTE race, même si une autre carte coûte plus", () => {
    const s = mkState(); s.rngState = 7; seedDeck(s, true);
    const sort = sortCompose({ race: "Orcs" });
    s.players[0].hand.push(sort);
    const next = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId } as GameAction);
    expect(next.players[0].hand.map(c => c.card.name)).toEqual(["Sort-7"]);
  });

  it("plafond X : la plus chère de coût ≤ X", () => {
    const s = mkState(); s.rngState = 7; seedDeck(s, true);
    const sort = sortCompose(undefined, 4);
    s.players[0].hand.push(sort);
    const next = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId } as GameAction);
    expect(next.players[0].hand.map(c => c.card.name)).toEqual(["Orc-3"]);
  });

  it("mot-clé porté : la plus chère qui porte la capacité", () => {
    const s = mkState(); s.rngState = 7;
    s.players[0].deck.push(
      mkInstance(mkCard({ name: "Lourd", mana_cost: 9 })),
      mkInstance(mkCard({ name: "Rapide-4", mana_cost: 4, keywords: ["charge"] as never })),
      mkInstance(mkCard({ name: "Rapide-2", mana_cost: 2, keywords: ["charge"] as never })),
    );
    const sort = sortCompose({ keywordId: "charge" });
    s.players[0].hand.push(sort);
    const next = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId } as GameAction);
    expect(next.players[0].hand.map(c => c.card.name)).toEqual(["Rapide-4"]);
  });

  it("aucune carte ne satisfait le filtre : no-op", () => {
    const s = mkState(); seedDeck(s);
    const sort = sortCompose({ clan: "Clan fantôme" });
    s.players[0].hand.push(sort);
    const next = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId } as GameAction);
    expect(next.players[0].hand).toHaveLength(0);
    expect(next.players[0].deck).toHaveLength(5);
  });
});
