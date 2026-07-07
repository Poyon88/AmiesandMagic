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
  | "canalisation" | "contresort" | "convocation" | "convocation_simple" | "malediction" | "necrophagie"
  | "paralysie" | "permutation" | "persecution" | "pietinement"
  // Tier 2 — Cimetière / Main / Mixte
  | "catalyse" | "ombre_du_passe" | "profanation" | "prescience" | "suprematie" | "divination" | "savant"
  // Tier 3 — Terrain
  | "liaison_de_vie" | "ombre" | "sacrifice" | "malefice"
  | "indestructible" | "regeneration" | "corruption"
  | "carnage" | "heritage" | "mimique" | "metamorphose" | "tactique"
  // Tier 3 — Cimetière
  | "exhumation" | "heritage_du_cimetiere"
  // Tier 2 — Deck / Race / Clan
  | "traque_du_destin" | "sang_mele" | "fierte_du_clan" | "solidarite" | "lycanthropie" | "entraide"
  // Tier 3 — Deck / Race / Clan / Mixte
  | "cycle_eternel" | "martyr" | "instinct_de_meute" | "totem" | "appel_du_clan" | "appel_supreme" | "rassemblement"
  // Tier 4
  | "pacte_de_sang" | "souffle_de_feu" | "domination" | "resurrection" | "transcendance"
  | "vampirisme"
  // Tier 2 — Collection
  | "selection"
  // Tier 2 — Collection (spells of every faction)
  | "selection_magique"
  // Tier 3 — Collection (limited prints, ≥30 owned)
  | "renfort_royal"
  // Tier 3 — Relancer
  | "relancer"
  // Tier 2 — AoE random damage
  | "tempete"
  // Drawback — self-damage on ETB / cast
  | "douleur"
  // Drawback — self ATK reduced by opponent's hand size (dynamic aura)
  | "pauvrete"
  // Reactive — gains +X/+X each time any player discards a card
  | "richesse"
  // Death — on death, distributes X cost reductions among Démons in hand
  | "sacrifice_demoniaque"
  // Polymorphic — draw X cards
  | "inspiration"
  // Polymorphic — replace each spell in hand with a random higher-cost spell, discounted
  | "concentration"
  // Polymorphic — bounce a unit to its true owner's hand (4 trigger modes)
  | "remontee"
  // Polymorphic — +X/+Y to all controller's creatures of a selected race/clan
  | "renforcement_multiple"
  // +X/+X aux créatures en main de la même faction que la source (multi-trigger)
  | "entrainement"
  // Confère une capacité choisie à une/aux unité(s) alliée(s) (mot-clé paramétrique)
  | "conferer"
  // Rejoue à l'entrée en jeu les effets composés déclenchés des AUTRES alliés,
  // pour un sous-ensemble figé de déclencheurs (cf. replayTriggers).
  | "declenchement";

export type SpellTargetType =
  | "any"
  | "any_creature"
  | "enemy_hero"
  | "friendly_hero"
  | "friendly_creature"
  | "enemy_creature"
  // Unité OU héros d'un camp donné (picker des effets composés « both » +
  // side). enemy_any = plateau ennemi + héros ennemi ; friendly_any = plateau
  // allié + héros allié. Évite qu'un effet offensif propose ses propres cibles.
  | "enemy_any"
  | "friendly_any"
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
  | "convocation_simple"
  | "rappel"
  | "exhumation"
  | "selection"
  | "renfort_royal"
  | "relancer"
  | "tempete"
  | "douleur"
  | "appel_du_clan"
  | "appel_supreme"
  | "rassemblement"
  | "concentration"
  | "selection_magique"
  | "poison"
  | "remontee"
  | "renforcement_multiple"
  | "pillage"
  | "entrainement"
  | "damnation";

/** Trigger mode for a creature keyword. Undefined = on-play (default,
 *  existing behaviour). "death" = on-death rattle. "tap" = activated by
 *  tapping the creature (MTG-strict semantics). Only a curated subset of
 *  keywords accept non-play modes — see plan. */
