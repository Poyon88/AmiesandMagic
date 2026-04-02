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
  SpellKeywordInstance,
  SpellEffectNode,
  AtomicEffect,
  SpellCondition,
  SimpleCondition,
  CompoundCondition,
  ConditionalEffectNode,
  SpellResolutionContext,
  SpellTargetSlot,
  SpellTargetType,
  TokenTemplate,
} from "./types";
import { SPELL_KEYWORDS } from "./spell-keywords";
import { parseXValuesFromEffectText } from "./keyword-labels";
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
let currentTokenTemplates: TokenTemplate[] = [];

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
    hasUsedResurrection: false,
    fureurActive: false,
    fureurATKBonus: 0,
    berserkActive: false,
    berserkATKBonus: 0,
    targetsAttackedThisTurn: [],
    esquiveUsedThisTurn: false,
    summonBonusATK: 0,
    ombreRevealed: false,
    corruptionStolenIds: [],
    contresortActive: false,
    maledictionTargetId: null,
    isParalyzed: false,
    loyauteATKBonus: 0,
    loyautePVBonus: 0,
    necrophagieATKBonus: 0,
    necrophagiePVBonus: 0,
    persecutionX: 0,
    riposteX: 0,
    carnageX: 0,
    heritageX: 0,
    instinctDeMeuteX: 0,
    cycleEternelAutoPlay: false,
    originalOwnerId: null,
  };
}

function applyTokenTemplate(tokenCard: Card, templates?: TokenTemplate[]): Card {
  const tmpls = templates ?? currentTokenTemplates;
  if (!tmpls.length || !tokenCard.race) return tokenCard;
  const tmpl = tmpls.find(t => t.race === tokenCard.race);
  if (!tmpl) return tokenCard;
  return {
    ...tokenCard,
    name: tmpl.name,
    image_url: tmpl.image_url,
    keywords: tmpl.keywords?.length ? tmpl.keywords : tokenCard.keywords,
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
  player2Hero?: HeroDefinition | null,
  factionCardPool?: Card[],
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
    factionCardPool: factionCardPool ?? undefined,
  };
}

// ============================================================
// AURA RECALCULATION
// ============================================================

function recalculateAuras(player: PlayerState, opponent: PlayerState) {
  // Reset ATK to base + permanent bonuses (not auras)
  for (const c of player.board) {
    let atk = c.card.attack ?? 0;
    atk += c.loyauteATKBonus;
    atk += c.summonBonusATK;
    if (c.fureurActive) atk += c.fureurATKBonus;
    atk += c.necrophagieATKBonus;
    c.currentAttack = atk;
  }
  for (const c of opponent.board) {
    let atk = c.card.attack ?? 0;
    atk += c.loyauteATKBonus;
    atk += c.summonBonusATK;
    if (c.fureurActive) atk += c.fureurATKBonus;
    atk += c.necrophagieATKBonus;
    c.currentAttack = atk;
  }

  // Loyauté: permanent on-summon bonus — NOT recalculated here (handled in playCard)

  // Terreur: enemy units -1 ATK per terreur unit
  const playerTerreurCount = player.board.filter(c => hasKw(c, "terreur")).length;
  const opponentTerreurCount = opponent.board.filter(c => hasKw(c, "terreur")).length;
  for (const c of opponent.board) {
    c.currentAttack = Math.max(0, c.currentAttack - playerTerreurCount);
  }
  for (const c of player.board) {
    c.currentAttack = Math.max(0, c.currentAttack - opponentTerreurCount);
  }

  // Commandement: alliés de même faction gagnent +1/+1
  for (const board of [player.board, opponent.board]) {
    for (const c of board) {
      if (hasKw(c, "commandement") && c.card.faction) {
        for (const ally of board) {
          if (ally !== c && ally.card.faction === c.card.faction) {
            ally.currentAttack += 1;
          }
        }
      }
    }
  }

  // Berserk: double ATK si PV actuels < PV originaux (sur la carte)
  for (const board of [player.board, opponent.board]) {
    for (const c of board) {
      if (hasKw(c, "berserk")) {
        const originalHP = c.card.health ?? 1;
        const shouldBeActive = c.currentHealth < originalHP;
        if (shouldBeActive && !c.berserkActive) {
          c.berserkActive = true;
          c.berserkATKBonus = c.currentAttack; // double = add current once more
          c.currentAttack += c.berserkATKBonus;
        } else if (!shouldBeActive && c.berserkActive) {
          c.berserkActive = false;
          c.currentAttack -= c.berserkATKBonus;
          c.berserkATKBonus = 0;
        }
      }
    }
  }

  // Sang mêlé: +1 ATK et +1 PV par type de race différent parmi vos alliés
  for (const board of [player.board, opponent.board]) {
    for (const c of board) {
      if (hasKw(c, "sang_mele")) {
        const uniqueRaces = new Set(board.filter(a => a !== c && a.card.race).map(a => a.card.race));
        c.currentAttack += uniqueRaces.size;
      }
    }
  }

  // Totem: gagne les capacités de toutes les unités de même race alliées
  for (const board of [player.board, opponent.board]) {
    for (const c of board) {
      if (hasKw(c, "totem") && c.card.race) {
        const sameRaceKeywords = board
          .filter(a => a !== c && a.card.race === c.card.race)
          .flatMap(a => a.card.keywords);
        const newKeywords = [...new Set([...c.card.keywords, ...sameRaceKeywords])];
        if (newKeywords.length !== c.card.keywords.length) {
          c.card = { ...c.card, keywords: newKeywords };
        }
      }
    }
  }

  // Bravoure: double dégâts contre unités à ATK supérieure (handled in combat, no aura needed)
}

// ============================================================
// TURN MANAGEMENT
// ============================================================

