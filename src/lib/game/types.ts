// Card types matching database schema
export type CardType = "creature" | "spell";

export type Keyword =
  // Legacy (backward compat with existing DB)
  | "charge" | "taunt" | "divine_shield" | "ranged"
  // Tier 0
  | "loyaute" | "ancre" | "resistance" | "premier_frappe" | "berserk"
  // Tier 1
  | "precision" | "drain_de_vie" | "esquive" | "poison" | "celerite"
  // Tier 2
  | "terreur" | "armure" | "commandement" | "fureur" | "double_attaque" | "invisible"
  // Tier 3
  | "liaison_de_vie" | "ombre" | "sacrifice" | "malefice"
  | "indestructible" | "regeneration" | "corruption"
  // Tier 4
  | "pacte_de_sang" | "souffle_de_feu" | "domination" | "resurrection" | "transcendance";

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
  spell_effect: SpellEffect | null;
  image_url: string | null;
  faction?: string;
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
  // New keyword runtime state
  attacksRemaining: number;
  isPoisoned: boolean;
  hasUsedIndestructible: boolean;
  hasUsedResurrection: boolean;
  fureurActive: boolean;
  fureurATKBonus: number;
  berserkActive: boolean;
  berserkATKBonus: number;
  transcendanceTurns: number;
  targetsAttackedThisTurn: string[];
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
  boardPosition?: number;
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
