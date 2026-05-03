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
import { getEntraideReduction } from "./abilities";
import { parseXValuesFromEffectText } from "./keyword-labels";
import {
  HERO_MAX_HP,
  STARTING_HAND_SIZE,
  MAX_HAND_SIZE,
  MAX_BOARD_SIZE,
  MAX_MANA,
} from "./constants";
import { getFactionForRace } from "@/lib/card-engine/constants";

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
// Turn number of the action being processed. Set in `applyAction` so any
// engine helper (cleanDeadCreatures…) can stamp creatures with their death
// turn without having to thread state through every signature.
let currentTurnNumber = 0;

export function initRNG(seed: number) {
  rng = createRNG(seed);
}

// ============================================================
// KEYWORD HELPERS
// ============================================================

function hasKw(ci: CardInstance, kw: Keyword): boolean {
  return ci.card.keywords.includes(kw);
}

// Alternative cost helpers — collapse null/undefined/0 to 0 so call sites can
// stay terse. Canalisation/Entraide reductions never apply here: only mana_cost
// is reducible by design.
export function getLifeCost(card: Card): number {
  return Math.max(0, card.life_cost ?? 0);
}
export function getDiscardCost(card: Card): number {
  return Math.max(0, card.discard_cost ?? 0);
}
export function getSacrificeCost(card: Card): number {
  return Math.max(0, card.sacrifice_cost ?? 0);
}

// Add a keyword to a creature at runtime (e.g. spell granting Bouclier
// Divin to a target, or hero power mode 1 / 3). Mirrors any stateful flags
// that the engine reads off CardInstance instead of card.keywords. The
// `card` object is replaced with an immutable copy so other holders of the
// previous reference are unaffected.
// Some ABILITIES entries don't have a spell side but DO have an on-play
// creature-side effect that makes sense as a hero power (mode 2 / spell
// trigger). For those, useHeroPower simulates the on-play effect directly
// (see resolveCreatureKeywordAsHeroPower below) and getHeroPowerTargets
// uses this map to drive the targeting picker.
const CREATURE_KEYWORD_HERO_POWER_TARGET: Record<
  string,
  "enemy_creature" | "friendly_creature" | "any_creature" | "none"
> = {
  corruption: "enemy_creature",
  malediction: "enemy_creature",
  vampirisme: "enemy_creature",
  permutation: "enemy_creature",
  sacrifice: "friendly_creature",
  benediction: "friendly_creature",
  domination: "none", // random enemy
};

function applyGrantedKeyword(
  creature: CardInstance,
  kwId: string,
  params?: { amount?: number; attack?: number; health?: number },
) {
  const list = creature.card.keywords as string[];
  if (!list.includes(kwId)) {
    // Cast through unknown — `keywords` is typed as Keyword[] but at runtime
    // we accept any ABILITIES id (hero powers can grant keywords by id).
    creature.card = {
      ...creature.card,
      keywords: [...list, kwId] as unknown as Keyword[],
    };
  }
  if (kwId === "divine_shield") {
    creature.hasDivineShield = true;
  }
  if (kwId === "charge") {
    creature.hasSummoningSickness = false;
  }
  // Mémoriser le X du keyword accordé (Résistance 2, Persécution 3, …) pour
  // que les résolveurs et le badge UI le retrouvent — le `card.effect_text`
  // n'est pas réécrit avec la notation [Keyword X] côté hero power.
  if (typeof params?.amount === "number") {
    creature.grantedKeywordX = {
      ...creature.grantedKeywordX,
      [kwId]: params.amount,
    };
  }
}

// Mode 2 fallback for creature-only keywords (corruption, malediction, …).
// Replays the on-play effect that those keywords trigger when a creature
// with them enters the field. Mirrors the inline logic in playCard so the
// hero-power version behaves the same as casting a creature with the
// keyword.
function resolveCreatureKeywordAsHeroPower(
  player: PlayerState,
  opponent: PlayerState,
  keywordId: string,
  targetInstanceId: string | null | undefined,
  params?: { amount?: number; attack?: number; health?: number },
) {
  switch (keywordId) {
    case "corruption": {
      // Steal an enemy creature until end of turn, give it Traque.
      const target = targetInstanceId
        ? opponent.board.find(c => c.instanceId === targetInstanceId)
        : (opponent.board.length > 0 ? opponent.board[Math.floor(rng() * opponent.board.length)] : null);
      if (!target || player.board.length >= MAX_BOARD_SIZE) break;
      opponent.board = opponent.board.filter(c => c !== target);
      target.originalOwnerId = opponent.id;
      target.hasSummoningSickness = false;
      const list = target.card.keywords as string[];
      if (!list.includes("charge")) {
        target.card = {
          ...target.card,
          keywords: [...list, "charge"] as unknown as Keyword[],
        };
      }
      player.board.push(target);
      break;
    }
    case "domination": {
      // Take permanent control of a random enemy creature.
      if (opponent.board.length === 0 || player.board.length >= MAX_BOARD_SIZE) break;
      const idx = Math.floor(rng() * opponent.board.length);
      const stolen = opponent.board.splice(idx, 1)[0];
      stolen.hasSummoningSickness = true;
      stolen.originalOwnerId = null;
      player.board.push(stolen);
      break;
    }
    case "malediction": {
      // Reduce target enemy ATK to 0 permanently (overrides the base ATK on
      // the card so recalculateAuras doesn't restore it on the next pass).
      if (!targetInstanceId) break;
      const target = opponent.board.find(c => c.instanceId === targetInstanceId);
      if (!target) break;
      target.card = { ...target.card, attack: 0 };
      target.currentAttack = 0;
      break;
    }
    case "sacrifice": {
      // Destroy a friendly creature for some benefit. Heroe-power version
      // simply removes the chosen ally (no buff applied — keep semantics
      // simple ; the hero gets the activation cost itself as the trade).
      if (!targetInstanceId) break;
      const target = player.board.find(c => c.instanceId === targetInstanceId);
      if (!target) break;
      target.currentHealth = 0;
      break;
    }
    case "vampirisme": {
      // Hero-power adaptation of the creature drain : inflige X dégâts à
      // une unité ennemie ciblée et soigne le héros lanceur de X. La
      // version créature (`Vampirisme X`) transfère les PV à la créature
      // qui frappe ; pour un pouvoir héroïque, le sujet naturel du soin
      // est le héros qui active.
      if (!targetInstanceId) break;
      const target = opponent.board.find(c => c.instanceId === targetInstanceId);
      if (!target) break;
      const amount = params?.amount ?? 1;
      dealDamageToCreature(target, amount, false, true);
      player.hero.hp += amount;
      break;
    }
    default:
      // Unknown / unsupported creature keyword in mode 2 → silent no-op.
      break;
  }
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
    auraHealthBonus: 0,
    ombreRevealed: false,
    corruptionStolenIds: [],
    contresortActive: false,
    maledictionTargetId: null,
    isParalyzed: false,
    loyauteATKBonus: 0,
    loyautePVBonus: 0,
    necrophagieATKBonus: 0,
    necrophagiePVBonus: 0,
    martyrATKBonus: 0,
    persecutionX: 0,
    riposteX: 0,
    carnageX: 0,
    heritageX: 0,
    instinctDeMeuteX: 0,
    instinctDeMeuteATKBonus: 0,
    diedOnTurn: null,
    cycleEternelAutoPlay: false,
    originalOwnerId: null,
    hasTransformedLycanthropie: false,
    grantedKeywordX: {},
  };
}

// Returns the saved token template for a given id (looked up against the
// current registry or a passed-in array). Null if missing.
function findTokenTemplate(id: number | null | undefined, templates?: TokenTemplate[]): TokenTemplate | null {
  if (!id) return null;
  const tmpls = templates ?? currentTokenTemplates;
  return tmpls.find(t => t.id === id) ?? null;
}

