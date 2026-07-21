// Harnais de NON-RÉGRESSION du moteur (gate de la refonte des capacités).
//
// Objectif : prouver l'iso-comportement avant/après la bascule du moteur vers le
// modèle de capacités unifié. On joue une partie scriptée 100 % déterministe
// (cartes synthétiques + RNG semée + auto-player piloté par l'état) et on
// capture un snapshot de `GameState` après chaque action. Le golden est capturé
// depuis le moteur LEGACY ; après le refactor, ces snapshots doivent rester
// identiques.
//
// RE-BASELINE 2026-07-21 — Berserk → Gloire +X/+Y. Le golden a été régénéré une
// fois, volontairement : le remplacement de Berserk (doublement conditionnel de
// l'ATK) par Gloire (+X/+Y permanent à chaque survie au combat) change les
// dégâts de la partie scriptée, donc les morts, donc la consommation de la RNG —
// toute la trace diverge en cascade. Ce n'est PAS une régression du refactor de
// capacités ; le comportement de Gloire lui-même est verrouillé par gloire.test.ts.
// Hors changement de règle assumé, ce golden doit rester figé.
//
// Déterminisme : RNG semée via initializeGame(seed) ; shuffleArray utilise cette
// RNG ; l'auto-player fournit TOUJOURS des cibles explicites pour éviter le
// `Math.random()` d'auto-ciblage (engine.ts ~1802) ; `turnStartedAt` (Date.now)
// est retiré des snapshots.

import { describe, expect, it } from "vitest";
import { applyAction, canAttack, canPlayCard, getSpellTargetSlots, getValidTargets } from "./engine";
import type {
  Card,
  GameAction,
  GameState,
  PlayerState,
  SpellKeywordInstance,
  SpellTargetType,
} from "./types";

let nextId = 1;
function creature(
  name: string,
  mana: number,
  attack: number,
  health: number,
  opts: Partial<Card> = {},
): Card {
  return {
    id: nextId++,
    name,
    mana_cost: mana,
    card_type: "creature",
    attack,
    health,
    effect_text: opts.effect_text ?? "",
    keywords: opts.keywords ?? [],
    keyword_instances: opts.keyword_instances ?? null,
    spell_keywords: null,
    spell_effects: null,
    image_url: null,
    race: opts.race,
    faction: opts.faction ?? "neutre",
    clan: opts.clan,
    ...opts,
  } as Card;
}
function spell(name: string, mana: number, opts: Partial<Card>): Card {
  return {
    id: nextId++,
    name,
    mana_cost: mana,
    card_type: "spell",
    attack: null,
    health: null,
    effect_text: opts.effect_text ?? "",
    keywords: opts.keywords ?? [],
    keyword_instances: opts.keyword_instances ?? null,
    spell_keywords: opts.spell_keywords ?? null,
    spell_effects: null,
    image_url: null,
    faction: opts.faction ?? "neutre",
    ...opts,
  } as Card;
}

