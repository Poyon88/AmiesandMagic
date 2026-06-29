// Déclencheurs tap / fin de tour pour les capacités Sélection (selection,
// selection_magique, renfort_royal). On exerce le vrai flux applyAction.
import { describe, expect, it } from "vitest";
import { applyAction, initRNG } from "./engine";
import { CURATED_KEYWORD_MODES } from "../card-engine/constants";
import { HERO_MAX_HP } from "./constants";
import type { Card, CardInstance, GameState, HeroState, Keyword, PlayerState } from "./types";

let seq = 1;
function mkCard(partial: Partial<Card>): Card {
  return {
    id: seq++, name: "C", mana_cost: 0, card_type: "creature", attack: 1, health: 1,
    effect_text: "", keywords: [], spell_keywords: null, spell_effects: null,
    image_url: null, capabilities: null, ...partial,
  } as Card;
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
// Carte « Commune Mercenaires » : éligible quel que soit l'alignement de la
// source (le pool de Sélection retombe sur Mercenaires sans alignement).
const commune = (id: number, type: Card["card_type"] = "creature") =>
  mkCard({ id, faction: "Mercenaires", rarity: "Commune", card_type: type, attack: type === "spell" ? null : 1, health: type === "spell" ? null : 1 });

describe("gating forge — modes des capacités Sélection", () => {
  it("propose tap + fin de tour, jamais mort/retour", () => {
    for (const label of ["Sélection X", "Sélection magique X", "Sélection Royale X"]) {
      const modes = CURATED_KEYWORD_MODES[label];
      expect(modes, label).toBeDefined();
      expect(modes.has("tap")).toBe(true);
      expect(modes.has("end_of_turn")).toBe(true);
      expect(modes.has("death")).toBe(false);
      expect(modes.has("return")).toBe(false);
    }
  });
});

describe("Sélection au tap (on_activation)", () => {
  it("ajoute la carte choisie en main et engage la créature", () => {
    const s0 = mkState();
    s0.factionCardPool = [commune(901)];
    const src = mkInstance(mkCard({ attack: 1, health: 3, faction: undefined,
      keywords: ["selection"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "selection" as Keyword, mode: "tap" }] }));
    src.hasSummoningSickness = false;
    s0.players[0].board = [src];
    initRNG(1);
    const s = applyAction(s0, { type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: 0, selectionCardId: 901 });
    expect(s.players[0].hand.some(c => c.card.id === 901)).toBe(true);
    expect(s.players[0].board[0].tapped).toBe(true);
  });

  it("selection_magique au tap puise dans allSpellsPool", () => {
    const s0 = mkState();
    s0.allSpellsPool = [commune(950, "spell")];
    const src = mkInstance(mkCard({ attack: 1, health: 3, faction: undefined,
      keywords: ["selection_magique"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "selection_magique" as Keyword, mode: "tap" }] }));
    src.hasSummoningSickness = false;
    s0.players[0].board = [src];
    initRNG(1);
    const s = applyAction(s0, { type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: 0, selectionCardId: 950 });
    expect(s.players[0].hand.some(c => c.card.id === 950)).toBe(true);
  });
});

