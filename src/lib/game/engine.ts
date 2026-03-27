import type {
  Card,
  CardInstance,
  GameState,
  PlayerState,
  PlayCardAction,
  AttackAction,
  MulliganAction,
  HeroPowerAction,
  GameAction,
  SpellEffect,
  HeroDefinition,
  Keyword,
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
// KEYWORD HELPERS
// ============================================================

function hasKw(ci: CardInstance, kw: Keyword): boolean {
  return ci.card.keywords.includes(kw);
}

function maxAttacksFor(ci: CardInstance): number {
  if (hasKw(ci, "celerite") || hasKw(ci, "double_attaque")) return 2;
  return 1;
}

// ============================================================
// INITIALIZATION
// ============================================================

function generateInstanceId(): string {
  return rng().toString(36).substring(2, 10) + rng().toString(36).substring(2, 10);
}

function createCardInstance(card: Card): CardInstance {
  const noSickness = card.keywords.includes("charge");
  return {
    instanceId: generateInstanceId(),
    card,
    currentAttack: card.attack ?? 0,
    currentHealth: card.health ?? 1,
    maxHealth: card.health ?? 1,
    hasAttacked: false,
    hasSummoningSickness: !noSickness,
    hasDivineShield: card.keywords.includes("divine_shield"),
    attacksRemaining: 1,
    isPoisoned: false,
    hasUsedIndestructible: false,
    hasUsedResurrection: false,
    fureurActive: false,
    fureurATKBonus: 0,
    berserkActive: false,
    berserkATKBonus: 0,
    transcendanceTurns: card.keywords.includes("transcendance") ? 2 : 0,
    targetsAttackedThisTurn: [],
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

function createDeckInstances(cards: { card: Card; quantity: number }[]): CardInstance[] {
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
  seed?: number,
  player1Hero?: HeroDefinition | null,
  player2Hero?: HeroDefinition | null
): GameState {
  if (seed !== undefined) initRNG(seed);
  const p1Deck = createDeckInstances(player1Cards);
  const p2Deck = createDeckInstances(player2Cards);
  const p1Hand = p1Deck.splice(0, STARTING_HAND_SIZE);
  const p2Hand = p2Deck.splice(0, STARTING_HAND_SIZE);

  const makePlayer = (id: string, hand: CardInstance[], deck: CardInstance[], hero?: HeroDefinition | null): PlayerState => ({
    id,
    hero: { hp: HERO_MAX_HP, maxHp: HERO_MAX_HP, armor: 0, heroDefinition: hero ?? null, heroPowerUsedThisTurn: false },
    mana: 0, maxMana: 0,
    hand, board: [], deck, graveyard: [],
    fatigueDamage: 0,
  });

  return {
    players: [makePlayer(player1Id, p1Hand, p1Deck, player1Hero), makePlayer(player2Id, p2Hand, p2Deck, player2Hero)],
    currentPlayerIndex: firstPlayerIndex,
    turnNumber: 0,
    phase: "mulligan",
    winner: null,
    lastAction: null,
    mulliganReady: [false, false],
  };
}

// ============================================================
// AURA RECALCULATION
// ============================================================

function recalculateAuras(player: PlayerState, opponent: PlayerState) {
  // Reset ATK to base + keyword bonuses (not aura)
  for (const c of player.board) {
    let atk = c.card.attack ?? 0;
    if (c.fureurActive) atk += c.fureurATKBonus;
    if (c.berserkActive) atk += c.berserkATKBonus;
    c.currentAttack = atk;
  }
  for (const c of opponent.board) {
    let atk = c.card.attack ?? 0;
    if (c.fureurActive) atk += c.fureurATKBonus;
    if (c.berserkActive) atk += c.berserkATKBonus;
    c.currentAttack = atk;
  }

  // Loyauté: +1 ATK per ally on board
  for (const c of player.board) {
    if (hasKw(c, "loyaute")) {
      c.currentAttack += Math.max(0, player.board.length - 1);
    }
  }
  for (const c of opponent.board) {
    if (hasKw(c, "loyaute")) {
      c.currentAttack += Math.max(0, opponent.board.length - 1);
    }
  }

  // Terreur: enemy units -1 ATK per terreur unit
  const playerTerreurCount = player.board.filter(c => hasKw(c, "terreur")).length;
  const opponentTerreurCount = opponent.board.filter(c => hasKw(c, "terreur")).length;
  for (const c of opponent.board) {
    c.currentAttack = Math.max(0, c.currentAttack - playerTerreurCount);
  }
  for (const c of player.board) {
    c.currentAttack = Math.max(0, c.currentAttack - opponentTerreurCount);
  }

  // Commandement: same-faction allies +1/+1
  for (const board of [player.board, opponent.board]) {
    for (const c of board) {
      if (hasKw(c, "commandement") && c.card.race) {
        for (const ally of board) {
          if (ally !== c && ally.card.race === c.card.race) {
            ally.currentAttack += 1;
            // Health buff is tricky — only add if not already buffed
            // We handle this as a display buff, actual maxHealth unchanged
          }
        }
      }
    }
  }

  // Berserk check: +2 ATK when HP < 50% of max
  for (const board of [player.board, opponent.board]) {
    for (const c of board) {
      if (hasKw(c, "berserk")) {
        const shouldBeActive = c.currentHealth < c.maxHealth / 2;
        if (shouldBeActive && !c.berserkActive) {
          c.berserkActive = true;
          c.berserkATKBonus = 2;
          c.currentAttack += 2;
        } else if (!shouldBeActive && c.berserkActive) {
          c.berserkActive = false;
          c.currentAttack -= c.berserkATKBonus;
          c.berserkATKBonus = 0;
        }
      }
    }
  }
}

// ============================================================
// TURN MANAGEMENT
// ============================================================

export function startTurn(state: GameState): GameState {
  const newState = deepClone(state);
  const player = newState.players[newState.currentPlayerIndex];
  const opponent = newState.players[newState.currentPlayerIndex === 0 ? 1 : 0];

  newState.turnNumber++;
  if (player.maxMana < MAX_MANA) player.maxMana++;
  player.mana = player.maxMana;
  drawCard(player);

  for (const creature of player.board) {
    creature.hasAttacked = false;
    creature.hasSummoningSickness = false;
    creature.attacksRemaining = maxAttacksFor(creature);
    creature.targetsAttackedThisTurn = [];

    // Reset fureur
    if (creature.fureurActive) {
      creature.currentAttack -= creature.fureurATKBonus;
      creature.fureurActive = false;
      creature.fureurATKBonus = 0;
    }

    // Régénération: +2 HP at start of turn
    if (hasKw(creature, "regeneration")) {
      creature.currentHealth = Math.min(creature.maxHealth, creature.currentHealth + 2);
    }

    // Poison tick: -1 HP
    if (creature.isPoisoned) {
      creature.currentHealth -= 1;
    }

    // Transcendance countdown
    if (creature.transcendanceTurns > 0) {
      creature.transcendanceTurns--;
    }
  }

  // Clean creatures killed by poison
  const poisonDead = cleanDeadCreatures(player);
  processDeathTriggers(poisonDead, player, opponent);

  player.hero.heroPowerUsedThisTurn = false;

  recalculateAuras(player, opponent);

  return newState;
}

function drawCard(player: PlayerState): CardInstance | null {
  if (player.deck.length === 0) {
    player.fatigueDamage++;
    dealDamageToHero(player.hero, player.fatigueDamage);
    return null;
  }
  const card = player.deck.shift()!;
  if (player.hand.length >= MAX_HAND_SIZE) {
    player.graveyard.push(card);
    return null;
  }
  player.hand.push(card);
  return card;
}

export function endTurn(state: GameState): GameState {
  const newState = deepClone(state);
  newState.currentPlayerIndex = newState.currentPlayerIndex === 0 ? 1 : 0;
  newState.lastAction = { type: "end_turn" };
  return startTurn(newState);
}

// ============================================================
// PLAY CARD
// ============================================================

export function playCard(state: GameState, action: PlayCardAction): GameState {
  const newState = deepClone(state);
  const player = newState.players[newState.currentPlayerIndex];
  const opponent = newState.players[newState.currentPlayerIndex === 0 ? 1 : 0];

  const cardIndex = player.hand.findIndex(c => c.instanceId === action.cardInstanceId);
  if (cardIndex === -1) return state;

  const cardInstance = player.hand[cardIndex];
  const card = cardInstance.card;
  if (card.mana_cost > player.mana) return state;

  player.mana -= card.mana_cost;
  player.hand.splice(cardIndex, 1);

  if (card.card_type === "creature") {
    if (player.board.length >= MAX_BOARD_SIZE) return state;

    cardInstance.hasSummoningSickness = !card.keywords.includes("charge");
    cardInstance.hasAttacked = false;
    cardInstance.attacksRemaining = maxAttacksFor(cardInstance);
    const pos = action.boardPosition ?? player.board.length;
    player.board.splice(pos, 0, cardInstance);

    // ── On-summon triggers ──

    // Corruption: steal weakest enemy with ATK <= 3
    if (hasKw(cardInstance, "corruption")) {
      const stealable = opponent.board
        .filter(c => c.currentAttack <= 3)
        .sort((a, b) => a.currentAttack - b.currentAttack);
      if (stealable.length > 0 && player.board.length < MAX_BOARD_SIZE) {
        const stolen = stealable[0];
        opponent.board = opponent.board.filter(c => c !== stolen);
        stolen.hasSummoningSickness = true;
        player.board.push(stolen);
      }
    }

    // Domination: take control of random enemy
    if (hasKw(cardInstance, "domination") && opponent.board.length > 0) {
      if (player.board.length < MAX_BOARD_SIZE) {
        const idx = Math.floor(rng() * opponent.board.length);
        const stolen = opponent.board.splice(idx, 1)[0];
        stolen.hasSummoningSickness = true;
        player.board.push(stolen);
      }
    }

    recalculateAuras(player, opponent);

  } else if (card.card_type === "spell") {
    if (card.spell_effect) {
      resolveSpellEffect(newState, card.spell_effect, player, opponent, action.targetInstanceId);
    }
    const playerDead = cleanDeadCreatures(player);
    const opponentDead = cleanDeadCreatures(opponent);
    processDeathTriggers(playerDead, player, opponent);
    processDeathTriggers(opponentDead, opponent, player);
    player.graveyard.push(cardInstance);
    recalculateAuras(player, opponent);
  }

  newState.lastAction = action;
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
          dealDamageToHero(opponent.hero, amount);
          break;
        case "friendly_hero":
          dealDamageToHero(caster.hero, amount);
          break;
        case "any":
        case "any_creature": {
          if (targetInstanceId === "enemy_hero") {
            dealDamageToHero(opponent.hero, amount);
          } else if (targetInstanceId === "friendly_hero") {
            dealDamageToHero(caster.hero, amount);
          } else if (targetInstanceId) {
            const target = findCreatureOnBoard(caster, targetInstanceId) ?? findCreatureOnBoard(opponent, targetInstanceId);
            if (target) dealDamageToCreature(target, amount);
          }
          break;
        }
        case "all_enemy_creatures":
          [...opponent.board].forEach(c => dealDamageToCreature(c, amount));
          break;
        case "all_enemies":
          dealDamageToHero(opponent.hero, amount);
          [...opponent.board].forEach(c => dealDamageToCreature(c, amount));
          break;
        case "all_friendly_creatures":
          [...caster.board].forEach(c => dealDamageToCreature(c, amount));
          break;
      }
      break;
    }
    case "heal": {
      const amount = effect.amount ?? 0;
      if (effect.target === "friendly_hero") {
        caster.hero.hp = Math.min(caster.hero.maxHp, caster.hero.hp + amount);
      } else if (effect.target === "enemy_hero") {
        opponent.hero.hp = Math.min(opponent.hero.maxHp, opponent.hero.hp + amount);
      } else if (targetInstanceId) {
        const target = findCreatureOnBoard(caster, targetInstanceId);
        if (target) target.currentHealth = Math.min(target.maxHealth, target.currentHealth + amount);
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
          if (effect.keyword === "divine_shield") target.hasDivineShield = true;
          if (!target.card.keywords.includes(effect.keyword)) {
            target.card = { ...target.card, keywords: [...target.card.keywords, effect.keyword] };
          }
        }
      }
      break;
    }
    case "draw_cards": {
      const amount = effect.amount ?? 1;
      for (let i = 0; i < amount; i++) drawCard(caster);
      break;
    }
    case "resurrect": {
      const amount = effect.amount ?? 1;
      const deadCreatures = caster.graveyard.filter(c => c.card.card_type === "creature");
      const shuffled = shuffleArray(deadCreatures);
      const toResurrect = shuffled.slice(0, amount);
      for (const creature of toResurrect) {
        const idx = caster.graveyard.indexOf(creature);
        if (idx !== -1) caster.graveyard.splice(idx, 1);
        creature.currentAttack = creature.card.attack ?? 0;
        creature.currentHealth = creature.card.health ?? 1;
        creature.maxHealth = creature.card.health ?? 1;
        creature.hasDivineShield = creature.card.keywords.includes("divine_shield");
        creature.hasAttacked = false;
        creature.hasSummoningSickness = !creature.card.keywords.includes("charge");
        creature.attacksRemaining = maxAttacksFor(creature);
        creature.instanceId = generateInstanceId();
        if (effect.target === "friendly_graveyard_to_board") {
          if (caster.board.length < MAX_BOARD_SIZE) caster.board.push(creature);
        } else {
          if (caster.hand.length < MAX_HAND_SIZE) caster.hand.push(creature);
        }
      }
      break;
    }
    case "gain_mana": {
      caster.mana += effect.amount ?? 1;
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
  const opponent = newState.players[newState.currentPlayerIndex === 0 ? 1 : 0];

  const attacker = player.board.find(c => c.instanceId === action.attackerInstanceId);
  if (!attacker) return state;
  if (attacker.attacksRemaining <= 0) return state;
  if (attacker.hasSummoningSickness) return state;

  // Ombre: always attacks hero, ignores taunts
  const effectiveTarget = hasKw(attacker, "ombre") ? "enemy_hero" : action.targetInstanceId;

  // Taunt check (skip for ombre)
  // Vol : ignore les taunts qui n'ont pas Vol elles-mêmes
  const attackerFlies = hasKw(attacker, "ranged");
  const relevantTaunts = opponent.board.filter(c =>
    hasKw(c, "taunt") && (!attackerFlies || hasKw(c, "ranged"))
  );
  if (!hasKw(attacker, "ombre") && relevantTaunts.length > 0) {
    if (effectiveTarget === "enemy_hero") return state;
    const target = opponent.board.find(c => c.instanceId === effectiveTarget);
    if (target && !relevantTaunts.includes(target)) return state;
  }

  // Double Attaque: must attack different targets
  if (hasKw(attacker, "double_attaque") && attacker.targetsAttackedThisTurn.includes(effectiveTarget)) {
    return state;
  }

  const attackPower = attacker.currentAttack;

  if (effectiveTarget === "enemy_hero") {
    // Souffle de feu: 4 damage to all enemy creatures
    if (hasKw(attacker, "souffle_de_feu")) {
      [...opponent.board].forEach(c => dealDamageToCreature(c, 4));
    }

    dealDamageToHero(opponent.hero, attackPower);

    // Drain de vie: heal own hero
    if (hasKw(attacker, "drain_de_vie")) {
      player.hero.hp = Math.min(player.hero.maxHp, player.hero.hp + attackPower);
    }

    attacker.attacksRemaining--;
    attacker.targetsAttackedThisTurn.push(effectiveTarget);
    attacker.hasAttacked = attacker.attacksRemaining <= 0;

  } else {
    const target = opponent.board.find(c => c.instanceId === effectiveTarget);
    if (!target) return state;

    // Esquive: 30% chance to dodge
    if (hasKw(target, "esquive") && rng() < 0.3) {
      attacker.attacksRemaining--;
      attacker.targetsAttackedThisTurn.push(effectiveTarget);
      attacker.hasAttacked = attacker.attacksRemaining <= 0;
      newState.lastAction = action;
      return newState;
    }

    const attackerHasPrecision = hasKw(attacker, "precision");

    // Premier Frappe: attacker deals damage first
    if (hasKw(attacker, "premier_frappe")) {
      dealDamageToCreature(target, attackPower, attackerHasPrecision);

      // Apply poison from attacker
      if (hasKw(attacker, "poison") && target.currentHealth > 0) {
        target.isPoisoned = true;
      }

      // If target survived, it retaliates
      if (target.currentHealth > 0) {
        dealDamageToCreature(attacker, target.currentAttack);
        if (hasKw(target, "poison") && attacker.currentHealth > 0) {
          attacker.isPoisoned = true;
        }
      }
    } else {
      // Simultaneous damage
      dealDamageToCreature(target, attackPower, attackerHasPrecision);
      dealDamageToCreature(attacker, target.currentAttack, hasKw(target, "precision"));

      // Poison application
      if (hasKw(attacker, "poison") && target.currentHealth > 0) target.isPoisoned = true;
      if (hasKw(target, "poison") && attacker.currentHealth > 0) attacker.isPoisoned = true;
    }

    // Souffle de feu: 4 damage to all OTHER enemy creatures
    if (hasKw(attacker, "souffle_de_feu")) {
      opponent.board.filter(c => c !== target).forEach(c => dealDamageToCreature(c, 4));
    }

    // Drain de vie: heal own hero for damage dealt
    if (hasKw(attacker, "drain_de_vie")) {
      player.hero.hp = Math.min(player.hero.maxHp, player.hero.hp + attackPower);
    }

    // Liaison de vie: damage taken by target is also dealt to enemy hero
    if (hasKw(target, "liaison_de_vie")) {
      const dmgTaken = Math.max(0, attackPower); // simplified
      dealDamageToHero(player.hero, dmgTaken);
    }

    // Fureur: +3 ATK for one turn after taking damage
    if (hasKw(target, "fureur") && target.currentHealth > 0 && !target.fureurActive) {
      target.fureurActive = true;
      target.fureurATKBonus = 3;
      target.currentAttack += 3;
    }
    if (hasKw(attacker, "fureur") && attacker.currentHealth > 0 && !attacker.fureurActive) {
      attacker.fureurActive = true;
      attacker.fureurATKBonus = 3;
      attacker.currentAttack += 3;
    }

    attacker.attacksRemaining--;
    attacker.targetsAttackedThisTurn.push(effectiveTarget);
    attacker.hasAttacked = attacker.attacksRemaining <= 0;
  }

  // Clean dead creatures and process death triggers
  const playerDead = cleanDeadCreatures(player);
  const opponentDead = cleanDeadCreatures(opponent);
  processDeathTriggers(playerDead, player, opponent);
  processDeathTriggers(opponentDead, opponent, player);

  recalculateAuras(player, opponent);

  newState.lastAction = action;
  checkWinCondition(newState);
  return newState;
}

// ============================================================
// DAMAGE HELPERS
// ============================================================

function dealDamageToHero(hero: import("./types").HeroState, damage: number) {
  if (damage <= 0) return;
  if (hero.armor > 0) {
    if (hero.armor >= damage) {
      hero.armor -= damage;
      return;
    } else {
      damage -= hero.armor;
      hero.armor = 0;
    }
  }
  hero.hp -= damage;
}

function dealDamageToCreature(creature: CardInstance, damage: number, ignoreDR = false) {
  if (damage <= 0) return;

  // Divine Shield absorbs
  if (creature.hasDivineShield) {
    creature.hasDivineShield = false;
    return;
  }

  // Damage reduction (unless attacker has Precision)
  if (!ignoreDR) {
    if (hasKw(creature, "resistance")) damage = Math.max(0, damage - 1);
    if (hasKw(creature, "armure")) damage = Math.max(0, damage - 2);
  }

  if (damage <= 0) return;
  creature.currentHealth -= damage;
}

// ============================================================
// DEATH PROCESSING
// ============================================================

function cleanDeadCreatures(player: PlayerState): CardInstance[] {
  const dead: CardInstance[] = [];
  const alive: CardInstance[] = [];

  for (const c of player.board) {
    if (c.currentHealth <= 0) {
      // Indestructible: survive once with 1 HP
      if (hasKw(c, "indestructible") && !c.hasUsedIndestructible) {
        c.currentHealth = 1;
        c.hasUsedIndestructible = true;
        alive.push(c);
      } else {
        dead.push(c);
      }
    } else {
      alive.push(c);
    }
  }

  player.board = alive;
  player.graveyard.push(...dead);
  return dead;
}

function processDeathTriggers(dead: CardInstance[], owner: PlayerState, enemy: PlayerState, depth = 0) {
  if (depth > 5 || dead.length === 0) return;

  for (const c of dead) {
    // Maléfice: deal 3 damage to all enemies
    if (hasKw(c, "malefice")) {
      dealDamageToHero(enemy.hero, 3);
      [...enemy.board].forEach(e => dealDamageToCreature(e, 3));
    }

    // Résurrection: return with half HP once
    if (hasKw(c, "resurrection") && !c.hasUsedResurrection) {
      if (owner.board.length < MAX_BOARD_SIZE) {
        const revived = createCardInstance(c.card);
        revived.currentHealth = Math.max(1, Math.floor(c.maxHealth / 2));
        revived.maxHealth = c.maxHealth;
        revived.hasUsedResurrection = true;
        revived.hasSummoningSickness = true;
        owner.board.push(revived);
      }
    }

    // Pacte de sang: summon a copy
    if (hasKw(c, "pacte_de_sang")) {
      if (owner.board.length < MAX_BOARD_SIZE) {
        const copy = createCardInstance(c.card);
        copy.hasSummoningSickness = true;
        owner.board.push(copy);
      }
    }
  }

  // Trigger passive hero power on friendly death
  triggerPassiveOnCreatureDeath(owner, dead.length);

  // Cascade: malefice may have killed more
  const cascadeDead = cleanDeadCreatures(enemy);
  if (cascadeDead.length > 0) {
    processDeathTriggers(cascadeDead, enemy, owner, depth + 1);
  }
}

function triggerPassiveOnCreatureDeath(player: PlayerState, deadCount: number) {
  if (!player.hero.heroDefinition) return;
  if (player.hero.heroDefinition.powerType !== "passive") return;
  if (player.hero.heroDefinition.powerEffect.type !== "buff_on_friendly_death") return;
  if (player.board.length === 0) return;

  const atkBuff = player.hero.heroDefinition.powerEffect.attack ?? 1;
  for (let i = 0; i < deadCount; i++) {
    if (player.board.length === 0) break;
    const idx = Math.floor(rng() * player.board.length);
    player.board[idx].currentAttack += atkBuff;
  }
}

// ============================================================
// HERO POWER
// ============================================================

export function useHeroPower(state: GameState, action: HeroPowerAction): GameState {
  const newState = deepClone(state);
  const player = newState.players[newState.currentPlayerIndex];
  const opponent = newState.players[newState.currentPlayerIndex === 0 ? 1 : 0];
  const heroDef = player.hero.heroDefinition;

  if (!heroDef || heroDef.powerType !== "active") return state;
  if (player.hero.heroPowerUsedThisTurn) return state;
  if (player.mana < heroDef.powerCost) return state;

  player.mana -= heroDef.powerCost;
  player.hero.heroPowerUsedThisTurn = true;

  const effect = heroDef.powerEffect;
  switch (effect.type) {
    case "gain_armor":
      player.hero.armor += effect.amount ?? 0;
      break;
    case "deal_damage": {
      const amount = effect.amount ?? 0;
      if (effect.target === "enemy_hero") {
        dealDamageToHero(opponent.hero, amount);
      } else if (effect.target === "any") {
        if (action.targetInstanceId === "enemy_hero") {
          dealDamageToHero(opponent.hero, amount);
        } else if (action.targetInstanceId === "friendly_hero") {
          dealDamageToHero(player.hero, amount);
        } else if (action.targetInstanceId) {
          const target = findCreatureOnBoard(player, action.targetInstanceId) ?? findCreatureOnBoard(opponent, action.targetInstanceId);
          if (target) {
            dealDamageToCreature(target, amount);
            const pDead = cleanDeadCreatures(player);
            const oDead = cleanDeadCreatures(opponent);
            processDeathTriggers(pDead, player, opponent);
            processDeathTriggers(oDead, opponent, player);
          }
        }
      }
      break;
    }
    case "heal": {
      const amount = effect.amount ?? 0;
      if (action.targetInstanceId === "friendly_hero") {
        player.hero.hp = Math.min(player.hero.maxHp, player.hero.hp + amount);
      } else if (action.targetInstanceId) {
        const target = findCreatureOnBoard(player, action.targetInstanceId);
        if (target) target.currentHealth = Math.min(target.maxHealth, target.currentHealth + amount);
      }
      break;
    }
  }

  newState.lastAction = action;
  checkWinCondition(newState);
  return newState;
}

export function canUseHeroPower(state: GameState): boolean {
  const player = state.players[state.currentPlayerIndex];
  const heroDef = player.hero.heroDefinition;
  if (!heroDef || heroDef.powerType !== "active") return false;
  if (player.hero.heroPowerUsedThisTurn) return false;
  if (player.mana < heroDef.powerCost) return false;
  return true;
}

export function heroPowerNeedsTarget(heroDef: HeroDefinition): boolean {
  if (heroDef.powerType !== "active") return false;
  const target = heroDef.powerEffect.target;
  return target === "any" || target === "any_friendly";
}

export function getHeroPowerTargets(state: GameState, heroDef: HeroDefinition): string[] {
  const player = state.players[state.currentPlayerIndex];
  const opponent = state.players[state.currentPlayerIndex === 0 ? 1 : 0];
  const target = heroDef.powerEffect.target;

  if (target === "any") {
    return [...player.board.map(c => c.instanceId), ...opponent.board.map(c => c.instanceId), "enemy_hero", "friendly_hero"];
  }
  if (target === "any_friendly") {
    return [...player.board.map(c => c.instanceId), "friendly_hero"];
  }
  return [];
}

// ============================================================
// MULLIGAN
// ============================================================

export function applyMulligan(state: GameState, action: MulliganAction): GameState {
  const newState = deepClone(state);
  const playerIndex = newState.players.findIndex(p => p.id === action.playerId);
  if (playerIndex === -1) return state;

  if (action.replacedInstanceIds && action.replacedInstanceIds.length > 0) {
    const player = newState.players[playerIndex];
    const kept = player.hand.filter(c => !action.replacedInstanceIds.includes(c.instanceId));
    const replaced = player.hand.filter(c => action.replacedInstanceIds.includes(c.instanceId));
    const drawn = player.deck.splice(0, replaced.length);
    player.deck.push(...replaced);
    player.hand = [...kept, ...drawn];
  }

  newState.mulliganReady[playerIndex] = true;

  if (newState.mulliganReady[0] && newState.mulliganReady[1]) {
    newState.players[0].deck = shuffleArray(newState.players[0].deck);
    newState.players[1].deck = shuffleArray(newState.players[1].deck);

    const secondPlayerIndex = newState.currentPlayerIndex === 0 ? 1 : 0;
    const manaSpark: Card = {
      id: -1, name: "Mana Spark", mana_cost: 0, card_type: "spell",
      attack: null, health: null, effect_text: "Gain 1 mana this turn",
      keywords: [], spell_effect: { type: "gain_mana", amount: 1 }, image_url: null,
    };
    newState.players[secondPlayerIndex].hand.push(createCardInstance(manaSpark));
    newState.phase = "playing";
    return startTurn(newState);
  }

  return newState;
}

// ============================================================
// ACTION DISPATCH
// ============================================================

export function applyAction(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "mulligan": return applyMulligan(state, action);
    case "play_card": return playCard(state, action);
    case "attack": return attack(state, action);
    case "end_turn": return endTurn(state);
    case "hero_power": return useHeroPower(state, action);
    default: return state;
  }
}