// Jeu de cartes couvrant un large spectre de déclencheurs/effets.
function buildLibrary() {
  return {
    vanilla: creature("Vanille", 2, 2, 3, { race: "humains" }),
    charge: creature("Chargeur", 3, 3, 2, { keywords: ["charge"], race: "humains" }),
    taunt: creature("Mur", 2, 1, 5, { keywords: ["taunt"], race: "nains" }),
    firstStrike: creature("Lancier", 3, 3, 3, { keywords: ["premiere_frappe"], race: "humains" }),
    gloire: creature("Glorieux", 4, 4, 5, {
      keywords: ["gloire"],
      keyword_instances: [{ id: "gloire", x: 1, y: 1 }],
      race: "orcs",
    }),
    command: creature("Capitaine", 4, 2, 4, { keywords: ["commandement"], race: "humains", faction: "ordre" }),
    terror: creature("Spectre", 3, 2, 2, { keywords: ["terreur"], race: "morts_vivants" }),
    fureur: creature("Enragé", 4, 3, 4, { keywords: ["fureur"], race: "orcs" }),
    riposte: creature("Épineux", 3, 2, 4, {
      keywords: ["riposte"],
      keyword_instances: [{ id: "riposte", x: 2 }],
      effect_text: "[Riposte 2]",
      race: "nains",
    }),
    lifesteal: creature("Vampire", 4, 3, 3, { keywords: ["drain_de_vie"], race: "morts_vivants" }),
    poison: creature("Serpent", 2, 2, 2, { keywords: ["poison"], race: "bêtes" }),
    regen: creature("Troll", 4, 2, 6, { keywords: ["regeneration"], race: "bêtes" }),
    celerite: creature("Éclair", 3, 2, 3, { keywords: ["celerite"], race: "elfes" }),
    loyaute: creature("Fidèle", 3, 2, 2, { keywords: ["loyaute"], race: "humains" }),
    carnage: creature("Bombe", 4, 2, 3, {
      keywords: ["carnage"],
      keyword_instances: [{ id: "carnage", x: 2 }],
      effect_text: "[Carnage 2]",
      race: "orcs",
    }),
    heritage: creature("Patriarche", 5, 3, 4, {
      keywords: ["heritage"],
      keyword_instances: [{ id: "heritage", x: 1 }],
      effect_text: "[Héritage 1]",
      race: "humains",
    }),
    martyr: creature("Martyr", 3, 2, 2, { keywords: ["martyr"], race: "humains" }),
    necro: creature("Goule", 4, 2, 5, { keywords: ["necrophagie"], race: "morts_vivants" }),
    inspiration: creature("Sage", 4, 2, 3, {
      keywords: ["inspiration"],
      keyword_instances: [{ id: "inspiration", x: 1 }],
      effect_text: "[Inspiration 1]",
      race: "elfes",
    }),
    pacte: creature("Cultiste", 4, 2, 3, { keywords: ["pacte_de_sang"], race: "morts_vivants" }),
    // Sorts
    impact: spell("Foudre", 2, {
      spell_keywords: [{ id: "impact", amount: 3 }] as SpellKeywordInstance[],
    }),
    deferlement: spell("Onde", 4, {
      spell_keywords: [{ id: "deferlement", amount: 2 }] as SpellKeywordInstance[],
    }),
    execution: spell("Exécution", 3, {
      spell_keywords: [{ id: "execution" }] as SpellKeywordInstance[],
    }),
    renforcement: spell("Bénir", 2, {
      spell_keywords: [{ id: "renforcement", attack: 2, health: 2 }] as SpellKeywordInstance[],
    }),
    guerison: spell("Soin", 1, {
      spell_keywords: [{ id: "guerison", amount: 3 }] as SpellKeywordInstance[],
    }),
    grantGloire: spell("Rage", 2, { keywords: ["gloire"] }),
  };
}

// Deck déterministe (paire {card, quantity}). Ordre fixe, RNG semée fera le reste.
function buildDeck(lib: ReturnType<typeof buildLibrary>): { card: Card; quantity: number }[] {
  return Object.values(lib).map((card) => ({ card, quantity: 2 }));
}

// Cibles on-play des créatures du harnais qui en réclament une.
const CREATURE_TARGET: Record<string, SpellTargetType> = {};

function pickTargetForType(state: GameState, type: SpellTargetType): string | undefined {
  const me = state.players[state.currentPlayerIndex];
  const opp = state.players[state.currentPlayerIndex === 0 ? 1 : 0];
  switch (type) {
    case "enemy_hero":
      return "enemy_hero";
    case "friendly_hero":
      return "friendly_hero";
    case "any":
      return opp.board[0]?.instanceId ?? "enemy_hero";
    case "any_creature":
      return opp.board[0]?.instanceId ?? me.board[0]?.instanceId;
    case "enemy_creature":
      return opp.board[0]?.instanceId;
    case "friendly_creature":
      return me.board[0]?.instanceId;
    case "friendly_graveyard":
    case "friendly_graveyard_to_board":
      return me.graveyard.find((c) => c.card.card_type === "creature")?.instanceId;
    default:
      return undefined; // AoE → pas de cible
  }
}

