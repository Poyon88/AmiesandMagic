// Tests du contenu composé "exhumation" : ressuscite une créature du cimetière
// du contrôleur (coût ≤ magnitude.x) sur le plateau, via le vrai flux
// applyAction(play_card). On exerce la résolution moteur (case "exhumation" de
// resolveComposedEffect, commun à TOUS les déclencheurs) + le câblage picker
// (composedSlotType → slot cimetière, getComposedGraveyardTargets filtré coût).
import { describe, expect, it } from "vitest";
import { applyAction, getComposedGraveyardTargets, getSpellTargetSlots, initRNG } from "./engine";
import { MAX_BOARD_SIZE, HERO_MAX_HP } from "./constants";
import type {
  Capability, Card, CardInstance, ComposedEffect, GameState, HeroState, PlayerState, TargetSpec,
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

const GRAVE_TARGET: TargetSpec = { entity: "unit", count: 1, side: "ally", location: "graveyard", designation: "choice" };

/** Sort composé "exhumation" (X = maxCost, count = nb de cibles). Renvoie la carte
 *  + l'uid de la cap (nécessaire pour keyer le targetMap `${uid}#i`). */
function exhumSpell(x: number, count: number | "all" = 1): { card: Card; uid: string } {
  const cap = composedCap("spell_resolution", { content: "exhumation", magnitude: { x }, target: { ...GRAVE_TARGET, count } });
  const card = mkCard({ card_type: "spell", attack: null, health: null, capabilities: [cap] });
  return { card, uid: cap.uid };
}

function play(state: GameState, ci: CardInstance, targetMap?: Record<string, string>) {
  initRNG(42);
  state.players[0].hand.push(ci);
  return applyAction(state, { type: "play_card", cardInstanceId: ci.instanceId, targetMap });
}

describe("exhumation composée — résolution moteur", () => {
  it("ressuscite la créature CHOISIE (cible du targetMap) sur le plateau", () => {
    const s0 = mkState();
    const goule = mkInstance(mkCard({ name: "Goule", mana_cost: 2, attack: 3, health: 4 }));
    const rat = mkInstance(mkCard({ name: "Rat", mana_cost: 1, attack: 1, health: 1 }));
    s0.players[0].graveyard = [rat, goule];
    const { card, uid } = exhumSpell(3);
    const s = play(s0, mkInstance(card), { [`${uid}#0`]: goule.instanceId });

    const board = s.players[0].board;
    expect(board.length).toBe(1);
    expect(board[0].card.name).toBe("Goule");
    expect(board[0].instanceId).not.toBe(goule.instanceId); // identité fraîche
    expect(board[0].hasSummoningSickness).toBe(true);
    expect(board[0].currentHealth).toBe(4);
    // La goule quitte le cimetière ; le rat (non choisi) y reste (le sort lancé
    // atterrit aussi au cimetière → on filtre sur les créatures).
    const graveCreatures = s.players[0].graveyard.filter(c => c.card.card_type === "creature");
    expect(graveCreatures.map(c => c.card.name)).toEqual(["Rat"]);
  });

  it("multi-cible : ressuscite les N créatures choisies (count = 3)", () => {
    const s0 = mkState();
    const a = mkInstance(mkCard({ name: "A", mana_cost: 2, attack: 2, health: 2 }));
    const b = mkInstance(mkCard({ name: "B", mana_cost: 3, attack: 3, health: 3 }));
    const c = mkInstance(mkCard({ name: "C", mana_cost: 1, attack: 1, health: 1 }));
    const d = mkInstance(mkCard({ name: "D", mana_cost: 3, attack: 4, health: 4 }));
    s0.players[0].graveyard = [a, b, c, d];
    const { card, uid } = exhumSpell(3, 3);
    const s = play(s0, mkInstance(card), {
      [`${uid}#0`]: a.instanceId, [`${uid}#1`]: b.instanceId, [`${uid}#2`]: c.instanceId,
    });
    const names = s.players[0].board.map(x => x.card.name).sort();
    expect(names).toEqual(["A", "B", "C"]); // les 3 choisies, pas D
  });

  it("multi-cible borné par le disponible (« jusqu'à N ») : count 3 mais 2 éligibles → 2", () => {
    const s0 = mkState();
    const a = mkInstance(mkCard({ name: "A", mana_cost: 2, attack: 2, health: 2 }));
    const b = mkInstance(mkCard({ name: "B", mana_cost: 3, attack: 3, health: 3 }));
    s0.players[0].graveyard = [a, b];
    const { card, uid } = exhumSpell(3, 3);
    const s = play(s0, mkInstance(card), { [`${uid}#0`]: a.instanceId, [`${uid}#1`]: b.instanceId });
    expect(s.players[0].board.map(x => x.card.name).sort()).toEqual(["A", "B"]);
  });

  it("multi-cible repli non-interactif : sans targetMap, ressuscite les N plus hauts coûts", () => {
    const s0 = mkState();
    s0.players[0].graveyard = [
      mkInstance(mkCard({ name: "Rat", mana_cost: 1 })),
      mkInstance(mkCard({ name: "Ours", mana_cost: 3, health: 5 })),
      mkInstance(mkCard({ name: "Loup", mana_cost: 2, health: 2 })),
      mkInstance(mkCard({ name: "Cerf", mana_cost: 3, health: 3 })),
    ];
    const { card } = exhumSpell(3, 2); // pas de targetMap → repli, 2 plus hauts coûts (les deux « 3 »)
    const s = play(s0, mkInstance(card));
    const costs = s.players[0].board.map(x => x.card.mana_cost).sort();
    expect(s.players[0].board.length).toBe(2);
    expect(costs).toEqual([3, 3]);
  });

  it("respecte le filtre de coût : une créature coût > X n'est pas ressuscitée", () => {
    const s0 = mkState();
    const dragon = mkInstance(mkCard({ name: "Dragon", mana_cost: 8, attack: 8, health: 8 }));
    s0.players[0].graveyard = [dragon];
    const { card, uid } = exhumSpell(2); // X=2 < 8
    const s = play(s0, mkInstance(card), { [`${uid}#0`]: dragon.instanceId });
    expect(s.players[0].board.length).toBe(0);
    // Dragon reste au cimetière (coût > X).
    expect(s.players[0].graveyard.some(c => c.card.name === "Dragon")).toBe(true);
  });

  it("cimetière vide → no-op", () => {
    const { card, uid } = exhumSpell(5);
    const s = play(mkState(), mkInstance(card), { [`${uid}#0`]: "absent" });
    expect(s.players[0].board.length).toBe(0);
  });

  it("plateau plein (MAX_BOARD_SIZE) → no-op, la créature reste au cimetière", () => {
    const s0 = mkState();
    s0.players[0].board = Array.from({ length: MAX_BOARD_SIZE }, () => mkInstance(mkCard({ name: "Mur" })));
    const goule = mkInstance(mkCard({ name: "Goule", mana_cost: 2, attack: 3, health: 4 }));
    s0.players[0].graveyard = [goule];
    const { card, uid } = exhumSpell(3);
    const s = play(s0, mkInstance(card), { [`${uid}#0`]: goule.instanceId });
    expect(s.players[0].board.length).toBe(MAX_BOARD_SIZE);
    expect(s.players[0].graveyard.some(c => c.card.name === "Goule")).toBe(true);
  });

  it("repli déterministe sans cible : ressuscite le plus haut coût éligible (pas de RNG)", () => {
    const mk = () => {
      const s0 = mkState();
      s0.players[0].graveyard = [
        mkInstance(mkCard({ name: "Rat", mana_cost: 1, attack: 1, health: 1 })),
        mkInstance(mkCard({ name: "Ours", mana_cost: 3, attack: 3, health: 5 })),
        mkInstance(mkCard({ name: "Loup", mana_cost: 2, attack: 2, health: 2 })),
      ];
      const { card } = exhumSpell(3);
      return play(s0, mkInstance(card)); // pas de targetMap → repli
    };
    const a = mk(); const b = mk();
    expect(a.players[0].board[0].card.name).toBe("Ours"); // plus haut coût ≤ 3
    expect(b.players[0].board[0].card.name).toBe("Ours"); // rejouable à l'identique
  });

  it("une créature avec Traque (charge) exhumée peut attaquer immédiatement", () => {
    const s0 = mkState();
    const traqueur = mkInstance(mkCard({ name: "Traqueur", mana_cost: 2, attack: 3, health: 3, keywords: ["charge"] }));
    s0.players[0].graveyard = [traqueur];
    const { card, uid } = exhumSpell(3);
    const s = play(s0, mkInstance(card), { [`${uid}#0`]: traqueur.instanceId });
    const revived = s.players[0].board.find(c => c.card.name === "Traqueur")!;
    expect(revived.hasSummoningSickness).toBe(false); // Traque : pas de mal d'invocation
  });

  it("une créature SANS Traque exhumée conserve le mal d'invocation", () => {
    const s0 = mkState();
    const goule = mkInstance(mkCard({ name: "Goule", mana_cost: 2, attack: 3, health: 3 }));
    s0.players[0].graveyard = [goule];
    const { card, uid } = exhumSpell(3);
    const s = play(s0, mkInstance(card), { [`${uid}#0`]: goule.instanceId });
    const revived = s.players[0].board.find(c => c.card.name === "Goule")!;
    expect(revived.hasSummoningSickness).toBe(true);
  });

  it("conserve les bonus permanents de la créature exhumée (returnInstanceToPlay)", () => {
    const s0 = mkState();
    const goule = mkInstance(mkCard({ name: "Goule", mana_cost: 2, attack: 3, health: 4 }));
    goule.loyauteATKBonus = 2; // bonus permanent accumulé
    s0.players[0].graveyard = [goule];
    const { card, uid } = exhumSpell(3);
    const s = play(s0, mkInstance(card), { [`${uid}#0`]: goule.instanceId });
    const revived = s.players[0].board[0];
    expect(revived.loyauteATKBonus).toBe(2);
    expect(revived.currentAttack).toBe(3 + 2); // base + bonus persistant
  });
});

describe("exhumation composée — câblage picker (fonctions pures)", () => {
  it("getSpellTargetSlots émet un slot cimetière pour un sort exhumation composé", () => {
    const { card, uid } = exhumSpell(3);
    const slots = getSpellTargetSlots(card);
    const slot = slots.find(s => s.type === "friendly_graveyard_to_board");
    expect(slot).toBeDefined();
    expect(slot!.slot).toBe(`${uid}#0`); // clé composée (≠ kw_N)
  });

  it("getComposedGraveyardTargets ne renvoie que les créatures de coût ≤ X", () => {
    const s0 = mkState();
    const rat = mkInstance(mkCard({ name: "Rat", mana_cost: 1 }));
    const goule = mkInstance(mkCard({ name: "Goule", mana_cost: 3 }));
    const dragon = mkInstance(mkCard({ name: "Dragon", mana_cost: 8 }));
    s0.players[0].graveyard = [rat, goule, dragon];
    const { card, uid } = exhumSpell(3);
    const ids = getComposedGraveyardTargets(s0, card, uid);
    expect(ids).toEqual([rat.instanceId, goule.instanceId]); // Dragon (8) exclu
  });
});
