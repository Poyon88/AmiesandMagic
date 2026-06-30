// Tests de la pile d'effets LIFO unifiée (cf. plan maître).
// On exerce le vrai flux applyAction(play_card) avec des cartes synthétiques et
// on vérifie : (1) la pile est vidée entre actions ; (2) une mort déclenchée par
// un effet on_play résout le déclencheur de mort de l'allié pendant le drain ;
// (3) le déterminisme (même seed → même syncHash).
import { describe, expect, it } from "vitest";
import { applyAction, initRNG, initializeGame } from "./engine";
import { syncHash } from "./stateHash";
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
    necrophagieATKBonus: 0, necrophagiePVBonus: 0, richesseATKBonus: 0, richessePVBonus: 0, martyrATKBonus: 0,
    persecutionX: 0, riposteX: 0, carnageX: 0, sacrificeDemoniaqueX: 0, heritageX: 0,
    instinctDeMeuteX: 0, instinctDeMeuteATKBonus: 0, diedOnTurn: null,
    cycleEternelAutoPlay: false, originalOwnerId: null, trueOwnerId: null,
    hasTransformedLycanthropie: false, grantedKeywordX: {}, manaCostReduction: 0,
  };
}
function mkHero(): HeroState {
  return { hp: 30, maxHp: 30, armor: 0, heroDefinition: null, heroPowerUsedThisTurn: false, heroPowerActivationsUsed: 0, activeAuras: [] };
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

describe("pile d'effets LIFO", () => {
  it("la pile est vidée (absente) après une invocation simple", () => {
    const carrier = mkCard({ health: 10, capabilities: [
      composedCap("on_play", { content: "draw_cards", magnitude: { x: 1 } }),
    ] });
    const s0 = mkState();
    s0.players[0].deck = [mkInstance(mkCard({})), mkInstance(mkCard({}))];
    const s = play(s0, mkInstance(carrier));
    expect(s.effectStack).toBeUndefined();
    expect(s.players[0].deck.length).toBe(1); // a bien pioché
  });

  it("un on_play qui tue un allié résout le on_death de l'allié pendant le drain", () => {
    // Allié A (1 PV) avec un death-rattle composé : pioche 1 carte.
    const allyA = mkInstance(mkCard({ health: 1, capabilities: [
      composedCap("on_death", { content: "draw_cards", magnitude: { x: 1 } }),
    ] }));
    const s0 = mkState();
    s0.players[0].board = [allyA];
    s0.players[0].deck = [mkInstance(mkCard({})), mkInstance(mkCard({})), mkInstance(mkCard({}))];
    // Porteur (10 PV) : AoE 5 dégâts à toutes les unités alliées → tue A, survit lui-même.
    const carrier = mkCard({ health: 10, capabilities: [
      composedCap("on_play", { content: "deal_damage", magnitude: { x: 5 },
        target: { entity: "unit", count: "all", side: "ally", location: "board", designation: "automatic" } }),
    ] });
    const s = play(s0, mkInstance(carrier));
    // A est mort et son death-rattle (pioche) a tiré pendant le drain.
    expect(s.players[0].graveyard.some(c => c.instanceId === allyA.instanceId)).toBe(true);
    expect(s.players[0].deck.length).toBe(2); // 3 → 2 (death-rattle a pioché)
    // Le porteur a survécu (10 - 5 = 5 PV).
    const carrierOnBoard = s.players[0].board.find(c => c.currentHealth === 5);
    expect(carrierOnBoard).toBeDefined();
    expect(s.effectStack).toBeUndefined();
  });

  it("cascade séquentielle profonde : aucune mort droppée (corrige bug #1)", () => {
    // 8 alliés 1 PV en chaîne : chacun, à sa mort, tue le PREMIER allié restant
    // (deal 99, count 1, automatic) ET pioche 1. L'ancien plafond depth>5 aurait
    // « droppé » les morts au-delà du 6e niveau ; la pile LIFO les traite toutes.
    const chain = (): CardInstance => mkInstance(mkCard({ health: 1, capabilities: [
      composedCap("on_death", { content: "deal_damage", magnitude: { x: 99 },
        target: { entity: "unit", count: 1, side: "ally", location: "board", designation: "automatic" } }),
      composedCap("on_death", { content: "draw_cards", magnitude: { x: 1 } }),
    ] }));
    const s0 = mkState();
    s0.players[0].board = [chain(), chain(), chain(), chain(), chain(), chain(), chain(), chain()]; // A1..A8 (plateau plein)
    s0.players[0].deck = Array.from({ length: 12 }, () => mkInstance(mkCard({})));
    // Sort déclencheur (hors plateau) : tue A1 (premier allié), démarrant la
    // chaîne A1→A2→…→A8 (8 morts séquentielles, > ancien plafond de 5).
    const starter = mkCard({ card_type: "spell", attack: null, health: null, capabilities: [
      composedCap("spell_resolution", { content: "deal_damage", magnitude: { x: 99 },
        target: { entity: "unit", count: 1, side: "ally", location: "board", designation: "automatic" } }),
    ] });
    const s = play(s0, mkInstance(starter));
    // Les 8 maillons sont morts (cimetière = 8 créatures + le sort) et ont
    // chacun pioché → 12 - 8 = 4 cartes restantes (preuve : aucune mort droppée).
    expect(s.players[0].graveyard.filter(c => c.card.card_type === "creature").length).toBe(8);
    expect(s.players[0].deck.length).toBe(4);
    expect(s.effectStack).toBeUndefined();
  });

  it("déterminisme : même état + même seed → même syncHash (cible aléatoire)", () => {
    const st = mkState();
    st.players[1].board = [mkInstance(mkCard({ health: 3 })), mkInstance(mkCard({ health: 3 })), mkInstance(mkCard({ health: 3 }))];
    const carrier = mkInstance(mkCard({ health: 5, capabilities: [
      composedCap("on_play", { content: "deal_damage", magnitude: { x: 2 },
        target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "random" } }),
    ] }));
    st.players[0].hand.push(carrier);
    // Deux clones structurellement identiques (mêmes ids) → l'action doit produire
    // le même hash (le tirage aléatoire passe par la RNG semée portée par l'état).
    const a = JSON.parse(JSON.stringify(st)) as GameState;
    const b = JSON.parse(JSON.stringify(st)) as GameState;
    initRNG(42);
    const ra = applyAction(a, { type: "play_card", cardInstanceId: carrier.instanceId });
    initRNG(42);
    const rb = applyAction(b, { type: "play_card", cardInstanceId: carrier.instanceId });
    expect(syncHash(ra)).toBe(syncHash(rb));
  });

  it("init déterministe (initializeGame)", () => {
    // Garde-fou : la pile ne casse pas l'initialisation ni le hash d'un état neuf.
    const g1 = initializeGame("P1", "P2", [], [], 0, 42);
    const g2 = initializeGame("P1", "P2", [], [], 0, 42);
    expect(syncHash(g1)).toBe(syncHash(g2));
  });
});

