// Gloire +X/+Y : « Chaque fois que cette unité survit à des dégâts de combat,
// elle gagne +X/+Y de façon permanente. »
//
// Remplace l'ancien Berserk (doublement conditionnel de l'ATK tant que les PV
// étaient entamés). Trois propriétés à verrouiller :
//   1. le déclencheur est le COMBAT (attaque, riposte, assaut Fureur) — ni les
//      sorts, ni les capacités de créature (souffle, carnage, zone…) ;
//   2. il faut SURVIVRE : mourir ne donne rien, et un Bouclier qui absorbe tout
//      ne compte pas (aucune blessure surmontée) ;
//   3. le bonus est PERMANENT et CUMULATIF (cuit dans les stats de l'instance,
//      donc insensible à recalculateAuras et conservé entre les zones).
import { describe, expect, it } from "vitest";
import { attack, playCard } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance } from "./types";

function glorieux(name: string, atk: number, health: number, x = 1, y = 1): CardInstance {
  return mkInstance(mkCard({
    name, attack: atk, health,
    keywords: ["gloire"] as never,
    keyword_instances: [{ id: "gloire", x, y }] as never,
  }));
}

describe("Gloire — déclenchement", () => {
  it("survit à l'attaque adverse → gagne +X/+Y de façon permanente", () => {
    const s = mkState();
    const atk = mkInstance(mkCard({ name: "Attaquant", attack: 2, health: 10 }));
    atk.hasSummoningSickness = false;
    const glo = glorieux("Glorieux", 3, 10, 2, 1);
    s.players[0].board.push(atk);
    s.players[1].board.push(glo);

    const next = attack(s, { type: "attack", attackerInstanceId: atk.instanceId, targetInstanceId: glo.instanceId });
    const after = next.players[1].board.find(c => c.instanceId === glo.instanceId)!;

    expect(after.gloireStacks).toBe(1);
    // ATK 3 + 2 (Gloire). Le bonus est cuit dans la carte → survit au recalcul d'auras.
    expect(after.currentAttack).toBe(5);
    expect(after.card.attack).toBe(5);
    // PV : 10 - 2 (attaque) + 1 (Gloire) = 9 ; le max monte aussi.
    expect(after.currentHealth).toBe(9);
    expect(after.maxHealth).toBe(11);
  });

  it("l'ATTAQUANT qui survit à la riposte gagne aussi sa Gloire", () => {
    const s = mkState();
    const glo = glorieux("Glorieux", 3, 10);
    glo.hasSummoningSickness = false;
    const def = mkInstance(mkCard({ name: "Défenseur", attack: 2, health: 10 }));
    s.players[0].board.push(glo);
    s.players[1].board.push(def);

    const next = attack(s, { type: "attack", attackerInstanceId: glo.instanceId, targetInstanceId: def.instanceId });
    const after = next.players[0].board.find(c => c.instanceId === glo.instanceId)!;

    expect(after.gloireStacks).toBe(1);
    expect(after.currentAttack).toBe(4);
  });

  it("cumule : deux combats survécus = deux fois le bonus", () => {
    const s = mkState();
    const a1 = mkInstance(mkCard({ name: "A1", attack: 2, health: 10 }));
    const a2 = mkInstance(mkCard({ name: "A2", attack: 2, health: 10 }));
    a1.hasSummoningSickness = false;
    a2.hasSummoningSickness = false;
    const glo = glorieux("Glorieux", 3, 20, 2, 1);
    s.players[0].board.push(a1, a2);
    s.players[1].board.push(glo);

    let next = attack(s, { type: "attack", attackerInstanceId: a1.instanceId, targetInstanceId: glo.instanceId });
    next = attack(next, { type: "attack", attackerInstanceId: a2.instanceId, targetInstanceId: glo.instanceId });
    const after = next.players[1].board.find(c => c.instanceId === glo.instanceId)!;

    expect(after.gloireStacks).toBe(2);
    expect(after.currentAttack).toBe(7);   // 3 + 2 + 2
    expect(after.maxHealth).toBe(22);      // 20 + 1 + 1
  });

  it("l'échange simultané reste simultané : la riposte n'utilise pas l'ATK déjà gonflée", () => {
    const s = mkState();
    const atk = mkInstance(mkCard({ name: "Attaquant", attack: 2, health: 10 }));
    atk.hasSummoningSickness = false;
    const glo = glorieux("Glorieux", 3, 10, 5, 0); // +5 ATK : l'écart serait flagrant
    s.players[0].board.push(atk);
    s.players[1].board.push(glo);

    const next = attack(s, { type: "attack", attackerInstanceId: atk.instanceId, targetInstanceId: glo.instanceId });
    const atkAfter = next.players[0].board.find(c => c.instanceId === atk.instanceId)!;

    // L'attaquant encaisse 3 (ATK d'origine), pas 8 (ATK post-Gloire).
    expect(atkAfter.currentHealth).toBe(7);
  });
});

