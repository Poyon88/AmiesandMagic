// Card types matching database schema
export type CardType = "creature" | "spell";

export type Keyword =
  // Legacy (backward compat with existing DB)
  | "charge" | "taunt" | "divine_shield" | "ranged"
  // Tier 0
  | "raid" | "loyaute" | "ancre" | "resistance" | "premiere_frappe" | "berserk"
  | "convocations_multiples"
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
  | "traque_du_destin" | "sang_mele" | "fierte_du_clan" | "solidarite" | "lycanthropie"
  // Tier 3 — Deck / Race / Clan / Mixte
  | "cycle_eternel" | "martyr" | "instinct_de_meute" | "totem" | "appel_du_clan" | "rassemblement"
  // Tier 4
  | "pacte_de_sang" | "souffle_de_feu" | "domination" | "resurrection" | "transcendance"
  | "vampirisme"
  // Tier 2 — Collection
  | "selection"
  // Tier 3 — Relancer
  | "relancer"
  // Tier 2 — AoE random damage
  | "tempete";

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
  | "afflux"
  | "invocation_multiple"
  | "rappel"
  | "exhumation"
  | "selection"
  | "relancer"
  | "tempete";

export interface SpellKeywordInstance {
  id: SpellKeywordId;
  amount?: number;   // X value for impact, deferlement, siphon, guerison, inspiration, afflux
  attack?: number;   // for renforcement, invocation
  health?: number;   // for renforcement, invocation
  race?: string;     // for invocation (token race)
}

// --- Convocation tokens config ---

// Each entry of `cards.convocation_tokens` (jsonb) — references a saved
// token template by id and may override its base atk/def stats.
export interface ConvocationTokenDef {
  token_id: number;
  attack?: number;
  health?: number;
}

// --- Token templates ---

export interface TokenTemplate {
  id: number;
  race: string;
  clan: string | null;
  name: string;
  attack: number;
  health: number;
  image_url: string | null;
  keywords: Keyword[];
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
  card: Card;                          // the spell card being played
  targetMap: Record<string, string>;
  results: Record<string, boolean>;
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
  convocation_token_id?: number | null;
  convocation_tokens?: ConvocationTokenDef[] | null;
  lycanthropie_token_id?: number | null;
  // Set on instance Cards spawned by the engine when a token is summoned —
  // points to the originating token_template so renderers can fetch the
  // visual / name without guessing by race.
  token_id?: number | null;
  set_id?: number | null;
  card_year?: number | null;
  card_month?: number | null;
  sfx_play_url?: string | null;
  sfx_death_url?: string | null;
}

export interface CardSet {
  id: number;
  name: string;
  code: string;
  icon: string;
  released_at?: string | null;
}

export type FormatCode = 'standard' | 'etendu' | 'variable' | 'basique';

export interface GameFormat {
  id: number;
  code: FormatCode;
  name: string;
  description?: string | null;
  is_active: boolean;
}

export interface FormatSet {
  format_id: number;
  set_id: number;
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
  // Loyauté: permanent on-summon bonus
  loyauteATKBonus: number;
  loyautePVBonus: number;
  // Generic permanent on-summon ATK bonus (profanation, sacrifice, suprématie, ombre_du_passe, vampirisme)
  summonBonusATK: number;
  // Aura health bonus (commandement) — tracked to adjust HP when aura changes
  auraHealthBonus: number;
  // Nécrophagie: permanent buff tracker
  necrophagieATKBonus: number;
  necrophagiePVBonus: number;
  // Martyr (death-trigger from same-race ally): permanent ATK bonus
  // tracked separately from currentAttack so recalculateAuras() doesn't
  // erase it on its next pass.
  martyrATKBonus: number;
  // Persécution X: damage to hero on attack
  persecutionX: number;
  // Riposte X: counter-damage
  riposteX: number;
  // Carnage X: death AoE
  carnageX: number;
  // Héritage X: death buff to allies
  heritageX: number;
  // Instinct de meute X: X value resolved at summon (how much the on-play
  // trigger grants if a same-faction ally has died this turn).
  instinctDeMeuteX: number;
  // Permanent ATK bonus once the on-play trigger fires. Tracked
  // separately so recalculateAuras() doesn't erase it on its next pass.
  instinctDeMeuteATKBonus: number;
  // Turn number on which this creature was put into a graveyard (set in
  // cleanDeadCreatures). null while the creature is still on the board /
  // in the deck / hand. Used by triggers like Instinct de meute that
  // need to know "did this die during the current turn?".
  diedOnTurn: number | null;
  // Cycle éternel: flag for auto-play when drawn
  cycleEternelAutoPlay: boolean;
  // Owner tracking (for Corruption end-of-turn return)
  originalOwnerId: string | null;
  // Lycanthropie: has already transformed
  hasTransformedLycanthropie: boolean;
  // Mots-clés accordés runtime par un pouvoir héroïque (mode grant_keyword)
  // avec leur valeur X. Lu en fallback par le résolveur combat et le rendu
  // du badge quand le keyword n'est pas inscrit dans card.effect_text.
  grantedKeywordX: Record<string, number>;
}