describe("Sélection en fin de tour (on_end_of_turn)", () => {
  it("crée un pending trigger interactif, résolu en main, puis bascule le tour", () => {
    const s0 = mkState();
    s0.factionCardPool = [commune(902)];
    const src = mkInstance(mkCard({ attack: 1, health: 3, faction: undefined,
      keywords: ["selection"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "selection" as Keyword, mode: "end_of_turn" }] }));
    s0.players[0].board = [src];
    initRNG(1);

    const s1 = applyAction(s0, { type: "end_turn" });
    expect(s1.pendingTriggers?.[0]?.selectionType).toBe("selection");
    expect(s1.pendingTriggers?.[0]?.selectionOptionIds).toContain(902);
    expect(s1.endTurnPending).toBe(true);
    expect(s1.currentPlayerIndex).toBe(0); // tour pas encore basculé

    const trigId = s1.pendingTriggers![0].id;
    const s2 = applyAction(s1, { type: "resolve_pending_trigger", triggerId: trigId, selectionCardId: 902 });
    expect(s2.players[0].hand.some(c => c.card.id === 902)).toBe(true);
    expect(s2.currentPlayerIndex).toBe(1); // tour basculé après résolution
    expect(s2.pendingTriggers?.length ?? 0).toBe(0);
  });

  it("RÉGRESSION : une Sélection en fin de tour ne se déclenche PAS à l'invocation", () => {
    const s0 = mkState();
    s0.factionCardPool = [commune(903)];
    const ci = mkInstance(mkCard({ attack: 1, health: 1, faction: undefined,
      keywords: ["selection"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "selection" as Keyword, mode: "end_of_turn" }] }));
    s0.players[0].hand.push(ci);
    initRNG(42);
    // Même en forçant selectionCardId, rien ne doit être ajouté à l'entrée.
    const s = applyAction(s0, { type: "play_card", cardInstanceId: ci.instanceId, selectionCardId: 903 });
    expect(s.players[0].hand.some(c => c.card.id === 903)).toBe(false);
  });

  it("RÉGRESSION Prêtresse de la Lune : capabilities[] backfillé (trigger on_play périmé) ne se joue pas à l'invocation", () => {
    // Config réelle de la carte : keyword_instances dit end_of_turn, mais le
    // capabilities[] stocké garde un trigger on_play obsolète. La dérivation
    // étant court-circuitée par capabilities[], le mode de keyword_instances
    // doit rester autoritaire — sinon la Sélection se déclenche à l'entrée EN
    // PLUS de la fin de tour.
    const s0 = mkState();
    s0.factionCardPool = [commune(904)];
    const card = mkCard({ attack: 1, health: 1, faction: undefined,
      keywords: ["selection"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "selection" as Keyword, x: 5, mode: "end_of_turn" }],
      capabilities: [{ uid: "cw_0", trigger: "on_play", effectKind: "immediate", abilityId: "selection", params: { x: 5 }, targets: [] }] });
    const ci = mkInstance(card);
    s0.players[0].hand.push(ci);
    initRNG(42);

    // À l'invocation : aucune carte ajoutée, même en forçant selectionCardId.
    const played = applyAction(s0, { type: "play_card", cardInstanceId: ci.instanceId, selectionCardId: 904 });
    expect(played.players[0].hand.some(c => c.card.id === 904)).toBe(false);

    // En fin de tour : la Sélection se déclenche bien (pending trigger).
    const ended = applyAction(played, { type: "end_turn" });
    expect(ended.pendingTriggers?.[0]?.selectionType).toBe("selection");
    expect(ended.pendingTriggers?.[0]?.selectionOptionIds).toContain(904);
  });

  it("aucune carte éligible (pool vide) → pas de pending trigger, le tour bascule", () => {
    const s0 = mkState();
    s0.factionCardPool = [];
    const src = mkInstance(mkCard({ attack: 1, health: 3, faction: undefined,
      keywords: ["selection"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "selection" as Keyword, mode: "end_of_turn" }] }));
    s0.players[0].board = [src];
    initRNG(1);
    const s = applyAction(s0, { type: "end_turn" });
    expect(s.pendingTriggers?.length ?? 0).toBe(0);
    expect(s.currentPlayerIndex).toBe(1);
  });
});