export type KeywordMode = "death" | "tap" | "return" | "attack" | "end_of_turn";

/** Per-instance metadata for a creature keyword. Lives in
 *  `Card.keywordInstances` alongside the string `keywords` array so each
 *  visible icon can carry its own mode + X. Older cards without this field
 *  default every keyword to on-play mode with X parsed from effect_text. */
export interface KeywordInstance {
  id: Keyword;
  mode?: KeywordMode; // undefined ⇒ on-play
  x?: number;
  /** Renforcement multiple : bonus de PV (+Y). `x` porte le bonus d'ATK (+X). */
  y?: number;
  /** Renforcement multiple : race ciblée (les créatures du contrôleur de cette
   *  race gagnent +X/+Y). `clan` prime sur `race` quand il est défini. */
  race?: string;
  /** Renforcement multiple : clan ciblé (prioritaire sur `race`). */
  clan?: string;
  /** Spell-only. When a creature keyword is carried by a SPELL, the spell
   *  CONFERS it to creature(s) on cast. `grantScope` chooses the recipients:
   *  "target" (default) = a single chosen allied creature; "all_allies" =
   *  every allied creature on the board at cast time. Ignored on creatures. */
  grantScope?: "target" | "all_allies";
  /** Mot-clé "conferer" : id de l'ability conférée à la/aux cible(s). */
  grantAbilityId?: string;
  /** Mot-clé "declenchement" : sous-ensemble FIGÉ (à la création) de déclencheurs
   *  dont les capacités composées des AUTRES alliés sont rejouées une fois à
   *  l'entrée en jeu du porteur. ⊆ {on_play, on_death, on_end_of_turn, on_return}. */
  replayTriggers?: CapabilityTrigger[];
}