// Backwards-compat helper for legacy code paths that still spawn tokens by
// race string (spell-keyword "invocation", atomic "summon_token", "pacte de
// sang"). Picks the first template matching the race so the visual is at
// least preserved; returns null if none exists.
function findTokenTemplateByRace(race: string | null | undefined, templates?: TokenTemplate[]): TokenTemplate | null {
  if (!race) return null;
  const tmpls = templates ?? currentTokenTemplates;
  return tmpls.find(t => t.race === race) ?? null;
}

// Copies the visual / race / keywords / name from a saved token template
// onto a fresh instance Card. The instance Card keeps its own stats so the
// caller can apply any per-use override (e.g. Convocation X formula).
function applyTokenTemplate(tokenCard: Card, tmpl: TokenTemplate | null): Card {
  if (!tmpl) return tokenCard;
  return {
    ...tokenCard,
    name: tmpl.name,
    image_url: tmpl.image_url,
    keywords: tmpl.keywords?.length ? tmpl.keywords : tokenCard.keywords,
    race: tmpl.race,
    clan: tmpl.clan ?? tokenCard.clan,
    token_id: tmpl.id,
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
    hero: { hp: HERO_MAX_HP, maxHp: HERO_MAX_HP, armor: 0, heroDefinition: hero ?? null, heroPowerUsedThisTurn: false, heroPowerActivationsUsed: 0, activeAuras: [] },
    mana: 0, maxMana: 0,
    hand, board: [], deck, graveyard: [],
    spellHistory: [],
    fatigueDamage: 0,
    ownedLimitedCardIds: [],
  });

  return {
    players: [makePlayer(player1Id, p1Hand, p1Deck, player1Hero), makePlayer(player2Id, p2Hand, p2Deck, player2Hero)],
    currentPlayerIndex: firstPlayerIndex,
    turnNumber: 0,
    turnStartedAt: 0,
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
    if (c.berserkActive) atk += c.berserkATKBonus;
    atk += c.necrophagieATKBonus;
    atk += c.martyrATKBonus;
    atk += c.instinctDeMeuteATKBonus;
    c.currentAttack = atk;
  }
  for (const c of opponent.board) {
    let atk = c.card.attack ?? 0;
    atk += c.loyauteATKBonus;
    atk += c.summonBonusATK;
    if (c.fureurActive) atk += c.fureurATKBonus;
    if (c.berserkActive) atk += c.berserkATKBonus;
    atk += c.necrophagieATKBonus;
    atk += c.martyrATKBonus;
    atk += c.instinctDeMeuteATKBonus;
    c.currentAttack = atk;
  }

  // Loyauté: permanent on-summon bonus — NOT recalculated here (handled in playCard)

  // Hero aura stack counts (mode 3 of HeroPowerEffect V2). Folded into the
  // creature-based aura logic below so a hero "Commandement" with N stacks
  // behaves like N invisible Commandement units of the hero's faction.
  const heroAuraStacks = (p: PlayerState, kwId: string): number =>
    (p.hero.activeAuras ?? [])
      .filter(a => a.keywordId === kwId)
      .reduce((s, a) => s + a.stacks, 0);
  const playerCommandementStacks = heroAuraStacks(player, "commandement");
  const opponentCommandementStacks = heroAuraStacks(opponent, "commandement");
  const playerTerreurStacks = heroAuraStacks(player, "terreur");
  const opponentTerreurStacks = heroAuraStacks(opponent, "terreur");

  // Terreur: enemy units -1 ATK per terreur unit (board) + per hero aura stack
  const playerTerreurCount = player.board.filter(c => hasKw(c, "terreur")).length + playerTerreurStacks;
  const opponentTerreurCount = opponent.board.filter(c => hasKw(c, "terreur")).length + opponentTerreurStacks;
  for (const c of opponent.board) {
    c.currentAttack = Math.max(0, c.currentAttack - playerTerreurCount);
  }
  for (const c of player.board) {
    c.currentAttack = Math.max(0, c.currentAttack - opponentTerreurCount);
  }

  // Commandement: alliés de même faction gagnent +1/+1 (per board commandement
  // unit + per hero aura stack of same faction).
  const playerHeroFaction = player.hero.heroDefinition?.faction ?? null;
  const opponentHeroFaction = opponent.hero.heroDefinition?.faction ?? null;
  for (const board of [player.board, opponent.board]) {
    const owner = board === player.board ? player : opponent;
    const ownerHeroFaction = owner === player ? playerHeroFaction : opponentHeroFaction;
    const ownerHeroCmdStacks = owner === player ? playerCommandementStacks : opponentCommandementStacks;
    for (const ally of board) {
      let newAuraHP = 0;
      for (const c of board) {
        if (c !== ally && hasKw(c, "commandement") && c.card.faction && ally.card.faction === c.card.faction) {
          ally.currentAttack += 1;
          newAuraHP += 1;
        }
      }
      // Hero aura "commandement" — stacks add +stacks/+stacks to allies of
      // the SAME faction as the hero (matches Commandement's native scope).
      if (ownerHeroCmdStacks > 0 && ownerHeroFaction && ally.card.faction === ownerHeroFaction) {
        ally.currentAttack += ownerHeroCmdStacks;
        newAuraHP += ownerHeroCmdStacks;
      }
      // Adjust HP based on change in aura bonus
      const oldAuraHP = ally.auraHealthBonus;
      if (newAuraHP !== oldAuraHP) {
        const diff = newAuraHP - oldAuraHP;
        ally.maxHealth += diff;
        ally.currentHealth += diff;
        if (ally.currentHealth < 1 && newAuraHP < oldAuraHP) ally.currentHealth = 1; // don't kill via aura removal
        ally.auraHealthBonus = newAuraHP;
      }
    }
  }

  // Hero auras — grant binary keywords (Bouclier divin, Vol, Provocation,
  // Charge, …) to every friendly creature of the hero's owner. Numeric auras
  // already handled above (commandement, terreur). Keywords with no aura
  // semantics (Impact, Inspiration, …) are silently ignored.
  for (const p of [player, opponent]) {
    for (const aura of p.hero.activeAuras ?? []) {
      if (aura.keywordId === "commandement" || aura.keywordId === "terreur") continue;
      for (const ally of p.board) {
        applyGrantedKeyword(ally, aura.keywordId);
      }
    }
  }

  // Berserk: double ATK si PV actuels < PV originaux (sur la carte)
  for (const board of [player.board, opponent.board]) {
    for (const c of board) {
      if (hasKw(c, "berserk")) {
        const shouldBeActive = c.currentHealth < c.maxHealth;
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
  // Wall-clock anchor for the per-turn countdown timer. Both clients read
  // this from game state so their local TurnTimer renders the same value
  // (within their own clock skew, typically <100 ms with NTP) instead of
  // drifting from independently-started setInterval ticks.
  newState.turnStartedAt = Date.now();

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

    // Paralysie : la créature est encore paralysée pendant TOUT son
    // tour (icône + descriptif l'affichent), elle ne peut pas attaquer.
    // Le flag est nettoyé en fin de tour (endTurn) pour que le joueur
    // affecté voie pourquoi sa créature reste inerte.
    if (creature.isParalyzed) {
      creature.attacksRemaining = 0;
      creature.hasSummoningSickness = true;
    }
    // fureurActive idem : on conserve le bonus ATK pendant le tour de
    // l'affecté, le reset arrive en endTurn.

    // Lycanthropie X: permanent transformation into X/X token with Traque
    if (hasKw(creature, "lycanthropie") && !creature.hasTransformedLycanthropie) {
      creature.hasTransformedLycanthropie = true;
      const xVals = parseXValuesFromEffectText(creature.card.effect_text);
      const x = xVals["lycanthropie"] || Math.max(1, Math.floor(creature.card.mana_cost / 2));
      const tmpl = findTokenTemplate(creature.card.lycanthropie_token_id);
      const fallbackRace = tmpl?.race ?? creature.card.race;
      // Keep original keywords except lycanthropie, add charge (Traque)
      const newKeywords = creature.card.keywords.filter(kw => kw !== "lycanthropie");
      if (!newKeywords.includes("charge")) newKeywords.push("charge");
      // Stat formula stays X/X (X computed above) — the token only owns the
      // visual, name and base keywords for the transformed form.
      let tokenCard: Card = {
        id: -1,
        name: `${fallbackRace || creature.card.name}`,
        mana_cost: creature.card.mana_cost,
        card_type: "creature",
        attack: x,
        health: x,
        effect_text: `Lycanthropie ${x}/${x}`,
        keywords: newKeywords,
        spell_keywords: null,
        spell_effects: null,
        image_url: null,
        race: fallbackRace,
        faction: creature.card.faction,
        clan: creature.card.clan,
      };
      tokenCard = applyTokenTemplate(tokenCard, tmpl);
      creature.card = tokenCard;
      creature.currentAttack = x + creature.summonBonusATK + creature.necrophagieATKBonus + creature.loyauteATKBonus + creature.auraHealthBonus;
      creature.currentHealth = x + creature.necrophagiePVBonus + creature.loyautePVBonus;
      creature.maxHealth = x + creature.necrophagiePVBonus + creature.loyautePVBonus;
      creature.hasSummoningSickness = false; // Traque
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

  // Expire one-turn statuses on the OUTGOING player's creatures: they were
  // visible (icon + statut row) during the player's whole turn so the
  // user understood why a paralyzed creature couldn't act, and we now
  // clear them as the turn ends. This used to happen in startTurn for
  // the same player, which made the status pop off the moment the
  // affected player's turn began — exactly when they were trying to
  // diagnose what was happening.
  const outgoing = newState.players[newState.currentPlayerIndex];
  for (const creature of outgoing.board) {
    if (creature.isParalyzed) {
      creature.isParalyzed = false;
    }
    if (creature.fureurActive) {
      creature.currentAttack -= creature.fureurATKBonus;
      creature.fureurActive = false;
      creature.fureurATKBonus = 0;
    }
  }

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

  // Canalisation: reduce spell cost by 1 per unit with Canalisation on board.
  // Entraide: reduce creature cost by 1 per allied creature whose race
  // matches the card's `entraide_race` (the card itself is in hand so it can
  // never count towards its own reduction).
  let manaCost = card.mana_cost;
  if (card.card_type === "spell") {
    const canalisationCount = player.board.filter(c => hasKw(c, "canalisation")).length;
    manaCost = Math.max(0, manaCost - canalisationCount);
  }
  if (card.card_type === "creature") {
    manaCost = Math.max(0, manaCost - getEntraideReduction(card, player.board));
  }

  if (manaCost > player.mana) return state;

  // Alternative costs — re-validate (UI may be stale) and reject silently if
  // the requested payment doesn't match the card's declared costs.
  const lifeCost = getLifeCost(card);
  const discardCost = getDiscardCost(card);
  const sacrificeCost = getSacrificeCost(card);
  const requestedDiscards = action.discardInstanceIds ?? [];
  const requestedSacrifices = action.sacrificeInstanceIds ?? [];
  if (lifeCost > 0 && player.hero.hp - lifeCost <= 0) return state;
  if (requestedDiscards.length !== discardCost) return state;
  if (requestedSacrifices.length !== sacrificeCost) return state;
  // The card being played cannot be selected as its own discard cost — even
  // though it still sits in the hand at this point.
  if (requestedDiscards.includes(action.cardInstanceId)) return state;
  // All chosen IDs must exist on the relevant zones.
  for (const id of requestedDiscards) {
    if (!player.hand.find(c => c.instanceId === id)) return state;
  }
  for (const id of requestedSacrifices) {
    if (!player.board.find(c => c.instanceId === id)) return state;
  }

  player.mana -= manaCost;
  // Pay life cost directly — armor protects from damage, not voluntary
  // self-payment. Coherent with canPlayCard's `hp - life_cost > 0` check.
  if (lifeCost > 0) player.hero.hp -= lifeCost;
  // Remove the played card from hand FIRST so it can never be its own discard
  // target and so hand-size checks downstream are accurate.
  player.hand.splice(cardIndex, 1);
  // Discard chosen hand cards.
  for (const id of requestedDiscards) {
    const idx = player.hand.findIndex(c => c.instanceId === id);
    if (idx !== -1) {
      const [discarded] = player.hand.splice(idx, 1);
      player.graveyard.push(discarded);
    }
  }
  // Sacrifice chosen board creatures, batching death triggers at the end.
  if (requestedSacrifices.length > 0) {
    const sacrificed: CardInstance[] = [];
    for (const id of requestedSacrifices) {
      const idx = player.board.findIndex(c => c.instanceId === id);
      if (idx !== -1) {
        const [creature] = player.board.splice(idx, 1);
        player.graveyard.push(creature);
        sacrificed.push(creature);
      }
    }
    if (sacrificed.length > 0) processDeathTriggers(sacrificed, player, opponent);
  }

  if (card.card_type === "creature") {
    if (player.board.length >= MAX_BOARD_SIZE) return state;

    cardInstance.hasSummoningSickness = !card.keywords.includes("charge");
    cardInstance.hasAttacked = false;
    cardInstance.attacksRemaining = maxAttacksFor(cardInstance);
    const pos = action.boardPosition ?? player.board.length;
    player.board.splice(pos, 0, cardInstance);

    // ── On-summon triggers ──

    // Douleur X: drawback — la créature inflige X dégâts à votre héros
    // dès son arrivée en jeu, avant tout autre effet d'invocation. Le
    // moteur ne s'arrête pas si l'auto-dégât est létal — checkWinCondition
    // appelé en fin de playCard détectera la défaite.
    if (hasKw(cardInstance, "douleur")) {
      const douleurXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      const x = douleurXVals["douleur"] ?? 1;
      dealDamageToHero(player.hero, x);
    }

    // Inspiration X: pioche X cartes à l'invocation.
    if (hasKw(cardInstance, "inspiration")) {
      const inspXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      const x = inspXVals["inspiration"] ?? 1;
      for (let i = 0; i < x; i++) drawCard(player);
    }

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

    // Convocation X: crée un token X/X depuis le template choisi.
    // Si X est absent du texte, on tombe sur les stats par défaut du token.
    if (hasKw(cardInstance, "convocation") && player.board.length < MAX_BOARD_SIZE) {
      const tmpl = findTokenTemplate(cardInstance.card.convocation_token_id);
      if (!tmpl) {
        // Surface the silent-no-spawn case so the admin can fix the data.
        // Two common causes:
        //   1. card.convocation_token_id is null (forgot to pick a token)
        //   2. id is set but the registry doesn't carry it (template was
        //      deleted, or the engine was started with an empty
        //      tokenTemplates array). The diagnostic below distinguishes
        //      the two by dumping the available ids.
        console.warn(
          `[engine] Convocation: pas de token spawné pour la carte "${cardInstance.card.name}" — convocation_token_id =`,
          cardInstance.card.convocation_token_id,
          "| registry size:", currentTokenTemplates.length,
          "| available ids:", currentTokenTemplates.map((t) => t.id),
        );
      }
      if (tmpl) {
        const xValues = parseXValuesFromEffectText(cardInstance.card.effect_text);
        const xRaw = xValues["convocation"];
        const atk = xRaw && xRaw > 0 ? xRaw : tmpl.attack;
        const hp = xRaw && xRaw > 0 ? xRaw : tmpl.health;
        let tokenCard: Card = {
          id: -1, name: `Token ${tmpl.race}`.trim(),
          mana_cost: 0, card_type: "creature",
          attack: atk, health: hp,
          effect_text: `Token ${atk}/${hp}`,
          keywords: [], spell_keywords: null, spell_effects: null, image_url: null,
          race: tmpl.race,
          // Token faction follows its race (each race lives in exactly one
          // faction). Falls back to the caster's faction only when the
          // race isn't known to FACTIONS — keeps custom races working.
          faction: getFactionForRace(tmpl.race) ?? cardInstance.card.faction,
          clan: cardInstance.card.clan,
        };
        tokenCard = applyTokenTemplate(tokenCard, tmpl);
        const token = createCardInstance(tokenCard);
        token.hasSummoningSickness = true;
        player.board.push(token);
      }
    }

    // Convocation (sans X) : variante non scalable de Convocation X. Crée le
    // token configuré (`convocation_token_id`) avec ses stats par défaut, sans
    // formule X/X. Polymorphe : même mot-clé disponible côté sort dans
    // resolveSpellKeywords.
    if (hasKw(cardInstance, "convocation_simple") && player.board.length < MAX_BOARD_SIZE) {
      const tmpl = findTokenTemplate(cardInstance.card.convocation_token_id);
      if (!tmpl) {
        console.warn(
          `[engine] Convocation: pas de token spawné pour la carte "${cardInstance.card.name}" — convocation_token_id =`,
          cardInstance.card.convocation_token_id,
          "| registry size:", currentTokenTemplates.length,
          "| available ids:", currentTokenTemplates.map((t) => t.id),
        );
      } else {
        let tokenCard: Card = {
          id: -1, name: `Token ${tmpl.race}`.trim(),
          mana_cost: 0, card_type: "creature",
          attack: tmpl.attack, health: tmpl.health,
          effect_text: `Token ${tmpl.attack}/${tmpl.health}`,
          keywords: [], spell_keywords: null, spell_effects: null, image_url: null,
          race: tmpl.race,
          faction: getFactionForRace(tmpl.race) ?? cardInstance.card.faction,
        };
        tokenCard = applyTokenTemplate(tokenCard, tmpl);
        const token = createCardInstance(tokenCard);
        token.hasSummoningSickness = true;
        player.board.push(token);
      }
    }

    // Convocations multiples : chaque entrée pointe vers un token et peut
    // override ses stats (attack/health). Sans override, on hérite du token.
    if (hasKw(cardInstance, "convocations_multiples")) {
      if (!card.convocation_tokens?.length) {
        console.warn(
          `[engine] Convocations multiples: aucun token configuré pour la carte "${card.name}" — vérifiez l'onglet Édition.`,
        );
      }
      for (const tokenDef of card.convocation_tokens ?? []) {
        if (player.board.length >= MAX_BOARD_SIZE) break;
        const tmpl = findTokenTemplate(tokenDef.token_id);
        if (!tmpl) {
          console.warn(
            `[engine] Convocations multiples: token introuvable pour token_id=${tokenDef.token_id} sur la carte "${card.name}".`,
          );
          continue;
        }
        const atk = tokenDef.attack ?? tmpl.attack;
        const hp = tokenDef.health ?? tmpl.health;
        let tokenCard: Card = {
          id: -1, name: `Token ${tmpl.race}`.trim(),
          mana_cost: 0, card_type: "creature",
          attack: atk, health: hp,
          effect_text: `Token ${atk}/${hp}`,
          keywords: [], spell_keywords: null, spell_effects: null, image_url: null,
          race: tmpl.race,
          faction: getFactionForRace(tmpl.race) ?? cardInstance.card.faction,
        };
        tokenCard = applyTokenTemplate(tokenCard, tmpl);
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
      const vampXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      const x = vampXVals["vampirisme"] || Math.max(1, Math.floor(cardInstance.card.mana_cost / 2));
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
      const profXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      const x = profXVals["profanation"] || Math.max(1, Math.floor(cardInstance.card.mana_cost / 2));
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

    // Sélection X / Renfort Royal X : same picker flow, both resolve by
    // looking up `selectionCardId` in factionCardPool. The choice menu
    // is what differs (commons vs owned limited prints with fallback).
    if (
      (hasKw(cardInstance, "selection") || hasKw(cardInstance, "renfort_royal"))
      && action.selectionCardId != null
      && newState.factionCardPool?.length
    ) {
      const chosenCard = newState.factionCardPool.find(c => c.id === action.selectionCardId);
      if (chosenCard && player.hand.length < MAX_HAND_SIZE) {
        const chosen = createCardInstance(chosenCard);
        player.hand.push(chosen);
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
      const tdXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      const x = tdXVals["traque_du_destin"] || Math.max(1, Math.floor(cardInstance.card.mana_cost / 2));
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

    // Solidarité X: piochez X cartes si 2+ alliés de même race
    if (hasKw(cardInstance, "solidarite") && cardInstance.card.race) {
      const sameRaceCount = player.board.filter(a => a !== cardInstance && a.card.race === cardInstance.card.race).length;
      if (sameRaceCount >= 2) {
        const solXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
        const x = solXVals["solidarite"] || Math.max(1, Math.floor(cardInstance.card.mana_cost / 3));
        for (let i = 0; i < x; i++) drawCard(player);
      }
    }

    // Appel du clan X: met en jeu la première unité de même clan (coût ≤ X) depuis le deck
    if (hasKw(cardInstance, "appel_du_clan") && cardInstance.card.clan && player.board.length < MAX_BOARD_SIZE) {
      const adcXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      const x = adcXVals["appel_du_clan"] || Math.max(1, cardInstance.card.mana_cost - 1);
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
      const rasXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      const x = rasXVals["rassemblement"] || Math.max(1, Math.floor(cardInstance.card.mana_cost / 2));
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

    // Tempête X — on-play, deals X damage spread one-by-one across the
    // currently-alive enemy creatures. Each "drop" picks a random target
    // from the live enemies (re-evaluated per drop so dead creatures stop
    // taking hits). Does not target the enemy hero.
    if (hasKw(cardInstance, "tempete")) {
      const xVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      const total = xVals["tempete"] || Math.max(1, Math.floor(cardInstance.card.mana_cost / 3));
      for (let drop = 0; drop < total; drop++) {
        const alive = opponent.board.filter((u) => u.currentHealth > 0);
        if (alive.length === 0) break;
        const target = alive[Math.floor(rng() * alive.length)];
        dealDamageToCreature(target, 1, false, true);
      }
    }

    // Instinct de meute X — on-play, fires once if any same-faction ally
    // (owned by this player) joined the graveyard during the CURRENT
    // turn. Single +X/+X grant; does not stack with the number of dead
    // allies. Reads `diedOnTurn` stamped by cleanDeadCreatures.
    if (hasKw(cardInstance, "instinct_de_meute")) {
      const imXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      const x = imXVals["instinct_de_meute"] || Math.max(1, Math.floor(cardInstance.card.mana_cost / 3));
      cardInstance.instinctDeMeuteX = x;
      const sameFactionDiedThisTurn = cardInstance.card.faction
        ? player.graveyard.some(
            (g) =>
              g.diedOnTurn === currentTurnNumber &&
              g.card.faction === cardInstance.card.faction,
          )
        : false;
      if (sameFactionDiedThisTurn) {
        cardInstance.instinctDeMeuteATKBonus = x;
        cardInstance.currentAttack += x;
        cardInstance.currentHealth += x;
        cardInstance.maxHealth += x;
      }
    }

    // Set Persécution X value
    if (hasKw(cardInstance, "persecution")) {
      const persXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      cardInstance.persecutionX = persXVals["persecution"] || Math.max(1, Math.floor(cardInstance.card.mana_cost / 3));
    }

    // Set Riposte X value
    if (hasKw(cardInstance, "riposte")) {
      const ripXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      cardInstance.riposteX = ripXVals["riposte"] || Math.max(1, Math.floor(cardInstance.card.mana_cost / 3));
    }

    // Set Carnage X value
    if (hasKw(cardInstance, "carnage")) {
      const carnXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      cardInstance.carnageX = carnXVals["carnage"] || Math.max(1, Math.floor(cardInstance.card.mana_cost / 2));
    }

    // Set Héritage X value
    if (hasKw(cardInstance, "heritage")) {
      const herXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      cardInstance.heritageX = herXVals["heritage"] || Math.max(1, Math.floor(cardInstance.card.mana_cost / 3));
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

    // Relancer X: rejoue les X derniers sorts lancés
    if (hasKw(cardInstance, "relancer")) {
      const relXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      const x = relXVals["relancer"] || 1;
      recastSpells(newState, player, opponent, x);
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

    // Track spell in history (exclude spells with "relancer" to prevent loops)
    const hasRelancer = card.spell_keywords?.some(kw => kw.id === "relancer") ?? false;
    if (!hasRelancer) {
      player.spellHistory.push({ card, targetMap: { ...targetMap } });
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
        caster.hero.hp += amount;
      } else if (effect.target === "enemy_hero") {
        opponent.hero.hp += amount;
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
// RECAST — pick random valid target for a spell keyword
// ============================================================

function pickRandomTarget(
  player: PlayerState,
  opponent: PlayerState,
  targetType: SpellTargetType | undefined
): string | undefined {
  if (!targetType) return undefined;
  const candidates: string[] = [];
  switch (targetType) {
    case "any":
      candidates.push("enemy_hero", "friendly_hero");
      opponent.board.forEach(c => candidates.push(c.instanceId));
      player.board.forEach(c => candidates.push(c.instanceId));
      break;
    case "any_creature":
      opponent.board.forEach(c => candidates.push(c.instanceId));
      player.board.forEach(c => candidates.push(c.instanceId));
      break;
    case "enemy_hero":
      candidates.push("enemy_hero");
      break;
    case "friendly_hero":
      candidates.push("friendly_hero");
      break;
    case "enemy_creature":
      opponent.board.forEach(c => candidates.push(c.instanceId));
      break;
    case "friendly_creature":
      player.board.forEach(c => candidates.push(c.instanceId));
      break;
    case "all_enemy_creatures":
    case "all_enemies":
    case "all_friendly_creatures":
      return undefined; // AoE — no target needed
    case "friendly_graveyard":
    case "friendly_graveyard_to_board":
      player.graveyard
        .filter(c => c.card.card_type === "creature")
        .forEach(c => candidates.push(c.instanceId));
      break;
  }
  if (candidates.length === 0) return undefined;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function recastSpells(
  state: GameState,
  player: PlayerState,
  opponent: PlayerState,
  amount: number
): void {
  const history = player.spellHistory;
  const toRecast = history.slice(-amount).reverse(); // most recent first

  for (const entry of toRecast) {
    const card = entry.card;

    // Skip spells that themselves have relancer (safety)
    if (card.spell_keywords?.some(kw => kw.id === "relancer")) continue;

    // Build random target map
    const targetMap: Record<string, string> = {};
    if (card.spell_keywords?.length) {
      for (let i = 0; i < card.spell_keywords.length; i++) {
        const kw = card.spell_keywords[i];
        const def = SPELL_KEYWORDS[kw.id];
        if (!def) continue;
        if (def.needsTarget) {
          const target = pickRandomTarget(player, opponent, def.targetType);
          if (target) targetMap[`kw_${i}`] = target;
        }
      }
    }
    // Also set target_0 for composable effects / legacy
    if (card.spell_effects?.targets?.length) {
      for (const slot of card.spell_effects.targets) {
        const target = pickRandomTarget(player, opponent, slot.type as SpellTargetType);
        if (target) targetMap[slot.slot] = target;
      }
    }
    if (!targetMap["target_0"]) {
      const fallback = pickRandomTarget(player, opponent, "any");
      if (fallback) targetMap["target_0"] = fallback;
    }

    const ctx: SpellResolutionContext = {
      state, caster: player, opponent, card, targetMap, results: {},
    };

    // Resolve spell keywords
    if (card.spell_keywords?.length) {
      resolveSpellKeywords(ctx, card.spell_keywords);
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

    // Resolve composable effects
    if (card.spell_effects?.effects?.length) {
      resolveComposableEffects(ctx, card.spell_effects.effects);
    }

    // Clean up deaths
    const pDead = cleanDeadCreatures(player);
    const oDead = cleanDeadCreatures(opponent);
    processDeathTriggers(pDead, player, opponent);
    processDeathTriggers(oDead, opponent, player);

    recalculateAuras(player, opponent);
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
    if (!def) continue;
    // Resolve target: use keyword's implicit slot or first target slot
    const slot = def.needsTarget ? `kw_${i}` : undefined;
    const targetId = slot ? (ctx.targetMap[slot] ?? ctx.targetMap["target_0"]) : undefined;

    switch (kw.id) {
      case "douleur": {
        // Drawback : le sort inflige X dégâts au héros qui le lance.
        // Atteint uniquement si le sort n'a pas été contré (le check
        // Contresort est en amont, dans playCard avant resolveSpellKeywords).
        const amount = kw.amount ?? 0;
        dealDamageToHero(ctx.caster.hero, amount);
        break;
      }
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
        ctx.caster.hero.hp += amount;
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
          ctx.opponent.hero.hp += amount;
        } else if (targetId === "friendly_hero") {
          ctx.caster.hero.hp += amount;
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
            faction: getFactionForRace(kw.race) ?? ctx.card.faction,
          };
          tokenCard = applyTokenTemplate(tokenCard, findTokenTemplateByRace(kw.race));
          const token = createCardInstance(tokenCard);
          token.hasSummoningSickness = true;
          ctx.caster.board.push(token);
        }
        break;
      }
      case "convocation_simple": {
        // Sort variante de Convocation X mais sans X : crée le token
        // configuré (`card.convocation_token_id`) avec ses stats par défaut.
        if (ctx.caster.board.length >= MAX_BOARD_SIZE) break;
        const tmpl = findTokenTemplate(ctx.card.convocation_token_id);
        if (!tmpl) {
          console.warn(
            `[engine] Spell convocation_simple: token introuvable pour le sort "${ctx.card.name}" — convocation_token_id =`,
            ctx.card.convocation_token_id,
          );
          break;
        }
        let tokenCard: Card = {
          id: -1, name: `Token ${tmpl.race}`.trim(),
          mana_cost: 0, card_type: "creature",
          attack: tmpl.attack, health: tmpl.health,
          effect_text: `Token ${tmpl.attack}/${tmpl.health}`,
          keywords: [], spell_keywords: null, spell_effects: null, image_url: null,
          race: tmpl.race,
          faction: getFactionForRace(tmpl.race) ?? ctx.card.faction,
        };
        tokenCard = applyTokenTemplate(tokenCard, tmpl);
        const token = createCardInstance(tokenCard);
        token.hasSummoningSickness = true;
        ctx.caster.board.push(token);
        break;
      }
      case "invocation_multiple": {
        const tokenDefs = ctx.card.convocation_tokens ?? [];
        console.log(
          `[engine] Spell invocation_multiple sur "${ctx.card.name}" — convocation_tokens:`,
          ctx.card.convocation_tokens,
          "→ tokenDefs.length =", tokenDefs.length,
        );
        if (tokenDefs.length === 0) {
          console.warn(
            `[engine] Spell invocation_multiple: aucun token configuré pour le sort "${ctx.card.name}" — vérifiez l'onglet Édition.`,
          );
        }
        for (const tokenDef of tokenDefs) {
          if (ctx.caster.board.length >= MAX_BOARD_SIZE) break;
          const tmpl = findTokenTemplate(tokenDef.token_id);
          if (!tmpl) {
            console.warn(
              `[engine] Spell invocation_multiple: token introuvable pour token_id=${tokenDef.token_id} sur le sort "${ctx.card.name}".`,
            );
            continue;
          }
          const atk = tokenDef.attack ?? tmpl.attack;
          const hp = tokenDef.health ?? tmpl.health;
          let tokenCard: Card = {
            id: -1, name: `Token ${tmpl.race}`.trim(),
            mana_cost: 0, card_type: "creature",
            attack: atk, health: hp,
            effect_text: `Token ${atk}/${hp}`,
            keywords: [], spell_keywords: null, spell_effects: null, image_url: null,
            race: tmpl.race,
            faction: getFactionForRace(tmpl.race) ?? ctx.card.faction,
          };
          tokenCard = applyTokenTemplate(tokenCard, tmpl);
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
      case "tempete": {
        // Same logic as the creature on-play side: pick a random alive
        // enemy creature for each damage drop, no hero, re-evaluate per
        // drop so dead targets fall out of the rotation immediately.
        const total = kw.amount ?? 1;
        for (let drop = 0; drop < total; drop++) {
          const alive = ctx.opponent.board.filter((u) => u.currentHealth > 0);
          if (alive.length === 0) break;
          const target = alive[Math.floor(rng() * alive.length)];
          dealDamageToCreature(target, 1, false, true);
        }
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
      case "selection":
      case "renfort_royal": {
        // Both routes look up the chosen card by id in the shared
        // factionCardPool — only the offered shortlist differs.
        const slotKey = kw.id === "selection" ? "selection_0" : "renfort_royal_0";
        const fallbackKey = kw.id === "selection" ? "renfort_royal_0" : "selection_0";
        const slotVal = ctx.targetMap[slotKey] ?? ctx.targetMap[fallbackKey];
        const selCardId = slotVal ? parseInt(slotVal) : null;
        if (selCardId != null && ctx.state.factionCardPool?.length) {
          const chosenCard = ctx.state.factionCardPool.find(c => c.id === selCardId);
          if (chosenCard && ctx.caster.hand.length < MAX_HAND_SIZE) {
            const chosen = createCardInstance(chosenCard);
            ctx.caster.hand.push(chosen);
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
      case "relancer": {
        const amount = kw.amount ?? 1;
        recastSpells(ctx.state, ctx.caster, ctx.opponent, amount);
        break;
      }
      case "rassemblement": {
        // Mirror the creature-side behaviour: reveal X top deck cards, keep
        // same-race creatures (capped by hand size), discard the rest.
        // The spell uses its host card's race — a Rassemblement spell with no
        // race assigned is a no-op (same fail-safe as the creature side).
        const x = kw.amount ?? 1;
        const race = ctx.card.race;
        if (!race || ctx.caster.deck.length === 0) break;
        const count = Math.min(x, ctx.caster.deck.length);
        const revealed = ctx.caster.deck.splice(0, count);
        for (const c of revealed) {
          if (c.card.race === race && c.card.card_type === "creature" && ctx.caster.hand.length < MAX_HAND_SIZE) {
            ctx.caster.hand.push(c);
          } else {
            ctx.caster.graveyard.push(c);
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
        ctx.caster.hero.hp += amount;
      } else if (targetId === "enemy_hero") {
        ctx.opponent.hero.hp += amount;
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
        tokenCard = applyTokenTemplate(tokenCard, findTokenTemplateByRace(effect.race));
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
      if (!def) return;
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
  // Vol : ignore TOUTES les provocations adverses, même celles portées
  // par une créature qui a aussi Vol. Le keyword historique côté engine
  // est `ranged` mais le registre actuel l'expose sous `vol` — on
  // accepte les deux pour ne pas perdre le bénéfice selon la façon
  // dont la carte a été stockée.
  const attackerFlies = hasKw(attacker, "ranged") || hasKw(attacker, "vol");
  const relevantTaunts = attackerFlies
    ? []
    : opponent.board.filter(c => hasKw(c, "taunt"));
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
      const fireXVals = parseXValuesFromEffectText(attacker.card.effect_text);
      const fireX = fireXVals["souffle_de_feu"] || Math.max(1, Math.floor(attacker.card.mana_cost / 2));
      [...opponent.board].forEach(c => dealDamageToCreature(c, fireX));
    }

    dealDamageToHero(opponent.hero, attackPower);

    // Drain de vie: heal own hero
    if (hasKw(attacker, "drain_de_vie")) {
      player.hero.hp += attackPower;
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
      const fireXVals = parseXValuesFromEffectText(attacker.card.effect_text);
      const fireX = fireXVals["souffle_de_feu"] || Math.max(1, Math.floor(attacker.card.mana_cost / 2));
      opponent.board.filter(c => c !== target).forEach(c => dealDamageToCreature(c, fireX));
    }

    // Drain de vie: heal own hero for damage dealt
    if (hasKw(attacker, "drain_de_vie")) {
      player.hero.hp += attackPower;
    }

    // Drain de vie (defender): heal opponent hero for counter-damage dealt
    if (hasKw(target, "drain_de_vie")) {
      opponent.hero.hp += target.currentAttack;
    }

    // Liaison de vie: damage taken shared with enemy hero
    if (hasKw(target, "liaison_de_vie")) {
      dealDamageToHero(player.hero, attackPower);
    }

    // Riposte X: counter-damage to attacker
    if (hasKw(target, "riposte") && target.riposteX > 0) {
      dealDamageToCreature(attacker, target.riposteX);
    }

    // Fureur: après avoir subi des dégâts, le créatures attaque
    // immédiatement (sur le défenseur c'est résolu en contre-attaque
    // automatique sur l'agresseur ; sur l'attaquant qui survit au
    // contre-coup, on lui rend une attaque pour qu'il puisse frapper
    // de nouveau ce même tour). Dans les deux cas la créature gagne
    // aussi son ATK courante en bonus persistant jusqu'à son prochain
    // tour (recalculateAuras lit `fureurATKBonus`).
    if (hasKw(target, "fureur") && target.currentHealth > 0 && !target.fureurActive) {
      target.fureurActive = true;
      target.fureurATKBonus = target.currentAttack;
      dealDamageToCreature(attacker, target.currentAttack);
    }
    if (hasKw(attacker, "fureur") && attacker.currentHealth > 0 && !attacker.fureurActive) {
      attacker.fureurActive = true;
      attacker.fureurATKBonus = attacker.currentAttack;
      // Grant an extra strike: the +1 here cancels out the
      // `attacksRemaining--` a few lines below, so the creature
      // effectively didn't spend its action by attacking this turn.
      attacker.attacksRemaining++;
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
    if (hasKw(creature, "resistance")) {
      const resXVals = parseXValuesFromEffectText(creature.card.effect_text);
      const resAmount =
        resXVals["resistance"] ?? creature.grantedKeywordX["resistance"] ?? 1;
      damage = Math.max(1, damage - resAmount);
    }
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
      // Stamp the death turn so on-play triggers like Instinct de meute
      // can ask "did any same-faction ally die during the current turn?".
      c.diedOnTurn = currentTurnNumber;
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

    // Résurrection: revient avec 1 PV, perd Résurrection. La créature
    // doit transiter par le cimetière (pour les triggers Mort) puis en
    // sortir aussitôt — donc on retire l'instance d'origine du
    // graveyard quand la résurrection réussit, sinon on garderait à la
    // fois la copie ressuscitée sur le board ET la dépouille au
    // cimetière (visuellement et pour les comptages type "X morts ce
    // tour").
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
        owner.graveyard = owner.graveyard.filter(g => g !== c);
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
        tokenCard = applyTokenTemplate(tokenCard, findTokenTemplateByRace(c.card.race));
        const token = createCardInstance(tokenCard);
        token.hasSummoningSickness = true;
        owner.board.push(token);
      }
    }

    // Martyr: toutes les unités de même race gagnent +1/+1 permanent.
    // ATK is tracked via martyrATKBonus so recalculateAuras() preserves it
    // — assigning to currentAttack alone gets erased on the next pass.
    if (hasKw(c, "martyr") && c.card.race) {
      for (const ally of owner.board) {
        if (ally.card.race === c.card.race) {
          ally.martyrATKBonus += 1;
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

    // (Instinct de meute is now an on-play trigger — see playCard,
    // resolved once at summon based on whether any same-faction ally has
    // died this turn. The death side no longer mutates other creatures.)

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

// Legacy passive trigger ("Lich Malachar"-style buff_on_friendly_death) was
// part of the old HeroPowerEffect schema. Under the V2 system, this kind of
// effect is expressed as mode "aura" + keyword "necrophagie" instead. The
// stub stays as a no-op so existing call sites don't break — heroes carrying
// the legacy shape simply do nothing on creature death.
function triggerPassiveOnCreatureDeath(_player: PlayerState, _deadCount: number) {
  return;
}

// ============================================================
// HERO POWER
// ============================================================

// HeroPowerEffect V2 — see plan and src/lib/game/types.ts for the contract.
//
// 3 modes :
//   - "grant_keyword" : add effect.keywordId to a target creature's keywords.
//   - "spell_trigger" : run resolveSpellKeywords with the matching SpellKeywordInstance.
//   - "aura"          : push a stack onto player.hero.activeAuras and let
//                        recalculateAuras propagate the effect.
//
// Validations run in this order: definition exists, not already used this
// turn, usage limit not exhausted, enough mana. All gated by silent return
// of the unchanged input state on failure (mirrors legacy useHeroPower).
export function useHeroPower(state: GameState, action: HeroPowerAction): GameState {
  const pool = state.factionCardPool;
  const newState = deepClone({ ...state, factionCardPool: undefined } as GameState);
  newState.factionCardPool = pool;
  const player = newState.players[newState.currentPlayerIndex];
  const opponent = newState.players[newState.currentPlayerIndex === 0 ? 1 : 0];
  const heroDef = player.hero.heroDefinition;

  if (!heroDef) return state;
  const effect = heroDef.powerEffect;
  if (!effect || typeof effect.mode !== "string") return state;
  if (player.hero.heroPowerUsedThisTurn) return state;
  const limit = heroDef.powerUsageLimit ?? null;
  if (limit !== null && (player.hero.heroPowerActivationsUsed ?? 0) >= limit) return state;
  if (player.mana < heroDef.powerCost) return state;

  player.mana -= heroDef.powerCost;
  player.hero.heroPowerUsedThisTurn = true;
  player.hero.heroPowerActivationsUsed = (player.hero.heroPowerActivationsUsed ?? 0) + 1;

  switch (effect.mode) {
    case "grant_keyword": {
      // Mode 1 : add the keyword to the targeted creature. Target can be any
      // creature on either board (per design); heroes are not valid targets.
      const targetId = action.targetInstanceId;
      if (!targetId) break;
      const target =
        findCreatureOnBoard(player, targetId)
        ?? findCreatureOnBoard(opponent, targetId);
      if (!target) break;
      applyGrantedKeyword(target, effect.keywordId, effect.params);
      break;
    }

    case "spell_trigger": {
      // Mode 2 : prefer the keyword's spell side (resolveSpellKeywords). If
      // that doesn't exist, fall back to creature-only keywords that have a
      // sensible on-play effect we can replay as a hero power (corruption,
      // malediction, …).

      // Ni "convocation" (creature only) ni "convocation_simple" (creature+
      // spell mais avec card.convocation_token_id, pas un tokenId hero) ne
      // disposent d'un chemin SPELL_KEYWORDS qui consommerait le tokenId
      // stocké sur le power_effect du héros. On gère donc les deux ici, avant
      // le lookup générique. La seule différence : "convocation" applique le
      // X (params.amount → token X/X) ; "convocation_simple" garde toujours
      // les stats par défaut du token template.
      if (effect.keywordId === "convocation" || effect.keywordId === "convocation_simple") {
        if (!effect.tokenId) {
          console.warn(
            `[engine] Hero power ${effect.keywordId}: tokenId manquant sur le pouvoir de "${heroDef.name}".`,
          );
        } else if (player.board.length < MAX_BOARD_SIZE) {
          const tmpl = findTokenTemplate(effect.tokenId);
          if (!tmpl) {
            console.warn(
              `[engine] Hero power ${effect.keywordId}: template introuvable pour tokenId=${effect.tokenId} sur "${heroDef.name}". Available ids:`,
              currentTokenTemplates.map(t => t.id),
            );
          } else {
            const useX = effect.keywordId === "convocation";
            const x = useX ? effect.params?.amount : undefined;
            const atk = x && x > 0 ? x : tmpl.attack;
            const hp = x && x > 0 ? x : tmpl.health;
            let tokenCard: Card = {
              id: -1, name: `Token ${tmpl.race}`.trim(),
              mana_cost: 0, card_type: "creature",
              attack: atk, health: hp,
              effect_text: `Token ${atk}/${hp}`,
              keywords: [], spell_keywords: null, spell_effects: null, image_url: null,
              race: tmpl.race,
              faction: getFactionForRace(tmpl.race) ?? undefined,
            };
            tokenCard = applyTokenTemplate(tokenCard, tmpl);
            const token = createCardInstance(tokenCard);
            token.hasSummoningSickness = true;
            player.board.push(token);
          }
        }
        break;
      }

      const spellDef = SPELL_KEYWORDS[effect.keywordId as keyof typeof SPELL_KEYWORDS];
      if (spellDef) {
        const instance: SpellKeywordInstance = {
          id: effect.keywordId as SpellKeywordInstance["id"],
          amount: effect.params?.amount,
          attack: effect.params?.attack,
          health: effect.params?.health,
        };
        // resolveSpellKeywords reads the target from `targetMap["kw_<i>"]`
        // (or `target_0`), not from a key named after the keyword id. The
        // keyword is at index 0 here since the hero power resolves a single
        // instance. Set both for safety.
        const targetMap: Record<string, string> = {};
        if (action.targetInstanceId) {
          targetMap.kw_0 = action.targetInstanceId;
          targetMap.target_0 = action.targetInstanceId;
        }
        const ctx: SpellResolutionContext = {
          state: newState,
          caster: player,
          opponent,
          card: {
            id: -1,
            name: heroDef.powerName ?? "Hero power",
            mana_cost: heroDef.powerCost,
            card_type: "spell",
            attack: 0,
            health: 0,
            effect_text: heroDef.powerDescription ?? "",
            keywords: [],
            spell_keywords: [instance],
            spell_effects: null,
            image_url: null,
          },
          targetMap,
          results: {},
        };
        resolveSpellKeywords(ctx, [instance]);
      } else {
        resolveCreatureKeywordAsHeroPower(player, opponent, effect.keywordId, action.targetInstanceId, effect.params);
      }
      // Spell-side effects can kill creatures — clean up deaths so death
      // triggers fire and the board is consistent.
      const pDead = cleanDeadCreatures(player);
      const oDead = cleanDeadCreatures(opponent);
      processDeathTriggers(pDead, player, opponent);
      processDeathTriggers(oDead, opponent, player);
      break;
    }

    case "aura": {
      // Mode 3 : record / increment a stack on the hero's active-auras list.
      // recalculateAuras (called below) reads this list and applies effects.
      if (!player.hero.activeAuras) player.hero.activeAuras = [];
      const existing = player.hero.activeAuras.find(a => a.keywordId === effect.keywordId);
      if (existing) {
        existing.stacks += 1;
      } else {
        player.hero.activeAuras.push({
          keywordId: effect.keywordId,
          params: effect.params,
          stacks: 1,
        });
      }
      break;
    }
  }

  recalculateAuras(player, opponent);
  newState.lastAction = action;
  checkWinCondition(newState);
  return newState;
}

export function canUseHeroPower(state: GameState): boolean {
  const player = state.players[state.currentPlayerIndex];
  const heroDef = player.hero.heroDefinition;
  if (!heroDef || !heroDef.powerEffect || typeof heroDef.powerEffect.mode !== "string") return false;
  if (player.hero.heroPowerUsedThisTurn) return false;
  const limit = heroDef.powerUsageLimit ?? null;
  if (limit !== null && (player.hero.heroPowerActivationsUsed ?? 0) >= limit) return false;
  if (player.mana < heroDef.powerCost) return false;
  return true;
}

export function heroPowerNeedsTarget(heroDef: HeroDefinition): boolean {
  const effect = heroDef.powerEffect;
  if (!effect || typeof effect.mode !== "string") return false;
  if (effect.mode === "grant_keyword") return true;
  if (effect.mode === "spell_trigger") {
    const spellDef = SPELL_KEYWORDS[effect.keywordId as keyof typeof SPELL_KEYWORDS];
    if (spellDef?.needsTarget) return true;
    // Creature-only keywords with a known on-play effect (corruption, …).
    const creatureTarget = CREATURE_KEYWORD_HERO_POWER_TARGET[effect.keywordId];
    return creatureTarget != null && creatureTarget !== "none";
  }
  return false; // aura → no target
}

export function getHeroPowerTargets(state: GameState, heroDef: HeroDefinition): string[] {
  const player = state.players[state.currentPlayerIndex];
  const opponent = state.players[state.currentPlayerIndex === 0 ? 1 : 0];
  const effect = heroDef.powerEffect;
  if (!effect || typeof effect.mode !== "string") return [];

  if (effect.mode === "grant_keyword") {
    // Any creature, friendly or enemy. Heroes excluded.
    return [...player.board.map(c => c.instanceId), ...opponent.board.map(c => c.instanceId)];
  }
  if (effect.mode === "spell_trigger") {
    const spellDef = SPELL_KEYWORDS[effect.keywordId as keyof typeof SPELL_KEYWORDS];
    if (spellDef?.needsTarget) {
      switch (spellDef.targetType) {
        case "any":
          return [...player.board.map(c => c.instanceId), ...opponent.board.map(c => c.instanceId), "enemy_hero", "friendly_hero"];
        case "enemy_creature":
          return opponent.board.map(c => c.instanceId);
        case "friendly_creature":
          return player.board.map(c => c.instanceId);
        case "any_creature":
          return [...player.board.map(c => c.instanceId), ...opponent.board.map(c => c.instanceId)];
        default:
          return [];
      }
    }
    // Creature-only keyword fallback (corruption / malediction / …).
    const creatureTarget = CREATURE_KEYWORD_HERO_POWER_TARGET[effect.keywordId];
    if (creatureTarget === "enemy_creature") return opponent.board.map(c => c.instanceId);
    if (creatureTarget === "friendly_creature") return player.board.map(c => c.instanceId);
    if (creatureTarget === "any_creature") {
      return [...player.board.map(c => c.instanceId), ...opponent.board.map(c => c.instanceId)];
    }
    return [];
  }
  return []; // aura → no target
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
    // Use Mana Spark from factionCardPool if available, otherwise fallback
    const poolManaSpark = newState.factionCardPool?.find(c => c.name === "Mana Spark" && c.card_type === "spell");
    const manaSpark: Card = poolManaSpark ?? {
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
  currentTurnNumber = state.turnNumber;
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
  if (card.card.card_type === "creature") {
    manaCost = Math.max(0, manaCost - getEntraideReduction(card.card, player.board));
  }
  if (manaCost > player.mana) return false;
  // Alternative costs — non-reducible. Note: canPlayCard checks the raw life
  // cost only; cumulative drains (e.g. life_cost + Douleur on the same card)
  // can still kill the hero — coherent with Douleur's existing behaviour.
  const lifeCost = getLifeCost(card.card);
  if (lifeCost > 0 && player.hero.hp - lifeCost <= 0) return false;
  const discardCost = getDiscardCost(card.card);
  if (player.hand.length - 1 < discardCost) return false;
  const sacrificeCost = getSacrificeCost(card.card);
  if (player.board.length < sacrificeCost) return false;
  // Sacrifices free up board slots, so the test compares the final board size.
  if (card.card.card_type === "creature" &&
      player.board.length - sacrificeCost + 1 > MAX_BOARD_SIZE) return false;
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

  // Vol : ignore TOUTES les provocations adverses (cf. attackCreature).
  const attackerFlies2 = hasKw(attacker, "ranged") || hasKw(attacker, "vol");
  const relevantTaunts2 = attackerFlies2
    ? []
    : opponent.board.filter(c => hasKw(c, "taunt"));

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

export function creatureNeedsRenfortRoyal(card: Card): boolean {
  return card.card_type === "creature" && card.keywords.includes("renfort_royal" as Keyword);
}

const RENFORT_ROYAL_OWNERSHIP_THRESHOLD = 30;

/** Renfort Royal : pioche X cartes parmi les éditions limitées que le
 *  joueur possède réellement (au moins 30 requises). Si le seuil n'est
 *  pas atteint, on retombe sur la liste des communes (mêmes règles que
 *  Sélection X). Les deux clients doivent générer la même proposition,
 *  d'où le seed déterministe basé sur l'état de jeu visible. */
export function getRenfortRoyalCards(state: GameState, x: number): Card[] {
  const pool = state.factionCardPool;
  if (!pool || pool.length === 0) return [];
  const player = state.players[state.currentPlayerIndex];
  const ownedSet = new Set(player.ownedLimitedCardIds ?? []);
  const ownedLimited = pool.filter(c =>
    c.card_year != null
    && c.set_id == null
    && ownedSet.has(c.id),
  );
  if (ownedLimited.length < RENFORT_ROYAL_OWNERSHIP_THRESHOLD) {
    return getSelectionCards(state, x);
  }
  // Same deterministic shuffle pattern as getSelectionCards so both
  // clients agree without burning the seeded RNG.
  const entropy = player.hand.length * 7 + player.board.length * 13 + player.deck.length * 3 + player.graveyard.length * 17 + player.mana * 11;
  const seed = state.turnNumber * 1000 + state.currentPlayerIndex * 100 + entropy + 999;
  let hash = seed;
  const pseudoRng = () => {
    hash = (hash * 16807 + 12345) & 0x7fffffff;
    return (hash & 0xfffffff) / 0x10000000;
  };
  const shuffled = [...ownedLimited];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(pseudoRng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(x, shuffled.length));
}

/** Get X deterministic random cards from the faction pool.
 *  Uses a simple hash based on turnNumber + currentPlayerIndex + pool size
 *  to ensure both clients generate the same selection without advancing the seeded RNG.
 *  The engine version (called during action resolution) uses the seeded RNG instead.
 */
export function getSelectionCards(state: GameState, x: number): Card[] {
  const pool = state.factionCardPool;
  if (!pool || pool.length === 0) return [];

  // Filter pool to only factions present in the current player's deck +
  // Mercenaires, and to Commune rarity — Sélection should never offer
  // a Rare/Épique/Légendaire as a free pick from the open pool.
  const player = state.players[state.currentPlayerIndex];
  const playerFactions = new Set<string>();
  playerFactions.add("Mercenaires");
  for (const c of [...player.hand, ...player.board, ...player.deck, ...player.graveyard]) {
    if (c.card.faction && c.card.faction !== "Mercenaires") playerFactions.add(c.card.faction);
  }
  const filtered = pool.filter(c =>
    c.faction
    && playerFactions.has(c.faction)
    && c.rarity === "Commune",
  );
  if (filtered.length === 0) return [];

  // Deterministic seed based on game state — varies each time within a turn
  const entropy = player.hand.length * 7 + player.board.length * 13 + player.deck.length * 3 + player.graveyard.length * 17 + player.mana * 11;
  const seed = state.turnNumber * 1000 + state.currentPlayerIndex * 100 + entropy;
  let hash = seed;
  const pseudoRng = () => {
    hash = (hash * 16807 + 12345) & 0x7fffffff;
    return (hash & 0xfffffff) / 0x10000000;
  };
  const shuffled = [...filtered];
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