describe("Repli automatique à l'expiration du chrono (auto_resolve_pending_triggers)", () => {
  // Construit un état où la file contient une Sélection fin de tour non résolue.
  function stateWithPendingSelection(poolIds: number[]) {
    const s0 = mkState();
    s0.factionCardPool = poolIds.map(id => commune(id));
    s0.players[1].deck = [mkInstance(mkCard({}))]; // évite la fatigue au startTurn suivant
    const src = mkInstance(mkCard({ attack: 1, health: 3, faction: undefined,
      keywords: ["selection"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "selection" as Keyword, mode: "end_of_turn" }] }));
    s0.players[0].board = [src];
    initRNG(7);
    return applyAction(s0, { type: "end_turn" }); // crée le pending, ne bascule pas
  }

  it("résout au hasard la Sélection en attente, vide la file et bascule le tour", () => {
    const s1 = stateWithPendingSelection([901, 902, 903]);
    expect(s1.pendingTriggers?.[0]?.selectionType).toBe("selection");
    const s2 = applyAction(s1, { type: "auto_resolve_pending_triggers" });
    expect(s2.players[0].hand.length).toBe(1);
    expect([901, 902, 903]).toContain(s2.players[0].hand[0].card.id);
    expect(s2.pendingTriggers?.length ?? 0).toBe(0);
    expect(s2.currentPlayerIndex).toBe(1);
  });

  it("est déterministe : même état initial ⇒ même carte choisie", () => {
    const a = applyAction(stateWithPendingSelection([901, 902, 903]), { type: "auto_resolve_pending_triggers" });
    const b = applyAction(stateWithPendingSelection([901, 902, 903]), { type: "auto_resolve_pending_triggers" });
    expect(a.players[0].hand[0].card.id).toBe(b.players[0].hand[0].card.id);
  });

  it("draine PLUSIEURS effets en attente (2 créatures Sélection)", () => {
    const s0 = mkState();
    s0.factionCardPool = [commune(901), commune(902), commune(903)];
    s0.players[1].deck = [mkInstance(mkCard({}))];
    s0.players[0].board = [
      mkInstance(mkCard({ attack: 1, health: 3, faction: undefined,
        keywords: ["selection"] as unknown as Card["keywords"],
        keyword_instances: [{ id: "selection" as Keyword, mode: "end_of_turn" }] })),
      mkInstance(mkCard({ attack: 1, health: 3, faction: undefined,
        keywords: ["selection"] as unknown as Card["keywords"],
        keyword_instances: [{ id: "selection" as Keyword, mode: "end_of_turn" }] })),
    ];
    initRNG(7);
    const s1 = applyAction(s0, { type: "end_turn" });
    expect(s1.pendingTriggers?.length).toBe(2);
    const s2 = applyAction(s1, { type: "auto_resolve_pending_triggers" });
    expect(s2.players[0].hand.length).toBe(2);
    expect(s2.pendingTriggers?.length ?? 0).toBe(0);
    expect(s2.currentPlayerIndex).toBe(1);
  });
});

describe("RÉGRESSION remontee : capabilities[] backfillé en mode fin de tour", () => {
  it("Maîtresse des Ombres : remontee (instance end_of_turn, capabilities on_play périmé) ne rebondit PAS à l'invocation", () => {
    const s0 = mkState();
    const enemy = mkInstance(mkCard({ id: 7777, name: "Cible", attack: 2, health: 2 }));
    s0.players[1].board = [enemy];
    const card = mkCard({ attack: 1, health: 1, faction: undefined,
      keywords: ["remontee"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "remontee" as Keyword, mode: "end_of_turn" }],
      capabilities: [{ uid: "cw_0", trigger: "on_play", effectKind: "immediate", abilityId: "remontee", targets: [] }] });
    const ci = mkInstance(card);
    s0.players[0].hand.push(ci);
    initRNG(42);

    // À l'invocation : la cible ennemie n'est PAS renvoyée en main (le rebond
    // ne se déclenche qu'en fin de tour). Avant le réalignement de trigger, le
    // capabilities[] on_play périmé faisait rebondir la cible dès l'entrée.
    const played = applyAction(s0, { type: "play_card", cardInstanceId: ci.instanceId, targetInstanceId: enemy.instanceId });
    expect(played.players[1].board.some(c => c.instanceId === enemy.instanceId)).toBe(true);
  });
});

describe("RÉGRESSION générale : mot-clé curé en mode fin de tour", () => {
  it("Inspiration en fin de tour pioche en fin de tour, PAS à l'invocation", () => {
    const s0 = mkState();
    s0.players[0].deck = [mkInstance(mkCard({})), mkInstance(mkCard({})), mkInstance(mkCard({})), mkInstance(mkCard({})), mkInstance(mkCard({}))];
    const ci = mkInstance(mkCard({ attack: 1, health: 1,
      keywords: ["inspiration"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "inspiration" as Keyword, mode: "end_of_turn", x: 2 }] }));
    s0.players[0].hand.push(ci);
    initRNG(42);

    const afterPlay = applyAction(s0, { type: "play_card", cardInstanceId: ci.instanceId });
    expect(afterPlay.players[0].hand.length).toBe(0); // aucune pioche à l'entrée
    expect(afterPlay.players[0].deck.length).toBe(5);

    const afterEnd = applyAction(afterPlay, { type: "end_turn" });
    expect(afterEnd.players[0].hand.length).toBe(2); // Inspiration 2 en fin de tour
    expect(afterEnd.players[0].deck.length).toBe(3);
  });
});