export interface SpellKeywordInstance {
  id: SpellKeywordId;
  amount?: number;   // X value for impact, deferlement, siphon, guerison, inspiration, afflux, pillage
  attack?: number;   // for renforcement, renforcement_multiple, invocation
  health?: number;   // for renforcement, renforcement_multiple, invocation
  race?: string;     // for invocation (token race) and renforcement_multiple (race ciblée)
  clan?: string;     // for renforcement_multiple (clan ciblé, prioritaire sur race)
  token_id?: number | null; // for invocation — id from token_templates (preferred over race)
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
  // Faction explicite (optionnelle). Quand null/absente, la faction du token
  // invoqué est déduite de la race (getFactionForRace) — rétro-compat tokens
  // créés avant l'ajout de la colonne.
  faction?: string | null;
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

// ============================================================
// UNIFIED CAPABILITY MODEL (refonte des capacités)
// ============================================================
//
// Modèle unique remplaçant à terme les trois structures historiques
// (`keywords[]`, `keyword_instances[]`, `spell_keywords[]`). Le « Contenant »
// (unité / sort / mixte) est implicite via `Card.card_type`. Chaque carte
// porte `capabilities: Capability[]`, où chaque capacité déclare son
// Déclencheur, son Type d'effet, l'ability concernée, ses paramètres et ses
// cibles. Déploiement phasé : la colonne reste nullable et le moteur retombe
// sur l'adaptateur (`deriveCapabilities`) tant qu'une carte n'est pas backfillée.

/** Déclencheur d'une capacité.
 *  Unités : on_play (entrée, défaut) · on_death (mort) · on_return (remontée en
 *  main) · on_activation (activation / tap) · automatic (passif / conditionnel /
 *  réactif au combat — set curé câblé dans le moteur).
 *  Sorts : toujours spell_resolution (à la résolution, si non contré). */
export type CapabilityTrigger =
  | "on_play"
  | "on_death"
  | "on_return"
  | "on_activation"
  | "on_attack"
  | "on_end_of_turn"
  | "automatic"
  | "spell_resolution";

/** Type d'effet : effet immédiat, ou conférer une capacité à une unité. */
export type CapabilityEffectKind = "immediate" | "grant";

/** Un slot de cible que la capacité demande au joueur de sélectionner. */
export interface CapabilityTargetSlot {
  type: SpellTargetType;
  label?: string;
}

export interface Capability {
  /** Identifiant unique au sein du `capabilities[]` de la carte. Permet au
   *  moteur et à la file de déclencheurs en attente de référencer une capacité
   *  précise (remplace l'ancien `instanceIdx` positionnel). */
  uid: string;
  trigger: CapabilityTrigger;
  effectKind: CapabilityEffectKind;
  /** Id de l'ability du registre ABILITIES.
   *  - immediate / automatic : l'id dont le handler s'exécute.
   *  - grant : l'id de la capacité CONFÉRÉE à l'unité. */
  abilityId: string;
  /** Paramètres numériques. `x` = scalaire générique (ancien
   *  KeywordInstance.x / SpellKeywordInstance.amount) ; `attack`/`health` =
   *  paire +X/+Y (renforcement, renforcement_multiple, invocation). */
  params?: { x?: number; attack?: number; health?: number };
  /** Race/clan ciblé (renforcement_multiple, entraide, race du token). */
  race?: string;
  clan?: string;
  /** Référence token (convocation / invocation / convocation_simple). */
  tokenId?: number | null;
  /** Config multi-tokens (convocations_multiples / invocation_multiple). */
  tokens?: ConvocationTokenDef[];
  /** GRANT uniquement : destinataires de la capacité conférée. */
  grantScope?: "target" | "all_allies";
  /** Slots de cibles (0/1/N). Vide = aucun ciblage. Ordre = ordre du picker. */
  targets?: CapabilityTargetSlot[];
  /** Effet COMPOSÉ (modèle hybride). Présent ⇒ la capacité est exécutée par
   *  l'interpréteur générique (`resolveComposedEffect`) au lieu du chemin curé
   *  via `abilityId`. Absent ⇒ comportement curé inchangé. */
  composed?: ComposedEffect;
  /** Mot-clé "declenchement" uniquement : cf. KeywordInstance.replayTriggers
   *  (reporté sur la capability backfillée pour survivre au modèle unifié). */
  replayTriggers?: CapabilityTrigger[];
}

// ─── Capacités composables (modèle hybride) ─────────────────────────────────
// Couche compositionnelle bornée : un interpréteur unique exécute ces contenus
// d'effet courants sur un `TargetSpec`. Les mécaniques singulières (Métamorphose,
// Totem, Cycle éternel, auras à périmètre dynamique…) restent curées via
// `Capability.abilityId`.

export type ComposedEffectContent =
  | "deal_damage"
  | "heal"
  | "buff"
  | "debuff"
  | "draw_cards"
  | "discard"
  | "summon_token"
  | "gain_mana"
  | "destroy"
  | "bounce"
  | "paralyze"
  | "grant_keyword";

/** Spécification de cibles d'un effet composé. Les filtres par caractéristiques
 *  (coût/ATK/déf/rareté) et par capacités possédées sont prévus pour la v2. */
export interface TargetSpec {
  /** Type de cible. "hero" = le héros du bord visé ; "both" = héros + unités ;
   *  "self" = la créature source elle-même (déterministe : ni bord, ni nombre,
   *  ni choix — les autres champs sont ignorés). */
  entity: "unit" | "hero" | "both" | "self";
  /** Nombre d'unités impactées : un entier, ou "all" pour tout le pool filtré. */
  count: number | "all";
  /** Bord visé. */
  side: "ally" | "enemy" | "any";
  /** Appartenance (choix multiples possibles, OU logique entre listes). */
  membership?: { faction?: string[]; race?: string[]; clan?: string[] };
  /** Zone où chercher les cibles. */
  location: "board" | "hand" | "deck" | "graveyard";
  /** Désignation :
   *  - "choice"    : cibles choisies par le joueur (un slot de ciblage par cible) ;
   *  - "random"    : `count` cibles tirées au sort, chacune subit l'effet plein ;
   *  - "automatic" : le moteur applique l'effet à tout le pool filtré sans choix
   *                  ni hasard (pertinent pour count = "all") ;
   *  - "scatter"   : RÉPARTITION POINT PAR POINT (deal_damage / heal seulement).
   *                  L'amplitude `x` est le nombre de points distribués un à un,
   *                  au hasard, sur le pool éligible (tirage avec remise → une
   *                  même cible peut en cumuler plusieurs). `count` est ignoré. */
  designation: "choice" | "random" | "automatic" | "scatter";
}

export interface ComposedEffect {
  content: ComposedEffectContent;
  /** Amplitude : `x` (montant générique), `y` (PV pour buff/debuff +X/+Y). */
  magnitude?: { x?: number; y?: number };
  /** Spécification de cibles. Absent ⇒ effet sur le contrôleur (pioche, mana…). */
  target?: TargetSpec;
  /** content === "grant_keyword" : id de l'ability conférée. */
  grantAbilityId?: string;
  /** content === "summon_token" : token à invoquer. */
  tokenId?: number | null;
}

// --- Composable effects ---
// @deprecated Arbre d'effets génériques typé mais non utilisé en jeu. Conservé
// le temps de la refonte (cf. plan), superseded par le modèle Capability
// ci-dessus ; sera supprimé en phase de nettoyage.

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
  race?: string;           // for summon_token (legacy — token race, fallback when tokenId absent)
  tokenId?: number | null; // for summon_token — id from token_templates (preferred over race)
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
  // Mode metadata for keywords that fire outside the default on-play trigger
  // (death rattle or tap-activated). Optional sidecar to `keywords`: when a
  // keyword appears here it is ALSO listed in `keywords` (icon/label
  // resolution stays driven by the string array). A keyword may appear
  // multiple times in different modes (e.g. Convocation X on-play AND
  // Convocation X on-tap). The field uses snake_case to match the
  // Supabase column name (`keyword_instances`) for direct row mapping.
  keyword_instances?: KeywordInstance[] | null;
  spell_effect?: SpellEffect | null;          // Legacy — will be removed
  /** @deprecated Superseded by `capabilities`. Lecture-fallback uniquement
   *  pendant le déploiement phasé (cf. plan refonte des capacités). */
  spell_keywords: SpellKeywordInstance[] | null;
  spell_effects: SpellComposableEffects | null;
  /** Modèle de capacité unifié (colonne JSONB `capabilities`). Source de vérité
   *  à partir de la phase D ; `null`/absent ⇒ carte non backfillée, le moteur
   *  retombe sur `deriveCapabilities(card)` à partir des structures legacy. */
  capabilities?: Capability[] | null;
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
  // Entraide: race targeted by this card's "Entraide" keyword. While in hand,
  // mana cost is reduced by 1 per allied creature whose race matches this
  // value (recomputed dynamically). Null when the keyword isn't carried.
  entraide_race?: string | null;
  // Set on instance Cards spawned by the engine when a token is summoned —
  // points to the originating token_template so renderers can fetch the
  // visual / name without guessing by race.
  token_id?: number | null;
  set_id?: number | null;
  card_year?: number | null;
  card_month?: number | null;
  sfx_play_url?: string | null;
  sfx_death_url?: string | null;
  // Alternative costs (additional, cumulative with mana_cost). Null/0 = inactive.
  // Not reducible by Canalisation/Entraide — those touch only mana_cost.
  life_cost?: number | null;
  discard_cost?: number | null;
  sacrifice_cost?: number | null;
}

