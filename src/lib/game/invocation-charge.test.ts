// Invocation X : la créature invoquée arrive avec le mal d'invocation (précédent
// Appel du Clan) — sauf si elle porte Traque (id moteur `charge`), auquel cas
// elle doit pouvoir attaquer immédiatement, comme jouée depuis la main.
// Régression : « Renfort bienvenu » (invocation) invoquait un « Chaton du
// Bengale » (poison + charge) qui restait bloqué, resolveInvocationSummon
// forçant hasSummoningSickness = true sans regarder les mots-clés.
import { describe, expect, it } from "vitest";
import { playCard } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";

function invocationSpell(x = 1) {
  return mkInstance(mkCard({
    name: "Renfort bienvenu", card_type: "spell", attack: null, health: null,
    spell_keywords: [{ id: "invocation", amount: x }] as never,
  }));
}

function poolCreature(name: string, keywords: string[]) {
  return mkCard({
    name, faction: "Mercenaires", rarity: "Commune", mana_cost: 1,
    attack: 1, health: 1, keywords: keywords as never,
  });
}

describe("Invocation X — la créature invoquée garde sa Traque", () => {
  it("une créature avec Traque peut attaquer le tour de son invocation", () => {
    const s = mkState();
    s.rngState = 3;
    s.factionCardPool = [poolCreature("Chaton du Bengale", ["poison", "charge"])];

    const spell = invocationSpell(1);
    s.players[0].hand.push(spell);
    const next = playCard(s, { type: "play_card", cardInstanceId: spell.instanceId });

    const summoned = next.players[0].board.find((c) => c.card.name === "Chaton du Bengale");
    expect(summoned).toBeDefined();
    expect(summoned!.hasSummoningSickness).toBe(false);
  });

  it("Appel du clan : l'unité appelée depuis le deck garde sa Traque", () => {
    const s = mkState();
    const summoner = mkInstance(mkCard({
      name: "Chef de meute", mana_cost: 3, attack: 1, health: 1,
      clan: "Les Seigneurs Fauves", keywords: ["appel_du_clan"] as never,
    }));
    s.players[0].deck.push(mkInstance(mkCard({
      name: "Chaton du Bengale", mana_cost: 1, attack: 1, health: 1,
      clan: "Les Seigneurs Fauves", keywords: ["charge"] as never,
    })));
    s.players[0].hand.push(summoner);
    const next = playCard(s, { type: "play_card", cardInstanceId: summoner.instanceId });

    const called = next.players[0].board.find((c) => c.card.name === "Chaton du Bengale");
    expect(called).toBeDefined();
    expect(called!.hasSummoningSickness).toBe(false);
  });

  it("Résurrection : la créature ramenée du cimetière garde sa Traque", () => {
    const s = mkState();
    s.players[0].graveyard.push(mkInstance(mkCard({
      name: "Revenant", mana_cost: 2, attack: 2, health: 2, keywords: ["charge"] as never,
    })));
    const spell = mkInstance(mkCard({
      name: "Retour d'entre les morts", card_type: "spell", attack: null, health: null,
      spell_effects: { effects: [{ type: "resurrect", amount: 1 }] } as never,
    }));
    s.players[0].hand.push(spell);
    const next = playCard(s, { type: "play_card", cardInstanceId: spell.instanceId });

    const raised = next.players[0].board.find((c) => c.card.name === "Revenant");
    expect(raised).toBeDefined();
    expect(raised!.hasSummoningSickness).toBe(false);
  });

  it("sans Traque, le mal d'invocation reste appliqué", () => {
    const s = mkState();
    s.rngState = 3;
    s.factionCardPool = [poolCreature("Recrue", [])];

    const spell = invocationSpell(1);
    s.players[0].hand.push(spell);
    const next = playCard(s, { type: "play_card", cardInstanceId: spell.instanceId });

    const summoned = next.players[0].board.find((c) => c.card.name === "Recrue");
    expect(summoned).toBeDefined();
    expect(summoned!.hasSummoningSickness).toBe(true);
  });
});
