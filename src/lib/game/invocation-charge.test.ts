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