export interface CardSet {
  id: number;
  name: string;
  code: string;
  icon: string;
  released_at?: string | null;
}

// Matrice 2×2 : Mode (Classique/Expert) × Étendue (Standard/Étendu).
//  - Classique : uniquement les cartes Communes.
//  - Expert    : cartes non-communes autorisées (plafonnées par les slots de rareté).
//  - Standard  : rotation ~2 ans (par mois+année, cf. isWithinTwoYears).
//  - Étendu    : toutes les cartes depuis le début du jeu.
export type DeckMode = 'classique' | 'expert';
export type DeckExtent = 'standard' | 'etendu';
export type FormatCode = `${DeckMode}-${DeckExtent}`;

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
  // Tap state — true while the creature is "engaged" (MTG-style 45°
  // rotation). Set when the creature attacks OR when it tap-activates a
  // keyword; reset in startTurn for the outgoing player. Untapped state
  // is the only one that allows attacks and tap activations.
  tapped: boolean;
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
  // Aura health bonus (sang mêlé) — dynamic PV bonus, tracked separately from
  // auraHealthBonus so the two dynamic +PV auras don't clobber each other.
  sangMeleHealthBonus: number;
  // Nécrophagie: permanent buff tracker
  necrophagieATKBonus: number;
  necrophagiePVBonus: number;
  // Richesse: permanent buff tracker (+X/+X per discard, any player)
  richesseATKBonus: number;
  richessePVBonus: number;
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
  // Sacrifice démoniaque X: # of -1 cost reductions distributed to hand Démons on death
  sacrificeDemoniaqueX: number;
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
  // Vrai propriétaire d'origine, persistant à travers un changement de camp
  // PERMANENT (Domination / vol). null = la créature est chez son propriétaire.
  // Utilisé par Remontée pour renvoyer une unité dans la main de son
  // propriétaire initial, pas du contrôleur actuel.
  trueOwnerId: string | null;
  // Lycanthropie: has already transformed
  hasTransformedLycanthropie: boolean;
  // Mots-clés accordés runtime par un pouvoir héroïque (mode grant_keyword)
  // avec leur valeur X. Lu en fallback par le résolveur combat et le rendu
  // du badge quand le keyword n'est pas inscrit dans card.effect_text.
  grantedKeywordX: Record<string, number>;
  // Concentration: persistent mana_cost reduction stamped on the card when
  // it materialises in hand as the result of a Concentration X transform.
  // Cumulable with Canalisation / Entraide (those reduce on top of this
  // baseline). Lives only on the instance — a fresh draw of the same card
  // template starts at 0.
  manaCostReduction: number;
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
  | "aura"            // pay cost → activate a persistent aura (stackable)
  | "composed";       // pay cost → resolve a composed effect, like a spell cast by the hero