// Hero power system — V2
//
// A hero power is now a (mode, keyword, params) triple that reuses the
// unified ABILITIES registry instead of an ad-hoc effect type. See plan
// /Users/encellefabrice/.claude/plans/tender-tickling-wilkes.md for the
// design rationale.
export type Race = "elves" | "dwarves" | "halflings" | "humans" | "beastmen" | "giants" | "dark_elves" | "orcs_goblins" | "undead";

export type HeroPowerMode =
  | "grant_keyword"   // pay cost → grant the keyword to a targeted creature
  | "spell_trigger"   // pay cost → fire the keyword's spell-side effect once
  | "aura";           // pay cost → activate a persistent aura (stackable)

export interface HeroPowerEffect {
  mode: HeroPowerMode;
  keywordId: string;  // matches an entry in ABILITIES (src/lib/game/abilities.ts)
  // Optional numeric params for keywords that need them:
  //   amount → Impact X, Inspiration X, Convocation X, Renforcement (X part), …
  //   attack / health → Renforcement +X/+Y, summon_token override stats, …
  params?: { amount?: number; attack?: number; health?: number };
  // FK to token_templates.id when keywordId === "convocation".
  tokenId?: number | null;
}

export interface HeroDefinition {
  id: number;
  name: string;
  // Race is a free-form string: either a legacy simplified ID ("humans",
  // "elves", …) for existing heroes, or a granular race name pulled from
  // FACTIONS[faction].races ("Aigles Géants", "Hommes-Loups", …) for new
  // heroes.
  race: string;
  faction?: string | null;
  clan?: string | null;
  powerName: string;
  // Activation cost in mana. Paid every activation (mode 3 included — each
  // payment adds another aura stack).
  powerCost: number;
  powerEffect: HeroPowerEffect;
  powerDescription: string;
  // Max number of activations per game; null = unlimited.
  powerUsageLimit?: number | null;
  glbUrl?: string | null;
  thumbnailUrl?: string | null;
  powerImageUrl?: string | null;
}

// One active aura instance on a hero, set when mode === "aura" is activated.
// Stacks accumulate as the player pays the cost again (when usage limit
// allows): same keywordId / params, just incremented count.
export interface HeroActiveAura {
  keywordId: string;
  params?: { amount?: number; attack?: number; health?: number };
  stacks: number;
}

export interface HeroState {
  hp: number;
  maxHp: number;
  armor: number;
  heroDefinition: HeroDefinition | null;
  heroPowerUsedThisTurn: boolean;
  // Total activations this game across all 3 modes — used to enforce
  // powerUsageLimit on the hero definition.
  heroPowerActivationsUsed: number;
  // Persistent auras active on this hero (mode 3). Cleared at game start
  // (= deck shuffle / mulligan), preserved across turns.
  activeAuras: HeroActiveAura[];
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
  spellHistory: { card: Card; targetMap: Record<string, string> }[];
  fatigueDamage: number;
}

export type GamePhase = "mulligan" | "playing" | "finished";

export interface GameState {
  players: [PlayerState, PlayerState];
  currentPlayerIndex: 0 | 1;
  turnNumber: number;
  /** Wall-clock ms (`Date.now()`) at which the current turn began. Set by
   *  the engine in `startTurn`, broadcast as part of game state so both
   *  clients render the same countdown without drifting from their own
   *  setInterval timing. Initialized to 0 until the first turn starts. */
  turnStartedAt: number;
  phase: GamePhase;
  winner: string | null;
  lastAction: GameAction | null;
  mulliganReady: [boolean, boolean];
  tokenTemplates?: TokenTemplate[];
  factionCardPool?: Card[];  // cards from deck factions + Mercenaires for Sélection X
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
  convocationRace?: string;  // chosen race for token
  selectionCardId?: number;  // chosen card ID from faction pool
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
export type CombatEventType = "damage" | "heal" | "buff" | "shield" | "poison" | "dodge" | "paralyze" | "resurrect" | "transform";

export interface DamageEvent {
  targetId: string;
  amount: number;
  type: CombatEventType;
  label?: string;
  x: number;
  y: number;
  delayMs?: number; // stagger delay when multiple targets share one action
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
  role: string;
  created_at: string;
}

// User collection entry
export interface UserCollectionEntry {
  id: number;
  user_id: string;
  card_id: number;
  created_at: string;
}