// ============================================================
// QUERY HELPERS (for UI)
// ============================================================

export function canPlayCard(state: GameState, cardInstanceId: string): boolean {
  const player = state.players[state.currentPlayerIndex];
  const card = player.hand.find(c => c.instanceId === cardInstanceId);
  if (!card) return false;
  if (card.card.mana_cost > player.mana) return false;
  if (card.card.card_type === "creature" && player.board.length >= MAX_BOARD_SIZE) return false;
  return true;
}

export function canAttack(state: GameState, attackerInstanceId: string): boolean {
  const player = state.players[state.currentPlayerIndex];
  const attacker = player.board.find(c => c.instanceId === attackerInstanceId);
  if (!attacker) return false;
  if (attacker.attacksRemaining <= 0) return false;
  if (attacker.hasSummoningSickness) return false;
  if (attacker.currentAttack <= 0) return false;
  return true;
}

export function getValidTargets(state: GameState, attackerInstanceId: string): string[] {
  const player = state.players[state.currentPlayerIndex];
  const opponent = state.players[state.currentPlayerIndex === 0 ? 1 : 0];
  const attacker = player.board.find(c => c.instanceId === attackerInstanceId);
  if (!attacker) return [];

  // Ombre: can only attack hero
  if (hasKw(attacker, "ombre")) return ["enemy_hero"];

  // Double Attaque: filter already-attacked targets
  const excludeTargets = hasKw(attacker, "double_attaque") ? attacker.targetsAttackedThisTurn : [];

  // Vol : ignore les taunts sans Vol
  const attackerFlies2 = hasKw(attacker, "ranged");
  const relevantTaunts2 = opponent.board.filter(c =>
    hasKw(c, "taunt") && (!attackerFlies2 || hasKw(c, "ranged"))
  );
  if (relevantTaunts2.length > 0) {
    return relevantTaunts2
      .map(c => c.instanceId)
      .filter(id => !excludeTargets.includes(id));
  }

  const targets = [...opponent.board.map(c => c.instanceId), "enemy_hero"];
  return targets.filter(id => !excludeTargets.includes(id));
}

