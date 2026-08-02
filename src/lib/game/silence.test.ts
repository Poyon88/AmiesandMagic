// Silence : « Retire tous les mots-clés d'une créature ciblée et ramène ses
// stats à leur valeur d'origine. »
//
// Le volet mots-clés existait déjà ; le volet STATS est la règle ajoutée. Ce
// qu'il faut verrouiller :
//   1. les buffs CUITS dans `card` (Renforcement, Gloire, buff composé) sont
//      repris — c'est le cas qui exige la mémoire des stats imprimées, `card`
//      ayant été écrasée par le buff ;
//   2. les bonus permanents SUIVIS (loyauté, invocation, dévoration…) aussi ;
//   3. le Silence ne SOIGNE pas (les dégâts déjà subis restent) et ne TUE pas ;
//   4. les auras EXTERNES (Commandement d'un allié) survivent — elles ne sont
//      pas un gain de la créature — tandis que celles portées par son propre
//      mot-clé (Sang mêlé) retombent avec le mot-clé.
import { describe, expect, it } from "vitest";
import { applyAction, recalculateAuras } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameAction, SpellKeywordInstance } from "./types";

function play(state: ReturnType<typeof mkState>, ci: ReturnType<typeof mkInstance>, targetInstanceId?: string): GameAction {
  state.players[0].hand.push(ci);
  return { type: "play_card", cardInstanceId: ci.instanceId, targetInstanceId };
}

function silenceSpell() {
  return mkInstance(mkCard({
    name: "Silence", card_type: "spell", attack: null, health: null,
    spell_keywords: [{ id: "silence" }] as SpellKeywordInstance[],
  }));
}

function renforcementSpell(attack: number, health: number) {
  return mkInstance(mkCard({
    name: "Renforcement", card_type: "spell", attack: null, health: null,
    spell_keywords: [{ id: "renforcement", attack, health }] as SpellKeywordInstance[],
  }));
}

