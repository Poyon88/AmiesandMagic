// Tests de l'interpréteur d'effets composés (modèle hybride).
// On exerce le vrai flux applyAction(play_card) avec des cartes synthétiques
// portant des capacités `composed`, et on vérifie l'état résultant.
import { describe, expect, it } from "vitest";
import { applyAction, getSpellTargetSlots, initRNG } from "./engine";
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
    fureurActive: false, fureurATKBonus: 0, berserkActive: false, berserkATKBonus: 0,
    targetsAttackedThisTurn: [], esquiveUsedThisTurn: false, ombreRevealed: false,
    corruptionStolenIds: [], contresortActive: false, maledictionTargetId: null, isParalyzed: false,
    loyauteATKBonus: 0, loyautePVBonus: 0, summonBonusATK: 0, auraHealthBonus: 0,
    necrophagieATKBonus: 0, necrophagiePVBonus: 0, martyrATKBonus: 0,
    persecutionX: 0, riposteX: 0, carnageX: 0, heritageX: 0,
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
  };
}

function play(state: GameState, ci: CardInstance, targetMap?: Record<string, string>) {
  initRNG(42);
  state.players[0].hand.push(ci);
  return applyAction(state, { type: "play_card", cardInstanceId: ci.instanceId, targetMap });
}

