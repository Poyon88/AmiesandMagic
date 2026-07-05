// Entrainement X : au déclenchement, +X/+X aux créatures EN MAIN du contrôleur
// de la même faction que la source (snapshot). Buff permanent cuit dans les
// stats → persiste quand la carte est ensuite jouée. Utilisable par unités
// (tous les déclencheurs habituels) et par sorts (une fois à la résolution).
import { describe, expect, it } from "vitest";
import { playCard, attack, applyAction } from "./engine";
import type { Card } from "./types";
import { mkCard, mkInstance, mkState } from "./test-harness";

/** Créature d'une faction donnée. */
function creature(name: string, faction: string, attack = 2, health = 2, extra: Partial<Card> = {}): Card {
  return mkCard({ name, faction, attack, health, mana_cost: 0, ...extra });
}

describe("Entrainement X — unité à l'invocation (on_play)", () => {
  it("octroie +X/+X aux seules créatures en main de MÊME faction", () => {
    const s = mkState();
    // Main du joueur : 2 Elfes, 1 Orc, 1 sort Elfe.
    const elfeA = mkInstance(creature("Elfe A", "Elfes", 2, 2));
    const elfeB = mkInstance(creature("Elfe B", "Elfes", 3, 1));
    const orc = mkInstance(creature("Orc", "Orcs", 4, 4));
    const spell = mkInstance(mkCard({ name: "Sort Elfe", faction: "Elfes", card_type: "spell", attack: null, health: null }));
    s.players[0].hand.push(elfeA, elfeB, orc, spell);

    const src = mkInstance(creature("Formateur", "Elfes", 1, 1, { keywords: ["entrainement"], effect_text: "[Entrainement 2]" }));
    s.players[0].hand.push(src);

    const next = playCard(s, { type: "play_card", cardInstanceId: src.instanceId });
    const hand = next.players[0].hand;
    const a = hand.find((c) => c.card.name === "Elfe A")!;
    const b = hand.find((c) => c.card.name === "Elfe B")!;
    const o = hand.find((c) => c.card.name === "Orc")!;
    const sp = hand.find((c) => c.card.name === "Sort Elfe")!;

    expect(a.currentAttack).toBe(4); expect(a.maxHealth).toBe(4); expect(a.currentHealth).toBe(4);
    expect(b.currentAttack).toBe(5); expect(b.maxHealth).toBe(3);
    expect(o.currentAttack).toBe(4); expect(o.maxHealth).toBe(4);  // autre faction → inchangé
    expect(sp.card.attack ?? null).toBeNull();                     // sort → ignoré
  });

  it("le buff est cuit dans la carte et PERSISTE une fois la créature jouée", () => {
    const s = mkState();
    const recrue = mkInstance(creature("Recrue", "Elfes", 2, 2));
    s.players[0].hand.push(recrue);
    const src = mkInstance(creature("Formateur", "Elfes", 1, 1, { keywords: ["entrainement"], effect_text: "[Entrainement 2]" }));
    s.players[0].hand.push(src);

    const afterBuff = playCard(s, { type: "play_card", cardInstanceId: src.instanceId });
    const buffed = afterBuff.players[0].hand.find((c) => c.card.name === "Recrue")!;
    expect(buffed.currentAttack).toBe(4);

    // On joue la recrue boostée : elle arrive sur le plateau à 4/4.
    const afterPlay = playCard(afterBuff, { type: "play_card", cardInstanceId: buffed.instanceId });
    const onBoard = afterPlay.players[0].board.find((c) => c.card.name === "Recrue")!;
    expect(onBoard.currentAttack).toBe(4);
    expect(onBoard.maxHealth).toBe(4);
  });
});

describe("Entrainement X — sort (spell_resolution, one-shot)", () => {
  it("applique +X/+X aux créatures en main de la faction du SORT", () => {
    const s = mkState();
    const elfe = mkInstance(creature("Elfe", "Elfes", 2, 2));
    const orc = mkInstance(creature("Orc", "Orcs", 2, 2));
    s.players[0].hand.push(elfe, orc);

    const spell = mkInstance(mkCard({
      name: "Entrainement d'élite", faction: "Elfes", card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "entrainement", amount: 3 }],
    }));
    s.players[0].hand.push(spell);

    const next = playCard(s, { type: "play_card", cardInstanceId: spell.instanceId });
    const e = next.players[0].hand.find((c) => c.card.name === "Elfe")!;
    const o = next.players[0].hand.find((c) => c.card.name === "Orc")!;
    expect(e.currentAttack).toBe(5); expect(e.maxHealth).toBe(5);
    expect(o.currentAttack).toBe(2);  // autre faction → inchangé
  });
});

describe("Entrainement X — déclencheur fin de tour (on_end_of_turn)", () => {
  it("buffe la main de même faction à chaque fin de tour du contrôleur", () => {
    const s = mkState();
    const src = mkInstance(creature("Mentor", "Elfes", 2, 2, {
      keyword_instances: [{ id: "entrainement", mode: "end_of_turn", x: 1 }],
    }));
    s.players[0].board.push(src);
    const recrue = mkInstance(creature("Recrue", "Elfes", 2, 2));
    s.players[0].hand.push(recrue);

    const next = applyAction(s, { type: "end_turn" });
    const r = next.players[0].hand.find((c) => c.card.name === "Recrue")!;
    expect(r.currentAttack).toBe(3);  // 2 + 1
    expect(r.maxHealth).toBe(3);
  });
});

describe("Entrainement X — déclencheur attaque (on_attack, nouveau câblage)", () => {
  it("buffe la main de même faction quand la source attaque", () => {
    const s = mkState();
    const src = mkInstance(creature("Champion", "Elfes", 3, 3, {
      keyword_instances: [{ id: "entrainement", mode: "attack", x: 2 }],
    }));
    s.players[0].board.push(src);
    const recrue = mkInstance(creature("Recrue", "Elfes", 2, 2));
    s.players[0].hand.push(recrue);

    const next = attack(s, { type: "attack", attackerInstanceId: src.instanceId, targetInstanceId: "enemy_hero" });
    const r = next.players[0].hand.find((c) => c.card.name === "Recrue")!;
    expect(r.currentAttack).toBe(4);  // 2 + 2
    expect(r.maxHealth).toBe(4);
  });
});

describe("Entrainement X — déclencheur mort (on_death)", () => {
  it("buffe la main du contrôleur de la créature qui meurt", () => {
    const s = mkState();
    const attacker = mkInstance(creature("Attaquant", "Orcs", 5, 5));
    s.players[0].board.push(attacker);

    // Défenseur du joueur 1 : meurt au combat, déclenche Entrainement à la mort.
    const defender = mkInstance(creature("Défenseur", "Elfes", 1, 2, {
      keyword_instances: [{ id: "entrainement", mode: "death", x: 2 }],
    }));
    s.players[1].board.push(defender);
    const recrue = mkInstance(creature("Recrue", "Elfes", 2, 2));
    s.players[1].hand.push(recrue);

    const next = attack(s, { type: "attack", attackerInstanceId: attacker.instanceId, targetInstanceId: defender.instanceId });
    expect(next.players[1].board.find((c) => c.card.name === "Défenseur")).toBeUndefined(); // mort
    const r = next.players[1].hand.find((c) => c.card.name === "Recrue")!;
    expect(r.currentAttack).toBe(4);  // 2 + 2
    expect(r.maxHealth).toBe(4);
  });
});