describe("Silence — retour aux stats d'origine", () => {
  it("reprend un Renforcement (buff cuit dans card) et restaure les stats imprimées", () => {
    const s = mkState();
    const ally = mkInstance(mkCard({ name: "Cible", attack: 2, health: 3 }));
    s.players[0].board.push(ally);

    let next = applyAction(s, play(s, renforcementSpell(3, 4), ally.instanceId));
    let t = next.players[0].board.find(c => c.card.name === "Cible")!;
    expect([t.currentAttack, t.currentHealth, t.maxHealth]).toEqual([5, 7, 7]);

    next = applyAction(next, play(next, silenceSpell(), ally.instanceId));
    t = next.players[0].board.find(c => c.card.name === "Cible")!;
    expect(t.currentAttack).toBe(2);
    expect(t.maxHealth).toBe(3);
    expect(t.currentHealth).toBe(3);
    // La carte elle-même est rendue à ses valeurs imprimées : sans ça, le
    // prochain recalcul d'auras rebâtirait l'ATK depuis la valeur buffée.
    expect(t.card.attack).toBe(2);
    expect(t.card.health).toBe(3);
    recalculateAuras(next.players[0], next.players[1]);
    expect(next.players[0].board.find(c => c.card.name === "Cible")!.currentAttack).toBe(2);
  });

  it("efface les bonus permanents suivis (dévoration) sans soigner les dégâts subis", () => {
    const s = mkState();
    const t0 = mkInstance(mkCard({ name: "Dévoreur", attack: 2, health: 6 }));
    t0.devorationATKBonus = 4;
    t0.devorationPVBonus = 4;
    t0.maxHealth = 10;
    t0.currentAttack = 6;
    t0.currentHealth = 5; // 5 dégâts encaissés
    s.players[1].board.push(t0);

    const next = applyAction(s, play(s, silenceSpell(), t0.instanceId));
    const t = next.players[1].board.find(c => c.card.name === "Dévoreur")!;
    expect(t.devorationATKBonus).toBe(0);
    expect(t.devorationPVBonus).toBe(0);
    expect(t.currentAttack).toBe(2);
    expect(t.maxHealth).toBe(6);
    // PV courants écrêtés au nouveau max, jamais remontés : 5 était déjà ≤ 6.
    expect(t.currentHealth).toBe(5);
  });

  it("écrête les PV courants au nouveau maximum (aucun soin) et ne tue pas", () => {
    const s = mkState();
    const t0 = mkInstance(mkCard({ name: "Colosse", attack: 1, health: 1 }));
    t0.card = { ...t0.card, health: 9 }; // +8 PV cuits par un buff antérieur
    t0.maxHealth = 9;
    t0.currentHealth = 7;
    s.players[1].board.push(t0);

    const next = applyAction(s, play(s, silenceSpell(), t0.instanceId));
    const t = next.players[1].board.find(c => c.card.name === "Colosse")!;
    expect(t.maxHealth).toBe(1);
    expect(t.currentHealth).toBe(1); // écrêté, pas 7 — et > 0 : la cible survit
    expect(next.players[1].graveyard.some(c => c.card.name === "Colosse")).toBe(false);
  });

  it("remet le compteur de Gloire à zéro puisque son gain est repris", () => {
    const s = mkState();
    const t0 = mkInstance(mkCard({
      name: "Glorieux", attack: 5, health: 5,
      keywords: ["gloire"] as never,
      keyword_instances: [{ id: "gloire", x: 1, y: 1 }] as never,
    }));
    t0.baseAttack = 3;
    t0.baseHealth = 3; // 3/3 imprimé, +2/+2 accumulés par deux Gloires
    t0.gloireStacks = 2;
    t0.maxHealth = 5;
    t0.currentHealth = 5;
    t0.currentAttack = 5;
    s.players[1].board.push(t0);

    const next = applyAction(s, play(s, silenceSpell(), t0.instanceId));
    const t = next.players[1].board.find(c => c.card.name === "Glorieux")!;
    expect(t.gloireStacks).toBe(0);
    expect(t.currentAttack).toBe(3);
    expect(t.maxHealth).toBe(3);
    expect(t.card.keywords).toEqual([]);
  });

  it("conserve l'aura EXTERNE d'un allié (Commandement) mais fait retomber Sang mêlé", () => {
    const s = mkState();
    // Trois races distinctes chez l'adversaire → Sang mêlé +2/+2 sur la cible.
    const cible = mkInstance(mkCard({
      name: "Métis", attack: 2, health: 4, faction: "Elfes", race: "elves",
      keywords: ["sang_mele", "commandement"] as never,
    }));
    const allie1 = mkInstance(mkCard({ name: "Nain", attack: 1, health: 1, faction: "Elfes", race: "dwarves" }));
    const allie2 = mkInstance(mkCard({
      name: "Chef", attack: 1, health: 1, faction: "Elfes", race: "humans",
      keywords: ["commandement"] as never,
    }));
    s.players[1].board.push(cible, allie1, allie2);
    recalculateAuras(s.players[1], s.players[0]);

    const avant = s.players[1].board.find(c => c.card.name === "Métis")!;
    // 2 (base) + 2 (sang mêlé : nains + humains) + 1 (Commandement du Chef) = 5
    expect(avant.currentAttack).toBe(5);
    expect(avant.maxHealth).toBe(7);

    const next = applyAction(s, play(s, silenceSpell(), cible.instanceId));
    const t = next.players[1].board.find(c => c.card.name === "Métis")!;
    // Sang mêlé perdu avec le mot-clé ; le Commandement de l'allié reste.
    expect(t.currentAttack).toBe(3); // 2 + 1
    expect(t.maxHealth).toBe(5);     // 4 + 1
    expect(t.sangMeleHealthBonus).toBe(0);
    expect(t.auraHealthBonus).toBe(1);
  });
});