export function needsTarget(card: Card): boolean {
  if (card.card_type !== "spell" || !card.spell_effect) return false;
  const target = card.spell_effect.target;
  return target === "any" || target === "any_creature" || target === "friendly_creature" || target === "enemy_creature";
}

export function getSpellTargets(state: GameState, card: Card): string[] {
  if (!card.spell_effect) return [];
  const player = state.players[state.currentPlayerIndex];
  const opponent = state.players[state.currentPlayerIndex === 0 ? 1 : 0];

  // Filter out invisible and transcendance creatures from enemy targeting
  const filterEnemyTargetable = (creatures: CardInstance[]) =>
    creatures.filter(c => !hasKw(c, "invisible") && c.transcendanceTurns <= 0);

  switch (card.spell_effect.target) {
    case "any":
      return [
        ...player.board.map(c => c.instanceId),
        ...filterEnemyTargetable(opponent.board).map(c => c.instanceId),
        "enemy_hero", "friendly_hero",
      ];
    case "any_creature":
      return [
        ...player.board.map(c => c.instanceId),
        ...filterEnemyTargetable(opponent.board).map(c => c.instanceId),
      ];
    case "friendly_creature":
      return player.board.map(c => c.instanceId);
    case "enemy_creature":
      return filterEnemyTargetable(opponent.board).map(c => c.instanceId);
    default:
      return [];
  }
}

// ============================================================
// HELPERS
// ============================================================

function findCreatureOnBoard(player: PlayerState, instanceId: string): CardInstance | undefined {
  return player.board.find(c => c.instanceId === instanceId);
}

function checkWinCondition(state: GameState) {
  const p1Dead = state.players[0].hero.hp <= 0;
  const p2Dead = state.players[1].hero.hp <= 0;
  if (p1Dead && p2Dead) {
    state.winner = state.players[state.currentPlayerIndex === 0 ? 1 : 0].id;
    state.phase = "finished";
  } else if (p1Dead) {
    state.winner = state.players[1].id;
    state.phase = "finished";
  } else if (p2Dead) {
    state.winner = state.players[0].id;
    state.phase = "finished";
  }
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