export interface HeroPowerEffect {
  mode: HeroPowerMode;
  keywordId: string;  // matches an entry in ABILITIES (src/lib/game/abilities.ts)
  // mode === "composed" : effet générique résolu par l'interpréteur composé
  // (resolveComposedEffect), comme un sort. keywordId vaut "_composed" (ignoré).
  composed?: ComposedEffect;
  // Optional numeric params for keywords that need them:
  //   amount → Impact X, Inspiration X, Convocation X, Renforcement (X part), …
  //   attack / health → Renforcement +X/+Y, summon_token override stats, …
  params?: { amount?: number; attack?: number; health?: number };
  // FK to token_templates.id when keywordId === "convocation".
  tokenId?: number | null;
  // Race/clan ciblé pour les capacités qui en portent une (Appel Suprême,
  // Renforcement multiple…) lorsqu'elles sont déclenchées par un pouvoir.
  race?: string;
  clan?: string;
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
  /** IDs of the cards this player owns through `card_prints` (limited
   *  series). Drives the Renfort Royal pool: ≥30 owned → pick from these,
   *  otherwise fall back to common-rarity selection. */
  ownedLimitedCardIds: number[];
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
  /** mulberry32 PRNG state, carried IN the game state so the random stream is
   *  part of what gets replayed/snapshotted. The engine loads it at the start
   *  of every `applyAction` and writes the advanced value back, so two clients
   *  replaying the same actions stay bit-identical — and a refetched snapshot
   *  restores the exact RNG position (no out-of-band module-singleton drift). */
  rngState: number;
  // File de déclencheurs interactifs en attente (ex. Remontée mort/retour au
  // tour du contrôleur). Tant qu'elle est non vide, le jeu attend que le
  // contrôleur de pendingTriggers[0] choisisse une cible (resolve_pending_trigger).
  pendingTriggers?: PendingTrigger[];
  tokenTemplates?: TokenTemplate[];
  factionCardPool?: Card[];  // cards from deck factions + Mercenaires for Sélection X
  // Global pool of all spell cards (every faction, every set). Loaded once
  // at match start and used by Concentration X to draw a random replacement
  // spell of higher cost. Kept separate from factionCardPool because
  // Concentration must reach beyond the deck-faction subset.
  allSpellsPool?: Card[];
  // Transient: each Fureur trigger fired during the last action is pushed
  // here so the store can sequence a follow-up attack-lunge animation and
  // delay the damage popups on the random victim. Cleared by the store
  // after the animation is scheduled (one action ≠ one persisted entry).
  fureurStrikes?: Array<{
    attackerInstanceId: string;
    victimInstanceId: string;
  }>;
  // Transient: chaque point INDIVIDUEL d'une source de dégâts/soin séquentielle
  // (effets composés scatter, Tempête) est poussé ici dans l'ordre de résolution,
  // pour que le store rende un popup + un burst VFX décalés par point au lieu d'un
  // total agrégé par cible. Héros via le sentinel `__hero_<idx>__` (cf. fureurStrikes).
  // Vidé par le store après planification ; exclu du hash d'état.
  sequentialHits?: Array<{
    targetInstanceId: string;
    type: "damage" | "heal";
  }>;
  // Transient: chaque dégât infligé par un effet composé DÉCLENCHÉ (mort/retour/
  // attaque/fin de tour — PAS tap/on-play) est poussé ici {source, cible, mode}
  // pour que le store trace une flèche source→cible colorée par mode (vert fin de
  // tour, rouge mort, violet attaque, bleu retour). Héros via `__hero_<idx>__`.
  // Vidé par le store après planification ; exclu du hash d'état.
  powerStrikes?: Array<{
    sourceId: string;
    targetId: string;
    mode: KeywordMode;
  }>;
  // Transient: when an attack fires an "à l'attaque" composed power, the engine
  // attaches the post-power / pre-combat board here so the store can animate the
  // power in a first wave (its damage/deaths) then combat in a second wave.
  // Cleared by the store after scheduling, like fureurStrikes. Pools stripped.
  onAttackWave?: { intermediate: GameState } | null;
  // Transient : un end_turn est en pause sur des déclencheurs « fin de tour »
  // interactifs (cibles au choix). Tant que c'est vrai et que des
  // pendingTriggers restent, la bascule de tour est différée ; finishEndTurn
  // s'exécute quand la file est vidée (cf. resolvePendingTrigger).
  endTurnPending?: boolean;
  // Pile d'effets LIFO unifiée (cf. plan « pile d'effets »). Vide entre deux
  // actions, SAUF si la résolution est suspendue sur un choix joueur : la frame
  // au sommet porte alors `awaitingChoice` et la pile persiste dans l'état
  // (hashée + snapshotée → survit au resync, comme pendingTriggers). Données
  // JSON pures (réf. créatures par instanceId, joueurs par id) pour survivre au
  // deepClone et au snapshot multijoueur.
  effectStack?: StackFrame[];
  // Compteur de débordements de la garde de pile (profondeur/boucle). Télémétrie
  // déterministe (les 2 clients le calculent à l'identique) mais classée volatile
  // (exclue du hash) pour ne jamais provoquer de verdict de désync.
  stackOverflowCount?: number;
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
  // Alternative-cost payments chosen by the player. discardInstanceIds picks
  // cards from the player's hand to discard (length must equal card.discard_cost);
  // sacrificeInstanceIds picks allied creatures to sacrifice (length must
  // equal card.sacrifice_cost). Distinct from `targetInstanceId` used by the
  // Sacrifice keyword to designate a buff target.
  discardInstanceIds?: string[];
  sacrificeInstanceIds?: string[];
}