describe("mot-clé Déclenchement", () => {
  function declCarrier(replayTriggers: Capability["trigger"][]): Card {
    return mkCard({ health: 5, capabilities: [
      { uid: `decl_${seq++}`, trigger: "on_play", effectKind: "immediate", abilityId: "declenchement", replayTriggers },
    ] });
  }
  const selfBuff = (): Capability => composedCap("on_play", { content: "buff", magnitude: { x: 2, y: 2 },
    target: { entity: "self", count: 1, side: "ally", location: "board", designation: "automatic" } });

  it("rejoue le on_play composé d'un allié, source = l'allié (buff-self → l'allié)", () => {
    const allyA = mkInstance(mkCard({ attack: 1, health: 1, capabilities: [selfBuff()] }));
    const s0 = mkState();
    s0.players[0].board = [allyA];
    const s = play(s0, mkInstance(declCarrier(["on_play"])));
    const a = s.players[0].board.find(c => c.instanceId === allyA.instanceId)!;
    // L'allié A a reçu +2/+2 (rejeu, source = A) ; le porteur n'est pas buffé.
    expect(a.currentAttack).toBe(3);
    expect(a.currentHealth).toBe(3);
    const carrier = s.players[0].board.find(c => c.currentHealth === 5);
    expect(carrier).toBeDefined();
    expect(s.effectStack).toBeUndefined();
  });

  it("mode valeur (on_death) : rejoue le payoff sortant mais ne tue/renvoie pas l'allié", () => {
    const allyA = mkInstance(mkCard({ attack: 1, health: 4, capabilities: [
      composedCap("on_death", { content: "deal_damage", magnitude: { x: 3 },
        target: { entity: "hero", count: 1, side: "enemy", location: "board", designation: "automatic" } }),
      composedCap("on_death", { content: "bounce",
        target: { entity: "self", count: 1, side: "ally", location: "board", designation: "automatic" } }),
    ] }));
    const s0 = mkState();
    s0.players[0].board = [allyA];
    const s = play(s0, mkInstance(declCarrier(["on_death"])));
    // Payoff sortant rejoué : le héros ennemi a pris 3.
    expect(s.players[1].hero.hp).toBe(30 - 3);
    // Auto-renvoi (self-bounce) sauté : A est toujours sur le plateau, pas en main.
    expect(s.players[0].board.some(c => c.instanceId === allyA.instanceId)).toBe(true);
    expect(s.players[0].hand.length).toBe(0);
  });

  it("exclut le porteur et les autres porteurs de Déclenchement", () => {
    // Allié B porte AUSSI Déclenchement + un buff-self on_play → doit être ignoré.
    const allyB = mkInstance(mkCard({ attack: 1, health: 1, capabilities: [
      { uid: `decl_${seq++}`, trigger: "on_play", effectKind: "immediate", abilityId: "declenchement", replayTriggers: ["on_play"] },
      selfBuff(),
    ] }));
    const s0 = mkState();
    s0.players[0].board = [allyB];
    const s = play(s0, mkInstance(declCarrier(["on_play"])));
    const b = s.players[0].board.find(c => c.instanceId === allyB.instanceId)!;
    expect(b.currentAttack).toBe(1); // non buffé (B est un porteur de Déclenchement)
    expect(b.currentHealth).toBe(1);
  });

  it("respecte le sous-ensemble figé (on_death seulement → le on_play n'est pas rejoué)", () => {
    const allyA = mkInstance(mkCard({ attack: 1, health: 4, capabilities: [
      selfBuff(), // on_play
      composedCap("on_death", { content: "deal_damage", magnitude: { x: 3 },
        target: { entity: "hero", count: 1, side: "enemy", location: "board", designation: "automatic" } }),
    ] }));
    const s0 = mkState();
    s0.players[0].board = [allyA];
    const s = play(s0, mkInstance(declCarrier(["on_death"])));
    const a = s.players[0].board.find(c => c.instanceId === allyA.instanceId)!;
    expect(a.currentAttack).toBe(1);            // on_play NON rejoué
    expect(s.players[1].hero.hp).toBe(30 - 3);  // on_death rejoué
  });

  it("plateau sans autre allié → no-op, pas d'erreur", () => {
    const s0 = mkState();
    const s = play(s0, mkInstance(declCarrier(["on_play", "on_death", "on_end_of_turn", "on_return"])));
    expect(s.players[0].board.length).toBe(1); // juste le porteur
    expect(s.effectStack).toBeUndefined();
  });
});
