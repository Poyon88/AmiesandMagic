// Card types matching database schema
export type CardType = "creature" | "spell";

export type Keyword = "charge" | "taunt" | "divine_shield" | "ranged";

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
  keywords: Keyword[];
  spell_effect: SpellEffect | null;
}

// In-game card instance (a card on the board or in hand with runtime state)
export interface CardInstance {
  instanceId: string; // unique per game instance
  card: Card;
  currentAttack: number;
  currentHealth: number;
  maxHealth: number;
  hasAttacked: boolean;
  hasSummoningSickness: boolean;
  hasDivineShield: boolean;
}

export interface HeroState {
  hp: number;
  maxHp: number;
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
  winner: string | null; // player id
  lastAction: GameAction | null;
  mulliganReady: [boolean, boolean];
}

export type GameActionType = "play_card" | "attack" | "end_turn" | "spell_target";

export interface PlayCardAction {
  type: "play_card";
  cardInstanceId: string;
  targetInstanceId?: string; // for targeted spells
  boardPosition?: number;
}

export interface AttackAction {
  type: "attack";
  attackerInstanceId: string;
  targetInstanceId: string; // creature instanceId or 'hero' for enemy hero
}

export interface EndTurnAction {
  type: "end_turn";
}

export interface MulliganAction {
  type: "mulligan";
  playerId: string;
  replacedInstanceIds: string[];
}

export type GameAction = PlayCardAction | AttackAction | EndTurnAction | MulliganAction;

// Damage event for animations
export interface DamageEvent {
  targetId: string; // creature instanceId or "enemy_hero" / "friendly_hero"
  amount: number;
  x: number; // viewport x (center of target element)
  y: number; // viewport y (center of target element)
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