export interface AttackAction {
  type: "attack";
  attackerInstanceId: string;
  targetInstanceId: string;
  /** Cibles choisies pour un pouvoir composé « à l'attaque » (trigger
   *  on_attack, désignation choice). Mêmes clés que play_card : `${uid}#${i}`
   *  pour multi, `${uid}` pour cible unique. Porté par l'action ⇒ les deux
   *  clients résolvent le pouvoir à l'identique au rejeu. */
  targetMap?: Record<string, string>;
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
  // mode === "composed" : cibles choisies par slot `${uid}#${i}` (comme un
  // sort). Lu par runComposedCapsForCard via la carte synthétique du pouvoir.
  targetMap?: Record<string, string>;
  // Card chosen via the selection / renfort_royal / selection_magique
  // overlay when the hero power's keyword routes through a picker. The
  // engine looks the card up in factionCardPool / allSpellsPool and adds
  // it to the caster's hand inside resolveSpellKeywords.
  selectionCardId?: number;
}

/** Activate one of the source creature's tap-mode keywords. The engine
 *  checks the creature is on the active player's board, untapped, free of
 *  summoning sickness, and that `instanceIdx` points at a KeywordInstance
 *  with `mode === "tap"`. Optional targeting payload mirrors the spell
 *  targeting flow for keywords that need to pick an opponent or ally. */