describe("interpréteur composé — contenus d'effet", () => {
  it("deal_damage au héros ennemi (sort, résolution)", () => {
    const spell = mkCard({ card_type: "spell", attack: null, health: null,
      capabilities: [composedCap("spell_resolution", { content: "deal_damage", magnitude: { x: 5 }, target: { entity: "hero", count: 1, side: "enemy", location: "board", designation: "random" } })] });
    const s = play(mkState(), mkInstance(spell));
    expect(s.players[1].hero.hp).toBe(HERO_MAX_HP - 5);
  });

  it("draw_cards (contrôleur)", () => {
    const s0 = mkState();
    s0.players[0].deck = [mkInstance(mkCard({})), mkInstance(mkCard({})), mkInstance(mkCard({}))];
    const spell = mkCard({ card_type: "spell", attack: null, health: null,
      capabilities: [composedCap("spell_resolution", { content: "draw_cards", magnitude: { x: 2 } })] });
    const s = play(s0, mkInstance(spell));
    expect(s.players[0].deck.length).toBe(1); // 3 → 1
  });

  it("summon_token x2 à l'entrée", () => {
    const creature = mkCard({ capabilities: [composedCap("on_play", { content: "summon_token", magnitude: { x: 2 }, tokenId: null })] });
    const s = play(mkState(), mkInstance(creature));
    expect(s.players[0].board.length).toBe(3); // la créature + 2 tokens
  });

  it("deal_damage à toutes les unités ennemies", () => {
    const s0 = mkState();
    s0.players[1].board = [mkInstance(mkCard({ attack: 1, health: 3 })), mkInstance(mkCard({ attack: 1, health: 3 }))];
    const creature = mkCard({ capabilities: [composedCap("on_play", { content: "deal_damage", magnitude: { x: 2 }, target: { entity: "unit", count: "all", side: "enemy", location: "board", designation: "random" } })] });
    const s = play(s0, mkInstance(creature));
    expect(s.players[1].board.map(c => c.currentHealth)).toEqual([1, 1]);
  });

  it("buff +1/+1 filtré par race (appartenance)", () => {
    const s0 = mkState();
    s0.players[0].board = [
      mkInstance(mkCard({ race: "elfes", attack: 1, health: 1 })),
      mkInstance(mkCard({ race: "nains", attack: 1, health: 1 })),
    ];
    const creature = mkCard({ race: "humains", capabilities: [composedCap("on_play", { content: "buff", magnitude: { x: 1, y: 1 }, target: { entity: "unit", count: "all", side: "ally", location: "board", membership: { race: ["elfes"] }, designation: "random" } })] });
    const s = play(s0, mkInstance(creature));
    const elfe = s.players[0].board.find(c => c.card.race === "elfes")!;
    const nain = s.players[0].board.find(c => c.card.race === "nains")!;
    expect([elfe.currentAttack, elfe.currentHealth]).toEqual([2, 2]);
    expect([nain.currentAttack, nain.currentHealth]).toEqual([1, 1]);
  });

  it("grant_keyword confère un mot-clé aux alliés", () => {
    const creature = mkCard({ capabilities: [composedCap("on_play", { content: "grant_keyword", grantAbilityId: "berserk", target: { entity: "unit", count: "all", side: "ally", location: "board", designation: "random" } })] });
    const s = play(mkState(), mkInstance(creature));
    const self = s.players[0].board[0];
    expect((self.card.keywords as string[]).includes("berserk")).toBe(true);
  });

  it("désignation hasard : exactement une cible touchée, déterministe (RNG semée)", () => {
    const s0 = mkState();
    s0.players[1].board = [mkInstance(mkCard({ attack: 1, health: 5 })), mkInstance(mkCard({ attack: 1, health: 5 }))];
    const creature = mkCard({ capabilities: [composedCap("on_play", { content: "deal_damage", magnitude: { x: 1 }, target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "random" } })] });
    const s = play(s0, mkInstance(creature));
    const totalDmg = s.players[1].board.reduce((acc, c) => acc + (5 - c.currentHealth), 0);
    expect(totalDmg).toBe(1); // une seule unité a pris 1 dégât
  });

  it("ciblage au choix (count 1) : slot émis + cible choisie respectée", () => {
    const s0 = mkState();
    const u1 = mkInstance(mkCard({ attack: 1, health: 5 }));
    const u2 = mkInstance(mkCard({ attack: 1, health: 5 }));
    s0.players[1].board = [u1, u2];
    const cap = composedCap("spell_resolution", { content: "deal_damage", magnitude: { x: 3 }, target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" } });
    const spell = mkCard({ card_type: "spell", attack: null, health: null, capabilities: [cap] });
    const slots = getSpellTargetSlots(spell);
    expect(slots.some((s) => s.slot === cap.uid && s.type === "enemy_creature")).toBe(true);
    const s = play(s0, mkInstance(spell), { [cap.uid]: u2.instanceId });
    const h1 = s.players[1].board.find((c) => c.card.id === u1.card.id)?.currentHealth;
    const h2 = s.players[1].board.find((c) => c.card.id === u2.card.id)?.currentHealth;
    expect(h1).toBe(5); // intact
    expect(h2).toBe(2); // ciblé, 5 − 3
  });

  it("on_death : un mort composé buffe les alliés survivants", () => {
    const s0 = mkState();
    // Allié robuste (2/10) qui survivra au sort et recevra le buff de mort.
    const survivor = mkInstance(mkCard({ attack: 2, health: 10 }));
    // Créature fragile (1/1) avec on_death buff +2/+2 aux alliés.
    const dying = mkInstance(mkCard({ attack: 1, health: 1,
      capabilities: [composedCap("on_death", { content: "buff", magnitude: { x: 2, y: 2 }, target: { entity: "unit", count: "all", side: "ally", location: "board", designation: "random" } })] }));
    s0.players[0].board = [survivor, dying];
    // Sort : 5 dégâts à toutes les unités alliées → tue `dying`, blesse `survivor` (10→5).
    const spell = mkCard({ card_type: "spell", attack: null, health: null,
      capabilities: [composedCap("spell_resolution", { content: "deal_damage", magnitude: { x: 5 }, target: { entity: "unit", count: "all", side: "ally", location: "board", designation: "random" } })] });
    const s = play(s0, mkInstance(spell));
    expect(s.players[0].board.length).toBe(1); // dying au cimetière
    const surv = s.players[0].board[0];
    // 10 − 5 (sort) + 2 (buff de mort) = 7 PV ; ATK 2 + 2 = 4.
    expect(surv.currentHealth).toBe(7);
    expect(surv.currentAttack).toBe(4);
  });
});
