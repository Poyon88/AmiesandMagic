// Tests de l'interpréteur d'effets composés (modèle hybride).
// On exerce le vrai flux applyAction(play_card) avec des cartes synthétiques
// portant des capacités `composed`, et on vérifie l'état résultant.
import { describe, expect, it } from "vitest";
import { applyAction, creatureNeedsTarget, getCreatureTapComposedUid, getCreatureTargets, getSpellTargetSlots, initRNG, initializeGame } from "./engine";
import { getCapabilities } from "./capability-adapter";
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

  it("token invoqué : faction EXPLICITE du template prioritaire (choix libre race↔faction)", () => {
    const s0 = mkState();
    // Token de race « Fauves » mais faction explicite « Hommes-Bêtes ».
    s0.tokenTemplates = [{ id: 99, race: "Fauves", faction: "Hommes-Bêtes", clan: null, name: "Tigre", attack: 3, health: 3, image_url: null, keywords: [] }];
    const creature = mkCard({ faction: "Mercenaires", capabilities: [composedCap("on_play", { content: "summon_token", magnitude: { x: 1 }, tokenId: 99 })] });
    const s = play(s0, mkInstance(creature));
    const token = s.players[0].board.find(c => c.card.race === "Fauves")!;
    expect(token.card.faction).toBe("Hommes-Bêtes"); // pas la faction de l'invocateur
  });

  it("token invoqué legacy (sans faction) : repli sur la faction de l'invocateur", () => {
    const s0 = mkState();
    // Template sans faction (token créé avant la colonne).
    s0.tokenTemplates = [{ id: 98, race: "Fauves", clan: null, name: "Tigre", attack: 3, health: 3, image_url: null, keywords: [] }];
    const creature = mkCard({ faction: "Mercenaires", capabilities: [composedCap("on_play", { content: "summon_token", magnitude: { x: 1 }, tokenId: 98 })] });
    const s = play(s0, mkInstance(creature));
    const token = s.players[0].board.find(c => c.card.race === "Fauves")!;
    expect(token.card.faction).toBe("Mercenaires"); // repli inchangé
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
    expect(slots.some((s) => s.slot === `${cap.uid}#0` && s.type === "enemy_creature")).toBe(true);
    const s = play(s0, mkInstance(spell), { [`${cap.uid}#0`]: u2.instanceId });
    const h1 = s.players[1].board.find((c) => c.card.id === u1.card.id)?.currentHealth;
    const h2 = s.players[1].board.find((c) => c.card.id === u2.card.id)?.currentHealth;
    expect(h1).toBe(5); // intact
    expect(h2).toBe(2); // ciblé, 5 − 3
  });

  it("Damnation X (sort) : -X/-X à une créature ennemie ciblée", () => {
    const s0 = mkState();
    const u = mkInstance(mkCard({ attack: 3, health: 5 }));
    s0.players[1].board = [u];
    const spell = mkCard({ card_type: "spell", attack: null, health: null, spell_keywords: [{ id: "damnation", amount: 2 }] });
    const s = play(s0, mkInstance(spell), { kw_0: u.instanceId });
    const t = s.players[1].board[0];
    expect(t.currentAttack).toBe(1); // 3 − 2
    expect(t.currentHealth).toBe(3); // 5 − 2
  });

  it("Conférer (créature) : confère la capacité choisie aux alliés", () => {
    const s0 = mkState();
    const ally = mkInstance(mkCard({ attack: 1, health: 1 }));
    s0.players[0].board = [ally];
    const creature = mkInstance(mkCard({
      attack: 1, health: 1, keywords: ["conferer"],
      keyword_instances: [{ id: "conferer", grantAbilityId: "berserk", grantScope: "all_allies" }],
    }));
    const s = play(s0, creature);
    const a = s.players[0].board.find((c) => c.card.id === ally.card.id)!;
    expect((a.card.keywords as string[]).includes("berserk")).toBe(true);
  });

  it("ciblage au choix multi (count 2) : 2 slots, 2 cibles touchées", () => {
    const s0 = mkState();
    const u1 = mkInstance(mkCard({ attack: 1, health: 5 }));
    const u2 = mkInstance(mkCard({ attack: 1, health: 5 }));
    const u3 = mkInstance(mkCard({ attack: 1, health: 5 }));
    s0.players[1].board = [u1, u2, u3];
    const cap = composedCap("spell_resolution", { content: "deal_damage", magnitude: { x: 2 }, target: { entity: "unit", count: 2, side: "enemy", location: "board", designation: "choice" } });
    const spell = mkCard({ card_type: "spell", attack: null, health: null, capabilities: [cap] });
    expect(getSpellTargetSlots(spell).filter((s) => s.slot.startsWith(cap.uid)).length).toBe(2);
    const s = play(s0, mkInstance(spell), { [`${cap.uid}#0`]: u1.instanceId, [`${cap.uid}#1`]: u3.instanceId });
    expect(s.players[1].board.find((c) => c.card.id === u1.card.id)?.currentHealth).toBe(3); // touché
    expect(s.players[1].board.find((c) => c.card.id === u2.card.id)?.currentHealth).toBe(5); // épargné
    expect(s.players[1].board.find((c) => c.card.id === u3.card.id)?.currentHealth).toBe(3); // touché
  });

  it("entity 'both' (toutes) : touche les unités ET le héros du bord", () => {
    const s0 = mkState();
    const u1 = mkInstance(mkCard({ attack: 1, health: 5 }));
    const u2 = mkInstance(mkCard({ attack: 1, health: 5 }));
    s0.players[1].board = [u1, u2];
    const spell = mkCard({ card_type: "spell", attack: null, health: null,
      capabilities: [composedCap("spell_resolution", { content: "deal_damage", magnitude: { x: 2 }, target: { entity: "both", count: "all", side: "enemy", location: "board", designation: "random" } })] });
    const s = play(s0, mkInstance(spell));
    expect(s.players[1].hero.hp).toBe(HERO_MAX_HP - 2);
    expect(s.players[1].board.map((c) => c.currentHealth)).toEqual([3, 3]);
  });

  it("créature à l'entrée 'au choix' : cibleur branché + cible respectée", () => {
    const s0 = mkState();
    const u1 = mkInstance(mkCard({ attack: 1, health: 5 }));
    const u2 = mkInstance(mkCard({ attack: 1, health: 5 }));
    s0.players[1].board = [u1, u2];
    const cap = composedCap("on_play", { content: "deal_damage", magnitude: { x: 3 }, target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" } });
    const creatureCard = mkCard({ attack: 1, health: 1, capabilities: [cap] });
    // Le cibleur in-game doit s'activer et proposer les unités ennemies.
    expect(creatureNeedsTarget(creatureCard)).toBe(true);
    expect(getCreatureTargets(s0, creatureCard).sort()).toEqual([u1.instanceId, u2.instanceId].sort());
    // Jouer en ciblant u2 → seul u2 est touché.
    const ci = mkInstance(creatureCard);
    initRNG(42);
    s0.players[0].hand.push(ci);
    const s = applyAction(s0, { type: "play_card", cardInstanceId: ci.instanceId, targetInstanceId: u2.instanceId });
    expect(s.players[1].board.find((c) => c.card.id === u1.card.id)?.currentHealth).toBe(5);
    expect(s.players[1].board.find((c) => c.card.id === u2.card.id)?.currentHealth).toBe(2);
  });

  it("pouvoir activable composé (tap) : déclenche l'effet et engage la créature", () => {
    const s0 = mkState();
    const cap = composedCap("on_activation", { content: "deal_damage", magnitude: { x: 2 }, target: { entity: "hero", count: 1, side: "enemy", location: "board", designation: "random" } });
    const src = mkInstance(mkCard({ attack: 1, health: 3, capabilities: [cap] }));
    src.hasSummoningSickness = false;
    s0.players[0].board = [src];
    expect(getCreatureTapComposedUid(src.card)).toBe(cap.uid);
    initRNG(1);
    const s = applyAction(s0, { type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: -1, composedUid: cap.uid });
    expect(s.players[1].hero.hp).toBe(HERO_MAX_HP - 2);
    expect(s.players[0].board[0].tapped).toBe(true);
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

describe("pouvoir composé à l'attaque (on_attack)", () => {
  const onAttackCap = (x: number) => composedCap("on_attack", {
    content: "deal_damage", magnitude: { x },
    target: { entity: "unit", side: "enemy", count: 1, location: "board", designation: "choice" },
  });

  it("résout le pouvoir AVANT le combat ; s'il tue le défenseur → attaque à blanc, attaquant dépensé et indemne", () => {
    initRNG(42);
    const state = mkState();
    const cap = onAttackCap(5);
    const attacker = mkInstance(mkCard({ attack: 3, health: 3, capabilities: [cap] }));
    const defender = mkInstance(mkCard({ attack: 2, health: 2 }));
    state.players[0].board.push(attacker);
    state.players[1].board.push(defender);

    const result = applyAction(state, {
      type: "attack",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: defender.instanceId,
      targetMap: { [`${cap.uid}#0`]: defender.instanceId },
    });

    // Le pouvoir (5) tue le défenseur (2 PV) → retiré du plateau.
    expect(result.players[1].board.find(c => c.instanceId === defender.instanceId)).toBeUndefined();
    // Attaque à blanc : pas de combat, donc pas de riposte → attaquant indemne.
    const a = result.players[0].board.find(c => c.instanceId === attacker.instanceId)!;
    expect(a.currentHealth).toBe(3);
    // Mais l'attaquant est bien dépensé.
    expect(a.attacksRemaining).toBe(0);
    expect(a.tapped).toBe(true);
    // Snapshot deux-vagues attaché pour le store.
    expect(result.onAttackWave).toBeTruthy();
  });

  it("si le pouvoir laisse le défenseur en vie, le combat a lieu normalement (pouvoir + combat cumulés)", () => {
    initRNG(42);
    const state = mkState();
    const cap = onAttackCap(1);
    const attacker = mkInstance(mkCard({ attack: 2, health: 5, capabilities: [cap] }));
    const defender = mkInstance(mkCard({ attack: 3, health: 5 }));
    state.players[0].board.push(attacker);
    state.players[1].board.push(defender);

    const result = applyAction(state, {
      type: "attack",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: defender.instanceId,
      targetMap: { [`${cap.uid}#0`]: defender.instanceId },
    });

    const d = result.players[1].board.find(c => c.instanceId === defender.instanceId)!;
    const a = result.players[0].board.find(c => c.instanceId === attacker.instanceId)!;
    // Défenseur : 5 − 1 (pouvoir) − 2 (combat) = 2.
    expect(d.currentHealth).toBe(2);
    // Attaquant : 5 − 3 (riposte) = 2.
    expect(a.currentHealth).toBe(2);
  });

  it("Double Attaque déclenche le pouvoir 'à l'attaque' DEUX fois (ex. Commandant des Griffes : +1/+1 → +2/+2)", () => {
    initRNG(42);
    const state = mkState();
    // Buff +1/+1 sur soi quand il attaque.
    const cap = composedCap("on_attack", {
      content: "buff", magnitude: { x: 1, y: 1 },
      target: { entity: "self", count: 1, side: "ally", location: "board", designation: "choice" },
    });
    // `card.capabilities` court-circuite la dérivation depuis `keywords`, donc
    // on exprime Double Attaque comme une capability explicite (hasKw lit l'abilityId).
    const doubleAttaque: Capability = {
      uid: `c_${seq++}`, trigger: "on_attack", effectKind: "immediate", abilityId: "double_attaque",
    };
    const attacker = mkInstance(mkCard({
      attack: 3, health: 6, capabilities: [cap, doubleAttaque],
    }));
    // Cible grasse : survit aux deux frappes pour qu'on lise l'état final de l'attaquant.
    const defender = mkInstance(mkCard({ attack: 0, health: 20 }));
    state.players[0].board.push(attacker);
    state.players[1].board.push(defender);

    const result = applyAction(state, {
      type: "attack",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: defender.instanceId,
    });

    const a = result.players[0].board.find(c => c.instanceId === attacker.instanceId)!;
    // +1/+1 deux fois → 3+2 = 5 ATK, 6+2 = 8 PV max.
    expect(a.currentAttack).toBe(5);
    expect(a.maxHealth).toBe(8);
    expect(a.card.attack).toBe(5);
  });

  it("sans Double Attaque, le pouvoir 'à l'attaque' ne se déclenche qu'une fois", () => {
    initRNG(42);
    const state = mkState();
    const cap = composedCap("on_attack", {
      content: "buff", magnitude: { x: 1, y: 1 },
      target: { entity: "self", count: 1, side: "ally", location: "board", designation: "choice" },
    });
    const attacker = mkInstance(mkCard({ attack: 3, health: 6, capabilities: [cap] }));
    const defender = mkInstance(mkCard({ attack: 0, health: 20 }));
    state.players[0].board.push(attacker);
    state.players[1].board.push(defender);

    const result = applyAction(state, {
      type: "attack",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: defender.instanceId,
    });

    const a = result.players[0].board.find(c => c.instanceId === attacker.instanceId)!;
    // +1/+1 une seule fois → 4 ATK, 7 PV max.
    expect(a.currentAttack).toBe(4);
    expect(a.maxHealth).toBe(7);
  });
});

describe("cible composée — soi-même (entity self)", () => {
  it("applique l'effet à la créature source (buff sur soi à l'entrée), sans demander de cible", () => {
    initRNG(42);
    const cap = composedCap("on_play", {
      content: "buff", magnitude: { x: 2, y: 3 },
      target: { entity: "self", count: 1, side: "ally", location: "board", designation: "choice" },
    });
    const ci = mkInstance(mkCard({ attack: 1, health: 1, capabilities: [cap] }));
    // self n'est pas un slot de ciblage → pas de picker requis.
    expect(creatureNeedsTarget(ci.card)).toBe(false);
    const result = play(mkState(), ci);
    const onBoard = result.players[0].board.find(c => c.instanceId === ci.instanceId)!;
    expect(onBoard.currentAttack).toBe(3); // 1 + 2
    expect(onBoard.currentHealth).toBe(4); // 1 + 3
  });
});

describe("debuff composé — réduction permanente (cuite dans card, survit au recalc/zone)", () => {
  it("cuit la baisse d'ATK/PV dans card et la reflète sur currentAttack/maxHealth après recalc", () => {
    const cap = composedCap("on_play", {
      content: "debuff", magnitude: { x: 1, y: 1 },
      target: { entity: "self", count: 1, side: "ally", location: "board", designation: "choice" },
    });
    const ci = mkInstance(mkCard({ attack: 4, health: 5, capabilities: [cap] }));
    const result = play(mkState(), ci);
    const onBoard = result.players[0].board.find(c => c.instanceId === ci.instanceId)!;
    // Baisse cuite dans card → survit à recalculateAuras (qui recompose depuis card).
    expect(onBoard.card.attack).toBe(3);   // 4 - 1
    expect(onBoard.card.health).toBe(4);   // 5 - 1
    expect(onBoard.currentAttack).toBe(3);
    expect(onBoard.maxHealth).toBe(4);
  });

  it("debuff létal sur le plateau : PV permanente réduite à 0 ⇒ la créature meurt", () => {
    // Créature 2/1 qui se debuff -0/-1 à l'entrée → 0 PV → morte au summon.
    const cap = composedCap("on_play", {
      content: "debuff", magnitude: { x: 0, y: 1 },
      target: { entity: "self", count: 1, side: "ally", location: "board", designation: "choice" },
    });
    const ci = mkInstance(mkCard({ name: "Fragile", attack: 2, health: 1, capabilities: [cap] }));
    const result = play(mkState(), ci);
    expect(result.players[0].board.find(c => c.instanceId === ci.instanceId)).toBeUndefined();
    expect(result.players[0].graveyard.find(c => c.card.name === "Fragile")).toBeDefined();
  });

  it("debuff non létal : laisse ≥ 1 PV ⇒ la créature survit (non-régression du plancher retiré)", () => {
    const cap = composedCap("on_play", {
      content: "debuff", magnitude: { x: 0, y: 1 },
      target: { entity: "self", count: 1, side: "ally", location: "board", designation: "choice" },
    });
    const ci = mkInstance(mkCard({ name: "Costaud", attack: 2, health: 3, capabilities: [cap] }));
    const result = play(mkState(), ci);
    const onBoard = result.players[0].board.find(c => c.instanceId === ci.instanceId)!;
    expect(onBoard).toBeDefined();
    expect(onBoard.card.health).toBe(2); // 3 - 1
    expect(onBoard.maxHealth).toBe(2);
  });

  it("buff puis debuff sur soi (cf. Ombre Insaisissable : +1 ATK / -1 PV) → 2/2 persistant", () => {
    const buff = composedCap("on_play", {
      content: "buff", magnitude: { x: 1, y: 0 },
      target: { entity: "self", count: 1, side: "ally", location: "board", designation: "choice" },
    });
    const debuff = composedCap("on_play", {
      content: "debuff", magnitude: { x: 0, y: 1 },
      target: { entity: "self", count: 1, side: "ally", location: "board", designation: "choice" },
    });
    const ci = mkInstance(mkCard({ attack: 1, health: 3, capabilities: [buff, debuff] }));
    const result = play(mkState(), ci);
    const onBoard = result.players[0].board.find(c => c.instanceId === ci.instanceId)!;
    expect(onBoard.card.attack).toBe(2);   // 1 + 1
    expect(onBoard.card.health).toBe(2);   // 3 - 1
    expect(onBoard.currentAttack).toBe(2);
    expect(onBoard.maxHealth).toBe(2);
  });
});

describe("copie de capacités (Héritage du cimetière / Mimique) — capacités composées", () => {
  // Effet composé qui ne vit QUE dans capabilities[] (aucune représentation
  // keywords/keyword_instances) : c'est précisément ce que la copie laissait
  // tomber avant le correctif.
  const onDeathBurn = () => composedCap("on_death", {
    content: "deal_damage", magnitude: { x: 3 },
    target: { entity: "hero", count: 1, side: "enemy", location: "board", designation: "random" },
  });

  it("Héritage du cimetière hérite la capacité composée d'une unité du cimetière, qui se déclenche à la mort de l'héritier", () => {
    initRNG(42);
    const s0 = mkState();
    // Mort au cimetière : à sa mort, 3 dégâts au héros ennemi (effet composé).
    const dead = mkInstance(mkCard({ attack: 1, health: 1, capabilities: [onDeathBurn()] }));
    s0.players[0].graveyard.push(dead);
    // Héritier 1/1 avec Héritage du cimetière (mot-clé curé, capabilities null).
    const heir = mkInstance(mkCard({ attack: 1, health: 1, keywords: ["heritage_du_cimetiere"] }));
    s0.players[0].hand.push(heir);
    const s1 = applyAction(s0, { type: "play_card", cardInstanceId: heir.instanceId, graveyardTargetInstanceId: dead.instanceId });

    // L'héritier porte désormais la capacité composée on_death.
    const onBoard = s1.players[0].board.find(c => c.instanceId === heir.instanceId)!;
    expect(getCapabilities(onBoard.card).some(c => c.composed && c.trigger === "on_death")).toBe(true);

    // …et elle se déclenche à SA mort : sort de 5 dégâts à toutes les unités
    // alliées → tue l'héritier (1 PV) → l'effet hérité tire 3 sur le héros ennemi.
    const spell = mkInstance(mkCard({ card_type: "spell", attack: null, health: null,
      capabilities: [composedCap("spell_resolution", { content: "deal_damage", magnitude: { x: 5 }, target: { entity: "unit", count: "all", side: "ally", location: "board", designation: "random" } })] }));
    s1.players[0].hand.push(spell);
    const s2 = applyAction(s1, { type: "play_card", cardInstanceId: spell.instanceId });

    expect(s2.players[0].board.find(c => c.instanceId === heir.instanceId)).toBeUndefined(); // héritier mort
    expect(s2.players[1].hero.hp).toBe(HERO_MAX_HP - 3); // l'on_death hérité a bien tiré
  });

  it("Mimique copie la capacité composée d'une unité ciblée sur le plateau", () => {
    initRNG(42);
    const s0 = mkState();
    const model = mkInstance(mkCard({ attack: 2, health: 5, capabilities: [onDeathBurn()] }));
    s0.players[0].board.push(model);
    const heir = mkInstance(mkCard({ attack: 1, health: 1, keywords: ["mimique"] }));
    s0.players[0].hand.push(heir);
    const s1 = applyAction(s0, { type: "play_card", cardInstanceId: heir.instanceId, targetInstanceId: model.instanceId });

    const onBoard = s1.players[0].board.find(c => c.instanceId === heir.instanceId)!;
    expect(getCapabilities(onBoard.card).some(c => c.composed && c.trigger === "on_death")).toBe(true);
    // uid ré-attribué pour ne pas entrer en collision avec ceux du copieur.
    const inherited = getCapabilities(onBoard.card).find(c => c.composed && c.trigger === "on_death")!;
    expect(inherited.uid.startsWith("inh")).toBe(true);
  });
});

describe("désignation automatique", () => {
  it("count=all : applique l'effet à tout le pool, sans choix ni cible fournie", () => {
    const s0 = mkState();
    s0.players[1].board = [mkInstance(mkCard({ attack: 1, health: 5 })), mkInstance(mkCard({ attack: 1, health: 5 }))];
    const creature = mkCard({ attack: 1, health: 1,
      capabilities: [composedCap("on_play", { content: "deal_damage", magnitude: { x: 2 },
        target: { entity: "unit", count: "all", side: "enemy", location: "board", designation: "automatic" } })] });
    // Désignation automatique → aucun picker requis.
    expect(creatureNeedsTarget(creature)).toBe(false);
    const s = play(s0, mkInstance(creature));
    expect(s.players[1].board.map(c => c.currentHealth)).toEqual([3, 3]); // 5 − 2 chacune
  });

  it("count=N : applique à N cibles de façon déterministe, sans demander de cible", () => {
    const s0 = mkState();
    s0.players[1].board = [
      mkInstance(mkCard({ attack: 1, health: 5 })),
      mkInstance(mkCard({ attack: 1, health: 5 })),
      mkInstance(mkCard({ attack: 1, health: 5 })),
    ];
    const creature = mkCard({ attack: 1, health: 1,
      capabilities: [composedCap("on_play", { content: "deal_damage", magnitude: { x: 2 },
        target: { entity: "unit", count: 2, side: "enemy", location: "board", designation: "automatic" } })] });
    expect(creatureNeedsTarget(creature)).toBe(false);
    const s = play(s0, mkInstance(creature));
    expect(s.players[1].board.filter(c => c.currentHealth < 5).length).toBe(2); // exactement 2 touchées
  });
});

describe("désignation scatter (répartition point par point)", () => {
  it("distribue exactement X points sur le pool ennemi, sans demander de cible", () => {
    const s0 = mkState();
    s0.players[1].board = [
      mkInstance(mkCard({ attack: 1, health: 5 })),
      mkInstance(mkCard({ attack: 1, health: 5 })),
      mkInstance(mkCard({ attack: 1, health: 5 })),
    ];
    const creature = mkCard({ attack: 1, health: 1,
      capabilities: [composedCap("on_play", { content: "deal_damage", magnitude: { x: 2 },
        target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "scatter" } })] });
    // Scatter est aléatoire → aucun picker requis.
    expect(creatureNeedsTarget(creature)).toBe(false);
    const s = play(s0, mkInstance(creature));
    const totalDmg = s.players[1].board.reduce((acc, c) => acc + (5 - c.currentHealth), 0);
    expect(totalDmg).toBe(2); // 2 points répartis, total conservé
    // Chaque unité a pris entre 0 et 2 points (aucune n'excède l'amplitude totale).
    for (const c of s.players[1].board) expect(5 - c.currentHealth).toBeLessThanOrEqual(2);
  });

  it("tirage avec remise : une seule cible peut cumuler tous les points", () => {
    const s0 = mkState();
    // Pool d'une seule unité → les 3 points tombent forcément dessus.
    s0.players[1].board = [mkInstance(mkCard({ attack: 1, health: 10 }))];
    const creature = mkCard({ attack: 1, health: 1,
      capabilities: [composedCap("on_play", { content: "deal_damage", magnitude: { x: 3 },
        target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "scatter" } })] });
    const s = play(s0, mkInstance(creature));
    expect(s.players[1].board[0].currentHealth).toBe(7); // 10 − 3 cumulés
  });

  it("pool vide : aucun effet, aucune erreur", () => {
    const s0 = mkState();
    const creature = mkCard({ attack: 1, health: 1,
      capabilities: [composedCap("on_play", { content: "deal_damage", magnitude: { x: 4 },
        target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "scatter" } })] });
    const s = play(s0, mkInstance(creature));
    expect(s.players[1].board.length).toBe(0);
    expect(s.players[1].hero.hp).toBe(HERO_MAX_HP); // le héros n'est pas dans le pool (entity unit)
  });

  it("résolution séquentielle : un point létal ne se gaspille pas sur la cible morte", () => {
    // Deux unités à 1 PV, 2 points. En réévaluant les cibles vivantes avant
    // chaque point, la première meurt puis le second point part forcément sur
    // la seconde → les DEUX meurent, quel que soit le tirage. (Avec un pool figé
    // + tirage avec remise, les 2 points pouvaient retomber sur la même.)
    const s0 = mkState();
    s0.players[1].board = [
      mkInstance(mkCard({ attack: 1, health: 1 })),
      mkInstance(mkCard({ attack: 1, health: 1 })),
    ];
    const creature = mkCard({ attack: 1, health: 1,
      capabilities: [composedCap("on_play", { content: "deal_damage", magnitude: { x: 2 },
        target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "scatter" } })] });
    const s = play(s0, mkInstance(creature));
    const alive = s.players[1].board.filter((c) => c.currentHealth > 0);
    expect(alive.length).toBe(0);
  });

  it("cible unique à 1 PV : le second point ne la refrappe pas (se perd)", () => {
    // Cas exact rapporté : une seule créature ennemie à 1 PV, effet à 2 points.
    // Le 1er point la tue ; faute d'autre cible valide, le 2e se perd au lieu
    // de frapper un cadavre — et ne déborde pas sur le héros (entity = unit).
    const s0 = mkState();
    s0.players[1].board = [mkInstance(mkCard({ attack: 1, health: 1 }))];
    const creature = mkCard({ attack: 1, health: 1,
      capabilities: [composedCap("on_play", { content: "deal_damage", magnitude: { x: 2 },
        target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "scatter" } })] });
    const s = play(s0, mkInstance(creature));
    expect(s.players[1].board.filter((c) => c.currentHealth > 0).length).toBe(0);
    expect(s.players[1].hero.hp).toBe(HERO_MAX_HP);
  });
});