export interface TapActivateAction {
  type: "tap_activate";
  sourceInstanceId: string;
  instanceIdx: number;
  targetInstanceId?: string;
  targetMap?: Record<string, string>;
  /** Active un effet COMPOSÉ on_activation (par uid) au lieu d'un keyword tap
   *  positionnel (instanceIdx ignoré quand présent). */
  composedUid?: string;
  /** Carte choisie dans la modale « 1 parmi 3 » quand le keyword tap est une
   *  capacité Sélection (selection / selection_magique / renfort_royal). Le
   *  moteur la cherche dans factionCardPool / allSpellsPool et l'ajoute en main. */
  selectionCardId?: number;
}

export interface ConcedeAction {
  type: "concede";
  playerId: string;
}

/** Résout un déclencheur interactif en attente (file `GameState.pendingTriggers`)
 *  dont le contrôleur doit choisir la cible — ex. Remontée à la mort / au retour
 *  pendant son propre tour. Dispatchée par le contrôleur (joueur actif). */
export interface ResolvePendingTriggerAction {
  type: "resolve_pending_trigger";
  triggerId: string;
  /** Cible choisie pour une remontée / un effet composé fin de tour. Absent pour
   *  une Sélection en fin de tour (qui passe par `selectionCardId`). */
  targetInstanceId?: string;
  /** Carte choisie pour une Sélection en fin de tour (selectionType présent). */
  selectionCardId?: number;
}

/** Repli automatique à l'expiration du chrono : résout TOUS les déclencheurs
 *  interactifs en attente au hasard (RNG semée, déterministe), puis termine le
 *  tour. Émise par le client du joueur actif quand son temps est écoulé alors
 *  que des `pendingTriggers` restent non résolus. Sans payload : le tirage est
 *  fait dans le moteur. */
export interface AutoResolvePendingTriggersAction {
  type: "auto_resolve_pending_triggers";
}

export type GameAction = PlayCardAction | AttackAction | EndTurnAction | MulliganAction | HeroPowerAction | TapActivateAction | ConcedeAction | ResolvePendingTriggerAction | AutoResolvePendingTriggersAction;

/** Déclencheur interactif en attente : le contrôleur doit choisir une cible
 *  avant que le jeu ne continue. Porté par l'état pour rester déterministe et
 *  rejouable côté réseau. */
export interface PendingTrigger {
  id: string;                       // déterministe (= sourceInstanceId, +uid pour les caps)
  kw?: Keyword;                     // ex. "remontee" (variante mot-clé) ; absent pour les caps
  controllerId: string;            // joueur qui choisit (toujours le joueur actif ici)
  sourceInstanceId: string | null; // source (exclusion de cible)
  /** Présent ⇒ variante « effet composé fin de tour » : uid de la capability
   *  on_end_of_turn à résoudre sur la cible choisie. Absent ⇒ remontée. */
  capUid?: string;
  /** Présent ⇒ variante « Sélection en fin de tour » : famille de la capacité
   *  (selection / selection_magique / renfort_royal). Le contrôleur choisit une
   *  carte parmi `selectionOptionIds` via la modale de sélection ; la carte
   *  choisie est ajoutée à sa main. */
  selectionType?: "selection" | "selection_magique" | "renfort_royal";
  /** Ids des cartes offertes (résolus en Card côté store via les pools). */
  selectionOptionIds?: number[];
}