describe("Gloire — non-déclenchement", () => {
  it("mourir au combat ne donne rien", () => {
    const s = mkState();
    const atk = mkInstance(mkCard({ name: "Bourreau", attack: 10, health: 10 }));
    atk.hasSummoningSickness = false;
    const glo = glorieux("Glorieux", 1, 3);
    s.players[0].board.push(atk);
    s.players[1].board.push(glo);

    const next = attack(s, { type: "attack", attackerInstanceId: atk.instanceId, targetInstanceId: glo.instanceId });

    expect(next.players[1].board.find(c => c.instanceId === glo.instanceId)).toBeUndefined();
    const dead = next.players[1].graveyard.find(c => c.instanceId === glo.instanceId)!;
    expect(dead.gloireStacks ?? 0).toBe(0);
    expect(dead.card.attack).toBe(1); // stats jamais buffées
  });

  it("un Bouclier qui absorbe tout ne déclenche pas la Gloire (aucune blessure subie)", () => {
    const s = mkState();
    const atk = mkInstance(mkCard({ name: "Attaquant", attack: 2, health: 10 }));
    atk.hasSummoningSickness = false;
    const glo = glorieux("Glorieux", 3, 10);
    glo.hasDivineShield = true;
    s.players[0].board.push(atk);
    s.players[1].board.push(glo);

    const next = attack(s, { type: "attack", attackerInstanceId: atk.instanceId, targetInstanceId: glo.instanceId });
    const after = next.players[1].board.find(c => c.instanceId === glo.instanceId)!;

    expect(after.gloireStacks ?? 0).toBe(0);
    expect(after.currentHealth).toBe(10);
    expect(after.currentAttack).toBe(3);
  });

  it("les dégâts de SORT ne déclenchent pas la Gloire", () => {
    const s = mkState();
    const glo = glorieux("Glorieux", 3, 10);
    s.players[1].board.push(glo);

    const spell = mkInstance(mkCard({
      name: "Éclair", card_type: "spell", attack: null, health: null,
      spell_effect: { type: "deal_damage", target: "any_creature", amount: 2 } as never,
    }));
    s.players[0].hand.push(spell);

    const next = playCard(s, {
      type: "play_card", cardInstanceId: spell.instanceId, targetInstanceId: glo.instanceId,
    });
    const after = next.players[1].board.find(c => c.instanceId === glo.instanceId)!;

    expect(after.currentHealth).toBe(8); // le sort a bien touché…
    expect(after.gloireStacks ?? 0).toBe(0); // …sans nourrir la Gloire
    expect(after.currentAttack).toBe(3);
  });

  it("les dégâts de zone d'une CAPACITÉ (Souffle de feu) ne déclenchent pas la Gloire", () => {
    const s = mkState();
    // mana_cost 4 → souffle X = max(1, floor(4/2)) = 2, infligé à l'attaque.
    const dragon = mkInstance(mkCard({ name: "Dragon", attack: 5, health: 10, mana_cost: 4, keywords: ["souffle_de_feu"] as never }));
    dragon.hasSummoningSickness = false;
    const glo = glorieux("Glorieux", 3, 10);
    s.players[0].board.push(dragon);
    s.players[1].board.push(glo);

    // Le dragon frappe le HÉROS : la seule chose que subit le Glorieux est le
    // souffle de zone — pas un échange de combat.
    const next = attack(s, { type: "attack", attackerInstanceId: dragon.instanceId, targetInstanceId: "enemy_hero" });
    const after = next.players[1].board.find(c => c.instanceId === glo.instanceId)!;

    expect(after.currentHealth).toBe(8); // souffle encaissé…
    expect(after.gloireStacks ?? 0).toBe(0); // …mais ce n'est pas du combat
    expect(after.currentAttack).toBe(3);
  });
});