describe("silence retire toutes les sources de capacités (modèle unifié)", () => {
  it("Silence vide aussi les capacités composées (capabilities[])", () => {
    const s0 = mkState();
    // Créature avec une capacité composée on_death — vit uniquement dans
    // capabilities[], aucune représentation keywords/keyword_instances.
    const victim = mkInstance(mkCard({ attack: 2, health: 3,
      capabilities: [composedCap("on_death", { content: "deal_damage", magnitude: { x: 3 },
        target: { entity: "hero", count: 1, side: "enemy", location: "board", designation: "random" } })] }));
    s0.players[1].board = [victim];
    expect(getCapabilities(victim.card).some(c => c.composed)).toBe(true); // présente avant

    const spell = mkCard({ card_type: "spell", attack: null, health: null, spell_keywords: [{ id: "silence" }] });
    const s = play(s0, mkInstance(spell), { kw_0: victim.instanceId });

    // Après silence : plus aucune capacité (ni curée ni composée).
    expect(getCapabilities(s.players[1].board[0].card).length).toBe(0);
  });
});

describe("déterminisme des pools de sélection (tri canonique par id)", () => {
  it("initializeGame trie factionCardPool et allSpellsPool par id, quel que soit l'ordre d'entrée", () => {
    const faction = [mkCard({ id: 30 }), mkCard({ id: 10 }), mkCard({ id: 20 })];
    const spells = [
      mkCard({ id: 5, card_type: "spell", attack: null, health: null }),
      mkCard({ id: 1, card_type: "spell", attack: null, health: null }),
      mkCard({ id: 3, card_type: "spell", attack: null, health: null }),
    ];
    const g = initializeGame("P1", "P2", [], [], 0, 42, null, null, faction, spells);
    // Ordre canonique → les deux clients indexent le même pool par RNG partagé.
    expect(g.factionCardPool?.map((c) => c.id)).toEqual([10, 20, 30]);
    expect(g.allSpellsPool?.map((c) => c.id)).toEqual([1, 3, 5]);
  });
});
