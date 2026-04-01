// Card types matching database schema
export type CardType = "creature" | "spell";

export type Keyword =
  // Legacy (backward compat with existing DB)
  | "charge" | "taunt" | "divine_shield" | "ranged"
  // Tier 0
  | "raid" | "loyaute" | "ancre" | "resistance" | "premiere_frappe" | "berserk"
  // Tier 1 — Terrain
  | "vol" | "precision" | "drain_de_vie" | "esquive" | "poison" | "celerite"
  | "augure" | "benediction" | "bravoure" | "pillage" | "riposte"
  // Tier 1 — Cimetière / Main
  | "rappel" | "combustion"
  // Tier 2 — Terrain
  | "terreur" | "armure" | "commandement" | "fureur" | "double_attaque" | "invisible"
  | "canalisation" | "contresort" | "convocation" | "malediction" | "necrophagie"
  | "paralysie" | "permutation" | "persecution"
  // Tier 2 — Cimetière / Main / Mixte
  | "catalyse" | "ombre_du_passe" | "profanation" | "prescience" | "suprematie" | "divination"
  // Tier 3 — Terrain
  | "liaison_de_vie" | "ombre" | "sacrifice" | "malefice"
  | "indestructible" | "regeneration" | "corruption"
  | "carnage" | "heritage" | "mimique" | "metamorphose" | "tactique"
  // Tier 3 — Cimetière
  | "exhumation" | "heritage_du_cimetiere"
  // Tier 2 — Deck / Race / Clan
  | "traque_du_destin" | "sang_mele" | "fierte_du_clan" | "solidarite"
  // Tier 3 — Deck / Race / Clan / Mixte
  | "cycle_eternel" | "martyr" | "instinct_de_meute" | "totem" | "appel_du_clan" | "rassemblement"
  // Tier 4
  | "pacte_de_sang" | "souffle_de_feu" | "domination" | "resurrection" | "transcendance"
  | "vampirisme";

export type SpellTargetType =
  | "any"
  | "any_creature"
  | "enemy_hero"
  | "friendly_hero"
  | "friendly_creature"
  | "enemy_creature"
  | "all_enemy_creatures"
  | "all_enemies"
  | "all_friendly_creatures"
  | "friendly_graveyard"
  | "friendly_graveyard_to_board";

// Legacy — kept temporarily for migration; will be removed
export interface SpellEffect {
  type:
    | "deal_damage"
    | "heal"
    | "buff"
    | "draw_cards"
    | "resurrect"
    | "grant_keyword"
    | "gain_mana";
  amount?: number;
  attack?: number;
  health?: number;
  keyword?: Keyword;
  target?: SpellTargetType;
}

// ============================================================
// NEW SPELL SYSTEM
// ============================================================

// --- Spell Keywords (predefined effects) ---

export type SpellKeywordId =
  | "impact"
  | "deferlement"
  | "siphon"
  | "entrave"
  | "execution"
  | "silence"
  | "renforcement"
  | "guerison"
  | "invocation"
  | "inspiration"
  | "afflux";

export interface SpellKeywordInstance {
  id: SpellKeywordId;
  amount?: number;   // X value for impact, deferlement, siphon, guerison, inspiration, afflux
  attack?: number;   // for renforcement, invocation
  health?: number;   // for renforcement, invocation
  race?: string;     // for invocation (token race)
}

// --- Token templates ---

export interface TokenTemplate {
  id: number;
  race: string;
  name: string;
  image_url: string | null;
}

// --- Multi-target system ---

export interface SpellTargetSlot {
  slot: string;            // "target_0", "target_1", "kw_0", etc.
  type: SpellTargetType;
  label?: string;          // UI hint, e.g. "Créature à détruire"
}

// --- Composable effects ---

export type AtomicEffectType =
  | "deal_damage"
  | "heal"
  | "buff"
  | "debuff"
  | "draw_cards"
  | "discard"
  | "grant_keyword"
  | "remove_keyword"
  | "summon_token"
  | "resurrect"
  | "gain_mana"
  | "paralyze"
  | "destroy"
  | "steal"
  | "transform"
  | "bounce";

export interface AtomicEffect {
  type: AtomicEffectType;
  target_slot?: string;    // references SpellTargetSlot.slot
  amount?: number;
  attack?: number;
  health?: number;
  keyword?: Keyword;
  race?: string;           // for summon_token (token race)
}

// --- Condition system ---

export type ConditionType =
  | "target_destroyed"
  | "board_count"
  | "hand_count"
  | "hero_hp_below"
  | "race_match"
  | "faction_match"
  | "graveyard_count"
  | "mana_remaining"
  | "has_keyword";

export interface SimpleCondition {
  type: ConditionType;
  target_slot?: string;
  comparator?: ">=" | "<=" | "==" | ">";
  value?: number | string;
  side?: "allied" | "enemy";
}

export interface CompoundCondition {
  op: "AND" | "OR" | "NOT";
  conditions: SpellCondition[];
}

export type SpellCondition = SimpleCondition | CompoundCondition;

// --- Effect tree (if/then/else) ---

export interface ConditionalEffectNode {
  condition: SpellCondition;
  then: SpellEffectNode[];
  else?: SpellEffectNode[];
}

export type SpellEffectNode = AtomicEffect | ConditionalEffectNode;

// --- Top-level composable structure ---

export interface SpellComposableEffects {
  targets: SpellTargetSlot[];
  effects: SpellEffectNode[];
}

// --- Spell resolution context (engine internal) ---

export interface SpellResolutionContext {
  state: GameState;
  caster: PlayerState;
  opponent: PlayerState;
  targetMap: Record<string, string>;   // slot -> instanceId
  results: Record<string, boolean>;    // e.g. "target_destroyed", "target_0_destroyed"
}

