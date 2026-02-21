import type {
  Card,
  CardInstance,
  GameState,
  PlayerState,
  PlayCardAction,
  AttackAction,
  MulliganAction,
  GameAction,
  SpellEffect,
} from "./types";
import {
  HERO_MAX_HP,
  STARTING_HAND_SIZE,
  MAX_HAND_SIZE,
  MAX_BOARD_SIZE,
  MAX_MANA,
} from "./constants";

// ============================================================
// SEEDED PRNG (mulberry32) — deterministic across clients
// ============================================================

function createRNG(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rng: () => number = Math.random;

export function initRNG(seed: number) {
  rng = createRNG(seed);
}

// ============================================================
// INITIALIZATION
// ============================================================

function generateInstanceId(): string {
  return rng().toString(36).substring(2, 10) + rng().toString(36).substring(2, 10);
}

function createCardInstance(card: Card): CardInstance {
  return {
    instanceId: generateInstanceId(),
    card,
    currentAttack: card.attack ?? 0,
    currentHealth: card.health ?? 1,
    maxHealth: card.health ?? 1,
    hasAttacked: false,
    hasSummoningSickness: !card.keywords.includes("charge"),
    hasDivineShield: card.keywords.includes("divine_shield"),
  };
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Create instances from a deck (list of cards with quantities)
 */
function createDeckInstances(
  cards: { card: Card; quantity: number }[]
): CardInstance[] {
  const instances: CardInstance[] = [];
  for (const { card, quantity } of cards) {
    for (let i = 0; i < quantity; i++) {
      instances.push(createCardInstance(card));
    }
  }
  return shuffleArray(instances);
}

export function initializeGame(
  player1Id: string,
  player2Id: string,
  player1Cards: { card: Card; quantity: number }[],
  player2Cards: { card: Card; quantity: number }[],
  firstPlayerIndex: 0 | 1 = 0,
  seed?: number
): GameState {
  if (seed !== undefined) {
    initRNG(seed);
  }
  const p1Deck = createDeckInstances(player1Cards);
  const p2Deck = createDeckInstances(player2Cards);

  // Draw starting hands
  const p1Hand = p1Deck.splice(0, STARTING_HAND_SIZE);
  const p2Hand = p2Deck.splice(0, STARTING_HAND_SIZE);

  const player1: PlayerState = {
    id: player1Id,
    hero: { hp: HERO_MAX_HP, maxHp: HERO_MAX_HP },
    mana: 0,
    maxMana: 0,
    hand: p1Hand,
    board: [],
    deck: p1Deck,
    graveyard: [],
    fatigueDamage: 0,
  };

  const player2: PlayerState = {
    id: player2Id,
    hero: { hp: HERO_MAX_HP, maxHp: HERO_MAX_HP },
    mana: 0,
    maxMana: 0,
    hand: p2Hand,
    board: [],
    deck: p2Deck,
    graveyard: [],
    fatigueDamage: 0,
  };

  const state: GameState = {
    players: [player1, player2],
    currentPlayerIndex: firstPlayerIndex,
    turnNumber: 0,
    phase: "mulligan",
    winner: null,
    lastAction: null,
    mulliganReady: [false, false],
  };

  return state;
}

// ============================================================
// TURN MANAGEMENT
// ============================================================

export function startTurn(state: GameState): GameState {
  const newState = deepClone(state);
  const player = newState.players[newState.currentPlayerIndex];

  newState.turnNumber++;

  // Increment max mana (cap at 10)
  if (player.maxMana < MAX_MANA) {
    player.maxMana++;
  }
  // Refill mana
  player.mana = player.maxMana;

  // Draw a card
  drawCard(player);

  // Reset creature attack flags and summoning sickness
  for (const creature of player.board) {
    creature.hasAttacked = false;
    creature.hasSummoningSickness = false;
  }

  return newState;
}

function drawCard(player: PlayerState): CardInstance | null {
  if (player.deck.length === 0) {
    // Fatigue damage
    player.fatigueDamage++;
    player.hero.hp -= player.fatigueDamage;
    return null;
  }

  const card = player.deck.shift()!;

  if (player.hand.length >= MAX_HAND_SIZE) {
    // Hand full: card is burned (goes to graveyard)
    player.graveyard.push(card);
    return null;
  }

  player.hand.push(card);
  return card;
}

export function endTurn(state: GameState): GameState {
  const newState = deepClone(state);

  // Switch current player
  newState.currentPlayerIndex =
    newState.currentPlayerIndex === 0 ? 1 : 0;

  newState.lastAction = { type: "end_turn" };

  // Start the new player's turn
  return startTurn(newState);
}

// ============================================================
// PLAY CARD
// ============================================================

export function playCard(
  state: GameState,
  action: PlayCardAction
): GameState {
  const newState = deepClone(state);
  const player = newState.players[newState.currentPlayerIndex];
  const opponent =
    newState.players[newState.currentPlayerIndex === 0 ? 1 : 0];

  // Find card in hand
  const cardIndex = player.hand.findIndex(
    (c) => c.instanceId === action.cardInstanceId
  );
  if (cardIndex === -1) return state; // Card not in hand

  const cardInstance = player.hand[cardIndex];
  const card = cardInstance.card;

  // Check mana
  if (card.mana_cost > player.mana) return state;

  // Deduct mana
  player.mana -= card.mana_cost;

  // Remove from hand
  player.hand.splice(cardIndex, 1);

  if (card.card_type === "creature") {
    // Check board space
    if (player.board.length >= MAX_BOARD_SIZE) return state;

    // Place on board
    cardInstance.hasSummoningSickness = !card.keywords.includes("charge");
    cardInstance.hasAttacked = false;
    const pos = action.boardPosition ?? player.board.length;
    player.board.splice(pos, 0, cardInstance);
  } else if (card.card_type === "spell") {
    // Resolve spell effect
    if (card.spell_effect) {
      resolveSpellEffect(
        newState,
        card.spell_effect,
        player,
        opponent,
        action.targetInstanceId
      );
    }
    // Clean up creatures killed by the spell
    cleanDeadCreatures(player);
    cleanDeadCreatures(opponent);

    // Spell goes to graveyard
    player.graveyard.push(cardInstance);
  }

  newState.lastAction = action;

  // Check win condition
  checkWinCondition(newState);

  return newState;
}

// ============================================================
// SPELL EFFECTS
// ============================================================

function resolveSpellEffect(
  state: GameState,
  effect: SpellEffect,
  caster: PlayerState,
  opponent: PlayerState,
  targetInstanceId?: string
) {
  switch (effect.type) {
    case "deal_damage": {
      const amount = effect.amount ?? 0;
      switch (effect.target) {
        case "enemy_hero":
          opponent.hero.hp -= amount;
          break;
        case "friendly_hero":
          caster.hero.hp = Math.min(
            caster.hero.maxHp,
            caster.hero.hp - amount
          );
          break;
        case "any":
        case "any_creature": {
          if (targetInstanceId === "enemy_hero") {
            opponent.hero.hp -= amount;
          } else if (targetInstanceId === "friendly_hero") {
            caster.hero.hp -= amount;
          } else if (targetInstanceId) {
            const target =
              findCreatureOnBoard(caster, targetInstanceId) ??
              findCreatureOnBoard(opponent, targetInstanceId);
            if (target) {
              dealDamageToCreature(target, amount, caster, opponent);
            }
          }
          break;
        }
        case "all_enemy_creatures":
          [...opponent.board].forEach((c) =>
            dealDamageToCreature(c, amount, opponent, caster)
          );
          cleanDeadCreatures(opponent);
          break;
        case "all_enemies":
          opponent.hero.hp -= amount;
          [...opponent.board].forEach((c) =>
            dealDamageToCreature(c, amount, opponent, caster)
          );
          cleanDeadCreatures(opponent);
          break;
        case "all_friendly_creatures":
          [...caster.board].forEach((c) =>
            dealDamageToCreature(c, amount, caster, opponent)
          );
          cleanDeadCreatures(caster);
          break;
      }
      break;
    }
    case "heal": {
      const amount = effect.amount ?? 0;
      if (effect.target === "friendly_hero") {
        caster.hero.hp = Math.min(caster.hero.maxHp, caster.hero.hp + amount);
      } else if (effect.target === "enemy_hero") {
        opponent.hero.hp = Math.min(
          opponent.hero.maxHp,
          opponent.hero.hp + amount
        );
      } else if (targetInstanceId) {
        const target = findCreatureOnBoard(caster, targetInstanceId);
        if (target) {
          target.currentHealth = Math.min(
            target.maxHealth,
            target.currentHealth + amount
          );
        }
      }
      break;
    }
    case "buff": {
      if (targetInstanceId) {
        const target = findCreatureOnBoard(caster, targetInstanceId);
        if (target) {
          target.currentAttack += effect.attack ?? 0;
          target.currentHealth += effect.health ?? 0;
          target.maxHealth += effect.health ?? 0;
        }
      }
      break;
    }
    case "grant_keyword": {
      if (targetInstanceId && effect.keyword) {
        const target = findCreatureOnBoard(caster, targetInstanceId);
        if (target) {
          if (effect.keyword === "divine_shield") {
            target.hasDivineShield = true;
          }
          if (!target.card.keywords.includes(effect.keyword)) {
            target.card = {
              ...target.card,
              keywords: [...target.card.keywords, effect.keyword],
            };
          }
        }
      }
      break;
    }
    case "draw_cards": {
      const amount = effect.amount ?? 1;
      for (let i = 0; i < amount; i++) {
        drawCard(caster);
      }
      break;
    }
    case "resurrect": {
      const amount = effect.amount ?? 1;
      const deadCreatures = caster.graveyard.filter(
        (c) => c.card.card_type === "creature"
      );
      const shuffled = shuffleArray(deadCreatures);
      const toResurrect = shuffled.slice(0, amount);

      for (const creature of toResurrect) {
        // Remove from graveyard
        const idx = caster.graveyard.indexOf(creature);
        if (idx !== -1) caster.graveyard.splice(idx, 1);

        // Reset stats
        creature.currentAttack = creature.card.attack ?? 0;
        creature.currentHealth = creature.card.health ?? 1;
        creature.maxHealth = creature.card.health ?? 1;
        creature.hasDivineShield = creature.card.keywords.includes("divine_shield");
        creature.hasAttacked = false;
        creature.hasSummoningSickness = !creature.card.keywords.includes("charge");
        creature.instanceId = generateInstanceId();

        if (effect.target === "friendly_graveyard_to_board") {
          if (caster.board.length < MAX_BOARD_SIZE) {
            caster.board.push(creature);
          }
        } else {
          // Return to hand
          if (caster.hand.length < MAX_HAND_SIZE) {
            caster.hand.push(creature);
          }
        }
      }
      break;
    }

    case "gain_mana": {
      const amount = effect.amount ?? 1;
      caster.mana += amount;
      break;
    }
  }
}

// ============================================================
// ATTACK
// ============================================================

export function attack(state: GameState, action: AttackAction): GameState {
  const newState = deepClone(state);
  const player = newState.players[newState.currentPlayerIndex];
  const opponent =
    newState.players[newState.currentPlayerIndex === 0 ? 1 : 0];

  // Find attacker
  const attacker = player.board.find(
    (c) => c.instanceId === action.attackerInstanceId
  );
  if (!attacker) return state;

  // Validate: can this creature attack?
  if (attacker.hasAttacked) return state;
  if (attacker.hasSummoningSickness) return state;

  // Check Taunt: if opponent has Taunt creatures, must attack them first
  const opponentTaunts = opponent.board.filter((c) =>
    c.card.keywords.includes("taunt")
  );

  if (action.targetInstanceId === "enemy_hero") {
    // Attacking hero
    if (opponentTaunts.length > 0) return state; // Must attack taunt first

    // Deal damage to hero
    opponent.hero.hp -= attacker.currentAttack;
    attacker.hasAttacked = true;
  } else {
    // Attacking a creature
    const target = opponent.board.find(
      (c) => c.instanceId === action.targetInstanceId
    );
    if (!target) return state;

    // If there are taunts, target must be one of them
    if (opponentTaunts.length > 0 && !target.card.keywords.includes("taunt")) {
      return state;
    }

    // Combat: simultaneous damage
    const isRanged = attacker.card.keywords.includes("ranged");

    // Attacker deals damage to target
    dealDamageToCreature(target, attacker.currentAttack, opponent, player);

    // Target deals counter-damage to attacker (unless attacker is Ranged)
    if (!isRanged) {
      dealDamageToCreature(attacker, target.currentAttack, player, opponent);
    }

    attacker.hasAttacked = true;

    // Clean up dead creatures
    cleanDeadCreatures(player);
    cleanDeadCreatures(opponent);
  }

  newState.lastAction = action;

  // Check win condition
  checkWinCondition(newState);

  return newState;
}

// ============================================================
// HELPERS
// ============================================================

function dealDamageToCreature(
  creature: CardInstance,
  damage: number,
  owner: PlayerState,
  _attacker: PlayerState
) {
  if (damage <= 0) return;

  if (creature.hasDivineShield) {
    creature.hasDivineShield = false;
    return; // Damage absorbed by divine shield
  }

  creature.currentHealth -= damage;
}

function cleanDeadCreatures(player: PlayerState) {
  const dead = player.board.filter((c) => c.currentHealth <= 0);
  player.board = player.board.filter((c) => c.currentHealth > 0);
  player.graveyard.push(...dead);
}

function findCreatureOnBoard(
  player: PlayerState,
  instanceId: string
): CardInstance | undefined {
  return player.board.find((c) => c.instanceId === instanceId);
}

function checkWinCondition(state: GameState) {
  const p1Dead = state.players[0].hero.hp <= 0;
  const p2Dead = state.players[1].hero.hp <= 0;

  if (p1Dead && p2Dead) {
    // Both dead: current turn player loses
    state.winner =
      state.players[state.currentPlayerIndex === 0 ? 1 : 0].id;
    state.phase = "finished";
  } else if (p1Dead) {
    state.winner = state.players[1].id;
    state.phase = "finished";
  } else if (p2Dead) {
    state.winner = state.players[0].id;
    state.phase = "finished";
  }
}

export function applyMulligan(
  state: GameState,
  action: MulliganAction
): GameState {
  const newState = deepClone(state);
  const playerIndex = newState.players.findIndex(
    (p) => p.id === action.playerId
  );
  if (playerIndex === -1) return state;

  // Perform the mulligan swap deterministically
  if (action.replacedInstanceIds && action.replacedInstanceIds.length > 0) {
    const player = newState.players[playerIndex];
    const kept = player.hand.filter(
      (c) => !action.replacedInstanceIds.includes(c.instanceId)
    );
    const replaced = player.hand.filter(
      (c) => action.replacedInstanceIds.includes(c.instanceId)
    );

    // Draw replacement cards from top of deck
    const drawn = player.deck.splice(0, replaced.length);

    // Put replaced cards at bottom of deck
    player.deck.push(...replaced);

    player.hand = [...kept, ...drawn];
  }

  newState.mulliganReady[playerIndex] = true;

  // If both players are ready, transition to playing phase
  if (newState.mulliganReady[0] && newState.mulliganReady[1]) {
    // Reshuffle both decks after mulligan (deterministic via seeded RNG)
    newState.players[0].deck = shuffleArray(newState.players[0].deck);
    newState.players[1].deck = shuffleArray(newState.players[1].deck);

    // Give "Mana Spark" to the player who goes second (compensation)
    const secondPlayerIndex = newState.currentPlayerIndex === 0 ? 1 : 0;
    const manaSpark: Card = {
      id: -1,
      name: "Mana Spark",
      mana_cost: 0,
      card_type: "spell",
      attack: null,
      health: null,
      effect_text: "Gain 1 mana this turn",
      keywords: [],
      spell_effect: { type: "gain_mana", amount: 1 },
      image_url: null,
    };
    newState.players[secondPlayerIndex].hand.push(createCardInstance(manaSpark));

    newState.phase = "playing";
    return startTurn(newState);
  }

  return newState;
}

export function applyAction(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "mulligan":
      return applyMulligan(state, action);
    case "play_card":
      return playCard(state, action);
    case "attack":
      return attack(state, action);
    case "end_turn":
      return endTurn(state);
    default:
      return state;
  }
}

// ============================================================
// QUERY HELPERS (for UI)
// ============================================================

export function canPlayCard(
  state: GameState,
  cardInstanceId: string
): boolean {
  const player = state.players[state.currentPlayerIndex];
  const card = player.hand.find((c) => c.instanceId === cardInstanceId);
  if (!card) return false;
  if (card.card.mana_cost > player.mana) return false;
  if (
    card.card.card_type === "creature" &&
    player.board.length >= MAX_BOARD_SIZE
  )
    return false;
  return true;
}

export function canAttack(
  state: GameState,
  attackerInstanceId: string
): boolean {
  const player = state.players[state.currentPlayerIndex];
  const attacker = player.board.find(
    (c) => c.instanceId === attackerInstanceId
  );
  if (!attacker) return false;
  if (attacker.hasAttacked) return false;
  if (attacker.hasSummoningSickness) return false;
  if (attacker.currentAttack <= 0) return false;
  return true;
}

export function getValidTargets(
  state: GameState,
  attackerInstanceId: string
): string[] {
  const player = state.players[state.currentPlayerIndex];
  const opponent =
    state.players[state.currentPlayerIndex === 0 ? 1 : 0];
  const attacker = player.board.find(
    (c) => c.instanceId === attackerInstanceId
  );
  if (!attacker) return [];

  const opponentTaunts = opponent.board.filter((c) =>
    c.card.keywords.includes("taunt")
  );

  if (opponentTaunts.length > 0) {
    return opponentTaunts.map((c) => c.instanceId);
  }

  // Can attack any enemy creature or hero
  return [...opponent.board.map((c) => c.instanceId), "enemy_hero"];
}

export function needsTarget(card: Card): boolean {
  if (card.card_type !== "spell" || !card.spell_effect) return false;
  const target = card.spell_effect.target;
  return (
    target === "any" ||
    target === "any_creature" ||
    target === "friendly_creature" ||
    target === "enemy_creature"
  );
}

export function getSpellTargets(
  state: GameState,
  card: Card
): string[] {
  if (!card.spell_effect) return [];
  const player = state.players[state.currentPlayerIndex];
  const opponent =
    state.players[state.currentPlayerIndex === 0 ? 1 : 0];

  switch (card.spell_effect.target) {
    case "any":
      return [
        ...player.board.map((c) => c.instanceId),
        ...opponent.board.map((c) => c.instanceId),
        "enemy_hero",
        "friendly_hero",
      ];
    case "any_creature":
      return [
        ...player.board.map((c) => c.instanceId),
        ...opponent.board.map((c) => c.instanceId),
      ];
    case "friendly_creature":
      return player.board.map((c) => c.instanceId);
    case "enemy_creature":
      return opponent.board.map((c) => c.instanceId);
    default:
      return [];
  }
}

// Deep clone helper
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
