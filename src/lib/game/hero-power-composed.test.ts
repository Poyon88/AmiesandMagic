// Pouvoirs de héros à effets composés (mode "composed") : résolus comme un sort
// lancé par le héros via runComposedCapsForCard sur une carte synthétique.
// On exerce le vrai flux applyAction({type:"hero_power", …}) avec un
// HeroDefinition portant powerEffect.composed, et on vérifie l'état résultant.
import { describe, expect, it } from "vitest";
import { applyAction, initRNG } from "./engine";
import { HERO_MAX_HP } from "./constants";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { ComposedEffect, GameState, HeroDefinition } from "./types";

function heroWithComposed(composed: ComposedEffect, powerCost = 1): HeroDefinition {
  return {
    id: 1, name: "Héros test", race: "humans",
    powerName: "Pouvoir composé", powerCost,
    powerEffect: { mode: "composed", keywordId: "_composed", composed },
    powerDescription: "",
  };
}

function setHero(s: GameState, composed: ComposedEffect, powerCost = 1) {
  s.players[0].hero.heroDefinition = heroWithComposed(composed, powerCost);
}

describe("pouvoir de héros composé — dégâts ciblés", () => {
  it("inflige X à une créature ennemie choisie (targetMap hp_0#0)", () => {
    const s = mkState();
    initRNG(42);
    const enemy = mkInstance(mkCard({ name: "Cible", attack: 1, health: 5 }));
    s.players[1].board.push(enemy);
    setHero(s, { content: "deal_damage", magnitude: { x: 3 }, target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" } });

    const next = applyAction(s, { type: "hero_power", targetMap: { "hp_0#0": enemy.instanceId } });

    const after = next.players[1].board.find(c => c.instanceId === enemy.instanceId)!;
    expect(after.currentHealth).toBe(2); // 5 - 3
    expect(next.players[0].hero.heroPowerUsedThisTurn).toBe(true);
    expect(next.players[0].mana).toBe(9); // 10 - coût 1
  });

  it("multi-cibles : deux slots (hp_0#0, hp_0#1) touchent deux créatures", () => {
    const s = mkState();
    initRNG(42);
    const a = mkInstance(mkCard({ name: "A", attack: 0, health: 5 }));
    const b = mkInstance(mkCard({ name: "B", attack: 0, health: 5 }));
    s.players[1].board.push(a, b);
    setHero(s, { content: "deal_damage", magnitude: { x: 2 }, target: { entity: "unit", count: 2, side: "enemy", location: "board", designation: "choice" } });

    const next = applyAction(s, { type: "hero_power", targetMap: { "hp_0#0": a.instanceId, "hp_0#1": b.instanceId } });

    expect(next.players[1].board.find(c => c.instanceId === a.instanceId)!.currentHealth).toBe(3);
    expect(next.players[1].board.find(c => c.instanceId === b.instanceId)!.currentHealth).toBe(3);
  });
});

describe("pouvoir de héros composé — sans cible (contrôleur)", () => {
  it("draw_cards pioche X cartes", () => {
    const s = mkState();
    initRNG(42);
    for (let i = 0; i < 3; i++) s.players[0].deck.push(mkInstance(mkCard({ name: `D${i}` })));
    const handBefore = s.players[0].hand.length;
    setHero(s, { content: "draw_cards", magnitude: { x: 2 } });

    const next = applyAction(s, { type: "hero_power" });

    expect(next.players[0].hand.length).toBe(handBefore + 2);
    expect(next.players[0].deck.length).toBe(1);
  });

  it("gain_mana ajoute X mana", () => {
    const s = mkState();
    initRNG(42);
    setHero(s, { content: "gain_mana", magnitude: { x: 3 } }, 1);

    const next = applyAction(s, { type: "hero_power" });

    expect(next.players[0].mana).toBe(12); // 10 - 1 (coût) + 3
  });
});

describe("pouvoir de héros composé — cible héros + gardes", () => {
  it("dégâts au héros ennemi (entity hero, résolution déterministe sans picker)", () => {
    const s = mkState();
    initRNG(42);
    setHero(s, { content: "deal_damage", magnitude: { x: 5 }, target: { entity: "hero", count: 1, side: "enemy", location: "board", designation: "choice" } });

    const next = applyAction(s, { type: "hero_power" });

    expect(next.players[1].hero.hp).toBe(HERO_MAX_HP - 5);
  });

  it("bloqué si mana insuffisant (état inchangé)", () => {
    const s = mkState();
    initRNG(42);
    s.players[0].mana = 0;
    const enemy = mkInstance(mkCard({ name: "Cible", attack: 0, health: 5 }));
    s.players[1].board.push(enemy);
    setHero(s, { content: "deal_damage", magnitude: { x: 3 }, target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" } }, 3);

    const next = applyAction(s, { type: "hero_power", targetMap: { "hp_0#0": enemy.instanceId } });

    expect(next).toBe(s); // useHeroPower renvoie l'état d'origine
  });

  it("bloqué si déjà utilisé ce tour", () => {
    const s = mkState();
    initRNG(42);
    s.players[0].hero.heroPowerUsedThisTurn = true;
    setHero(s, { content: "gain_mana", magnitude: { x: 3 } });

    const next = applyAction(s, { type: "hero_power" });

    expect(next).toBe(s);
  });
});