/** Calcule la prochaine action déterministe, ou null (→ fin de tour). */
function nextAction(state: GameState): GameAction | null {
  // 1) Déclencheurs interactifs en attente → résoudre la 1ʳᵉ avec une cible stable.
  const pending = state.pendingTriggers?.[0];
  if (pending) {
    const me = state.players[state.currentPlayerIndex];
    const target =
      me.board.find((c) => c.instanceId !== pending.sourceInstanceId)?.instanceId ??
      me.board[0]?.instanceId;
    if (target) return { type: "resolve_pending_trigger", triggerId: pending.id, targetInstanceId: target };
  }

  const me: PlayerState = state.players[state.currentPlayerIndex];

  // 2) Jouer la 1ʳᵉ carte abordable dont le ciblage est satisfaisable.
  for (const ci of me.hand) {
    if (!canPlayCard(state, ci.instanceId)) continue;
    const card = ci.card;
    if (card.card_type === "spell") {
      const slots = getSpellTargetSlots(card);
      const targetMap: Record<string, string> = {};
      let ok = true;
      for (const slot of slots) {
        const t = pickTargetForType(state, slot.type);
        if (!t) {
          ok = false;
          break;
        }
        targetMap[slot.slot] = t;
      }
      if (!ok) continue;
      return { type: "play_card", cardInstanceId: ci.instanceId, targetMap };
    }
    // Créature : cible on-play éventuelle.
    let targetInstanceId: string | undefined;
    let needTarget = false;
    for (const kw of card.keywords) {
      const tt = CREATURE_TARGET[kw];
      if (tt) {
        needTarget = true;
        targetInstanceId = pickTargetForType(state, tt);
      }
    }
    if (needTarget && !targetInstanceId) continue;
    return { type: "play_card", cardInstanceId: ci.instanceId, targetInstanceId };
  }

  // 3) Attaquer : 1ʳᵉ créature capable, 1ʳᵉ cible valide (créature avant héros).
  for (const ci of me.board) {
    if (!canAttack(state, ci.instanceId)) continue;
    const targets = getValidTargets(state, ci.instanceId);
    if (targets.length === 0) continue;
    const creatureTarget = targets.find((t) => t !== "enemy_hero");
    return {
      type: "attack",
      attackerInstanceId: ci.instanceId,
      targetInstanceId: creatureTarget ?? targets[0],
    };
  }

  return null; // rien à faire → fin de tour
}