export function startTurn(state: GameState): GameState {
  const pool = state.factionCardPool;
  const newState = deepClone({ ...state, factionCardPool: undefined } as GameState);
  newState.factionCardPool = pool;
  const player = newState.players[newState.currentPlayerIndex];
  const opponent = newState.players[newState.currentPlayerIndex === 0 ? 1 : 0];

  newState.turnNumber++;

  // Canalisation: reduce mana cost of spells (handled at play time, not here)

  if (player.maxMana < MAX_MANA) player.maxMana++;
  player.mana = player.maxMana;
  drawCard(player);

  // Return Corruption-stolen units to opponent at start of owner's turn
  for (const creature of [...opponent.board]) {
    if (creature.originalOwnerId === player.id) {
      opponent.board = opponent.board.filter(c => c !== creature);
      creature.hasSummoningSickness = true;
      if (player.board.length < MAX_BOARD_SIZE) {
        player.board.push(creature);
      } else {
        player.graveyard.push(creature);
      }
      creature.originalOwnerId = null;
    }
  }

  // Process Malédiction: exile cursed enemy units at start of their owner's turn
  for (const creature of [...player.board]) {
    if (creature.maledictionTargetId) {
      const cursed = opponent.board.find(c => c.instanceId === creature.maledictionTargetId);
      if (cursed) {
        opponent.board = opponent.board.filter(c => c !== cursed);
        // Exiled — not added to graveyard
      }
      creature.maledictionTargetId = null;
    }
  }

  for (const creature of player.board) {
    creature.hasAttacked = false;
    creature.hasSummoningSickness = false;
    creature.attacksRemaining = maxAttacksFor(creature);
    creature.targetsAttackedThisTurn = [];

    // Reset esquive for the new turn
    creature.esquiveUsedThisTurn = false;

    // Reset paralysie
    if (creature.isParalyzed) {
      creature.isParalyzed = false;
      creature.attacksRemaining = 0; // can't attack this turn
      creature.hasSummoningSickness = true;
    }

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
  // Cycle éternel: auto-play if flagged
  if (card.cycleEternelAutoPlay && card.card.card_type === "creature" && player.board.length < MAX_BOARD_SIZE) {
    card.cycleEternelAutoPlay = false;
    card.hasSummoningSickness = true;
    player.board.push(card);
    return card;
  }
  if (player.hand.length >= MAX_HAND_SIZE) {
    player.graveyard.push(card);
    return null;
  }
  player.hand.push(card);
  return card;
}

export function endTurn(state: GameState): GameState {
  const pool = state.factionCardPool;
  const newState = deepClone({ ...state, factionCardPool: undefined } as GameState);
  newState.factionCardPool = pool;
  newState.currentPlayerIndex = newState.currentPlayerIndex === 0 ? 1 : 0;
  newState.lastAction = { type: "end_turn" };
  return startTurn(newState);
}

// ============================================================
// PLAY CARD
// ============================================================

export function playCard(state: GameState, action: PlayCardAction): GameState {
  // Exclude factionCardPool from deep clone for performance (it's read-only)
  const pool = state.factionCardPool;
  const newState = deepClone({ ...state, factionCardPool: undefined } as GameState);
  newState.factionCardPool = pool;
  const player = newState.players[newState.currentPlayerIndex];
  const opponent = newState.players[newState.currentPlayerIndex === 0 ? 1 : 0];

  const cardIndex = player.hand.findIndex(c => c.instanceId === action.cardInstanceId);
  if (cardIndex === -1) return state;

  const cardInstance = player.hand[cardIndex];
  const card = cardInstance.card;

  // Canalisation: reduce spell cost by 1 per unit with Canalisation on board
  let manaCost = card.mana_cost;
  if (card.card_type === "spell") {
    const canalisationCount = player.board.filter(c => hasKw(c, "canalisation")).length;
    manaCost = Math.max(0, manaCost - canalisationCount);
  }

  if (manaCost > player.mana) return state;

  player.mana -= manaCost;
  player.hand.splice(cardIndex, 1);

  if (card.card_type === "creature") {
    if (player.board.length >= MAX_BOARD_SIZE) return state;

    cardInstance.hasSummoningSickness = !card.keywords.includes("charge");
    cardInstance.hasAttacked = false;
    cardInstance.attacksRemaining = maxAttacksFor(cardInstance);
    const pos = action.boardPosition ?? player.board.length;
    player.board.splice(pos, 0, cardInstance);

    // ── On-summon triggers ──

    // Loyauté: +1 ATK et +1 PV permanent par allié de même race (effet d'invocation)
    if (hasKw(cardInstance, "loyaute") && cardInstance.card.race) {
      const sameRaceCount = player.board.filter(a => a !== cardInstance && a.card.race === cardInstance.card.race).length;
      if (sameRaceCount > 0) {
        cardInstance.loyauteATKBonus = sameRaceCount;
        cardInstance.loyautePVBonus = sameRaceCount;
        cardInstance.currentHealth += sameRaceCount;
        cardInstance.maxHealth += sameRaceCount;
      }
    }

    // Sacrifice: détruisez un allié pour gagner ses PV et ATK permanents
    if (hasKw(cardInstance, "sacrifice") && action.targetInstanceId) {
      const sacrificed = player.board.find(c => c.instanceId === action.targetInstanceId && c !== cardInstance);
      if (sacrificed) {
        cardInstance.summonBonusATK += sacrificed.currentAttack;
        cardInstance.currentAttack += sacrificed.currentAttack;
        cardInstance.currentHealth += sacrificed.currentHealth;
        cardInstance.maxHealth += sacrificed.currentHealth;
        player.board = player.board.filter(c => c !== sacrificed);
        player.graveyard.push(sacrificed);
        processDeathTriggers([sacrificed], player, opponent);
      }
    }

    // Corruption: vole une unité ennemie jusqu'à fin du tour, elle gagne Traque
    if (hasKw(cardInstance, "corruption") && opponent.board.length > 0) {
      const targetId = action.targetInstanceId;
      const stealTarget = targetId
        ? opponent.board.find(c => c.instanceId === targetId)
        : opponent.board[Math.floor(rng() * opponent.board.length)];
      if (stealTarget && player.board.length < MAX_BOARD_SIZE) {
        opponent.board = opponent.board.filter(c => c !== stealTarget);
        stealTarget.originalOwnerId = opponent.id;
        stealTarget.hasSummoningSickness = false; // Traque
        if (!stealTarget.card.keywords.includes("charge")) {
          stealTarget.card = { ...stealTarget.card, keywords: [...stealTarget.card.keywords, "charge"] };
        }
        player.board.push(stealTarget);
      }
    }

    // Domination: take control of random enemy (permanent)
    if (hasKw(cardInstance, "domination") && opponent.board.length > 0) {
      if (player.board.length < MAX_BOARD_SIZE) {
        const idx = Math.floor(rng() * opponent.board.length);
        const stolen = opponent.board.splice(idx, 1)[0];
        stolen.hasSummoningSickness = true;
        player.board.push(stolen);
      }
    }

    // Pillage: adversaire défausse une carte de son choix
    if (hasKw(cardInstance, "pillage") && opponent.hand.length > 0) {
      const discardIdx = Math.floor(rng() * opponent.hand.length);
      const discarded = opponent.hand.splice(discardIdx, 1)[0];
      opponent.graveyard.push(discarded);
    }

    // Contresort: annule le prochain sort adverse
    if (hasKw(cardInstance, "contresort")) {
      cardInstance.contresortActive = true;
    }

    // Convocation X: crée un token X/X de la race indiquée
    if (hasKw(cardInstance, "convocation") && player.board.length < MAX_BOARD_SIZE) {
      const xValues = parseXValuesFromEffectText(cardInstance.card.effect_text);
      const x = xValues["convocation"] || Math.max(1, cardInstance.card.mana_cost);
      const tokenRace = cardInstance.card.convocation_race || cardInstance.card.race;
      let tokenCard: Card = {
        id: -1, name: `Token ${tokenRace || ""}`.trim(),
        mana_cost: 0, card_type: "creature",
        attack: x, health: x,
        effect_text: `Token ${x}/${x}`,
        keywords: [], spell_keywords: null, spell_effects: null, image_url: null,
        race: tokenRace, faction: cardInstance.card.faction,
        clan: cardInstance.card.clan,
      };
      tokenCard = applyTokenTemplate(tokenCard);
      const token = createCardInstance(tokenCard);
      token.hasSummoningSickness = true;
      player.board.push(token);
    }

    // Convocations multiples : crée plusieurs tokens de races/stats différentes
    if (hasKw(cardInstance, "convocations_multiples") && card.convocation_tokens?.length) {
      for (const tokenDef of card.convocation_tokens) {
        if (player.board.length >= MAX_BOARD_SIZE) break;
        let tokenCard: Card = {
          id: -1, name: `Token ${tokenDef.race || ""}`.trim(),
          mana_cost: 0, card_type: "creature",
          attack: tokenDef.attack, health: tokenDef.health,
          effect_text: `Token ${tokenDef.attack}/${tokenDef.health}`,
          keywords: [], spell_keywords: null, spell_effects: null, image_url: null,
          race: tokenDef.race, faction: cardInstance.card.faction,
        };
        tokenCard = applyTokenTemplate(tokenCard);
        const token = createCardInstance(tokenCard);
        token.hasSummoningSickness = true;
        player.board.push(token);
      }
    }

    // Malédiction: cible une unité ennemie, exilée fin du prochain tour adverse
    if (hasKw(cardInstance, "malediction") && action.targetInstanceId) {
      const cursedTarget = opponent.board.find(c => c.instanceId === action.targetInstanceId);
      if (cursedTarget) {
        cardInstance.maledictionTargetId = cursedTarget.instanceId;
      }
    }

    // Paralysie: now a combat effect (applied when dealing damage, like poison)

    // Permutation: échange les PV de deux unités (une alliée, une ennemie)
    if (hasKw(cardInstance, "permutation") && action.targetInstanceId) {
      // targetInstanceId = enemy, secondTargetInstanceId would be ally
      // Simplified: swap HP between this unit and targeted enemy
      const enemyTarget = opponent.board.find(c => c.instanceId === action.targetInstanceId);
      if (enemyTarget) {
        const tempHP = cardInstance.currentHealth;
        const tempMaxHP = cardInstance.maxHealth;
        cardInstance.currentHealth = enemyTarget.currentHealth;
        cardInstance.maxHealth = enemyTarget.maxHealth;
        enemyTarget.currentHealth = tempHP;
        enemyTarget.maxHealth = tempMaxHP;
      }
    }

    // Vampirisme X: vole X PV à une unité ennemie ciblée
    if (hasKw(cardInstance, "vampirisme") && action.targetInstanceId) {
      const x = Math.max(1, Math.floor(cardInstance.card.mana_cost / 2));
      const vampTarget = opponent.board.find(c => c.instanceId === action.targetInstanceId);
      if (vampTarget) {
        const stolen = Math.min(x, vampTarget.currentHealth);
        vampTarget.currentHealth -= stolen;
        cardInstance.currentHealth += stolen;
        cardInstance.maxHealth += stolen;
        cardInstance.persecutionX = x; // reuse field for X tracking
      }
    }

    // Mimique: copie toutes les capacités d'une unité ciblée
    if (hasKw(cardInstance, "mimique") && action.targetInstanceId) {
      const mimicTarget = findCreatureOnBoard(player, action.targetInstanceId) ?? findCreatureOnBoard(opponent, action.targetInstanceId);
      if (mimicTarget) {
        const newKeywords = [...new Set([...cardInstance.card.keywords, ...mimicTarget.card.keywords])];
        cardInstance.card = { ...cardInstance.card, keywords: newKeywords };
        // Copy runtime state flags
        if (mimicTarget.hasDivineShield) cardInstance.hasDivineShield = true;
      }
    }

    // Métamorphose: devient une copie exacte d'une unité ciblée
    if (hasKw(cardInstance, "metamorphose") && action.targetInstanceId) {
      const morphTarget = findCreatureOnBoard(player, action.targetInstanceId) ?? findCreatureOnBoard(opponent, action.targetInstanceId);
      if (morphTarget) {
        cardInstance.card = { ...morphTarget.card };
        cardInstance.currentAttack = morphTarget.currentAttack;
        cardInstance.currentHealth = morphTarget.currentHealth;
        cardInstance.maxHealth = morphTarget.maxHealth;
        cardInstance.hasDivineShield = morphTarget.hasDivineShield;
      }
    }

    // Combustion: défaussez une carte de votre main, piochez deux
    if (hasKw(cardInstance, "combustion") && player.hand.length > 0) {
      const discardIdx = Math.floor(rng() * player.hand.length);
      const discarded = player.hand.splice(discardIdx, 1)[0];
      player.graveyard.push(discarded);
      drawCard(player);
      drawCard(player);
    }

    // Catalyse: réduit de 1 le coût en mana des unités de même race en main
    if (hasKw(cardInstance, "catalyse") && cardInstance.card.race) {
      for (const handCard of player.hand) {
        if (handCard.card.race === cardInstance.card.race && handCard.card.card_type === "creature") {
          handCard.card = { ...handCard.card, mana_cost: Math.max(0, handCard.card.mana_cost - 1) };
        }
      }
    }

    // Prescience X: piochez jusqu'à X cartes en main
    if (hasKw(cardInstance, "prescience")) {
      const x = Math.min(7, Math.max(3, cardInstance.card.mana_cost)); // X = mana cost capped
      while (player.hand.length < x && player.deck.length > 0) {
        drawCard(player);
      }
    }

    // Suprématie: +1 ATK et +1 PV par carte en main
    if (hasKw(cardInstance, "suprematie")) {
      const handSize = player.hand.length;
      cardInstance.summonBonusATK += handSize;
      cardInstance.currentAttack += handSize;
      cardInstance.currentHealth += handSize;
      cardInstance.maxHealth += handSize;
    }

    // Ombre du passé: +1 ATK et +1 PV par unité de même race au cimetière
    if (hasKw(cardInstance, "ombre_du_passe") && cardInstance.card.race) {
      const graveCount = player.graveyard.filter(c => c.card.race === cardInstance.card.race && c.card.card_type === "creature").length;
      cardInstance.summonBonusATK += graveCount;
      cardInstance.currentAttack += graveCount;
      cardInstance.currentHealth += graveCount;
      cardInstance.maxHealth += graveCount;
    }

    // Profanation X: exile X cartes du cimetière, +1/+1 par carte
    if (hasKw(cardInstance, "profanation")) {
      const x = Math.max(1, Math.floor(cardInstance.card.mana_cost / 2));
      const toExile = Math.min(x, player.graveyard.length);
      for (let i = 0; i < toExile; i++) {
        player.graveyard.pop(); // exile (remove from game)
      }
      cardInstance.summonBonusATK += toExile;
      cardInstance.currentAttack += toExile;
      cardInstance.currentHealth += toExile;
      cardInstance.maxHealth += toExile;
    }

    // Exhumation X: ressuscite une unité du cimetière (mana ≤ X)
    if (hasKw(cardInstance, "exhumation")) {
      const x = Math.max(1, cardInstance.card.mana_cost - 1);
      const resurrectable = player.graveyard.filter(c => c.card.card_type === "creature" && c.card.mana_cost <= x);
      if (resurrectable.length > 0 && player.board.length < MAX_BOARD_SIZE) {
        const target = (action.graveyardTargetInstanceId
          ? resurrectable.find(c => c.instanceId === action.graveyardTargetInstanceId)
          : resurrectable[resurrectable.length - 1]) ?? resurrectable[resurrectable.length - 1];
        player.graveyard = player.graveyard.filter(c => c !== target);
        const revived = createCardInstance(target.card);
        revived.hasSummoningSickness = true;
        player.board.push(revived);
      }
    }

    // Héritage du cimetière: copie les capacités d'une unité du cimetière
    if (hasKw(cardInstance, "heritage_du_cimetiere")) {
      const graveCreatures = player.graveyard.filter(c => c.card.card_type === "creature");
      if (graveCreatures.length > 0) {
        const graveTarget = (action.graveyardTargetInstanceId
          ? graveCreatures.find(c => c.instanceId === action.graveyardTargetInstanceId)
          : graveCreatures[graveCreatures.length - 1]) ?? graveCreatures[graveCreatures.length - 1];
        const newKeywords = [...new Set([...cardInstance.card.keywords, ...graveTarget.card.keywords])];
        cardInstance.card = { ...cardInstance.card, keywords: newKeywords };
      }
    }

    // Rappel: remettre une carte du cimetière en main
    if (hasKw(cardInstance, "rappel") && player.graveyard.length > 0) {
      const recallTarget = (action.graveyardTargetInstanceId
        ? player.graveyard.find(c => c.instanceId === action.graveyardTargetInstanceId)
        : player.graveyard[player.graveyard.length - 1]) ?? player.graveyard[player.graveyard.length - 1];
      if (recallTarget && player.hand.length < MAX_HAND_SIZE) {
        player.graveyard = player.graveyard.filter(c => c !== recallTarget);
        const refreshed = createCardInstance(recallTarget.card);
        player.hand.push(refreshed);
      }
    }

    // Divination: reveal top 3 cards, player chooses 1 to keep on top
    if (hasKw(cardInstance, "divination") && player.deck.length > 0) {
      const count = Math.min(3, player.deck.length);
      const top3 = player.deck.splice(0, count);
      const chosenIdx = Math.min(action.divinationChoiceIndex ?? 0, top3.length - 1);
      player.deck.unshift(top3[chosenIdx]); // chosen goes on top
      for (let i = 0; i < top3.length; i++) {
        if (i !== chosenIdx) player.deck.push(top3[i]); // rest on bottom
      }
    }

    // Sélection X: show X random cards from faction pool, player picks one for hand
    if (hasKw(cardInstance, "selection") && newState.factionCardPool?.length) {
      const selXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      const x = selXVals["selection"] || Math.max(2, Math.floor(cardInstance.card.mana_cost / 2));
      const choices = getSelectionCards(newState, x);
      if (choices.length > 0) {
        const chosenIdx = Math.min(action.selectionChoiceIndex ?? 0, choices.length - 1);
        if (player.hand.length < MAX_HAND_SIZE) {
          const chosen = createCardInstance(choices[chosenIdx]);
          player.hand.push(chosen);
        }
      }
    }

    // Bénédiction: soigne complètement une unité ciblée
    if (hasKw(cardInstance, "benediction") && action.targetInstanceId) {
      const healTarget = player.board.find(c => c.instanceId === action.targetInstanceId);
      if (healTarget) {
        healTarget.currentHealth = healTarget.maxHealth;
        healTarget.isPoisoned = false;
      }
    }

    // Traque du destin X: révèle X premières cartes du deck, prend 1 en main, reste en dessous aléatoire
    if (hasKw(cardInstance, "traque_du_destin") && player.deck.length > 0) {
      const x = Math.max(1, Math.floor(cardInstance.card.mana_cost / 2));
      const count = Math.min(x, player.deck.length);
      const revealed = player.deck.splice(0, count);
      if (revealed.length > 0 && player.hand.length < MAX_HAND_SIZE) {
        // Pick the first one (simplified — ideally player chooses)
        const chosenIdx = 0;
        player.hand.push(revealed[chosenIdx]);
        revealed.splice(chosenIdx, 1);
        // Shuffle the rest to bottom
        shuffleArray(revealed);
        player.deck.push(...revealed);
      }
    }

    // Sang mêlé: +1 ATK et +1 PV par type de race différent (on-summon permanent PV)
    if (hasKw(cardInstance, "sang_mele")) {
      const uniqueRaces = new Set(player.board.filter(a => a !== cardInstance && a.card.race).map(a => a.card.race));
      if (uniqueRaces.size > 0) {
        cardInstance.currentHealth += uniqueRaces.size;
        cardInstance.maxHealth += uniqueRaces.size;
      }
    }

    // Fierté du clan: handled as an aura — units of same clan summoned get +1/+1
    // Check if existing allies with Fierté du clan buff the newly summoned unit
    if (cardInstance.card.clan) {
      for (const ally of player.board) {
        if (ally !== cardInstance && hasKw(ally, "fierte_du_clan") && ally.card.clan === cardInstance.card.clan) {
          cardInstance.summonBonusATK += 1;
          cardInstance.currentAttack += 1;
          cardInstance.currentHealth += 1;
          cardInstance.maxHealth += 1;
        }
      }
    }

    // Solidarité X: piochez X cartes si 2+ alliés de même clan
    if (hasKw(cardInstance, "solidarite") && cardInstance.card.clan) {
      const sameClanCount = player.board.filter(a => a !== cardInstance && a.card.clan === cardInstance.card.clan).length;
      if (sameClanCount >= 2) {
        const x = Math.max(1, Math.floor(cardInstance.card.mana_cost / 3));
        for (let i = 0; i < x; i++) drawCard(player);
      }
    }

    // Appel du clan X: met en jeu la première unité de même clan (coût ≤ X) depuis le deck
    if (hasKw(cardInstance, "appel_du_clan") && cardInstance.card.clan && player.board.length < MAX_BOARD_SIZE) {
      const x = Math.max(1, cardInstance.card.mana_cost - 1);
      const idx = player.deck.findIndex(c => c.card.clan === cardInstance.card.clan && c.card.card_type === "creature" && c.card.mana_cost <= x);
      if (idx >= 0) {
        const [called] = player.deck.splice(idx, 1);
        const calledInstance = createCardInstance(called.card);
        calledInstance.hasSummoningSickness = true;
        player.board.push(calledInstance);
      }
    }

    // Rassemblement X: révèle X premières cartes du deck, unités de même race en main, reste défaussé
    if (hasKw(cardInstance, "rassemblement") && cardInstance.card.race && player.deck.length > 0) {
      const x = Math.max(1, Math.floor(cardInstance.card.mana_cost / 2));
      const count = Math.min(x, player.deck.length);
      const revealed = player.deck.splice(0, count);
      for (const c of revealed) {
        if (c.card.race === cardInstance.card.race && c.card.card_type === "creature" && player.hand.length < MAX_HAND_SIZE) {
          player.hand.push(c);
        } else {
          player.graveyard.push(c);
        }
      }
    }

    // Set Instinct de meute X value
    if (hasKw(cardInstance, "instinct_de_meute")) {
      cardInstance.instinctDeMeuteX = Math.max(1, Math.floor(cardInstance.card.mana_cost / 3));
    }

    // Set Persécution X value
    if (hasKw(cardInstance, "persecution")) {
      cardInstance.persecutionX = Math.max(1, Math.floor(cardInstance.card.mana_cost / 3));
    }

    // Set Riposte X value
    if (hasKw(cardInstance, "riposte")) {
      cardInstance.riposteX = Math.max(1, Math.floor(cardInstance.card.mana_cost / 3));
    }

    // Set Carnage X value
    if (hasKw(cardInstance, "carnage")) {
      cardInstance.carnageX = Math.max(1, Math.floor(cardInstance.card.mana_cost / 2));
    }

    // Set Héritage X value
    if (hasKw(cardInstance, "heritage")) {
      cardInstance.heritageX = Math.max(1, Math.floor(cardInstance.card.mana_cost / 3));
    }

    // Tactique X: attribue X capacités choisies à un allié (simplified: copy 1 keyword)
    if (hasKw(cardInstance, "tactique") && action.targetInstanceId) {
      const tacticTarget = player.board.find(c => c.instanceId === action.targetInstanceId && c !== cardInstance);
      if (tacticTarget) {
        // Use player-chosen keywords if provided, else fallback to first grantable
        const kwsToGrant = action.tactiqueKeywords
          ?? cardInstance.card.keywords.filter(kw => kw !== "tactique" && !tacticTarget.card.keywords.includes(kw)).slice(0, 1);
        for (const kw of kwsToGrant) {
          if (!tacticTarget.card.keywords.includes(kw)) {
            tacticTarget.card = { ...tacticTarget.card, keywords: [...tacticTarget.card.keywords, kw] };
          }
        }
      }
    }

    recalculateAuras(player, opponent);

    // Clean creatures killed by on-summon effects (vampirisme, corruption, etc.)
    const summonDead = cleanDeadCreatures(player);
    const summonDeadOpp = cleanDeadCreatures(opponent);
    processDeathTriggers(summonDead, player, opponent);
    processDeathTriggers(summonDeadOpp, opponent, player);

  } else if (card.card_type === "spell") {
    // Contresort: check if opponent has an active counter-spell
    const counterUnit = opponent.board.find(c => c.contresortActive);
    if (counterUnit) {
      counterUnit.contresortActive = false;
      // Spell is countered — goes to graveyard without effect
      player.graveyard.push(cardInstance);
      newState.lastAction = action;
      return newState;
    }

    // Build target map from action
    const targetMap: Record<string, string> = { ...(action.targetMap ?? {}) };
    // Backward compat: single targetInstanceId → target_0
    if (action.targetInstanceId && !action.targetMap) {
      targetMap["target_0"] = action.targetInstanceId;
    }

    const ctx: SpellResolutionContext = {
      state: newState, caster: player, opponent, card, targetMap, results: {},
    };

    // Phase 1: Resolve spell keywords
    if (card.spell_keywords?.length) {
      resolveSpellKeywords(ctx, card.spell_keywords);
      // Intermediate death processing to detect target_destroyed
      const pDead = cleanDeadCreatures(player);
      const oDead = cleanDeadCreatures(opponent);
      for (const [slot, instanceId] of Object.entries(targetMap)) {
        if ([...pDead, ...oDead].some(c => c.instanceId === instanceId)) {
          ctx.results[`${slot}_destroyed`] = true;
          ctx.results["target_destroyed"] = true;
        }
      }
      processDeathTriggers(pDead, player, opponent);
      processDeathTriggers(oDead, opponent, player);
    }

    // Phase 2: Resolve composable effects
    if (card.spell_effects?.effects?.length) {
      resolveComposableEffects(ctx, card.spell_effects.effects);
    }

    // Phase 3: Grant creature keywords from spell to first target
    if (card.keywords.length > 0) {
      const firstTargetId = targetMap["kw_0"] ?? targetMap["target_0"];
      if (firstTargetId && firstTargetId !== "enemy_hero" && firstTargetId !== "friendly_hero") {
        const target = findCreatureOnBoard(player, firstTargetId) ?? findCreatureOnBoard(opponent, firstTargetId);
        if (target) {
          for (const kw of card.keywords) {
            if (kw === "divine_shield") target.hasDivineShield = true;
            if (!target.card.keywords.includes(kw)) {
              target.card = { ...target.card, keywords: [...target.card.keywords, kw] };
            }
          }
        }
      }
    }

    // Legacy fallback for old spell_effect (temporary)
    if (card.spell_effect && !card.spell_keywords?.length && !card.spell_effects?.effects?.length) {
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
            if (target) dealDamageToCreature(target, amount, false, true);
          }
          break;
        }
        case "all_enemy_creatures":
          [...opponent.board].forEach(c => dealDamageToCreature(c, amount, false, true));
          break;
        case "all_enemies":
          dealDamageToHero(opponent.hero, amount);
          [...opponent.board].forEach(c => dealDamageToCreature(c, amount, false, true));
          break;
        case "all_friendly_creatures":
          [...caster.board].forEach(c => dealDamageToCreature(c, amount, false, true));
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
        const target = findCreatureOnBoard(caster, targetInstanceId) ?? findCreatureOnBoard(opponent, targetInstanceId);
        if (target) {
          const atkBuff = effect.attack ?? 0;
          const hpBuff = effect.health ?? 0;
          // Apply buff to base stats so recalculateAuras doesn't erase ATK bonus
          target.card = { ...target.card, attack: (target.card.attack ?? 0) + atkBuff, health: (target.card.health ?? 0) + hpBuff };
          target.currentAttack += atkBuff;
          target.currentHealth += hpBuff;
          target.maxHealth += hpBuff;
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
// NEW SPELL SYSTEM — SPELL KEYWORD RESOLUTION
// ============================================================

function resolveSpellKeywords(
  ctx: SpellResolutionContext,
  keywords: SpellKeywordInstance[]
): void {
  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    const def = SPELL_KEYWORDS[kw.id];
    // Resolve target: use keyword's implicit slot or first target slot
    const slot = def.needsTarget ? `kw_${i}` : undefined;
    const targetId = slot ? (ctx.targetMap[slot] ?? ctx.targetMap["target_0"]) : undefined;

    switch (kw.id) {
      case "impact": {
        const amount = kw.amount ?? 0;
        if (targetId === "enemy_hero") {
          dealDamageToHero(ctx.opponent.hero, amount);
        } else if (targetId === "friendly_hero") {
          dealDamageToHero(ctx.caster.hero, amount);
        } else if (targetId) {
          const target = findCreatureOnBoard(ctx.caster, targetId) ?? findCreatureOnBoard(ctx.opponent, targetId);
          if (target) dealDamageToCreature(target, amount, false, true);
        }
        break;
      }
      case "deferlement": {
        const amount = kw.amount ?? 0;
        dealDamageToHero(ctx.opponent.hero, amount);
        [...ctx.opponent.board].forEach(c => dealDamageToCreature(c, amount, false, true));
        break;
      }
      case "siphon": {
        const amount = kw.amount ?? 0;
        if (targetId && targetId !== "enemy_hero" && targetId !== "friendly_hero") {
          const target = findCreatureOnBoard(ctx.caster, targetId) ?? findCreatureOnBoard(ctx.opponent, targetId);
          if (target) dealDamageToCreature(target, amount, false, true);
        } else if (targetId === "enemy_hero") {
          dealDamageToHero(ctx.opponent.hero, amount);
        }
        ctx.caster.hero.hp = Math.min(ctx.caster.hero.maxHp, ctx.caster.hero.hp + amount);
        break;
      }
      case "entrave": {
        if (targetId) {
          const target = findCreatureOnBoard(ctx.opponent, targetId);
          if (target) target.isParalyzed = true;
        }
        break;
      }
      case "execution": {
        if (targetId) {
          const target = findCreatureOnBoard(ctx.caster, targetId) ?? findCreatureOnBoard(ctx.opponent, targetId);
          if (target) target.currentHealth = 0;
        }
        break;
      }
      case "silence": {
        if (targetId) {
          const target = findCreatureOnBoard(ctx.caster, targetId) ?? findCreatureOnBoard(ctx.opponent, targetId);
          if (target) {
            target.card = { ...target.card, keywords: [] };
            target.hasDivineShield = false;
            target.contresortActive = false;
            target.isParalyzed = false;
            target.fureurActive = false;
            target.fureurATKBonus = 0;
            target.berserkActive = false;
            target.berserkATKBonus = 0;
          }
        }
        break;
      }
      case "renforcement": {
        if (targetId) {
          const target = findCreatureOnBoard(ctx.caster, targetId) ?? findCreatureOnBoard(ctx.opponent, targetId);
          if (target) {
            const atkBuff = kw.attack ?? 0;
            const hpBuff = kw.health ?? 0;
            target.card = { ...target.card, attack: (target.card.attack ?? 0) + atkBuff, health: (target.card.health ?? 0) + hpBuff };
            target.currentAttack += atkBuff;
            target.currentHealth += hpBuff;
            target.maxHealth += hpBuff;
          }
        }
        break;
      }
      case "guerison": {
        const amount = kw.amount ?? 0;
        if (targetId === "enemy_hero") {
          ctx.opponent.hero.hp = Math.min(ctx.opponent.hero.maxHp, ctx.opponent.hero.hp + amount);
        } else if (targetId === "friendly_hero") {
          ctx.caster.hero.hp = Math.min(ctx.caster.hero.maxHp, ctx.caster.hero.hp + amount);
        } else if (targetId) {
          const target = findCreatureOnBoard(ctx.caster, targetId) ?? findCreatureOnBoard(ctx.opponent, targetId);
          if (target) target.currentHealth = Math.min(target.maxHealth, target.currentHealth + amount);
        }
        break;
      }
      case "invocation": {
        if (ctx.caster.board.length < MAX_BOARD_SIZE) {
          let tokenCard: Card = {
            id: -1, name: kw.race ? `Token ${kw.race}` : "Token",
            mana_cost: 0, card_type: "creature",
            attack: kw.attack ?? 1, health: kw.health ?? 1,
            effect_text: `Token ${kw.attack ?? 1}/${kw.health ?? 1}`,
            keywords: [], spell_keywords: null, spell_effects: null, image_url: null,
            race: kw.race,
          };
          tokenCard = applyTokenTemplate(tokenCard);
          const token = createCardInstance(tokenCard);
          token.hasSummoningSickness = true;
          ctx.caster.board.push(token);
        }
        break;
      }
      case "invocation_multiple": {
        const tokenDefs = ctx.card.convocation_tokens ?? [];
        for (const tokenDef of tokenDefs) {
          if (ctx.caster.board.length >= MAX_BOARD_SIZE) break;
          let tokenCard: Card = {
            id: -1, name: `Token ${tokenDef.race || ""}`.trim(),
            mana_cost: 0, card_type: "creature",
            attack: tokenDef.attack, health: tokenDef.health,
            effect_text: `Token ${tokenDef.attack}/${tokenDef.health}`,
            keywords: [], spell_keywords: null, spell_effects: null, image_url: null,
            race: tokenDef.race,
          };
          tokenCard = applyTokenTemplate(tokenCard);
          const token = createCardInstance(tokenCard);
          token.hasSummoningSickness = true;
          ctx.caster.board.push(token);
        }
        break;
      }
      case "inspiration": {
        const amount = kw.amount ?? 1;
        for (let j = 0; j < amount; j++) drawCard(ctx.caster);
        break;
      }
      case "afflux": {
        ctx.caster.mana += kw.amount ?? 1;
        break;
      }
      case "rappel": {
        if (targetId) {
          const gravIdx = ctx.caster.graveyard.findIndex(c => c.instanceId === targetId);
          if (gravIdx !== -1) {
            const target = ctx.caster.graveyard[gravIdx];
            if (target.card.card_type === "creature" && ctx.caster.hand.length < MAX_HAND_SIZE) {
              ctx.caster.graveyard.splice(gravIdx, 1);
              const refreshed = createCardInstance(target.card);
              ctx.caster.hand.push(refreshed);
            }
          }
        }
        break;
      }
      case "selection": {
        const x = kw.amount ?? 2;
        if (ctx.state.factionCardPool?.length) {
          const choices = getSelectionCards(ctx.state, x);
          if (choices.length > 0) {
            const chosenIdx = Math.min(ctx.targetMap["selection_0"] ? parseInt(ctx.targetMap["selection_0"]) : 0, choices.length - 1);
            if (ctx.caster.hand.length < MAX_HAND_SIZE) {
              const chosen = createCardInstance(choices[chosenIdx]);
              ctx.caster.hand.push(chosen);
            }
          }
        }
        break;
      }
      case "exhumation": {
        const maxCost = kw.amount ?? 1;
        if (targetId) {
          const gravIdx = ctx.caster.graveyard.findIndex(c => c.instanceId === targetId);
          if (gravIdx !== -1) {
            const target = ctx.caster.graveyard[gravIdx];
            if (target.card.card_type === "creature"
                && target.card.mana_cost <= maxCost
                && ctx.caster.board.length < MAX_BOARD_SIZE) {
              ctx.caster.graveyard.splice(gravIdx, 1);
              const revived = createCardInstance(target.card);
              revived.hasSummoningSickness = true;
              ctx.caster.board.push(revived);
            }
          }
        }
        break;
      }
    }
  }
}

// ============================================================
// NEW SPELL SYSTEM — COMPOSABLE EFFECTS RESOLUTION
// ============================================================

function isConditionalNode(node: SpellEffectNode): node is ConditionalEffectNode {
  return "condition" in node;
}

function resolveComposableEffects(
  ctx: SpellResolutionContext,
  effects: SpellEffectNode[]
): void {
  for (const node of effects) {
    if (isConditionalNode(node)) {
      if (evaluateCondition(ctx, node.condition)) {
        resolveComposableEffects(ctx, node.then);
      } else if (node.else) {
        resolveComposableEffects(ctx, node.else);
      }
    } else {
      resolveAtomicEffect(ctx, node);
    }
  }
}

function evaluateCondition(ctx: SpellResolutionContext, cond: SpellCondition): boolean {
  // Compound condition
  if ("op" in cond) {
    const compound = cond as CompoundCondition;
    switch (compound.op) {
      case "AND":
        return compound.conditions.every(c => evaluateCondition(ctx, c));
      case "OR":
        return compound.conditions.some(c => evaluateCondition(ctx, c));
      case "NOT":
        return compound.conditions.length > 0 ? !evaluateCondition(ctx, compound.conditions[0]) : true;
    }
  }

  // Simple condition
  const simple = cond as SimpleCondition;
  const comparator = simple.comparator ?? ">=";
  const numVal = typeof simple.value === "number" ? simple.value : parseInt(simple.value as string) || 0;

  function compare(actual: number): boolean {
    switch (comparator) {
      case ">=": return actual >= numVal;
      case "<=": return actual <= numVal;
      case "==": return actual === numVal;
      case ">": return actual > numVal;
      default: return false;
    }
  }

  switch (simple.type) {
    case "target_destroyed": {
      if (simple.target_slot) {
        return !!ctx.results[`${simple.target_slot}_destroyed`];
      }
      return !!ctx.results["target_destroyed"];
    }
    case "board_count": {
      const side = simple.side === "enemy" ? ctx.opponent : ctx.caster;
      return compare(side.board.length);
    }
    case "hand_count": {
      const side = simple.side === "enemy" ? ctx.opponent : ctx.caster;
      return compare(side.hand.length);
    }
    case "hero_hp_below": {
      const side = simple.side === "enemy" ? ctx.opponent : ctx.caster;
      return side.hero.hp < numVal;
    }
    case "race_match": {
      if (!simple.target_slot) return false;
      const targetId = ctx.targetMap[simple.target_slot];
      if (!targetId) return false;
      const target = findCreatureOnBoard(ctx.caster, targetId) ?? findCreatureOnBoard(ctx.opponent, targetId);
      return target?.card.race === (simple.value as string);
    }
    case "faction_match": {
      if (!simple.target_slot) return false;
      const targetId = ctx.targetMap[simple.target_slot];
      if (!targetId) return false;
      const target = findCreatureOnBoard(ctx.caster, targetId) ?? findCreatureOnBoard(ctx.opponent, targetId);
      return target?.card.faction === (simple.value as string);
    }
    case "graveyard_count": {
      const side = simple.side === "enemy" ? ctx.opponent : ctx.caster;
      return compare(side.graveyard.length);
    }
    case "mana_remaining": {
      return compare(ctx.caster.mana);
    }
    case "has_keyword": {
      if (!simple.target_slot) return false;
      const targetId = ctx.targetMap[simple.target_slot];
      if (!targetId) return false;
      const target = findCreatureOnBoard(ctx.caster, targetId) ?? findCreatureOnBoard(ctx.opponent, targetId);
      return target?.card.keywords.includes(simple.value as Keyword) ?? false;
    }
    default:
      return false;
  }
}

function resolveAtomicEffect(ctx: SpellResolutionContext, effect: AtomicEffect): void {
  const targetId = effect.target_slot ? ctx.targetMap[effect.target_slot] : undefined;

  switch (effect.type) {
    case "deal_damage": {
      const amount = effect.amount ?? 0;
      if (targetId === "enemy_hero") {
        dealDamageToHero(ctx.opponent.hero, amount);
      } else if (targetId === "friendly_hero") {
        dealDamageToHero(ctx.caster.hero, amount);
      } else if (targetId) {
        const target = findCreatureOnBoard(ctx.caster, targetId) ?? findCreatureOnBoard(ctx.opponent, targetId);
        if (target) dealDamageToCreature(target, amount, false, true);
      }
      break;
    }
    case "heal": {
      const amount = effect.amount ?? 0;
      if (targetId === "friendly_hero") {
        ctx.caster.hero.hp = Math.min(ctx.caster.hero.maxHp, ctx.caster.hero.hp + amount);
      } else if (targetId === "enemy_hero") {
        ctx.opponent.hero.hp = Math.min(ctx.opponent.hero.maxHp, ctx.opponent.hero.hp + amount);
      } else if (targetId) {
        const target = findCreatureOnBoard(ctx.caster, targetId) ?? findCreatureOnBoard(ctx.opponent, targetId);
        if (target) target.currentHealth = Math.min(target.maxHealth, target.currentHealth + amount);
      }
      break;
    }
    case "buff": {
      if (targetId) {
        const target = findCreatureOnBoard(ctx.caster, targetId) ?? findCreatureOnBoard(ctx.opponent, targetId);
        if (target) {
          const atkBuff = effect.attack ?? 0;
          const hpBuff = effect.health ?? 0;
          target.card = { ...target.card, attack: (target.card.attack ?? 0) + atkBuff, health: (target.card.health ?? 0) + hpBuff };
          target.currentAttack += atkBuff;
          target.currentHealth += hpBuff;
          target.maxHealth += hpBuff;
        }
      }
      break;
    }
    case "debuff": {
      if (targetId) {
        const target = findCreatureOnBoard(ctx.caster, targetId) ?? findCreatureOnBoard(ctx.opponent, targetId);
        if (target) {
          const atkDebuff = effect.attack ?? 0;
          const hpDebuff = effect.health ?? 0;
          target.card = { ...target.card, attack: Math.max(0, (target.card.attack ?? 0) - atkDebuff), health: Math.max(1, (target.card.health ?? 0) - hpDebuff) };
          target.currentAttack = Math.max(0, target.currentAttack - atkDebuff);
          target.currentHealth = Math.max(1, target.currentHealth - hpDebuff);
          target.maxHealth = Math.max(1, target.maxHealth - hpDebuff);
        }
      }
      break;
    }
    case "draw_cards": {
      const amount = effect.amount ?? 1;
      for (let i = 0; i < amount; i++) drawCard(ctx.caster);
      break;
    }
    case "discard": {
      const amount = effect.amount ?? 1;
      for (let i = 0; i < amount && ctx.opponent.hand.length > 0; i++) {
        const idx = Math.floor(rng() * ctx.opponent.hand.length);
        const discarded = ctx.opponent.hand.splice(idx, 1)[0];
        ctx.opponent.graveyard.push(discarded);
      }
      break;
    }
    case "grant_keyword": {
      if (targetId && effect.keyword) {
        const target = findCreatureOnBoard(ctx.caster, targetId) ?? findCreatureOnBoard(ctx.opponent, targetId);
        if (target) {
          if (effect.keyword === "divine_shield") target.hasDivineShield = true;
          if (!target.card.keywords.includes(effect.keyword)) {
            target.card = { ...target.card, keywords: [...target.card.keywords, effect.keyword] };
          }
        }
      }
      break;
    }
    case "remove_keyword": {
      if (targetId && effect.keyword) {
        const target = findCreatureOnBoard(ctx.caster, targetId) ?? findCreatureOnBoard(ctx.opponent, targetId);
        if (target) {
          target.card = { ...target.card, keywords: target.card.keywords.filter(k => k !== effect.keyword) };
          if (effect.keyword === "divine_shield") target.hasDivineShield = false;
        }
      }
      break;
    }
    case "summon_token": {
      if (ctx.caster.board.length < MAX_BOARD_SIZE) {
        let tokenCard: Card = {
          id: -1, name: effect.race ? `Token ${effect.race}` : "Token",
          mana_cost: 0, card_type: "creature",
          attack: effect.attack ?? 1, health: effect.health ?? 1,
          effect_text: `Token ${effect.attack ?? 1}/${effect.health ?? 1}`,
          keywords: [], spell_keywords: null, spell_effects: null, image_url: null,
          race: effect.race,
        };
        tokenCard = applyTokenTemplate(tokenCard);
        const token = createCardInstance(tokenCard);
        token.hasSummoningSickness = true;
        ctx.caster.board.push(token);
      }
      break;
    }
    case "resurrect": {
      const amount = effect.amount ?? 1;
      const deadCreatures = ctx.caster.graveyard.filter(c => c.card.card_type === "creature");
      const shuffled = shuffleArray(deadCreatures);
      const toResurrect = shuffled.slice(0, amount);
      for (const creature of toResurrect) {
        const idx = ctx.caster.graveyard.indexOf(creature);
        if (idx !== -1) ctx.caster.graveyard.splice(idx, 1);
        creature.currentAttack = creature.card.attack ?? 0;
        creature.currentHealth = creature.card.health ?? 1;
        creature.maxHealth = creature.card.health ?? 1;
        creature.hasSummoningSickness = true;
        creature.instanceId = generateInstanceId();
        if (ctx.caster.board.length < MAX_BOARD_SIZE) ctx.caster.board.push(creature);
      }
      break;
    }
    case "gain_mana": {
      ctx.caster.mana += effect.amount ?? 1;
      break;
    }
    case "paralyze": {
      if (targetId) {
        const target = findCreatureOnBoard(ctx.opponent, targetId);
        if (target) target.isParalyzed = true;
      }
      break;
    }
    case "destroy": {
      if (targetId) {
        const target = findCreatureOnBoard(ctx.caster, targetId) ?? findCreatureOnBoard(ctx.opponent, targetId);
        if (target) target.currentHealth = 0;
      }
      break;
    }
    case "steal": {
      if (targetId) {
        const target = findCreatureOnBoard(ctx.opponent, targetId);
        if (target && ctx.caster.board.length < MAX_BOARD_SIZE) {
          const idx = ctx.opponent.board.indexOf(target);
          if (idx !== -1) {
            ctx.opponent.board.splice(idx, 1);
            target.originalOwnerId = ctx.opponent.id;
            target.hasSummoningSickness = false;
            ctx.caster.board.push(target);
          }
        }
      }
      break;
    }
    case "transform": {
      if (targetId) {
        const target = findCreatureOnBoard(ctx.caster, targetId) ?? findCreatureOnBoard(ctx.opponent, targetId);
        if (target) {
          target.currentAttack = effect.attack ?? target.currentAttack;
          target.currentHealth = effect.health ?? target.currentHealth;
          target.maxHealth = effect.health ?? target.maxHealth;
          target.card = {
            ...target.card,
            attack: effect.attack ?? target.card.attack,
            health: effect.health ?? target.card.health,
            keywords: [],
          };
          target.hasDivineShield = false;
        }
      }
      break;
    }
    case "bounce": {
      if (targetId) {
        const ownerIsPlayer = !!findCreatureOnBoard(ctx.caster, targetId);
        const owner = ownerIsPlayer ? ctx.caster : ctx.opponent;
        const target = findCreatureOnBoard(owner, targetId);
        if (target) {
          const idx = owner.board.indexOf(target);
          if (idx !== -1) {
            owner.board.splice(idx, 1);
            // Reset to fresh card instance in hand
            target.currentAttack = target.card.attack ?? 0;
            target.currentHealth = target.card.health ?? 1;
            target.maxHealth = target.card.health ?? 1;
            target.hasSummoningSickness = true;
            if (owner.hand.length < MAX_HAND_SIZE) {
              owner.hand.push(target);
            } else {
              owner.graveyard.push(target);
            }
          }
        }
      }
      break;
    }
  }
}

// ============================================================
// NEW SPELL SYSTEM — TARGETING
// ============================================================

function requiresPlayerSelection(targetType: SpellTargetType): boolean {
  return targetType === "any" || targetType === "any_creature"
    || targetType === "friendly_creature" || targetType === "enemy_creature"
    || targetType === "friendly_graveyard" || targetType === "friendly_graveyard_to_board";
}

export function getSpellTargetSlots(card: Card): SpellTargetSlot[] {
  const slots: SpellTargetSlot[] = [];

  // From spell keywords
  if (card.spell_keywords) {
    card.spell_keywords.forEach((kw, i) => {
      const def = SPELL_KEYWORDS[kw.id];
      if (def.needsTarget && def.targetType) {
        slots.push({ slot: `kw_${i}`, type: def.targetType, label: def.label });
      }
    });
  }

  // From composable effects
  if (card.spell_effects?.targets) {
    slots.push(...card.spell_effects.targets);
  }

  return slots;
}

// ============================================================
// ATTACK
// ============================================================

export function attack(state: GameState, action: AttackAction): GameState {
  const pool = state.factionCardPool;
  const newState = deepClone({ ...state, factionCardPool: undefined } as GameState);
  newState.factionCardPool = pool;
  const player = newState.players[newState.currentPlayerIndex];
  const opponent = newState.players[newState.currentPlayerIndex === 0 ? 1 : 0];

  const attacker = player.board.find(c => c.instanceId === action.attackerInstanceId);
  if (!attacker) return state;
  if (attacker.attacksRemaining <= 0) return state;
  if (attacker.hasSummoningSickness && !hasKw(attacker, "raid")) return state;

  const effectiveTarget = action.targetInstanceId;

  // Raid with summoning sickness: can only target creatures, not hero
  if (attacker.hasSummoningSickness && hasKw(attacker, "raid") && effectiveTarget === "enemy_hero") return state;

  // Taunt check
  // Vol : ignore les taunts qui n'ont pas Vol elles-mêmes
  const attackerFlies = hasKw(attacker, "ranged");
  const relevantTaunts = opponent.board.filter(c =>
    hasKw(c, "taunt") && (!attackerFlies || hasKw(c, "ranged"))
  );
  if (relevantTaunts.length > 0) {
    if (effectiveTarget === "enemy_hero") return state;
    const target = opponent.board.find(c => c.instanceId === effectiveTarget);
    if (target && !relevantTaunts.includes(target)) return state;
  }

  // Ombre: reveal stealth when attacking
  if (hasKw(attacker, "ombre")) {
    attacker.ombreRevealed = true;
  }

  let attackPower = attacker.currentAttack;

  // Bravoure: double ses dégâts contre unités à ATK supérieure
  const targetCreature = effectiveTarget !== "enemy_hero"
    ? opponent.board.find(c => c.instanceId === effectiveTarget) : null;
  if (hasKw(attacker, "bravoure") && targetCreature && targetCreature.currentAttack > attacker.currentAttack) {
    attackPower = Math.ceil(attackPower * 2);
  }

  if (effectiveTarget === "enemy_hero") {
    // Souffle de feu X: X dégâts à toutes les unités ennemies
    if (hasKw(attacker, "souffle_de_feu")) {
      const fireX = Math.max(1, Math.floor(attacker.card.mana_cost / 2));
      [...opponent.board].forEach(c => dealDamageToCreature(c, fireX));
    }

    dealDamageToHero(opponent.hero, attackPower);

    // Drain de vie: heal own hero
    if (hasKw(attacker, "drain_de_vie")) {
      player.hero.hp = Math.min(player.hero.maxHp, player.hero.hp + attackPower);
    }

    // Augure: piochez une carte quand dégâts au héros adverse
    if (hasKw(attacker, "augure")) {
      drawCard(player);
    }

    // Persécution X: dégâts bonus au héros adverse
    if (hasKw(attacker, "persecution") && attacker.persecutionX > 0) {
      dealDamageToHero(opponent.hero, attacker.persecutionX);
    }

    attacker.attacksRemaining--;
    attacker.targetsAttackedThisTurn.push(effectiveTarget);
    attacker.hasAttacked = attacker.attacksRemaining <= 0;

  } else {
    const target = opponent.board.find(c => c.instanceId === effectiveTarget);
    if (!target) return state;

    // Esquive: évite automatiquement la 1re attaque chaque tour
    if (hasKw(target, "esquive") && !target.esquiveUsedThisTurn) {
      target.esquiveUsedThisTurn = true;
      attacker.attacksRemaining--;
      attacker.targetsAttackedThisTurn.push(effectiveTarget);
      attacker.hasAttacked = attacker.attacksRemaining <= 0;
      newState.lastAction = action;
      return newState;
    }

    const attackerHasPrecision = hasKw(attacker, "precision");

    // Double Attaque: inflige 2x ATK, 1re fois en Première Frappe
    // Première Frappe: attacker deals damage first
    const hasFirstStrike = hasKw(attacker, "premiere_frappe") || hasKw(attacker, "double_attaque");

    if (hasFirstStrike) {
      dealDamageToCreature(target, attackPower, attackerHasPrecision);

      // Double Attaque: second hit
      if (hasKw(attacker, "double_attaque") && target.currentHealth > 0) {
        dealDamageToCreature(target, attackPower, attackerHasPrecision);
      }

      // Apply poison from attacker
      if (hasKw(attacker, "poison") && target.currentHealth > 0) {
        target.isPoisoned = true;
      }
      // Apply paralysie from attacker
      if (hasKw(attacker, "paralysie") && target.currentHealth > 0) {
        target.isParalyzed = true;
      }

      // If target survived, it retaliates
      if (target.currentHealth > 0) {
        dealDamageToCreature(attacker, target.currentAttack);
        if (hasKw(target, "poison") && attacker.currentHealth > 0) {
          attacker.isPoisoned = true;
        }
        if (hasKw(target, "paralysie") && attacker.currentHealth > 0) {
          attacker.isParalyzed = true;
        }
      }
    } else {
      // Simultaneous damage
      dealDamageToCreature(target, attackPower, attackerHasPrecision);
      dealDamageToCreature(attacker, target.currentAttack, hasKw(target, "precision"));

      // Poison application
      if (hasKw(attacker, "poison") && target.currentHealth > 0) target.isPoisoned = true;
      if (hasKw(target, "poison") && attacker.currentHealth > 0) attacker.isPoisoned = true;
      // Paralysie application
      if (hasKw(attacker, "paralysie") && target.currentHealth > 0) target.isParalyzed = true;
      if (hasKw(target, "paralysie") && attacker.currentHealth > 0) attacker.isParalyzed = true;
    }

    // Souffle de feu X: X dégâts à toutes les AUTRES unités ennemies
    if (hasKw(attacker, "souffle_de_feu")) {
      const fireX = Math.max(1, Math.floor(attacker.card.mana_cost / 2));
      opponent.board.filter(c => c !== target).forEach(c => dealDamageToCreature(c, fireX));
    }

    // Drain de vie: heal own hero for damage dealt
    if (hasKw(attacker, "drain_de_vie")) {
      player.hero.hp = Math.min(player.hero.maxHp, player.hero.hp + attackPower);
    }

    // Liaison de vie: damage taken shared with enemy hero
    if (hasKw(target, "liaison_de_vie")) {
      dealDamageToHero(player.hero, attackPower);
    }

    // Riposte X: counter-damage to attacker
    if (hasKw(target, "riposte") && target.riposteX > 0) {
      dealDamageToCreature(attacker, target.riposteX);
    }

    // Fureur: après dégâts, attaque immédiatement une unité adverse au choix
    // Simplified: gains bonus ATK for immediate counter-attack opportunity
    if (hasKw(target, "fureur") && target.currentHealth > 0 && !target.fureurActive) {
      target.fureurActive = true;
      target.fureurATKBonus = target.currentAttack; // counter-attack with full ATK
      // Deal immediate damage to the attacker as counter
      dealDamageToCreature(attacker, target.currentAttack);
    }
    if (hasKw(attacker, "fureur") && attacker.currentHealth > 0 && !attacker.fureurActive) {
      attacker.fureurActive = true;
      attacker.fureurATKBonus = 0; // already attacked, just flag
    }

    // Augure: if attacker hits hero (doesn't apply in creature combat)
    // Persécution X: X dégâts au héros adverse on each attack
    if (hasKw(attacker, "persecution") && attacker.persecutionX > 0) {
      dealDamageToHero(opponent.hero, attacker.persecutionX);
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

function dealDamageToCreature(creature: CardInstance, damage: number, ignoreDR = false, isSpellDamage = false) {
  if (damage <= 0) return;

  // Transcendance: immunité totale aux sorts (y compris zone)
  if (hasKw(creature, "transcendance") && isSpellDamage) {
    return;
  }

  // Indestructible: ne subit aucun dégât de combat (sauf sorts)
  if (hasKw(creature, "indestructible") && !isSpellDamage) {
    return;
  }

  // Bouclier (Divine Shield) absorbs first hit — Précision bypasses it
  if (creature.hasDivineShield && !ignoreDR) {
    creature.hasDivineShield = false;
    return;
  }

  // Damage reduction (unless attacker has Precision)
  if (!ignoreDR) {
    if (hasKw(creature, "resistance")) damage = Math.max(0, damage - 1);
    // Armure: réduit de moitié les dégâts de combat (arrondi au supérieur), pas les sorts
    if (hasKw(creature, "armure") && !isSpellDamage) {
      damage = Math.ceil(damage / 2);
    }
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
      dead.push(c);
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
    // Maléfice: inflige X dégâts à TOUTES les unités (alliés et ennemis), X = ATK
    if (hasKw(c, "malefice")) {
      const maleficeDmg = c.card.attack ?? 0;
      dealDamageToHero(enemy.hero, maleficeDmg);
      [...enemy.board].forEach(e => dealDamageToCreature(e, maleficeDmg, false, true));
      [...owner.board].forEach(e => dealDamageToCreature(e, maleficeDmg, false, true));
    }

    // Carnage X: inflige X dégâts à TOUTES les unités en jeu
    if (hasKw(c, "carnage") && c.carnageX > 0) {
      [...enemy.board].forEach(e => dealDamageToCreature(e, c.carnageX, false, true));
      [...owner.board].forEach(e => dealDamageToCreature(e, c.carnageX, false, true));
    }

    // Héritage X: chaque allié gagne +X ATK et +X PV
    if (hasKw(c, "heritage") && c.heritageX > 0) {
      for (const ally of owner.board) {
        ally.currentAttack += c.heritageX;
        ally.currentHealth += c.heritageX;
        ally.maxHealth += c.heritageX;
      }
    }

    // Résurrection: revient avec 1 PV, perd Résurrection
    if (hasKw(c, "resurrection") && !c.hasUsedResurrection) {
      if (owner.board.length < MAX_BOARD_SIZE) {
        const newKeywords = c.card.keywords.filter(kw => kw !== "resurrection");
        const revivedCard = { ...c.card, keywords: newKeywords };
        const revived = createCardInstance(revivedCard);
        revived.currentHealth = 1;
        revived.maxHealth = c.maxHealth;
        revived.hasUsedResurrection = true;
        revived.hasSummoningSickness = true;
        owner.board.push(revived);
      }
    }

    // Pacte de sang: invoque deux tokens 1/1 de sa race
    if (hasKw(c, "pacte_de_sang")) {
      for (let i = 0; i < 2 && owner.board.length < MAX_BOARD_SIZE; i++) {
        let tokenCard: Card = {
          id: -1, name: `Token ${c.card.race || ""}`.trim(),
          mana_cost: 0, card_type: "creature",
          attack: 1, health: 1,
          effect_text: "Token 1/1",
          keywords: [], spell_keywords: null, spell_effects: null, image_url: null,
          race: c.card.race, faction: c.card.faction,
        };
        tokenCard = applyTokenTemplate(tokenCard);
        const token = createCardInstance(tokenCard);
        token.hasSummoningSickness = true;
        owner.board.push(token);
      }
    }

    // Martyr: toutes les unités de même race gagnent +1/+1 permanent
    if (hasKw(c, "martyr") && c.card.race) {
      for (const ally of owner.board) {
        if (ally.card.race === c.card.race) {
          ally.currentAttack += 1;
          ally.currentHealth += 1;
          ally.maxHealth += 1;
        }
      }
    }

    // Cycle éternel: ajoute une copie dans le deck, marquée pour auto-play
    if (hasKw(c, "cycle_eternel")) {
      const copyInstance = createCardInstance({ ...c.card });
      copyInstance.cycleEternelAutoPlay = true;
      // Insert at random position in deck
      const insertIdx = Math.floor(rng() * (owner.deck.length + 1));
      owner.deck.splice(insertIdx, 0, copyInstance);
    }

    // Instinct de meute: buff same-clan allies with this keyword when a same-clan ally dies
    if (c.card.clan) {
      for (const unit of owner.board) {
        if (hasKw(unit, "instinct_de_meute") && unit.card.clan === c.card.clan && unit.instinctDeMeuteX > 0) {
          unit.currentAttack += unit.instinctDeMeuteX;
          unit.currentHealth += unit.instinctDeMeuteX;
          unit.maxHealth += unit.instinctDeMeuteX;
        }
      }
    }

    // Nécrophagie: toutes les unités avec Nécrophagie gagnent +1/+1 quand une unité meurt
    for (const board of [owner.board, enemy.board]) {
      for (const unit of board) {
        if (hasKw(unit, "necrophagie")) {
          unit.necrophagieATKBonus += 1;
          unit.necrophagiePVBonus += 1;
          unit.currentAttack += 1;
          unit.currentHealth += 1;
          unit.maxHealth += 1;
        }
      }
    }
  }

  // Trigger passive hero power on friendly death
  triggerPassiveOnCreatureDeath(owner, dead.length);

  // Cascade: malefice/carnage may have killed more
  const ownerCascadeDead = cleanDeadCreatures(owner);
  const enemyCascadeDead = cleanDeadCreatures(enemy);
  if (ownerCascadeDead.length > 0) {
    processDeathTriggers(ownerCascadeDead, owner, enemy, depth + 1);
  }
  if (enemyCascadeDead.length > 0) {
    processDeathTriggers(enemyCascadeDead, enemy, owner, depth + 1);
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
  const pool = state.factionCardPool;
  const newState = deepClone({ ...state, factionCardPool: undefined } as GameState);
  newState.factionCardPool = pool;
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
  const pool = state.factionCardPool;
  const newState = deepClone({ ...state, factionCardPool: undefined } as GameState);
  newState.factionCardPool = pool;
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
      keywords: [],
      spell_keywords: [{ id: "afflux", amount: 1 }],
      spell_effects: null,
      image_url: null,
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
  // Make token templates available to all engine functions
  currentTokenTemplates = state.tokenTemplates ?? [];
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
  let manaCost = card.card.mana_cost;
  if (card.card.card_type === "spell") {
    const canalisationCount = player.board.filter(c => hasKw(c, "canalisation")).length;
    manaCost = Math.max(0, manaCost - canalisationCount);
  }
  if (manaCost > player.mana) return false;
  if (card.card.card_type === "creature" && player.board.length >= MAX_BOARD_SIZE) return false;
  return true;
}

export function canAttack(state: GameState, attackerInstanceId: string): boolean {
  const player = state.players[state.currentPlayerIndex];
  const attacker = player.board.find(c => c.instanceId === attackerInstanceId);
  if (!attacker) return false;
  if (attacker.attacksRemaining <= 0) return false;
  // Raid: can attack creatures even with summoning sickness
  if (attacker.hasSummoningSickness && !hasKw(attacker, "raid")) return false;
  if (attacker.currentAttack <= 0) return false;
  return true;
}

export function getValidTargets(state: GameState, attackerInstanceId: string): string[] {
  const player = state.players[state.currentPlayerIndex];
  const opponent = state.players[state.currentPlayerIndex === 0 ? 1 : 0];
  const attacker = player.board.find(c => c.instanceId === attackerInstanceId);
  if (!attacker) return [];

  // Vol : ignore les taunts sans Vol
  const attackerFlies2 = hasKw(attacker, "ranged");
  const relevantTaunts2 = opponent.board.filter(c =>
    hasKw(c, "taunt") && (!attackerFlies2 || hasKw(c, "ranged"))
  );

  // Filter out Ombre (stealth) units that haven't acted yet
  const targetableEnemies = opponent.board.filter(c =>
    !(hasKw(c, "ombre") && !c.ombreRevealed)
  );

  if (relevantTaunts2.length > 0) {
    return relevantTaunts2
      .filter(c => !(hasKw(c, "ombre") && !c.ombreRevealed))
      .map(c => c.instanceId);
  }

  // Raid with summoning sickness: can only target creatures, not hero
  const canHitHero = !(attacker.hasSummoningSickness && hasKw(attacker, "raid"));
  const targets = [...targetableEnemies.map(c => c.instanceId)];
  if (canHitHero) targets.push("enemy_hero");
  return targets;
}

export function needsTarget(card: Card): boolean {
  if (card.card_type === "spell") {
    // New system
    const slots = getSpellTargetSlots(card);
    if (slots.some(s => requiresPlayerSelection(s.type))) return true;
    // Legacy fallback
    if (card.spell_effect) {
      const target = card.spell_effect.target;
      return target === "any" || target === "any_creature" || target === "friendly_creature" || target === "enemy_creature";
    }
    return false;
  }
  return creatureNeedsTarget(card);
}

const CREATURE_TARGETING_KEYWORDS: Keyword[] = [
  "sacrifice", "corruption", "malediction",
  "permutation", "vampirisme", "mimique", "metamorphose",
  "benediction", "tactique",
];

export function creatureNeedsTarget(card: Card): boolean {
  if (card.card_type !== "creature") return false;
  return card.keywords.some(kw => CREATURE_TARGETING_KEYWORDS.includes(kw));
}

export function getCreatureTargets(state: GameState, card: Card): string[] {
  const player = state.players[state.currentPlayerIndex];
  const opponent = state.players[state.currentPlayerIndex === 0 ? 1 : 0];

  const filterEnemyTargetable2 = (creatures: CardInstance[]) =>
    creatures.filter(c =>
      !hasKw(c, "invisible")
      && !hasKw(c, "transcendance")
      && !(hasKw(c, "ombre") && !c.ombreRevealed)
    );

  // Determine target pool based on the first targeting keyword found
  for (const kw of card.keywords) {
    switch (kw) {
      case "sacrifice":
      case "benediction":
      case "tactique":
        return player.board.map(c => c.instanceId);
      case "corruption":
      case "malediction":
      case "permutation":
      case "vampirisme":
        return filterEnemyTargetable2(opponent.board).map(c => c.instanceId);
      case "mimique":
      case "metamorphose":
        return [
          ...player.board.map(c => c.instanceId),
          ...filterEnemyTargetable2(opponent.board).map(c => c.instanceId),
        ];
    }
  }
  return [];
}

const GRAVEYARD_TARGETING_KEYWORDS: Keyword[] = ["rappel", "heritage_du_cimetiere", "exhumation"];

export function creatureNeedsGraveyardTarget(card: Card): boolean {
  if (card.card_type !== "creature") return false;
  return card.keywords.some(kw => GRAVEYARD_TARGETING_KEYWORDS.includes(kw));
}

export function getGraveyardTargets(state: GameState, card: Card): string[] {
  const player = state.players[state.currentPlayerIndex];
  for (const kw of card.keywords) {
    if (kw === "rappel") {
      return player.graveyard.map(c => c.instanceId);
    }
    if (kw === "heritage_du_cimetiere") {
      return player.graveyard.filter(c => c.card.card_type === "creature").map(c => c.instanceId);
    }
    if (kw === "exhumation") {
      const x = Math.max(1, card.mana_cost - 1);
      return player.graveyard.filter(c => c.card.card_type === "creature" && c.card.mana_cost <= x).map(c => c.instanceId);
    }
  }
  return [];
}

export function creatureNeedsDivination(card: Card): boolean {
  return card.card_type === "creature" && card.keywords.includes("divination" as Keyword);
}

export function creatureNeedsSelection(card: Card): boolean {
  return card.card_type === "creature" && card.keywords.includes("selection" as Keyword);
}

/** Get X deterministic random cards from the faction pool.
 *  Uses a simple hash based on turnNumber + currentPlayerIndex + pool size
 *  to ensure both clients generate the same selection without advancing the seeded RNG.
 *  The engine version (called during action resolution) uses the seeded RNG instead.
 */
export function getSelectionCards(state: GameState, x: number): Card[] {
  const pool = state.factionCardPool;
  if (!pool || pool.length === 0) return [];
  // Deterministic seed based on game state — varies each time within a turn
  // because hand/board/deck/graveyard sizes change after each card played
  const player = state.players[state.currentPlayerIndex];
  const entropy = player.hand.length * 7 + player.board.length * 13 + player.deck.length * 3 + player.graveyard.length * 17 + player.mana * 11;
  const seed = state.turnNumber * 1000 + state.currentPlayerIndex * 100 + entropy;
  let hash = seed;
  const pseudoRng = () => {
    hash = (hash * 16807 + 12345) & 0x7fffffff;
    return (hash & 0xfffffff) / 0x10000000;
  };
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(pseudoRng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(x, shuffled.length));
}

export function getSpellTargets(state: GameState, card: Card, slotType?: SpellTargetType): string[] {
  const player = state.players[state.currentPlayerIndex];
  const opponent = state.players[state.currentPlayerIndex === 0 ? 1 : 0];

  const filterEnemyTargetable = (creatures: CardInstance[]) =>
    creatures.filter(c =>
      !hasKw(c, "invisible")
      && !hasKw(c, "transcendance")
      && !(hasKw(c, "ombre") && !c.ombreRevealed)
    );

  // Determine target type: explicit param > first slot from new system > legacy
  const targetType = slotType
    ?? getSpellTargetSlots(card)[0]?.type
    ?? card.spell_effect?.target;

  if (!targetType) return [];

  switch (targetType) {
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
    case "friendly_graveyard":
      return player.graveyard
        .filter(c => c.card.card_type === "creature")
        .map(c => c.instanceId);
    case "friendly_graveyard_to_board":
      return player.graveyard
        .filter(c => c.card.card_type === "creature")
        .map(c => c.instanceId);
    default:
      return [];
  }
}

export function getSpellGraveyardTargets(state: GameState, card: Card, slotIndex: number): string[] {
  if (card.card_type !== "spell" || !card.spell_keywords) return [];
  const player = state.players[state.currentPlayerIndex];
  const kw = card.spell_keywords[slotIndex];
  if (!kw) return [];

  if (kw.id === "rappel") {
    return player.graveyard
      .filter(c => c.card.card_type === "creature")
      .map(c => c.instanceId);
  }
  if (kw.id === "exhumation") {
    const maxCost = kw.amount ?? 1;
    return player.graveyard
      .filter(c => c.card.card_type === "creature" && c.card.mana_cost <= maxCost)
      .map(c => c.instanceId);
  }
  return [];
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