/** Frame de la pile d'effets LIFO unifiée. UN frame = UN effet atomique (un
 *  `ComposedEffect`, ou un corps de mot-clé curated). Donnée JSON pure : les
 *  créatures sont référencées par `instanceId` et re-localisées à la résolution
 *  (la source peut être au cimetière), les joueurs par `id`. Voir le plan maître. */
export interface StackFrame {
  /** Id déterministe (`${sourceInstanceId}#${trigger}#${seq}`) — clé du sélecteur
   *  de cible quand la frame est suspendue sur un choix. */
  frameId: string;
  kind: "composed" | "curated" | "death_nature";
  /** Contrôleur de l'effet (owner/opponent résolus par id à la résolution). */
  ownerId: string;
  /** Source de l'effet ; null si sans source (re-localisée board+graveyard+hand). */
  sourceInstanceId: string | null;
  /** Déclencheur d'origine (cosmétique + routage du mode valeur). */
  trigger: CapabilityTrigger;
  /** kind === "composed" : snapshot inline de l'effet (pas re-lu depuis la carte,
   *  car Déclenchement rejoue l'effet d'un allié avec une autre source). */
  composed?: ComposedEffect;
  /** uid de la capability d'origine (reconstruction du sélecteur de choix). */
  capUid?: string;
  /** Cibles choisies (pré-connues via targetMap, ou fixées après choix joueur). */
  chosenTargetIds?: string[];
  /** true ⇒ frame suspendue au sommet, en attente d'un choix de cible. */
  awaitingChoice?: boolean;
  /** true ⇒ ne JAMAIS suspendre sur un choix : ciblage en repli déterministe
   *  (pool.slice) sans UI. Utilisé par Déclenchement pour rejouer les effets des
   *  alliés sans empiler N sélections interactives (évite l'explosion + desync). */
  noSuspend?: boolean;
  /** kind === "curated"/"death_nature" : mot-clé + X + instance à résoudre. */
  curatedKw?: Keyword;
  curatedX?: number;
  curatedInst?: KeywordInstance;
  /** Mode valeur (Déclenchement mort/retour) : rejoue le payoff sortant mais
   *  saute l'auto-suppression (self-bounce/destroy/deal_damage/debuff). */
  valueMode?: boolean;
  /** Garde unifiée : profondeur depuis le déclencheur racine + id de la cause
   *  racine (détection de boucle par origine). */
  depth: number;
  originTag: string;
}

// Combat event for animations
export type CombatEventType = "damage" | "heal" | "buff" | "shield" | "poison" | "dodge" | "paralyze" | "resurrect" | "transform" | "empower";

export interface DamageEvent {
  targetId: string;
  amount: number;
  type: CombatEventType;
  label?: string;
  x: number;
  y: number;
  delayMs?: number; // stagger delay when multiple targets share one action
  // Visual-only (cosmetic): attacker centre in viewport coords, stamped for
  // combat hits so the FX layer can shoot debris/shake along the strike
  // vector. Optional — absent for spell/ability damage (→ radial burst).
  // Computed identically on both clients from the same DOM, so it never
  // affects game state or multiplayer determinism.
  srcX?: number;
  srcY?: number;
}

// Visual-only: a creature died this action. Carries its last on-board position
// (viewport coords, captured before removal) so the FX layer can burst shards/
// ash there. Position is DOM-derived → identical on both clients, never touches
// game state.
export interface DeathFxEvent {
  instanceId: string;
  x: number;
  y: number;
  poisoned: boolean;
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
