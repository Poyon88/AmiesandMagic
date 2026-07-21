// Transcendance = immunité aux SORTS uniquement. Ces tests verrouillent le fait
// qu'une capacité de créature (effet composé, dégâts de zone d'une créature…)
// affecte bien une unité transcendante, alors qu'un sort ne l'affecte pas.
import { describe, expect, it } from "vitest";
import {
  applyAction, getCreatureTargets, getOnAttackTargets, getSpellTargets, initRNG,
} from "./engine";
import { HERO_MAX_HP } from "./constants";
import type {
  Capability, Card, CardInstance, ComposedEffect, GameState, HeroState, PlayerState,
} from "./types";

let seq = 1;
function mkCard(partial: Partial<Card>): Card {
  return {
    id: seq++, name: "C", mana_cost: 0, card_type: "creature", attack: 1, health: 1,
    effect_text: "", keywords: [], spell_keywords: null, spell_effects: null,
    image_url: null, capabilities: null, ...partial,
  } as Card;
}
function composedCap(trigger: Capability["trigger"], composed: ComposedEffect): Capability {
  return { uid: `c_${seq++}`, trigger, effectKind: "immediate", abilityId: "_composed", composed };
}
function mkInstance(card: Card): CardInstance {
  return {
    instanceId: `i_${seq++}`, card,
    currentAttack: card.attack ?? 0, currentHealth: card.health ?? 1, maxHealth: card.health ?? 1,
    hasAttacked: false, hasSummoningSickness: false, hasDivineShield: false, attacksRemaining: 1,
    isPoisoned: false, hasUsedResurrection: false, tapped: false,
    fureurActive: false, fureurATKBonus: 0, gloireStacks: 0,
    targetsAttackedThisTurn: [], esquiveUsedThisTurn: false, ombreRevealed: false,
    corruptionStolenIds: [], contresortActive: false, maledictionTargetId: null, isParalyzed: false,
    loyauteATKBonus: 0, loyautePVBonus: 0, summonBonusATK: 0, auraHealthBonus: 0, sangMeleHealthBonus: 0,
    necrophagieATKBonus: 0, necrophagiePVBonus: 0, richesseATKBonus: 0, richessePVBonus: 0, martyrATKBonus: 0,
    persecutionX: 0, riposteX: 0, carnageX: 0, sacrificeDemoniaqueX: 0, heritageX: 0,
    instinctDeMeuteX: 0, instinctDeMeuteATKBonus: 0, diedOnTurn: null,
    cycleEternelAutoPlay: false, originalOwnerId: null, trueOwnerId: null,
    hasTransformedLycanthropie: false, grantedKeywordX: {}, manaCostReduction: 0,
  };
}
function mkHero(): HeroState {
  return { hp: HERO_MAX_HP, maxHp: HERO_MAX_HP, armor: 0, heroDefinition: null, heroPowerUsedThisTurn: false, heroPowerActivationsUsed: 0, activeAuras: [] };
}
function mkPlayer(id: string): PlayerState {
  return { id, hero: mkHero(), mana: 10, maxMana: 10, hand: [], board: [], deck: [], graveyard: [], spellHistory: [], fatigueDamage: 0, ownedLimitedCardIds: [] };
}
function mkState(): GameState {
  return {
    players: [mkPlayer("P1"), mkPlayer("P2")], currentPlayerIndex: 0, turnNumber: 1,
    turnStartedAt: 0, phase: "playing", winner: null, lastAction: null, mulliganReady: [true, true],
    rngState: 1,
  };
}
const AOE_ENEMY: ComposedEffect = { content: "deal_damage", magnitude: { x: 3 }, target: { entity: "unit", count: "all", side: "enemy", location: "board", designation: "random" } };
const CHOICE_ENEMY: ComposedEffect = { content: "deal_damage", magnitude: { x: 3 }, target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" } };

describe("Transcendance — immunité aux sorts, pas aux capacités de créatures", () => {
  it("une capacité de créature (composé, à l'entrée) touche une unité transcendante", () => {
    const s0 = mkState();
    const transcendant = mkInstance(mkCard({ attack: 1, health: 5, keywords: ["transcendance"] }));
    const normal = mkInstance(mkCard({ attack: 1, health: 5 }));
    s0.players[1].board = [transcendant, normal];
    const attacker = mkInstance(mkCard({ attack: 1, health: 1, capabilities: [composedCap("on_play", AOE_ENEMY)] }));
    initRNG(42);
    s0.players[0].hand.push(attacker);
    const s = applyAction(s0, { type: "play_card", cardInstanceId: attacker.instanceId });
    // Les DEUX ennemis subissent les 3 dégâts (5 → 2), y compris le transcendant.
    expect(s.players[1].board.find((c) => c.card.id === transcendant.card.id)?.currentHealth).toBe(2);
    expect(s.players[1].board.find((c) => c.card.id === normal.card.id)?.currentHealth).toBe(2);
  });

  it("un sort n'affecte PAS une unité transcendante (mais frappe les autres)", () => {
    const s0 = mkState();
    const transcendant = mkInstance(mkCard({ attack: 1, health: 5, keywords: ["transcendance"] }));
    const normal = mkInstance(mkCard({ attack: 1, health: 5 }));
    s0.players[1].board = [transcendant, normal];
    const spell = mkCard({ card_type: "spell", attack: null, health: null,
      capabilities: [composedCap("spell_resolution", AOE_ENEMY)] });
    const ci = mkInstance(spell);
    initRNG(42);
    s0.players[0].hand.push(ci);
    const s = applyAction(s0, { type: "play_card", cardInstanceId: ci.instanceId });
    // Le transcendant est immunisé (5 PV intacts), le normal subit les dégâts.
    expect(s.players[1].board.find((c) => c.card.id === transcendant.card.id)?.currentHealth).toBe(5);
    expect(s.players[1].board.find((c) => c.card.id === normal.card.id)?.currentHealth).toBe(2);
  });

  it("le cibleur d'une capacité de créature propose l'unité transcendante", () => {
    const s0 = mkState();
    const transcendant = mkInstance(mkCard({ attack: 1, health: 5, keywords: ["transcendance"] }));
    s0.players[1].board = [transcendant];
    const creatureCard = mkCard({ attack: 1, health: 1, capabilities: [composedCap("on_play", CHOICE_ENEMY)] });
    expect(getCreatureTargets(s0, creatureCard)).toContain(transcendant.instanceId);
    // Même chose pour une capacité déclenchée à l'attaque.
    const onAttackCard = mkCard({ attack: 1, health: 1, capabilities: [composedCap("on_attack", CHOICE_ENEMY)] });
    expect(getOnAttackTargets(s0, onAttackCard)).toContain(transcendant.instanceId);
  });

  it("le cibleur d'un SORT exclut l'unité transcendante", () => {
    const s0 = mkState();
    const transcendant = mkInstance(mkCard({ attack: 1, health: 5, keywords: ["transcendance"] }));
    const normal = mkInstance(mkCard({ attack: 1, health: 5 }));
    s0.players[1].board = [transcendant, normal];
    const spell = mkCard({ card_type: "spell", attack: null, health: null,
      spell_effects: null, spell_effect: { target: "enemy_creature" } } as Partial<Card>);
    const ids = getSpellTargets(s0, spell, "enemy_creature");
    expect(ids).toContain(normal.instanceId);
    expect(ids).not.toContain(transcendant.instanceId);
  });
});