// Projection compacte mais fidèle : conserve TOUS les champs runtime mutés par
// le moteur (ce que le refactor pourrait changer) mais retire le volume statique
// (objets Card complets, contenu des decks) et le non-déterministe (turnStartedAt).
function compactInstance(ci: GameState["players"][0]["board"][0]) {
  return {
    id: ci.card.id,
    name: ci.card.name,
    // keywords mutés par grant / silence / corruption → essentiel.
    keywords: ci.card.keywords,
    cardAttack: ci.card.attack,
    cardHealth: ci.card.health,
    currentAttack: ci.currentAttack,
    currentHealth: ci.currentHealth,
    maxHealth: ci.maxHealth,
    hasAttacked: ci.hasAttacked,
    hasSummoningSickness: ci.hasSummoningSickness,
    hasDivineShield: ci.hasDivineShield,
    attacksRemaining: ci.attacksRemaining,
    isPoisoned: ci.isPoisoned,
    hasUsedResurrection: ci.hasUsedResurrection,
    tapped: ci.tapped,
    fureurActive: ci.fureurActive,
    fureurATKBonus: ci.fureurATKBonus,
    gloireStacks: ci.gloireStacks ?? 0,
    esquiveUsedThisTurn: ci.esquiveUsedThisTurn,
    ombreRevealed: ci.ombreRevealed,
    contresortActive: ci.contresortActive,
    isParalyzed: ci.isParalyzed,
    loyauteATKBonus: ci.loyauteATKBonus,
    loyautePVBonus: ci.loyautePVBonus,
    summonBonusATK: ci.summonBonusATK,
    auraHealthBonus: ci.auraHealthBonus,
    necrophagieATKBonus: ci.necrophagieATKBonus,
    necrophagiePVBonus: ci.necrophagiePVBonus,
    martyrATKBonus: ci.martyrATKBonus,
    persecutionX: ci.persecutionX,
    riposteX: ci.riposteX,
    carnageX: ci.carnageX,
    heritageX: ci.heritageX,
    instinctDeMeuteX: ci.instinctDeMeuteX,
    instinctDeMeuteATKBonus: ci.instinctDeMeuteATKBonus,
    diedOnTurn: ci.diedOnTurn,
    manaCostReduction: ci.manaCostReduction,
    grantedKeywordX: ci.grantedKeywordX,
    maledictionTargetId: ci.maledictionTargetId,
    corruptionStolenIds: ci.corruptionStolenIds,
  };
}
function compactPlayer(p: PlayerState) {
  return {
    id: p.id,
    mana: p.mana,
    maxMana: p.maxMana,
    fatigueDamage: p.fatigueDamage,
    hero: {
      hp: p.hero.hp,
      maxHp: p.hero.maxHp,
      armor: p.hero.armor,
      heroPowerUsedThisTurn: p.hero.heroPowerUsedThisTurn,
      heroPowerActivationsUsed: p.hero.heroPowerActivationsUsed,
      activeAuras: p.hero.activeAuras,
    },
    handCount: p.hand.length,
    hand: p.hand.map((c) => c.card.name),
    deckCount: p.deck.length,
    graveyard: p.graveyard.map((c) => c.card.name),
    spellHistoryCount: p.spellHistory.length,
    board: p.board.map(compactInstance),
  };
}
function snapshot(state: GameState): unknown {
  return {
    phase: state.phase,
    winner: state.winner,
    turnNumber: state.turnNumber,
    currentPlayerIndex: state.currentPlayerIndex,
    pendingTriggers: state.pendingTriggers ?? [],
    players: [compactPlayer(state.players[0]), compactPlayer(state.players[1])],
  };
}

describe("moteur — non-régression (iso-comportement)", () => {
  it("partie scriptée déterministe : snapshots stables", async () => {
    nextId = 1;
    const lib = buildLibrary();
    const deck = buildDeck(lib);
    // Import dynamique pour réinitialiser le module si besoin (RNG semée par initializeGame).
    const { initializeGame } = await import("./engine");

    let state = initializeGame("P1", "P2", deck, deck, 0, 123456);
    state = applyAction(state, { type: "mulligan", playerId: "P1", replacedInstanceIds: [] });
    state = applyAction(state, { type: "mulligan", playerId: "P2", replacedInstanceIds: [] });

    const trace: unknown[] = [{ step: "init", state: snapshot(state) }];

    const MAX_STEPS = 400;
    let endTurns = 0;
    for (let i = 0; i < MAX_STEPS && state.phase !== "finished"; i++) {
      const action = nextAction(state);
      if (action) {
        const next = applyAction(state, action);
        // Action no-op (état inchangé) → on force une fin de tour pour avancer.
        if (next === state) {
          state = applyAction(state, { type: "end_turn" });
          trace.push({ step: `endturn(noop)`, state: snapshot(state) });
          if (++endTurns > 60) break;
        } else {
          state = next;
          trace.push({ step: action.type, state: snapshot(state) });
        }
      } else {
        state = applyAction(state, { type: "end_turn" });
        trace.push({ step: "endturn", state: snapshot(state) });
        if (++endTurns > 60) break;
      }
    }

    // Le golden est figé par toMatchSnapshot (capturé sur le moteur legacy).
    expect({ steps: trace.length, finished: state.phase === "finished", trace }).toMatchSnapshot();
  });
});