export interface Card {
  id: number;
  name: string;
  mana_cost: number;
  card_type: CardType;
  attack: number | null;
  health: number | null;
  effect_text: string;
  flavor_text?: string | null;
  keywords: Keyword[];
  spell_effect?: SpellEffect | null;          // Legacy — will be removed
  spell_keywords: SpellKeywordInstance[] | null;
  spell_effects: SpellComposableEffects | null;
  image_url: string | null;
  illustration_prompt?: string | null;
  faction?: string;
  race?: string;
  clan?: string;
  rarity?: string;
  card_alignment?: string;
}

// In-game card instance (a card on the board or in hand with runtime state)
export interface CardInstance {
  instanceId: string;
  card: Card;
  currentAttack: number;
  currentHealth: number;
  maxHealth: number;
  hasAttacked: boolean;
  hasSummoningSickness: boolean;
  hasDivineShield: boolean;
  // Keyword runtime state
  attacksRemaining: number;
  isPoisoned: boolean;
  hasUsedResurrection: boolean;
  fureurActive: boolean;
  fureurATKBonus: number;
  berserkActive: boolean;
  berserkATKBonus: number;
  targetsAttackedThisTurn: string[];
  // Esquive: auto-dodge first attack each turn (reset at turn start)
  esquiveUsedThisTurn: boolean;
  // Ombre: stealth — untargetable until unit acts (attack or ability)
  ombreRevealed: boolean;
  // Corruption: IDs of units stolen (returned at end of turn)
  corruptionStolenIds: string[];
  // Contresort: active counter-spell shield on the player
  contresortActive: boolean;
  // Malédiction: instanceId of cursed enemy (exiled next turn)
  maledictionTargetId: string | null;
  // Paralysie: is this unit paralyzed (can't attack next turn)
  isParalyzed: boolean;
  // Nécrophagie: permanent buff tracker
  necrophagieATKBonus: number;
  necrophagiePVBonus: number;
  // Persécution X: damage to hero on attack
  persecutionX: number;
  // Riposte X: counter-damage
  riposteX: number;
  // Carnage X: death AoE
  carnageX: number;
  // Héritage X: death buff to allies
  heritageX: number;
  // Instinct de meute X: buff when same-clan ally dies this turn
  instinctDeMeuteX: number;
  // Cycle éternel: flag for auto-play when drawn
  cycleEternelAutoPlay: boolean;
  // Owner tracking (for Corruption end-of-turn return)
  originalOwnerId: string | null;
}

// Hero power system
export type Race = "elves" | "dwarves" | "halflings" | "humans" | "beastmen" | "giants" | "dark_elves" | "orcs_goblins" | "undead";
export type HeroPowerType = "active" | "passive";

export interface HeroPowerEffect {
  type: "gain_armor" | "deal_damage" | "heal" | "buff_on_friendly_death";
  amount?: number;
  attack?: number;
  target?: "any" | "any_friendly" | "enemy_hero";
}

export interface HeroDefinition {
  id: number;
  name: string;
  race: Race;
  powerName: string;
  powerType: HeroPowerType;
  powerCost: number;
  powerEffect: HeroPowerEffect;
  powerDescription: string;
}

export interface HeroState {
  hp: number;
  maxHp: number;
  armor: number;
  heroDefinition: HeroDefinition | null;
  heroPowerUsedThisTurn: boolean;
}

export interface PlayerState {
  id: string;
  hero: HeroState;
  mana: number;
  maxMana: number;
  hand: CardInstance[];
  board: CardInstance[];
  deck: CardInstance[];
  graveyard: CardInstance[];
  fatigueDamage: number;
}

export type GamePhase = "mulligan" | "playing" | "finished";

export interface GameState {
  players: [PlayerState, PlayerState];
  currentPlayerIndex: 0 | 1;
  turnNumber: number;
  phase: GamePhase;
  winner: string | null;
  lastAction: GameAction | null;
  mulliganReady: [boolean, boolean];
}

export type GameActionType = "play_card" | "attack" | "end_turn" | "spell_target";

export interface PlayCardAction {
  type: "play_card";
  cardInstanceId: string;
  targetInstanceId?: string;
  targetMap?: Record<string, string>;  // multi-target: slot -> instanceId
  boardPosition?: number;
  graveyardTargetInstanceId?: string;
  divinationChoiceIndex?: number;
  tactiqueKeywords?: Keyword[];
}

export interface AttackAction {
  type: "attack";
  attackerInstanceId: string;
  targetInstanceId: string;
}

export interface EndTurnAction {
  type: "end_turn";
}

export interface MulliganAction {
  type: "mulligan";
  playerId: string;
  replacedInstanceIds: string[];
}

export interface HeroPowerAction {
  type: "hero_power";
  targetInstanceId?: string;
}

export type GameAction = PlayCardAction | AttackAction | EndTurnAction | MulliganAction | HeroPowerAction;

// Combat event for animations
export type CombatEventType = "damage" | "heal" | "buff" | "shield";

export interface DamageEvent {
  targetId: string;
  amount: number;
  type: CombatEventType;
  label?: string;
  x: number;
  y: number;
}

// Match data from database
export interface Match {
  id: string;
  player1_id: string;
  player2_id: string;
  winner_id: string | null;
  player1_deck_id: number;
  player2_deck_id: number;
  status: "waiting" | "active" | "finished";
  created_at: string;
  finished_at: string | null;
}

// Deck from database
export interface Deck {
  id: number;
  user_id: string;
  name: string;
  hero_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface DeckCard {
  id: number;
  deck_id: number;
  card_id: number;
  quantity: number;
}

// Profile from database
export interface Profile {
  id: string;
  username: string;
  created_at: string;
}
