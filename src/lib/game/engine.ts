import type {
  Card,
  CardInstance,
  ComposedPoolFilter,
  GameState,
  PlayerState,
  PlayCardAction,
  AttackAction,
  MulliganAction,
  HeroPowerAction,
  TapActivateAction,
  GameAction,
  SpellEffect,
  HeroDefinition,
  Keyword,
  KeywordInstance,
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
  PendingTrigger,
  ResolvePendingTriggerAction,
  SpendEpargneAction,
  StackFrame,
  FormatCode,
} from "./types";
import { getFormatFilterByCode } from "./format-legality";
import { SPELL_KEYWORDS } from "./spell-keywords";
import { getEntraideReduction, getTokenManaCost, isCreatureKwShadowedBySpell, XY_ABILITY_IDS } from "./abilities";
import { isManaSpark, MANA_SPARK_FALLBACK } from "./mana-spark";
import { getCapabilities } from "./capability-adapter";
import { parseXValuesFromEffectText } from "./keyword-labels";
import {
  HERO_MAX_HP,
  STARTING_HAND_SIZE,
  MAX_HAND_SIZE,
  MAX_BOARD_SIZE,
  MAX_MANA,
  MAX_EPARGNE,
  SEUIL_DECK_THRESHOLD,
  LOW_HP_TRIGGER_THRESHOLD,
} from "./constants";
import { getFactionForRace, getEffectiveAlignment, FACTIONS } from "@/lib/card-engine/constants";

// ============================================================
// SEEDED PRNG (mulberry32) — deterministic across clients
// ============================================================

// mulberry32 state. Lives in this module var but is SYNCED to GameState.rngState
// at every applyAction boundary (loaded at entry, written back at exit), so the
// random stream is part of the serialized/replayed/snapshotted state — no
// out-of-band singleton drift between the two clients of an online match.
let rngState = 0;

function rng(): number {
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
let currentTokenTemplates: TokenTemplate[] = [];
// Turn number of the action being processed. Set in `applyAction` so any
// engine helper (cleanDeadCreatures…) can stamp creatures with their death
// turn without having to thread state through every signature.
let currentTurnNumber = 0;
// Id du joueur dont c'est le tour pendant l'action en cours (set dans applyAction).
// Permet aux déclencheurs (Remontée mort/retour) de savoir si le contrôleur est
// le joueur actif → ciblage interactif, sinon cible aléatoire.
let currentPlayerId = "";
// Accumulateur de déclencheurs interactifs créés pendant l'action en cours.
// Vidé au début d'applyAction, rattaché au state retourné à la fin.
let pendingTriggerSink: PendingTrigger[] = [];
// Accumulateur des points de dégâts/soin SÉQUENTIELS (scatter, Tempête) émis un
// à un pendant l'action en cours, dans l'ordre. Vidé au début d'applyAction,
// rattaché à state.sequentialHits à la fin (indice d'animation, hors hash). On
// passe par un sink module-level — comme pendingTriggerSink — pour éviter de
// threader le state dans resolveComposedEffect et tous ses appelants.
let sequentialHitsSink: Array<{ targetInstanceId: string; type: "damage" | "heal" }> = [];
// Registre de TOUS les paquets de dégâts réellement appliqués à une créature
// pendant l'action (après immunités, Bouclier, Résistance, Armure). Le store
// diffe les PV pour animer les survivants, mais une créature TUÉE quitte le
// plateau : le diff ne la voit plus et son popup de dégâts disparaissait — un
// Cataclysme qui nettoie le plateau n'animait alors plus rien. Ce registre
// donne au store le montant exact pour ces mortes. Volontairement alimenté au
// seul point de mutation `currentHealth -= damage` : un `destroy` (PV mis à 0
// sans dégât) n'y entre pas et ne fait donc pas flotter de faux chiffre.
// Vidé au début d'applyAction, rattaché à state.damageLedger ; hors hash.
let damageLedgerSink: Array<{ targetInstanceId: string; amount: number }> = [];
// Cartes dont le déclencheur « à la pioche » a RÉELLEMENT résolu quelque chose
// pendant l'action. Indice d'animation : la carte part en main sans jamais être
// jouée, donc rien à l'écran n'expliquait l'effet — l'adversaire voyait des
// dégâts surgir de nulle part. Le store la révèle comme un sort lancé.
// Vidé au début d'applyAction, rattaché à state.drawTriggerEvents ; hors hash.
let drawTriggerSink: Array<{ card: Card; ownerId: string }> = [];
// Capacités NOMMÉES qui ont réellement résolu pendant l'action, avec leur
// déclencheur. Le store en tire un bruitage par capacité (table `keyword_sfx`),
// et le `trigger` décide de la PHASE d'animation où le son s'enchaîne — après
// le son de pose pour une entrée en jeu, après le son de mort pour un râle.
//
// Les effets composés sur mesure (`abilityId === "_composed"`) sont volontairement
// ABSENTS : ils n'ont pas d'ability nommée, et leur donner le son de leur contenu
// ferait sonner deux mécaniques différentes à l'identique.
// Vidé au début d'applyAction, rattaché à state.abilitySfxEvents ; hors hash.
let abilitySfxSink: Array<{ abilityId: string; trigger: import("./types").CapabilityTrigger }> = [];
// Cartes EXILÉES du dessus du deck pour payer un coût d'exil. Indice
// d'animation : elles ne rejoignent aucune zone (ni cimetière, ni main), donc
// rien à l'écran ne les montrait partir — seul le compteur du deck baissait.
// Vidé au début d'applyAction, rattaché à state.exileCostEvents ; hors hash.
let exileCostSink: Array<{ ownerId: string; count: number }> = [];
/** Signale qu'une capacité nommée vient de résoudre. Dédoublonné par
 *  (id, déclencheur) : deux Tempête dans la même action ne sonnent qu'une fois. */
function noteAbilitySfx(abilityId: string, trigger: import("./types").CapabilityTrigger): void {
  if (!abilityId || abilityId === "_composed") return;
  if (abilitySfxSink.some(e => e.abilityId === abilityId && e.trigger === trigger)) return;
  abilitySfxSink.push({ abilityId, trigger });
}
// Flèches source→cible des dégâts de pouvoir DÉCLENCHÉS (mort/retour/attaque/fin
// de tour). Rempli via l'enregistrement dans resolveComposedEffect, en lisant le
// « mode » ambiant posé autour de chaque résolution de capacité (cf.
// withComposedMode). Rattaché à state.powerStrikes ; hors hash. Le tap/on-play
// est volontairement EXCLU (le tap est déjà couvert par la détection jaune du
// store ; on-play n'a pas de mode couleur).
let powerStrikeSink: Array<{ sourceId: string; targetId: string; mode: import("./types").KeywordMode }> = [];
// Mode (couleur) de la capacité composée en cours de résolution — posé autour de
// chaque resolveComposedEffect par withComposedMode. `undefined` = on-play /
// résolution de sort → aucune flèche.
let composedStrikeMode: import("./types").KeywordMode | undefined = undefined;
// Ids des joueurs dans l'ordre de state.players (set dans applyAction). Sert à
// résoudre l'index du sentinel héros `__hero_<idx>__` sans porter le state.
let currentPlayerIds: string[] = [];
// Joueurs de l'état EN COURS DE MUTATION (set par cloneStateForAction, juste
// après le clone du handler). Les fonctions de dégât ne reçoivent pas le state
// mais doivent pouvoir remonter d'une créature source à SON héros pour Drain
// de vie. Volontairement vidé en tête d'applyAction : si des dégâts tombaient
// avant tout clone, mieux vaut ne rien soigner que muter l'état de l'action
// précédente, que l'appelant détient peut-être encore.
let currentBoardPlayers: PlayerState[] = [];
// Pools de cartes de l'action en cours (set dans applyAction). Permet aux
// résolveurs curés SANS accès au GameState (mort / retour en main) de générer
// des options de Sélection ou de remplacer des sorts (Concentration). Même
// patron que currentTokenTemplates. Absent (test appelant un handler en
// direct) ⇒ les effets concernés fizzlent proprement (aucune option).
let currentCardPools: { factionCardPool?: Card[]; allSpellsPool?: Card[] } = {};
// Code du format du match (set dans applyAction depuis state.formatCode). Lu
// par Invocation X pour restreindre le pool aux cartes légales dans le format
// en cours, y compris depuis les déclencheurs curés sans accès au GameState.
// Absent ⇒ aucun filtre de format (parties historiques / decks sans format).
let currentFormatCode: FormatCode | null = null;

/** Pose le mode couleur ambiant le temps de résoudre une capacité composée
 *  (source des flèches de pouvoir), puis le restaure — sûr en ré-entrance. */
function withComposedMode<T>(mode: import("./types").KeywordMode | undefined, fn: () => T): T {
  const prev = composedStrikeMode;
  composedStrikeMode = mode;
  try { return fn(); } finally { composedStrikeMode = prev; }
}

// Touché mortel porté par un SORT : modificateur GLOBAL du sort en cours de
// résolution, comme `spellPierces` pour Précision. Un drapeau module est
// nécessaire car les résolveurs de dégâts de sort passent le HÉROS lanceur en
// source — impossible d'y retrouver la carte qui portait le mot-clé.
let lethalSpellActive = false;
function withLethalSpell<T>(active: boolean, fn: () => T): T {
  const prev = lethalSpellActive;
  lethalSpellActive = active;
  try { return fn(); } finally { lethalSpellActive = prev; }
}

// Seuil de colère porté par un SORT : bonus de dégâts GLOBAL, posé pour toute la
// résolution comme `lethalSpellActive`. Un COMPTEUR et non un booléen, parce que
// le bonus ne s'applique qu'UNE fois — au premier paquet de dégâts du sort, pas
// à chacun : une Tempête 3 avec Colère 2 inflige 3, puis 1, puis 1.
let wrathPending = 0;
function withWrathThreshold<T>(x: number, fn: () => T): T {
  const prev = wrathPending;
  wrathPending = x;
  try { return fn(); } finally { wrathPending = prev; }
}
/** Prélève le bonus de colère s'il en reste : le premier appelant le consomme. */
function consumeWrathBonus(): number {
  const bonus = wrathPending;
  wrathPending = 0;
  return bonus;
}
/** X de Seuil de colère porté par ce sort, 0 s'il ne l'a pas. */
function cardWrathAmount(card: Card): number {
  const cap = getCapabilities(card).find(c => c.abilityId === "seuil_colere");
  return Math.max(0, cap?.params?.x ?? 0);
}

// ── Chant X ────────────────────────────────────────────────────────────────
// Bonus de plateau porté par un SORT : si le lanceur contrôle au moins une
// créature portant Chant, TOUTES les amplitudes du sort gagnent +X. Même patron
// de drapeau que Seuil de colère, à trois différences près :
//   • le bonus ne se CONSOMME pas — il s'applique à chaque X du sort, pas au
//     premier paquet de dégâts (d'où un simple nombre, sans consume) ;
//   • il touche aussi bien le X que le Y des couples (Renforcement +X/+Y) ;
//   • il est BINAIRE côté déclencheur : une chanteuse ou dix, le bonus vaut X.
//
// Périmètre assumé : TOUT X, y compris ceux qui ne sont pas des amplitudes
// (Douleur = auto-dégâts, Invocation = coût EXACT, Sélection/Exhumation =
// plafond de coût, Déchainement = nombre et coût des sorts tirés). Choix du
// concepteur, pris en connaissance de cause. Le repli tient dans un `Set` d'ids
// exclus consulté par `chanted` — aucune migration, aucune carte à retoucher.
let chantBonus = 0;
function withChant<T>(x: number, fn: () => T): T {
  const prev = chantBonus;
  chantBonus = x;
  try { return fn(); } finally { chantBonus = prev; }
}
/** X de Chant porté par ce sort, 0 s'il ne l'a pas. */
function cardChantAmount(card: Card): number {
  const cap = getCapabilities(card).find(c => c.abilityId === "chant");
  return Math.max(0, cap?.params?.x ?? 0);
}
/** Le camp tient-il une chanteuse VIVANTE en jeu ? Binaire : le nombre de
 *  chanteuses n'entre pas dans le calcul. */
export function boardHasChanter(p: PlayerState): boolean {
  return p.board.some(c => hasKw(c, "chant") && c.currentHealth > 0);
}
/** Bonus de Chant d'un sort AVANT sa résolution, calculé depuis l'état seul.
 *
 *  Même règle que `withChant`, mais utilisable HORS résolution : c'est ce qui
 *  permet aux PICKERS de proposer exactement ce que la résolution acceptera.
 *  Sans lui, l'interface et le moteur divergent — une Exhumation 2 + Chant 4
 *  ne laissait choisir que des créatures à 2 alors que le moteur en acceptait
 *  jusqu'à 6, et le joueur ne voyait jamais son bonus. */
export function chantBonusForSpell(state: GameState, card: Card): number {
  const caster = state.players[state.currentPlayerIndex];
  return boardHasChanter(caster) ? cardChantAmount(card) : 0;
}
/** Applique le bonus de Chant à une amplitude du sort en cours.
 *
 *  `undefined` reste `undefined` : un champ absent (le Y d'un mot-clé qui n'en
 *  a pas) ne doit pas naître à `chantBonus`, sinon on inventerait une valeur là
 *  où le résolveur attend un repli.
 *
 *  Chant s'exclut lui-même : son X EST le bonus, l'auto-référence n'aurait
 *  aucun sens. */
function chanted(abilityId: string, value: number | undefined): number | undefined {
  if (chantBonus <= 0 || value == null || abilityId === "chant") return value;
  return value + chantBonus;
}

/** La carte (sort) porte-t-elle Touché mortel ? Lu via le modèle unifié pour
 *  couvrir les deux représentations (spell_keywords et keywords). */
function cardHasLethalTouch(card: Card): boolean {
  return getCapabilities(card).some((c) => c.abilityId === "touche_mortel");
}

/** La source de ces dégâts tue-t-elle sa cible d'un seul coup ? Créature (ou
 *  autre unité) portant Touché mortel, ou sort porteur en cours de résolution. */
function isLethalTouch(source: CardInstance | import("./types").HeroState | null | undefined, isSpellDamage: boolean): boolean {
  if (isSpellDamage && lethalSpellActive) return true;
  return !!source && "instanceId" in source && hasKw(source, "touche_mortel");
}

/** Enregistre une frappe de pouvoir (flèche source→cible) pour un dégât composé,
 *  UNIQUEMENT pour les modes déclenchés colorés (mort/retour/attaque/fin de tour).
 *  Le tap et l'on-play (mode absent) sont ignorés ici. */
function recordPowerStrike(source: CardInstance | null, targetId: string, content: import("./types").ComposedEffectContent, x: number): void {
  if (content !== "deal_damage" || x <= 0 || !source) return;
  const mode = composedStrikeMode;
  if (mode !== "death" && mode !== "return" && mode !== "attack" && mode !== "end_of_turn") return;
  powerStrikeSink.push({ sourceId: source.instanceId, targetId, mode });
}

/** Sentinel héros `__hero_<idx>__` pour une frappe de pouvoir (converti en
 *  sentinelle locale par le store). */
function heroStrikeSentinel(hero: import("./types").HeroState, owner: PlayerState, opponent: PlayerState): string {
  const heroOwner = hero === owner.hero ? owner : opponent;
  return `__hero_${currentPlayerIds.indexOf(heroOwner.id)}__`;
}

export function initRNG(seed: number) {
  rngState = seed | 0;
}

// ============================================================
// KEYWORD HELPERS
// ============================================================

// ── Lecture du modèle de capacités unifié ───────────────────────────────────
// `hasKw` / `hasKwInMode` / `cardHasKwOnPlay` / `getKwX` lisent désormais
// `getCapabilities(card)` (= card.capabilities ?? deriveCapabilities(card)) au
// lieu de `card.keywords` / `card.keyword_instances`. L'adaptateur reproduisant
// fidèlement l'ancienne sémantique, le comportement est inchangé (gate :
// engine-regression.test.ts). Les signatures sont préservées → aucun site
// d'appel modifié.

/** Mode legacy → déclencheur du modèle unifié. */
function capTriggerForMode(mode: import("./types").KeywordMode | undefined): import("./types").CapabilityTrigger {
  if (mode === "death") return "on_death";
  if (mode === "tap") return "on_activation";
  if (mode === "return") return "on_return";
  if (mode === "end_of_turn") return "on_end_of_turn";
  if (mode === "attack") return "on_attack";
  if (mode === "draw") return "on_draw";
  if (mode === "low_hp") return "on_low_hp";
  return "on_play";
}

/** Présence de l'ability quel que soit le déclencheur (remplace l'ancien
 *  `card.keywords.includes`). */
function hasKw(ci: CardInstance, kw: Keyword): boolean {
  return getCapabilities(ci.card).some(c => c.abilityId === kw);
}

/** Présence de l'ability sous un déclencheur donné. Ne concerne en pratique que
 *  le set curé multi-mode (seul à être routé par déclencheur) ; pour ces ids,
 *  l'adaptateur mappe le mode au déclencheur à l'identique. */
/** Unité encore TAPIE dans l'ombre : intargetable tant qu'elle ne s'est pas
 *  révélée (elle le fait en attaquant). */
function isHiddenShadow(c: CardInstance): boolean {
  return hasKw(c, "ombre") && !c.ombreRevealed;
}

function hasKwInMode(ci: CardInstance, kw: Keyword, mode: import("./types").KeywordMode | undefined): boolean {
  const trigger = capTriggerForMode(mode);
  return getCapabilities(ci.card).some(c => c.abilityId === kw && c.trigger === trigger);
}

function hasKwOnPlay(ci: CardInstance, kw: Keyword): boolean { return hasKwInMode(ci, kw, undefined); }

/** Merge two `keyword_instances` lists, deduping on (id, mode). Used by
 *  copy-keyword effects (Mimique, Héritage du cimetière) so that the
 *  copier inherits the source's tap-mode and death-mode triggers, not
 *  just the legacy `keywords[]` strings. The first occurrence of any
 *  (id, mode) wins so the copier's own pre-existing instances aren't
 *  overwritten when both sides share a keyword. */
function mergeKeywordInstances(
  a: KeywordInstance[] | null | undefined,
  b: KeywordInstance[] | null | undefined,
): KeywordInstance[] | null {
  const aArr = a ?? [];
  const bArr = b ?? [];
  if (aArr.length === 0 && bArr.length === 0) return null;
  const seen = new Map<string, KeywordInstance>();
  for (const inst of [...aArr, ...bArr]) {
    const key = `${inst.id}::${inst.mode ?? ""}`;
    if (!seen.has(key)) seen.set(key, inst);
  }
  return [...seen.values()];
}

/** Carries the COMPOSED (hybrid-model) capabilities of a copy source over to
 *  the copier. Composed effects live ONLY in `capabilities[]` — they have no
 *  `keywords` / `keyword_instances` representation — so the keyword merge above
 *  silently drops them. Copy-ability effects (Mimique, Héritage du cimetière)
 *  must therefore carry them explicitly, else an inherited composed ability is
 *  lost.
 *
 *  Composed capabilities never come from `deriveCapabilities` (derivation only
 *  produces curated abilities), so reading `source.capabilities` directly is
 *  sufficient — a source with null capabilities simply has none to copy.
 *
 *  Inherited caps are re-uided (`inh_<uid>`) so they never collide with the
 *  copier's own capability uids: the engine references composed caps by `uid`
 *  for targeting, and uids are positional (`cw_0`, `sk_0`…) so two cards can
 *  share one. Composed abilities the copier already has (same trigger + effect)
 *  are skipped. Returns the copier's existing capabilities unchanged (including
 *  null) when the source has nothing composed to add. */
function mergeComposedCapabilities(
  own: import("./types").Capability[] | null | undefined,
  source: import("./types").Capability[] | null | undefined,
): import("./types").Capability[] | null {
  const srcComposed = (source ?? []).filter((c) => c.composed);
  if (srcComposed.length === 0) return own ?? null;
  const ownArr = own ?? [];
  const composedSig = (c: import("./types").Capability) =>
    `${c.trigger}|${JSON.stringify(c.composed)}`;
  const ownSigs = new Set(ownArr.filter((c) => c.composed).map(composedSig));
  const uids = new Set(ownArr.map((c) => c.uid));
  const additions: import("./types").Capability[] = [];
  for (const cap of srcComposed) {
    if (ownSigs.has(composedSig(cap))) continue; // déjà présente sur le copieur
    let uid = `inh_${cap.uid}`;
    let k = 0;
    while (uids.has(uid)) uid = `inh${k++}_${cap.uid}`;
    uids.add(uid);
    additions.push({ ...cap, uid });
  }
  if (additions.length === 0) return own ?? null;
  return [...ownArr, ...additions];
}

/** Card-level (no CardInstance) mode check used by UI helpers like
 *  `creatureNeedsTarget` that operate on hand cards before they hit the
 *  board. Mirrors `hasKwInMode(_, kw, undefined)` semantics. */
function cardHasKwOnPlay(card: Card, kw: Keyword): boolean {
  // getCapabilities réaligne désormais les triggers périmés des capabilities[]
  // backfillées sur le mode autoritaire de keyword_instances (cf. adapter), donc
  // une simple lecture du trigger suffit — `hasKwInMode` fait de même.
  return getCapabilities(card).some(c => c.abilityId === kw && c.trigger === "on_play");
}

/** Look up the X value for a specific keyword/mode pair. Prefers the
 *  KeywordInstance.x field when present, else falls back to bracket
 *  notation parsed from effect_text (legacy storage). Returns
 *  `defaultX` when neither source has a value. */
function getKwX(ci: CardInstance, kw: Keyword, mode: import("./types").KeywordMode | undefined, defaultX: number): number {
  // L'adaptateur a déjà intégré le repli [Keyword X] de effect_text dans
  // params.x (pour le mode par défaut), donc une simple lecture suffit.
  const trigger = capTriggerForMode(mode);
  const cap = getCapabilities(ci.card).find(c => c.abilityId === kw && c.trigger === trigger);
  return cap?.params?.x ?? defaultX;
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
/** EXIL : cartes retirées du dessus du deck du joueur pour jouer la carte. */
export function getExileCost(card: Card): number {
  return Math.max(0, card.exile_cost ?? 0);
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
  conferer: "friendly_creature",
  domination: "none", // random enemy
};

/** Capacités « à usage » : leur effet se CONSOMME (Ombre révélée, esquive
 *  dépensée, Résurrection utilisée, Contresort déclenché). Regagner la capacité
 *  doit la RÉARMER, sinon le don n'ajoute qu'une ligne inerte au texte de la
 *  carte. Symptôme vu en partie : une unité Ombre déjà révélée, re-dotée
 *  d'Ombre par « Fumée Protectrice », restait attaquable.
 *
 *  Réservé aux dons PONCTUELS. Les AURAS de héros repassent par
 *  `applyGrantedKeyword` à CHAQUE `recalculateAuras` (19 sites d'appel) : y
 *  réarmer rendrait la cible indéfiniment intouchable — elle replongerait dans
 *  l'ombre aussitôt après avoir attaqué. D'où le drapeau `rearm`, faux par
 *  défaut, que seuls les cinq chemins de don ponctuel passent à vrai.
 *
 *  Hors périmètre, volontairement :
 *   • `lycanthropie` — transformation permanente à sens unique, pas une
 *     ressource ; la rejouer réécrirait les stats de l'unité déjà transformée ;
 *   • `fureurActive` — garde de RÉ-ENTRANCE de la chaîne d'assauts (remise à
 *     zéro en fin de tour), pas un usage consommé ; la lever en pleine chaîne
 *     rouvrirait la boucle. */
function rearmGrantedKeyword(creature: CardInstance, kwId: string): void {
  switch (kwId) {
    case "ombre": creature.ombreRevealed = false; break;
    case "esquive": creature.esquiveUsedThisTurn = false; break;
    case "resurrection": creature.hasUsedResurrection = false; break;
    // Contresort s'ARME à l'entrée en jeu (cf. playCard) : sans ce miroir, le
    // don posait le mot-clé sans jamais activer la garde — inerte jusqu'à ce
    // que l'unité repasse par un retour en jeu.
    case "contresort": creature.contresortActive = true; break;
    default: break;
  }
}

function applyGrantedKeyword(
  creature: CardInstance,
  kwId: string,
  params?: { amount?: number; amountY?: number; attack?: number; health?: number },
  // Don PONCTUEL (sort, effet composé, Conférer, pouvoir de héros) → réarme les
  // capacités à usage. Les auras laissent ce drapeau à faux (cf.
  // rearmGrantedKeyword).
  rearm = false,
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
  // Bouclier et Traque se réarment sur TOUS les chemins, auras comprises —
  // comportement historique, laissé tel quel pour ne pas changer la puissance
  // des auras de héros existantes. Voir la note de rearmGrantedKeyword : une
  // aura de Bouclier régénère donc l'absorption à chaque recalcul.
  if (kwId === "divine_shield") {
    creature.hasDivineShield = true;
  }
  if (kwId === "charge") {
    creature.hasSummoningSickness = false;
  }
  if (rearm) rearmGrantedKeyword(creature, kwId);
  // Mémoriser le X du keyword accordé (Résistance 2, Persécution 3, …) pour
  // que les résolveurs et le badge UI le retrouvent — le `card.effect_text`
  // n'est pas réécrit avec la notation [Keyword X] côté hero power.
  if (typeof params?.amount === "number") {
    creature.grantedKeywordX = {
      ...creature.grantedKeywordX,
      [kwId]: params.amount,
    };
  }
  // Idem pour le Y des mots-clés à couple X/Y (Gloire +X/+Y) : sans ce canal,
  // une Gloire conférée retombait sur le +Y=1 par défaut quelle que soit la
  // valeur saisie dans le forge.
  if (typeof params?.amountY === "number") {
    creature.grantedKeywordY = {
      ...creature.grantedKeywordY,
      [kwId]: params.amountY,
    };
  }
}

/** Paramètres à transmettre à `applyGrantedKeyword` pour un don d'amplitude
 *  (x, et y pour les mots-clés à couple — cf. XY_ABILITY_IDS). Centralisé :
 *  les trois chemins de don (effet composé, mot-clé créature « Conférer »,
 *  mot-clé créature porté par un sort) partagent la même règle, sinon l'un
 *  d'eux perd silencieusement le Y et retombe sur le repli 1. */
function grantParamsFor(
  abilityId: string,
  x: number | undefined,
  y: number | undefined,
): { amount?: number; amountY?: number } | undefined {
  const out: { amount?: number; amountY?: number } = {};
  if (x != null && x > 0) out.amount = x;
  if (y != null && XY_ABILITY_IDS.has(abilityId)) out.amountY = y;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Applique une capacité de type « grant » (conférer `cap.abilityId` à une
 *  unité). Généralise l'ancien bloc de don des sorts à tout contenant /
 *  déclencheur : le sort, mais aussi (à terme) une unité qui confère à
 *  l'entrée / la mort / l'activation. `owner` = contrôleur dont les alliés
 *  reçoivent le don ; `targetMap` fournit le destinataire pour le scope
 *  "target" (slot grant_target, repli kw_0 / target_0). */
function applyGrantCapability(
  cap: import("./types").Capability,
  owner: PlayerState,
  targetMap: Record<string, string>,
) {
  const scope = cap.grantScope ?? "target";
  // Chant majore l'amplitude de la capacité CONFÉRÉE (Conférer → Gloire +2/+1).
  // Ce résolveur n'est appelé que depuis la phase 3 d'un sort : le drapeau ne
  // peut donc pas fuir vers un don de créature.
  const params = grantParamsFor(cap.abilityId, chanted(cap.abilityId, cap.params?.x), chanted(cap.abilityId, cap.params?.y));
  if (scope === "all_allies") {
    for (const ally of owner.board) applyGrantedKeyword(ally, cap.abilityId, params, true);
    return;
  }
  const id = targetMap["grant_target"] ?? targetMap["kw_0"] ?? targetMap["target_0"];
  const target =
    id && id !== "enemy_hero" && id !== "friendly_hero" ? findCreatureOnBoard(owner, id) : null;
  if (target) applyGrantedKeyword(target, cap.abilityId, params, true);
}

// ── Interpréteur d'effets composés (modèle hybride) ─────────────────────────
// Exécute les contenus d'effet courants sur un TargetSpec. Les capacités portant
// `composed` empruntent ce chemin générique ; les autres restent curées (chemin
// abilityId). Réutilise les helpers d'effet existants (dégâts, soin, token…).

function composedTargetPool(
  spec: import("./types").TargetSpec,
  owner: PlayerState,
  opponent: PlayerState,
): CardInstance[] {
  const zoneOf = (p: PlayerState): CardInstance[] =>
    spec.location === "board" ? p.board
      : spec.location === "hand" ? p.hand
        : spec.location === "deck" ? p.deck
          : p.graveyard;
  let pool: CardInstance[] =
    spec.side === "ally" ? [...zoneOf(owner)]
      : spec.side === "enemy" ? [...zoneOf(opponent)]
        : [...zoneOf(owner), ...zoneOf(opponent)];
  // Sur le PLATEAU, une unité déjà réduite à 0 PV est un cadavre en sursis : le
  // retrait vers le cimetière (cleanDeadCreatures) n'a lieu qu'APRÈS la
  // résolution complète du sort/capacité. Elle ne doit jamais compter comme une
  // cible valide — sinon un effet multi-cibles « au hasard » (ex. Double
  // assassinat = 2× « Détruire 1 unité au hasard ») peut retomber sur la
  // créature que l'effet précédent vient de tuer, gaspillant la 2e destruction.
  // On ne filtre QUE le plateau : cimetière/main/deck n'ont pas de notion de PV
  // vivants (Exhumation, Résurrection… ciblent justement des cartes « mortes »).
  if (spec.location === "board") {
    pool = pool.filter((c) => c.currentHealth > 0);
  }
  const m = spec.membership;
  if (m && (m.faction?.length || m.race?.length || m.clan?.length)) {
    pool = pool.filter((c) =>
      (!!m.faction?.length && m.faction.includes(c.card.faction ?? "")) ||
      (!!m.race?.length && m.race.includes(c.card.race ?? "")) ||
      (!!m.clan?.length && m.clan.includes(c.card.clan ?? "")));
  }
  return pool;
}

/** Ids de cibles valides pour un ciblage composé "au choix" : ids d'unités
 *  (filtrées ciblables) + marqueurs héros ("enemy_hero"/"friendly_hero") pour
 *  les entités "hero" et "both". `opponent` sert au filtre de ciblabilité. */
function composedChoiceTargetIds(
  t: import("./types").TargetSpec,
  player: PlayerState,
  opponent: PlayerState,
  // Transcendance ne protège que des SORTS : un effet composé porté par une
  // créature (on_attack, on_play, tap…) peut cibler une unité transcendante.
  // true ⇒ effet issu d'un sort (spell_resolution), on respecte Transcendance.
  sourceIsSpell = true,
): string[] {
  const ids: string[] = [];
  if (t.entity === "hero" || t.entity === "both") {
    if (t.side === "ally") ids.push("friendly_hero");
    else if (t.side === "enemy") ids.push("enemy_hero");
    else ids.push("friendly_hero", "enemy_hero");
  }
  if (t.entity === "unit" || t.entity === "both") {
    for (const c of composedTargetPool(t, player, opponent)) {
      const targetable = !opponent.board.includes(c)
        || (!hasKw(c, "invisible")
          && (!sourceIsSpell || !hasKw(c, "transcendance"))
          && !(hasKw(c, "ombre") && !c.ombreRevealed));
      if (targetable) ids.push(c.instanceId);
    }
  }
  return ids;
}

function applyComposedToHero(
  content: import("./types").ComposedEffectContent,
  hero: import("./types").HeroState,
  x: number,
  source?: CardInstance | null,
): void {
  if (content === "deal_damage") dealDamageToHero(hero, x, source);
  else if (content === "heal") hero.hp = Math.min(hero.maxHp, hero.hp + x);
}

function applyComposedToUnit(
  composed: import("./types").ComposedEffect,
  u: CardInstance,
  x: number,
  y: number,
  source: CardInstance | null,
  owner: PlayerState,
  opponent: PlayerState,
  // true ⇒ l'effet composé provient d'un SORT (trigger spell_resolution). Seuls
  // les sorts sont bloqués par Transcendance ; une capacité de créature passe
  // outre (cf. resolveComposedEffect qui le dérive du déclencheur).
  fromSpell = false,
): void {
  switch (composed.content) {
    case "devoration": {
      // Sans instance source (effet porté par un SORT), il n'y a personne pour
      // absorber les stats : on ne détruit rien plutôt que de faire une
      // destruction déguisée qui mentirait sur la capacité.
      if (!source) return;
      resolveDevoration(source, u.instanceId, owner, opponent);
      return;
    }
    case "retour_differe": {
      resolveRetourDiffere(u.instanceId, source?.instanceId ?? null, owner, opponent, fromSpell);
      return;
    }
    case "deal_damage": {
      // Riposte : la source à punir est la créature à l'origine de l'effet, sauf
      // quand l'effet vient d'un SORT (source = instance de sort, hors plateau)
      // ou n'a pas d'unité source → on riposte alors le héros lanceur (owner).
      const dmgSource = source && source.card.card_type !== "spell" ? source : owner.hero;
      dealDamageToCreature(u, x, false, true, dmgSource, fromSpell);
      break;
    }
    case "heal": u.currentHealth = Math.min(u.maxHealth, u.currentHealth + x); break;
    case "buff":
      u.card = { ...u.card, attack: (u.card.attack ?? 0) + x, health: (u.card.health ?? 0) + y };
      u.currentAttack += x; u.currentHealth += y; u.maxHealth += y;
      u.lastBuffMode = composedStrikeMode; // couleur de l'effet → teinte du popup
      break;
    case "debuff":
      // Réduction PERMANENTE, symétrique du buff : on cuit la baisse dans
      // `u.card` (comme malédiction pour l'ATK). Sans ça, recalculateAuras et
      // persistentStats — qui recomposent ATK/PV depuis `card` + bonus trackés —
      // effacent la baisse au prochain recalc, et l'affichage hors-plateau
      // (main/cimetière) ne la reflète pas (bug Ombre Insaisissable : son
      // debuff de PV au retour en main était perdu, seul le buff d'ATK tenait).
      // PV SANS plancher : une baisse qui amène la PV permanente à ≤0 doit
      // TUER la créature (sur le plateau via cleanDeadCreatures du site
      // déclencheur ; au retour en main via triggerReturnToHand). Seule l'ATK
      // garde un plancher à 0 (ATK négative absurde).
      u.card = {
        ...u.card,
        attack: Math.max(0, (u.card.attack ?? 0) - x),
        health: y > 0 ? (u.card.health ?? 1) - y : (u.card.health ?? 1),
      };
      u.currentAttack = Math.max(0, u.currentAttack - x);
      if (y > 0) { u.currentHealth -= y; u.maxHealth = u.maxHealth - y; }
      u.lastBuffMode = composedStrikeMode; // couleur de l'effet → teinte du popup
      break;
    case "destroy": u.currentHealth = 0; break;
    case "paralyze": u.isParalyzed = true; break;
    // ÉTAT empoisonné (1 PV perdu à chaque fin de tour), pas le mot-clé Poison :
    // la cible subit le poison, elle ne devient pas empoisonneuse. Même effet
    // que le mot-clé de sort `poison` (cf. resolveSpellKeywords).
    case "poison": u.isPoisoned = true; break;
    // « Se renvoie en main » (entity "self") passe par l'auto-renvoi : le chemin
    // Remontée exclut la source et ne ferait RIEN, en silence. Le cas était déjà
    // routé à part pour la mort (wantsSelfReturnOnDeath) mais pour elle seule —
    // à l'attaque, à l'entrée ou en fin de tour, la capacité était inerte.
    case "bounce":
      if (source && u.instanceId === source.instanceId) resolveSelfBounce(u, owner, opponent);
      else resolveRemontee(u.instanceId, source?.instanceId ?? null, owner, opponent, fromSpell);
      break;
    case "grant_keyword":
      if (composed.grantAbilityId) {
        applyGrantedKeyword(u, composed.grantAbilityId, grantParamsFor(composed.grantAbilityId, x, y), true);
      }
      break;
    default: break;
  }
}

/** Cible composée résolue : une unité, ou un héros. */
type ComposedTargetRef =
  | { kind: "unit"; unit: CardInstance }
  | { kind: "hero"; hero: import("./types").HeroState };

/** Construit le pool brut de cibles d'un TargetSpec (unités et/ou héros selon
 *  `entity`/`side`/`membership`/`location`), SANS appliquer nombre/désignation. */
function buildComposedPool(
  spec: import("./types").TargetSpec,
  owner: PlayerState,
  opponent: PlayerState,
): ComposedTargetRef[] {
  const pool: ComposedTargetRef[] = [];
  const wantsHero = spec.entity === "hero" || spec.entity === "both";
  const wantsUnit = spec.entity === "unit" || spec.entity === "both";
  if (wantsHero) {
    if (spec.side === "ally") pool.push({ kind: "hero", hero: owner.hero });
    else if (spec.side === "enemy") pool.push({ kind: "hero", hero: opponent.hero });
    else pool.push({ kind: "hero", hero: owner.hero }, { kind: "hero", hero: opponent.hero });
  }
  if (wantsUnit) for (const u of composedTargetPool(spec, owner, opponent)) pool.push({ kind: "unit", unit: u });
  return pool;
}

/** Construit la liste des cibles sélectionnables d'un TargetSpec (unités et/ou
 *  héros selon `entity`), puis applique nombre/désignation. */
function selectComposedTargets(
  spec: import("./types").TargetSpec,
  owner: PlayerState,
  opponent: PlayerState,
  chosenTargetIds?: string[],
  harmful?: boolean,
): ComposedTargetRef[] {
  const pool = buildComposedPool(spec, owner, opponent);

  if (spec.count === "all") return pool;
  const n = typeof spec.count === "number" ? Math.max(0, spec.count) : 1;
  if (spec.designation === "choice" && chosenTargetIds?.length) {
    return chosenTargetIds
      .map((id): ComposedTargetRef | undefined =>
        id === "enemy_hero" ? { kind: "hero", hero: opponent.hero }
          : id === "friendly_hero" ? { kind: "hero", hero: owner.hero }
            : pool.find((t) => t.kind === "unit" && t.unit.instanceId === id))
      .filter((t): t is ComposedTargetRef => !!t)
      .slice(0, n);
  }
  if (spec.designation === "random") return shuffleArray(pool).slice(0, n);
  // Repli déterministe pour un « au choix » SANS cible désignée : survient au
  // tour adverse (pas d'UI, cf. frameNeedsChoice) ou pour une frame « choix »
  // suspendue qui a fuité au-delà du tour de son propriétaire. Un effet
  // OFFENSIF ne doit alors JAMAIS frapper son propre camp faute de désignation
  // — sinon le lanceur se retourne contre lui-même (bug : Jeune Archère se
  // suicidant quand l'adversaire jouait une carte). On restreint aux cibles
  // ENNEMIES ; aucune → l'effet fizzle proprement (slice sur liste vide).
  if (spec.designation === "choice" && harmful) {
    return pool
      .filter((ref) =>
        (ref.kind === "hero" && ref.hero === opponent.hero) ||
        (ref.kind === "unit" && opponent.board.includes(ref.unit)))
      .slice(0, n);
  }
  return pool.slice(0, n);
}

// Liste TOUTES les cibles éligibles (instanceIds + sentinelles de héros) d'un
// TargetSpec, sans appliquer count/designation — pour alimenter un sélecteur.
function composedTargetIds(
  spec: import("./types").TargetSpec,
  owner: PlayerState,
  opponent: PlayerState,
): string[] {
  const ids: string[] = [];
  const wantsHero = spec.entity === "hero" || spec.entity === "both";
  const wantsUnit = spec.entity === "unit" || spec.entity === "both";
  if (wantsHero) {
    if (spec.side === "ally") ids.push("friendly_hero");
    else if (spec.side === "enemy") ids.push("enemy_hero");
    else ids.push("friendly_hero", "enemy_hero");
  }
  if (wantsUnit) for (const u of composedTargetPool(spec, owner, opponent)) ids.push(u.instanceId);
  return ids;
}

// Cibles éligibles pour un déclencheur « fin de tour » interactif en attente
// (capUid). Exporté pour que le store construise le sélecteur.
export function endOfTurnTriggerTargets(state: GameState, trigger: import("./types").PendingTrigger): string[] {
  const controller = state.players.find(p => p.id === trigger.controllerId);
  const other = state.players.find(p => p.id !== trigger.controllerId);
  if (!controller || !other) return [];
  const source = controller.board.find(c => c.instanceId === trigger.sourceInstanceId);
  if (!source) return [];
  const cap = getCapabilities(source.card).find(c => c.uid === trigger.capUid && c.composed);
  const spec = cap?.composed?.target;
  if (!spec) return [];
  return composedTargetIds(spec, controller, other);
}

function resolveComposedEffect(
  composed: import("./types").ComposedEffect,
  source: CardInstance | null,
  owner: PlayerState,
  opponent: PlayerState,
  chosenTargetIds?: string[],
  // true ⇒ effet issu d'un sort (trigger spell_resolution) → respecte
  // Transcendance. Défaut false : une capacité de créature l'ignore.
  fromSpell = false,
  // Contexte d'exécution — utile aux contenus qui doivent SUSPENDRE pour
  // interroger le joueur (Sélection : modale « 1 parmi 3 »). Absent ⇒ contexte
  // non interactif, l'effet se résout au hasard (RNG semé, déterministe).
  opts?: {
    trigger?: import("./types").CapabilityTrigger;
    capUid?: string;
    noSuspend?: boolean;
    /** Carte porteuse de l'effet. Les contenus qui piochent dans la COLLECTION
     *  (invocation, sélections) en ont besoin pour l'alignement du pool — or un
     *  SORT est joué avec `source: null` (il n'a pas d'unité sur le plateau),
     *  d'où ce canal séparé. */
    sourceCard?: Card;
  },
): void {
  // Chant : le bonus ne vaut QUE pour les effets du sort lui-même. La garde sur
  // le déclencheur est load-bearing — `settleSpellDeaths` tourne à l'intérieur
  // du `withChant`, si bien qu'un râle d'agonie déclenché par les dégâts du
  // sort résout ses propres effets composés drapeau posé. Sans ce test, la
  // capacité d'une créature tuée par le sort serait boostée elle aussi.
  const chantX = opts?.trigger === "spell_resolution" ? chantBonus : 0;
  const x = (composed.magnitude?.x ?? 0) + (composed.magnitude?.x != null ? chantX : 0);
  const y = (composed.magnitude?.y ?? 0) + (composed.magnitude?.y != null ? chantX : 0);

  // Effets sur le contrôleur (sans ciblage d'entité)
  switch (composed.content) {
    case "draw_cards": for (let i = 0; i < x; i++) drawCard(owner); return;
    case "gain_mana": owner.mana += x; return;
    // Épargne : alimente le compteur du contrôleur. Aucune cible, donc aucun
    // besoin de `source` — un sort comme une créature y accèdent pareillement.
    case "epargne": addEpargne(owner, x); return;
    // Incinération. Deux écritures possibles, et la désignation prime :
    //   • cible AU CHOIX dans un cimetière (« recyclez 4 cartes au choix ») →
    //     ce sont EXACTEMENT les cartes cliquées qui repartent sous le deck ;
    //   • cible qui nomme seulement un camp → tirage au hasard dans ce
    //     cimetière, comme le mot-clé.
    // Le camp se lit sur la cible réellement désignée : `target.side` ne suffit
    // pas, car à `side: "any"` c'est le joueur qui tranche.
    case "incineration": {
      const spec = composed.target;
      const chosen = chosenTargetIds ?? [];
      const victim =
        spec?.side === "ally" ? owner
        : spec?.side === "enemy" ? opponent
        : graveyardOwnerOf(chosen[0], owner, opponent)
          ?? incinerationVictim(chosen[0], owner, opponent);
      if (spec?.location === "graveyard" && chosen.length > 0) {
        resolveIncinerationChosen(victim, chosen, x);
      } else {
        resolveIncineration(victim, x);
      }
      return;
    }
    case "discard":
      for (let i = 0; i < x && owner.hand.length > 0; i++) {
        discardFromHand(owner, Math.floor(rng() * owner.hand.length), [owner, opponent]);
      }
      return;
    case "summon_token": {
      const count = x > 0 ? x : 1;
      for (let i = 0; i < count && owner.board.length < MAX_BOARD_SIZE; i++) {
        const tmpl = findTokenTemplate(composed.tokenId);
        let base: Card = {
          id: -1, name: tmpl?.name ?? "Token", mana_cost: 0, card_type: "creature",
          attack: tmpl?.attack ?? 1, health: tmpl?.health ?? 1, effect_text: "",
          keywords: [], spell_keywords: null, spell_effects: null, image_url: null,
          faction: source?.card.faction,
        };
        base = applyTokenTemplate(base, tmpl);
        const tok = createCardInstance(base);
        tok.hasSummoningSickness = true;
        owner.board.push(tok);
      }
      return;
    }
    case "exhumation": {
      // Ressuscite jusqu'à `count` créatures du cimetière du contrôleur (coût
      // ≤ x) sur le plateau. Réutilise returnInstanceToPlay (conserve les bonus
      // permanents), comme le mot-clé exhumation. count "all" (ou absent) → tout
      // le pool éligible. Cibles CHOISIES via chosenTargetIds (picker, dans
      // l'ordre) ; en leur absence (déclencheur non-interactif), repli
      // DÉTERMINISTE = plus hauts coûts éligibles (jamais rng, pour la
      // rejouabilité multijoueur).
      const maxCost = x;
      const cnt = composed.target?.count;
      const desired = typeof cnt === "number" ? cnt : Infinity;
      const resurrect = (inst: CardInstance | undefined): boolean => {
        if (!inst || owner.board.length >= MAX_BOARD_SIZE) return false;
        if (inst.card.card_type !== "creature" || inst.card.mana_cost > maxCost) return false;
        owner.graveyard = owner.graveyard.filter((c) => c !== inst);
        returnInstanceToPlay(inst);
        inst.instanceId = generateInstanceId();
        // Traque (charge) → pas de mal d'invocation, même ressuscitée.
        inst.hasSummoningSickness = !inst.card.keywords.includes("charge");
        owner.board.push(inst);
        return true;
      };
      let done = 0;
      const chosen = chosenTargetIds ?? [];
      if (chosen.length > 0) {
        // Interactif : ressuscite exactement les créatures choisies (pas de repli
        // au-delà — le joueur a désigné son lot).
        for (const id of chosen) {
          if (done >= desired) break;
          if (resurrect(owner.graveyard.find((c) => c.instanceId === id))) done++;
        }
      } else {
        // Non-interactif : repli déterministe, plus hauts coûts d'abord.
        while (done < desired && owner.board.length < MAX_BOARD_SIZE) {
          const eligible = owner.graveyard.filter((c) => c.card.card_type === "creature" && c.card.mana_cost <= maxCost);
          if (eligible.length === 0) break;
          const best = eligible.reduce((b, c) => (c.card.mana_cost > b.card.mana_cost ? c : b), eligible[0]);
          if (!resurrect(best)) break;
          done++;
        }
      }
      return;
    }
    case "invocation": {
      // Créature aléatoire de la collection au coût EXACT x, mêmes règles
      // qu'Invocation X (alignement de la carte, format, collection), plus le
      // filtre de pool s'il est renseigné.
      const invocCard = source?.card ?? opts?.sourceCard;
      if (!invocCard) return;
      resolveInvocationSummon(
        owner, invocCard, x,
        currentCardPools.factionCardPool, currentFormatCode,
        composed.pool,
      );
      return;
    }
    case "selection":
    case "selection_magique":
    case "renfort_royal": {
      // Sélection composée : révèle 3 cartes de la collection, le joueur en
      // garde 1. Même moteur de pool que le mot-clé curé (l'aiguillage
      // selectionCardsForKeyword), plus le filtre `composed.pool`.
      // Même canal que l'invocation : un SORT arrive sans instance source.
      const selCard = source?.card ?? opts?.sourceCard;
      if (!selCard) return;
      const selState = {
        factionCardPool: currentCardPools.factionCardPool,
        allSpellsPool: currentCardPools.allSpellsPool,
        players: [owner, opponent],
        currentPlayerIndex: 0,
        // `turnNumber` EST load-bearing : c'est la seule part du germe de tirage
        // qui bouge d'une activation à l'autre. Absent, `state.turnNumber * 1000`
        // vaut NaN, et `NaN & 0xfffffff` vaut 0 — le pseudo-RNG rend alors 0 à
        // chaque appel et propose éternellement les 3 MÊMES cartes, sans la
        // moindre erreur pour le signaler.
        turnNumber: currentTurnNumber,
      } as unknown as GameState;
      // Germe du tirage. Sans source d'instance (SORT / pouvoir de héros), le
      // sel retombe sur l'uid de la capacité : deux Sélections portées par la
      // MÊME carte partagent sinon tout leur germe et proposent les trois mêmes
      // cartes (cf. saltDeSource, même symptôme que deux exemplaires d'une carte
      // résolus au même instant). L'uid est une donnée de carte, donc identique
      // sur les deux clients — aucun risque de désync.
      const seedSalt = source?.instanceId ?? opts?.capUid;
      const options = selectionCardsForKeyword(composed.content, selState, x, selCard, composed.pool, seedSalt);
      // Pool vide après filtrage : no-op assumé. On n'élargit JAMAIS le filtre
      // en repli, sinon une carte « révèle 3 Hommes-Bêtes » proposerait
      // silencieusement autre chose.
      if (options.length === 0) return;
      // La modale ne peut s'ouvrir que sur le tour du contrôleur, hors flux
      // synchrone (attaque) et hors rejeu Déclenchement (noSuspend) — mêmes
      // règles que le chemin curé.
      //
      // Un SORT (et un pouvoir de héros composé) se résout avec `source: null` :
      // il n'a pas d'unité sur le plateau. Exiger une instance source excluait
      // donc TOUS les sorts du chemin interactif — la modale ne s'ouvrait jamais
      // et la carte tombait dans le repli aléatoire, atterrissant directement en
      // main. On autorise explicitement `spell_resolution`, le seul déclencheur
      // à arriver sans source ; le trigger n'a de toute façon besoin que du
      // contrôleur (cf. la branche `selectionType` d'applyOnePendingTrigger, qui
      // ne lit jamais sourceInstanceId).
      const interactive = (!!source || opts?.trigger === "spell_resolution")
        && owner.id === currentPlayerId
        && opts?.trigger !== "on_attack"
        && !opts?.noSuspend;
      if (interactive) {
        // ⚠️ PAS de `capUid` sur ce trigger : applyOnePendingTrigger teste
        // `if (trigger.capUid)` AVANT `else if (trigger.selectionType)`, et
        // rappellerait donc resolveComposedEffect → nouveau trigger → boucle.
        // L'unicité passe par `id` seul — d'où l'uid de la capacité dans la clé
        // côté sort : deux Sélections d'une même carte doivent produire DEUX
        // déclencheurs distincts, donc deux modales successives.
        pendingTriggerSink.push({
          id: `${source?.instanceId ?? `spell_${selCard.id}`}#${opts?.capUid ?? composed.content}`,
          controllerId: owner.id,
          sourceInstanceId: source?.instanceId ?? null,
          selectionType: composed.content,
          selectionOptionIds: options.map(c => c.id),
        });
        return;
      }
      const picked = options[Math.floor(rng() * options.length)];
      if (owner.hand.length < MAX_HAND_SIZE) owner.hand.push(createCardInstance(picked));
      return;
    }
    default: break;
  }

  const target = composed.target;
  if (!target) return;

  // "self" : la créature source elle-même — déterministe, ni pool ni choix.
  // No-op si la source n'est pas une unité (ex. sort).
  if (target.entity === "self") {
    if (source) applyComposedToUnit(composed, source, x, y, source, owner, opponent, fromSpell);
    return;
  }

  // "scatter" : répartition au hasard, passe par passe, avec REMISE. Deux
  // passes peuvent retomber sur la même cible : le nombre de cibles DISTINCTES
  // varie donc de 1 au nombre de passes — c'est exactement l'intérêt de la
  // désignation (« 1 à 2 créatures », pas « 2 »).
  //
  // Le nombre de passes dépend du contenu, parce que `x` n'y désigne pas la
  // même chose :
  //   • deal_damage / heal : `x` EST le total de points, servis 1 par passe.
  //     `count` est ignoré (le champ est d'ailleurs masqué dans la forge).
  //   • tout autre contenu : `x` est l'amplitude de l'effet (buff +X/+Y…) ou
  //     n'a aucun sens (paralyze, destroy, bounce) — on ne peut donc pas le
  //     découper. Le nombre de passes vient de `count` et chaque passe applique
  //     l'effet ENTIER. Le hasard sur le nombre de cibles vient alors des
  //     doublons : une 2ᵉ passe sur une créature déjà paralysée ne fait rien.
  //
  // Résolution SÉQUENTIELLE : le pool est reconstruit AVANT chaque passe et les
  // unités mortes en sont exclues (currentHealth ≤ 0), pour ne pas gaspiller une
  // passe sur un cadavre (cf. Danseuse du Vent : 2 points sur une créature à
  // 1 PV → le 2e doit partir ailleurs, ou se perdre). Corollaire pour
  // `destroy` : la victime quitte le pool dès la passe suivante, donc chaque
  // passe touche forcément une cible neuve — pas de doublon, pas de hasard sur
  // le nombre. Assumé : on ne détruit pas deux fois la même créature.
  if (target.designation === "scatter") {
    const pointwise = composed.content === "deal_damage" || composed.content === "heal";
    // "all" n'a pas de sens ici (scatter tire AVEC remise, il lui faut un nombre
    // de passes fini) : on retombe sur une passe unique plutôt que sur zéro,
    // qui rendrait l'effet silencieusement inerte.
    const passes = pointwise
      ? Math.max(0, x)
      : Math.max(1, typeof target.count === "number" ? target.count : 1);
    // Montant servi par passe : 1 point en régime « point par point », l'effet
    // plein sinon.
    const px = pointwise ? 1 : x;
    const py = pointwise ? 0 : y;
    const seqType = composed.content === "heal" ? "heal" : "damage";
    for (let i = 0; i < passes; i++) {
      const pool = buildComposedPool(target, owner, opponent)
        .filter((ref) => ref.kind === "hero" || ref.unit.currentHealth > 0);
      if (pool.length === 0) break;
      const ref = pool[Math.floor(rng() * pool.length)];
      if (ref.kind === "hero") {
        // applyComposedToHero ne connaît que dégâts et soin : les autres
        // contenus tirés sur un héros sont des passes perdues, comme un doublon.
        applyComposedToHero(composed.content, ref.hero, px, source);
        const heroOwner = ref.hero === owner.hero ? owner : opponent;
        const idx = currentPlayerIds.indexOf(heroOwner.id);
        // Les points séquentiels ne portent qu'un popup de dégât/soin. Pour les
        // autres contenus, le store rend déjà le buff/état par diff d'état — y
        // pousser une entrée afficherait un faux « -1 ».
        if (pointwise) sequentialHitsSink.push({ targetInstanceId: `__hero_${idx}__`, type: seqType });
        recordPowerStrike(source, `__hero_${idx}__`, composed.content, px);
      } else {
        applyComposedToUnit(composed, ref.unit, px, py, source, owner, opponent, fromSpell);
        if (pointwise) sequentialHitsSink.push({ targetInstanceId: ref.unit.instanceId, type: seqType });
        recordPowerStrike(source, ref.unit.instanceId, composed.content, px);
      }
    }
    return;
  }

  // Contenus OFFENSIFS : leur repli auto ne doit jamais frapper le camp du
  // lanceur (cf. selectComposedTargets).
  const harmful =
    composed.content === "deal_damage" || composed.content === "destroy" ||
    composed.content === "debuff" || composed.content === "paralyze" ||
    composed.content === "poison";
  for (const t of selectComposedTargets(target, owner, opponent, chosenTargetIds, harmful)) {
    if (t.kind === "hero") {
      applyComposedToHero(composed.content, t.hero, x, source);
      recordPowerStrike(source, heroStrikeSentinel(t.hero, owner, opponent), composed.content, x);
    } else {
      applyComposedToUnit(composed, t.unit, x, y, source, owner, opponent, fromSpell);
      recordPowerStrike(source, t.unit.instanceId, composed.content, x);
    }
  }
}

/** Mode d'une instance de mot-clé → déclencheur. Inverse de
 *  `triggerToKeywordMode`. Mode absent ⇒ "on_activation" : `resolveCuratedKeywordEffect`
 *  n'est atteint que par les déclencheurs curés HORS entrée en jeu (l'on-play a
 *  ses propres blocs en ligne dans playCard), et le tap est leur cas par défaut. */
function keywordModeToTrigger(mode: import("./types").KeywordMode | undefined): import("./types").CapabilityTrigger {
  switch (mode) {
    case "death": return "on_death";
    case "return": return "on_return";
    case "attack": return "on_attack";
    case "end_of_turn": return "on_end_of_turn";
    case "draw": return "on_draw";
    case "low_hp": return "on_low_hp";
    case "entry": return "on_play";
    case "spell": return "spell_resolution";
    default: return "on_activation";
  }
}

/** Déclencheur → mode couleur (miroir de composedTriggerMode, gardé local pour
 *  éviter un import croisé). on_play / spell_resolution → undefined (pas de
 *  flèche). */
function triggerToKeywordMode(trigger: import("./types").CapabilityTrigger): import("./types").KeywordMode | undefined {
  switch (trigger) {
    case "on_death": return "death";
    case "on_return": return "return";
    case "on_activation": return "tap";
    case "on_attack": return "attack";
    case "on_end_of_turn": return "end_of_turn";
    case "on_low_hp": return "low_hp";
    case "on_play": return "entry"; // arrivée en jeu → jaune (cohérence flèche/icône)
    case "spell_resolution": return "spell"; // sort → jaune (cohérence flèche/icône)
    default: return undefined;
  }
}

/** Exécute les capacités composées d'une carte pour un déclencheur donné.
 *  `targetMap[cap.uid]` (ou `fallbackTargetId`) fournit la cible choisie pour
 *  les capacités en désignation "choice" (count = 1 en v1). */
function runComposedCapsForCard(
  card: Card,
  trigger: import("./types").CapabilityTrigger,
  source: CardInstance | null,
  owner: PlayerState,
  opponent: PlayerState,
  targetMap?: Record<string, string>,
  fallbackTargetId?: string,
): void {
  for (const cap of getCapabilities(card)) {
    if (!cap.composed || cap.trigger !== trigger) continue;
    // no-op pour les effets sur mesure (`_composed`), qui n'ont pas d'ability
    // nommée — cf. noteAbilitySfx.
    noteAbilitySfx(cap.abilityId, trigger);
    let chosen: string[] | undefined;
    if (targetMap) {
      // Multi-cibles : slots `${uid}#0`, `${uid}#1`, … ; sinon slot unique `${uid}`.
      const multi: string[] = [];
      for (let i = 0; targetMap[`${cap.uid}#${i}`] != null; i++) multi.push(targetMap[`${cap.uid}#${i}`]);
      if (multi.length) chosen = multi;
      else if (targetMap[cap.uid] != null) chosen = [targetMap[cap.uid]];
    }
    if (!chosen && fallbackTargetId) chosen = [fallbackTargetId];
    withComposedMode(triggerToKeywordMode(trigger), () =>
      resolveComposedEffect(cap.composed!, source, owner, opponent, chosen, trigger === "spell_resolution",
        { trigger, capUid: cap.uid, sourceCard: card }));
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
      target.trueOwnerId = opponent.id;
      resetTurnStateForNewController(target);
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
      // Contrôle permanent, mais on mémorise le propriétaire d'origine pour Remontée.
      stolen.trueOwnerId = opponent.id;
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
      dealDamageToCreature(target, amount, false, true, player.hero);
      player.hero.hp += amount;
      break;
    }
    default:
      // Unknown / unsupported creature keyword in mode 2 → silent no-op.
      break;
  }
}

function maxAttacksFor(ci: CardInstance): number {
  // Double Attaque inflicts damage twice WITHIN a single combat
  // (first-strike + regular step). It does NOT grant an extra attack
  // per turn — only Célérité does.
  if (hasKw(ci, "celerite")) return 2;
  return 1;
}

// ============================================================
// INITIALIZATION
// ============================================================

function generateInstanceId(): string {
  return rng().toString(36).substring(2, 10) + rng().toString(36).substring(2, 10);
}

/** Règlement des morts sur les DEUX camps : balayage puis râles d'agonie.
 *
 *  Ordre contrôleur → adversaire, non négociable : `processDeathTriggers`
 *  consomme de la RNG (Cycle éternel, Sacrifice démoniaque…) et l'inverser
 *  ferait diverger les deux clients d'une partie en ligne.
 *
 *  Ne recalcule PAS les auras : les appelants le font de toute façon, y compris
 *  quand personne ne meurt (un effet qui ne fait que buffer en a besoin).
 *
 *  Existe parce que l'oubli est invisible : une unité à 0 PV reste simplement
 *  affichée sur le plateau, sans erreur ni log. Deux fois de suite le même
 *  symptôme — un pouvoir de tap curé (Baliste à Répétition) et un effet à la
 *  pioche — pour la même cause. */
function settleDeathsBothSides(owner: PlayerState, opponent: PlayerState): void {
  const ownerDead = cleanDeadCreatures(owner);
  const oppDead = cleanDeadCreatures(opponent);
  if (ownerDead.length === 0 && oppDead.length === 0) return;
  processDeathTriggers(ownerDead, owner, opponent);
  processDeathTriggers(oppDead, opponent, owner);
}

/** Une unité qui CHANGE DE CAMP (Corruption, Domination, prise de contrôle)
 *  arrive prête à agir — c'est tout le sens de la Traque que ces effets lui
 *  posent au passage.
 *
 *  Lever le seul `hasSummoningSickness` ne suffit pas : la créature volée
 *  traîne les COMPTEURS DE TOUR de son ancien contrôleur. Une unité adverse a
 *  presque toujours déjà attaqué ou tapé pendant SON tour, donc elle arrive
 *  avec `attacksRemaining = 0` (ou `tapped`), et `canAttack` la refuse sur ces
 *  gardes-là bien AVANT de regarder le mot-clé. Symptôme vu en partie : un
 *  Intendant Suprême volé par la Corruption de Velkyn, affichant Traque, et
 *  incapable d'attaquer.
 *
 *  `esquiveUsedThisTurn` n'est PAS remis à zéro : l'esquive est une ressource
 *  défensive du tour, pas une permission d'agir. `isParalyzed` non plus — une
 *  paralysie est un malus qui doit survivre au changement de camp. */
function resetTurnStateForNewController(inst: CardInstance): void {
  inst.hasSummoningSickness = false;
  inst.tapped = false;
  inst.hasAttacked = false;
  inst.attacksRemaining = maxAttacksFor(inst);
  inst.targetsAttackedThisTurn = [];
}

/** X des capacités dont la valeur est FIGÉE sur l'instance à sa naissance, au
 *  lieu d'être relue à la résolution : Persécution, Riposte, Carnage, Sacrifice
 *  démoniaque et Héritage. Les résolveurs lisent `inst.<kw>X` et exigent `> 0`,
 *  donc une valeur non posée = capacité INERTE, en silence.
 *
 *  Trois sources, dans l'ordre :
 *   1. le sidecar `keyword_instances` (canal structuré : cartes ET tokens) ;
 *   2. la notation `[Keyword X]` de `effect_text` (repli legacy des cartes) ;
 *   3. une formule dérivée du coût en mana.
 *
 *  Appelé depuis createCardInstance — donc pour TOUTE instance, y compris les
 *  jetons, qui ne passent jamais par `playCard`. C'était le trou : un token
 *  Carnage X gardait carnageX = 0 et son râle ne partait pas, quelle que soit
 *  la valeur saisie dans la forge. La formule de repli n'aurait de toute façon
 *  rien donné : elle dérive du coût en mana, nul sur un jeton. */
function stampKeywordXValues(inst: CardInstance): void {
  const parsed = parseXValuesFromEffectText(inst.card.effect_text);
  const mana = inst.card.mana_cost;
  const xOf = (id: Keyword, fallback: number): number => {
    const fromSidecar = inst.card.keyword_instances?.find(k => k.id === id)?.x;
    if (fromSidecar != null) return fromSidecar;
    return parsed[id] || fallback;
  };
  if (hasKw(inst, "persecution")) inst.persecutionX = xOf("persecution", Math.max(1, Math.floor(mana / 3)));
  if (hasKw(inst, "riposte")) inst.riposteX = xOf("riposte", Math.max(1, Math.floor(mana / 3)));
  if (hasKw(inst, "carnage")) inst.carnageX = xOf("carnage", Math.max(1, Math.floor(mana / 2)));
  if (hasKw(inst, "sacrifice_demoniaque")) inst.sacrificeDemoniaqueX = xOf("sacrifice_demoniaque", Math.max(1, Math.floor(mana / 3)));
  if (hasKw(inst, "heritage")) inst.heritageX = xOf("heritage", Math.max(1, Math.floor(mana / 3)));
}

function createCardInstance(card: Card): CardInstance {
  const noSickness = card.keywords.includes("charge");
  const inst: CardInstance = {
    instanceId: generateInstanceId(),
    card,
    baseAttack: card.attack ?? 0,
    baseHealth: card.health ?? 1,
    currentAttack: card.attack ?? 0,
    currentHealth: card.health ?? 1,
    maxHealth: card.health ?? 1,
    hasAttacked: false,
    hasSummoningSickness: !noSickness,
    hasDivineShield: card.keywords.includes("divine_shield"),
    attacksRemaining: 1,
    isPoisoned: false,
    hasUsedResurrection: false,
    tapped: false,
    fureurActive: false,
    fureurATKBonus: 0,
    gloireStacks: 0,
    targetsAttackedThisTurn: [],
    esquiveUsedThisTurn: false,
    summonBonusATK: 0,
    auraHealthBonus: 0,
    sangMeleHealthBonus: 0,
    ombreRevealed: false,
    corruptionStolenIds: [],
    contresortActive: false,
    maledictionTargetId: null,
    isParalyzed: false,
    loyauteATKBonus: 0,
    loyautePVBonus: 0,
    necrophagieATKBonus: 0,
    necrophagiePVBonus: 0,
    richesseATKBonus: 0,
    richessePVBonus: 0,
    martyrATKBonus: 0, devorationATKBonus: 0, devorationPVBonus: 0,
    persecutionX: 0,
    riposteX: 0,
    carnageX: 0,
    sacrificeDemoniaqueX: 0,
    heritageX: 0,
    instinctDeMeuteX: 0,
    instinctDeMeuteATKBonus: 0,
    diedOnTurn: null,
    cycleEternelAutoPlay: false,
    originalOwnerId: null,
    trueOwnerId: null,
    hasTransformedLycanthropie: false,
    grantedKeywordX: {},
    manaCostReduction: 0,
  };
  // Valeurs figées à la naissance de l'instance. `playCard` les repose à
  // l'identique pour une carte jouée depuis la main (mêmes entrées, même
  // résultat) ; ce passage-ci est le SEUL que voient les jetons.
  stampKeywordXValues(inst);
  return inst;
}

// Dédoublement : fabrique une « copie exacte » de la créature `source` prête à
// entrer en jeu. Le clone est une NOUVELLE instance construite à partir de la
// carte de la source — donc mêmes ATK/PV de base (les bonus PERMANENTS étant
// cuits dans `card.attack`/`card.health`, ils sont copiés ; les bonus d'AURA
// seront recalculés pour la position propre du clone). Il entre FRAIS, à PV
// pleins : c'est le seul comportement cohérent sur TOUS les déclencheurs — en
// particulier « à la mort », où la source est à 0 PV. Le mal des invocations
// est respecté (Traque/charge dérogent, via createCardInstance). Le clone
// porte lui aussi le mot-clé mais n'est jamais repassé par un flux de
// déclenchement dans la même résolution → pas de duplication récursive.
function makeDedoublementClone(source: CardInstance): CardInstance {
  return createCardInstance({ ...source.card });
}

// Prépare une instance EXISTANTE à ré-entrer en jeu (depuis la main après un
// bounce, ou depuis le cimetière via Rappel/Résurrection/Cycle Éternel) en
// CONSERVANT ses bonus permanents accumulés au lieu de la recréer à neuf.
// Ce qui est conservé : `card` (qui porte déjà les buffs génériques de sorts,
// cf. content "buff"), tous les champs de bonus permanents (+ATK/+PV trackés,
// valeurs X, summonBonusATK, martyr/necrophagie/richesse/loyauté/instinct) et
// les mots-clés accordés (grantedKeywordX). Ce qui est réinitialisé : les états
// transitoires/de tour, les bonus d'aura/temporaires (recalculés par
// recalculateAuras une fois sur le plateau) et la propriété volée.
// Les PV sont recomposés depuis la base (du card, buffs génériques inclus) plus
// les bonus de PV trackés — même formule que la reconstruction existante des
// stats — puis soin complet. L'ATK provisoire est laissée à la base ; elle est
// recomposée par recalculateAuras à partir des champs ATK conservés.
/** Stats EFFECTIVES « permanentes » d'une instance = base de la carte + tous les
 *  bonus +ATK/+PV CONSERVÉS à travers les zones (loyauté, summon, nécrophagie,
 *  richesse, martyr, instinct). EXCLUT les bonus transitoires recalculés sur le
 *  plateau (auras, fureur). Source unique : recompose les stats en
 *  sortie de zone (returnInstanceToPlay) ET pilote l'affichage hors-plateau
 *  (cimetière / main) pour qu'il reflète l'état réel — au même titre que les
 *  buffs génériques, déjà cuits dans `card.attack`/`card.health`. */
export function persistentStats(inst: CardInstance): { attack: number; health: number } {
  return {
    attack: (inst.card.attack ?? 0)
      + inst.loyauteATKBonus + inst.summonBonusATK + inst.necrophagieATKBonus
      + inst.richesseATKBonus + inst.martyrATKBonus + inst.instinctDeMeuteATKBonus
      + inst.devorationATKBonus,
    health: (inst.card.health ?? 1)
      + inst.loyautePVBonus + inst.necrophagiePVBonus + inst.richessePVBonus
      + inst.devorationPVBonus,
  };
}

/** SILENCE — ramène une unité à ses ATK/PV IMPRIMÉS en effaçant TOUS ses gains
 *  de stats personnels, quelle qu'en soit la source :
 *   - les buffs cuits dans `card` (Renforcement, Gloire, Entrainement, buff
 *     composé, Affaiblissement) → restaurés depuis `baseAttack`/`baseHealth` ;
 *   - les bonus permanents suivis (loyauté, invocation, nécrophagie, richesse,
 *     martyr, instinct de meute, dévoration) → remis à zéro.
 *
 *  Ce qui n'est PAS touché : les bonus d'AURA (`auraHealthBonus` de
 *  Commandement, `sangMeleHealthBonus`, `forceAncetresHealthBonus`). Ils
 *  appartiennent à la comptabilité par différentiel de recalculateAuras et sont
 *  donc réintégrés tels quels dans les PV max ; le recalcul qui suit le sort
 *  les réconcilie seul — en particulier il fait retomber Sang mêlé et Force des
 *  ancêtres, dont le mot-clé vient d'être retiré. Les remettre à zéro ici
 *  décalerait le différentiel et SOIGNERAIT la créature au recalcul suivant.
 *
 *  Les PV courants sont écrêtés au nouveau maximum : le Silence ne soigne pas,
 *  et ne peut pas tuer non plus (les PV imprimés valent au moins 1). */
function stripBoostsToBase(inst: CardInstance): void {
  const baseAtk = inst.baseAttack ?? inst.card.attack ?? 0;
  const baseHp = inst.baseHealth ?? inst.card.health ?? 1;

  // Stats de la carte : on efface les buffs qui y ont été cuits. `card` est
  // remplacée (pas mutée) — cf. capability-adapter, qui mémoïse sur l'objet.
  inst.card = { ...inst.card, attack: baseAtk, health: baseHp };

  inst.loyauteATKBonus = 0;
  inst.loyautePVBonus = 0;
  inst.summonBonusATK = 0;
  inst.necrophagieATKBonus = 0;
  inst.necrophagiePVBonus = 0;
  inst.richesseATKBonus = 0;
  inst.richessePVBonus = 0;
  inst.martyrATKBonus = 0;
  inst.instinctDeMeuteATKBonus = 0;
  inst.devorationATKBonus = 0;
  inst.devorationPVBonus = 0;
  // Compteur de Gloire remis à zéro : son gain +X/+Y vient d'être effacé avec
  // le reste, l'indicateur de plateau ne doit plus l'annoncer.
  inst.gloireStacks = 0;

  // ATK : base seule ; recalculateAuras (systématique en fin de résolution de
  // sort) y rajoute les auras encore en vigueur.
  inst.currentAttack = baseAtk;
  inst.maxHealth = baseHp
    + inst.auraHealthBonus
    + inst.sangMeleHealthBonus
    + (inst.forceAncetresHealthBonus ?? 0)
    + (inst.pureteHealthBonus ?? 0)
    + (inst.seuilSacrificielHealthBonus ?? 0);
  inst.currentHealth = Math.min(inst.currentHealth, inst.maxHealth);
}

function returnInstanceToPlay(inst: CardInstance): void {
  const { attack, health } = persistentStats(inst);

  // PV : base + bonus de PV permanents conservés, soin complet. L'aura de PV
  // (Commandement) est purgée ici et réappliquée par recalculateAuras.
  inst.maxHealth = health;
  inst.currentHealth = inst.maxHealth;
  inst.auraHealthBonus = 0;
  inst.sangMeleHealthBonus = 0;

  // ATK = base + bonus ATK permanents conservés (même formule que
  // recalculateAuras, qui la reconfirmera une fois sur le plateau). Fureur est
  // remise inactive ci-dessous donc exclue, comme dans recalc.
  inst.currentAttack = attack;

  // États transitoires / de tour réinitialisés.
  inst.tapped = false;
  inst.hasAttacked = false;
  inst.hasSummoningSickness = !inst.card.keywords.includes("charge");
  // maxAttacksFor (pas 1 en dur) : une créature Célérité qui revient du cimetière
  // conserve ses 2 attaques/tour (utile avec Raid, qui la laisse attaquer malgré
  // le mal d'invocation). Non-Célérité → 1, inchangé.
  inst.attacksRemaining = maxAttacksFor(inst);
  inst.targetsAttackedThisTurn = [];
  inst.esquiveUsedThisTurn = false;
  inst.isParalyzed = false;
  inst.isPoisoned = false;
  inst.maledictionTargetId = null;
  inst.ombreRevealed = false;
  inst.contresortActive = false;
  inst.fureurActive = false;
  inst.fureurATKBonus = 0;
  // gloireStacks N'EST PAS remis à zéro : le bonus +X/+Y correspondant est fondu
  // dans les stats permanentes de l'instance, qui survivent au passage
  // main/cimetière (règle de persistance des buffs). Remettre le compteur à 0
  // afficherait « pas de Gloire » sur une unité qui en porte pourtant le gain.
  inst.diedOnTurn = null;
  inst.hasUsedResurrection = false;
  inst.hasTransformedLycanthropie = false;
  inst.corruptionStolenIds = [];
  inst.hasDivineShield = inst.card.keywords.includes("divine_shield");

  // Plus contrôlée/volée : revient à son propriétaire, sans marqueur de vol.
  inst.originalOwnerId = null;
  inst.trueOwnerId = null;
}

// Returns the saved token template for a given id (looked up against the
// current registry or a passed-in array). Null if missing.
function findTokenTemplate(id: number | null | undefined, templates?: TokenTemplate[]): TokenTemplate | null {
  if (!id) return null;
  const tmpls = templates ?? currentTokenTemplates;
  return tmpls.find(t => t.id === id) ?? null;
}

// Backwards-compat helper for legacy code paths that still spawn tokens by
// race string (atomic "summon_token", "pacte de sang"). Picks the first
// template matching the race so the visual is at least preserved; returns
// null if none exists.
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
    // Sidecar des capacités (X/Y, et à terme le mode). Rien d'autre à faire
    // côté moteur : `getCapabilities` dérive depuis keywords + keyword_instances
    // dès que `capabilities` est null, exactement comme pour une créature.
    // Recopié seulement s'il est non vide, pour ne pas écraser par `null` un
    // sidecar déjà posé par l'appelant.
    keyword_instances: tmpl.keyword_instances?.length
      ? tmpl.keyword_instances
      : tokenCard.keyword_instances,
    race: tmpl.race,
    // Faction explicite du template prioritaire ; sinon on conserve celle déjà
    // posée par l'appelant (déduite de la race via getFactionForRace, avec repli
    // sur la faction de l'invocateur). Centralisé ici → couvre tous les sites
    // d'invocation sans toucher leur logique de repli.
    faction: tmpl.faction ?? tokenCard.faction,
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
  allSpellsPool?: Card[],
  formatCode?: FormatCode | null,
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
    // null = Épargne jamais déclenchée ⇒ compteur masqué (cf. PlayerState).
    epargne: null,
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
    // Snapshot the RNG position after seeding + the opening shuffle, so the
    // initial state already carries the stream both clients continue from.
    rngState,
    // Canonicalise pool order by id. Selection effects (Concentration,
    // Sélection, Renfort royal, Sélection magique) index/shuffle these pools
    // with the shared seeded RNG, so a divergent fetch order between the two
    // clients would select different cards → desync. Sorting at the engine
    // boundary makes the order independent of the caller's DB fetch order.
    factionCardPool: factionCardPool ? [...factionCardPool].sort((a, b) => a.id - b.id) : undefined,
    allSpellsPool: allSpellsPool ? [...allSpellsPool].sort((a, b) => a.id - b.id) : undefined,
    formatCode: formatCode ?? null,
  };
}

// ============================================================
// DISCARD (main → cimetière) + déclencheur Richesse
// ============================================================

// Richesse X : chaque défausse (de n'importe quel joueur) confère +X/+X
// permanent à toute créature en jeu portant le mot-clé. Tracké comme
// Nécrophagie (bonus permanent réappliqué par recalculateAuras côté ATK ;
// le PV/maxHealth est incrémenté directement car le recalc ne le réinitialise
// pas).
function triggerRichesse(players: PlayerState[]) {
  for (const p of players) {
    for (const unit of p.board) {
      if (hasKw(unit, "richesse")) {
        // X lu depuis [Richesse N] de effect_text (patron des automatiques
        // scalables : persecution, carnage). Repli mana/3 si non annoté.
        const x = parseXValuesFromEffectText(unit.card.effect_text)["richesse"]
          || Math.max(1, Math.floor(unit.card.mana_cost / 3));
        unit.richesseATKBonus += x;
        unit.richessePVBonus += x;
        unit.currentAttack += x;
        unit.currentHealth += x;
        unit.maxHealth += x;
      }
    }
  }
}

// Défausse la carte à `handIdx` de la main d'un joueur vers son cimetière et
// déclenche Richesse sur les deux plateaux. Point de passage UNIQUE de toutes
// les défausses (coût de défausse, Pillage, Combustion, pouvoir de héros,
// sorts…) pour que le réactif Richesse reste cohérent quelle qu'en soit la
// source. `players` doit contenir les deux joueurs (les deux plateaux). Renvoie
// la carte défaussée, ou null si l'index est hors borne.
function discardFromHand(
  player: PlayerState,
  handIdx: number,
  players: PlayerState[],
): CardInstance | null {
  if (handIdx < 0 || handIdx >= player.hand.length) return null;
  const [card] = player.hand.splice(handIdx, 1);
  player.graveyard.push(card);
  triggerRichesse(players);
  return card;
}

// ============================================================
// AURA RECALCULATION
// ============================================================

// Force des ancêtres : seuil de créatures dans le cimetière du propriétaire à
// partir duquel le bonus +X/+Y s'allume.
export const FORCE_ANCETRES_GRAVEYARD_THRESHOLD = 7;

// Résolution du couple X/Y de Force des ancêtres, dans l'ordre : instance de
// mot-clé de la carte → valeurs conférées (grantedKeywordX/Y) → 1/1 par défaut.
// Même cascade qu'applyGloire.
function forceAncetresValues(inst: CardInstance): { x: number; y: number } {
  const kwInst = inst.card.keyword_instances?.find(i => i.id === "force_des_ancetres");
  const x = kwInst?.x ?? inst.grantedKeywordX["force_des_ancetres"] ?? 1;
  const y = kwInst?.y ?? inst.grantedKeywordY?.["force_des_ancetres"] ?? 1;
  return { x: Math.max(0, x), y: Math.max(0, y) };
}

/** X/Y de Pureté : instance de mot-clé → valeurs conférées → 1/1. */
function pureteValues(inst: CardInstance): { x: number; y: number } {
  const kwInst = inst.card.keyword_instances?.find(i => i.id === "purete");
  const x = kwInst?.x ?? inst.grantedKeywordX["purete"] ?? 1;
  const y = kwInst?.y ?? inst.grantedKeywordY?.["purete"] ?? 1;
  return { x: Math.max(0, x), y: Math.max(0, y) };
}

/** X/Y de Seuil Sacrificiel : instance de mot-clé → valeurs conférées → 1/1. */
function seuilSacrificielValues(inst: CardInstance): { x: number; y: number } {
  const kwInst = inst.card.keyword_instances?.find(i => i.id === "seuil_sacrificiel");
  const x = kwInst?.x ?? inst.grantedKeywordX["seuil_sacrificiel"] ?? 1;
  const y = kwInst?.y ?? inst.grantedKeywordY?.["seuil_sacrificiel"] ?? 1;
  return { x: Math.max(0, x), y: Math.max(0, y) };
}

export function recalculateAuras(player: PlayerState, opponent: PlayerState) {
  // Reset ATK to base + permanent bonuses (not auras)
  for (const c of player.board) {
    let atk = c.card.attack ?? 0;
    atk += c.loyauteATKBonus;
    atk += c.summonBonusATK;
    atk += c.necrophagieATKBonus;
    atk += c.richesseATKBonus;
    atk += c.martyrATKBonus;
    atk += c.instinctDeMeuteATKBonus;
    atk += c.devorationATKBonus;
    c.currentAttack = atk;
  }
  for (const c of opponent.board) {
    let atk = c.card.attack ?? 0;
    atk += c.loyauteATKBonus;
    atk += c.summonBonusATK;
    atk += c.necrophagieATKBonus;
    atk += c.richesseATKBonus;
    atk += c.martyrATKBonus;
    atk += c.instinctDeMeuteATKBonus;
    atk += c.devorationATKBonus;
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

  // Pauvreté : une unité dotée de ce mot-clé perd autant d'ATK que le nombre
  // de cartes en main de SON adversaire (X dynamique, recalculé ici à chaque
  // changement d'état). Clampé à 0 comme Terreur.
  const playerHandSize = player.hand.length;
  const opponentHandSize = opponent.hand.length;
  for (const c of player.board) {
    if (hasKw(c, "pauvrete")) c.currentAttack = Math.max(0, c.currentAttack - opponentHandSize);
  }
  for (const c of opponent.board) {
    if (hasKw(c, "pauvrete")) c.currentAttack = Math.max(0, c.currentAttack - playerHandSize);
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
      // Même règle d'amplitude que les autres dons : sans elle, une aura de
      // Gloire accordait +1/+1 quelles que soient les valeurs du pouvoir.
      const params = grantParamsFor(aura.keywordId, aura.params?.amount, aura.params?.amountY);
      for (const ally of p.board) {
        // PAS de réarmement ici : cette boucle retourne à chaque
        // recalculateAuras. Réarmer une Ombre y renverrait l'unité dans
        // l'ombre juste après son attaque, pour toujours (cf.
        // rearmGrantedKeyword).
        applyGrantedKeyword(ally, aura.keywordId, params);
      }
    }
  }

  // Gloire +X/+Y n'a RIEN à faire ici : contrairement à l'ancien Berserk (état
  // conditionnel recalculé à chaque passage), c'est un buff permanent appliqué
  // une fois pour toutes au moment où l'unité survit à des dégâts de combat
  // (cf. dealDamageToCreature). Le bonus vit donc dans les stats de base de
  // l'instance, comme Renforcement — le reset d'ATK en tête de fonction le
  // conserve naturellement.

  // Sang mêlé: +1 ATK et +1 PV par type de race différent parmi vos alliés.
  // Aura DYNAMIQUE (comme Commandement) : l'ATK est recalculé (reset ci-dessus),
  // les PV suivent via `sangMeleHealthBonus` avec diff pour monter/descendre
  // quand la diversité de races change (ex. mort d'un allié de race unique),
  // avec la garde « ne pas tuer par retrait d'aura ».
  // La réconciliation des PV tourne pour TOUTE créature (pas seulement celles
  // qui ont encore le mot-clé) : sans le mot-clé, uniqueRaces = 0 ramène le
  // bonus à zéro. Ainsi un Silence, qui retire « sang_mele », fait bien retomber
  // le bonus de PV (l'ATK, elle, n'est simplement plus ré-ajoutée). Sinon le
  // rollback, gardé derrière hasKw, ne se déclenchait jamais après un silence.
  for (const board of [player.board, opponent.board]) {
    for (const c of board) {
      const hasSangMele = hasKw(c, "sang_mele");
      const uniqueRaces = hasSangMele
        ? new Set(board.filter(a => a !== c && a.card.race).map(a => a.card.race)).size
        : 0;
      if (hasSangMele) c.currentAttack += uniqueRaces;
      const oldHP = c.sangMeleHealthBonus;
      if (uniqueRaces !== oldHP) {
        const diff = uniqueRaces - oldHP;
        c.maxHealth += diff;
        c.currentHealth += diff;
        if (c.currentHealth < 1 && uniqueRaces < oldHP) c.currentHealth = 1; // don't kill via aura removal
        c.sangMeleHealthBonus = uniqueRaces;
      }
    }
  }

  // Force des ancêtres +X/+Y : tant que le cimetière du PROPRIÉTAIRE compte
  // FORCE_ANCETRES_GRAVEYARD_THRESHOLD créatures ou plus, l'unité gagne
  // +X ATK / +Y PV. Aura DYNAMIQUE (modèle Sang mêlé) : l'ATK est ré-ajoutée
  // ici (reset en tête de fonction), les PV suivent via
  // forceAncetresHealthBonus avec diff pour monter/descendre quand la
  // condition bascule (Exhumation / Résurrection vident le cimetière), avec
  // la garde « ne pas tuer par retrait d'aura ». La réconciliation tourne
  // pour TOUTE créature : sans le mot-clé (Silence) le bonus visé vaut 0 et
  // les PV retombent.
  for (const board of [player.board, opponent.board]) {
    const owner = board === player.board ? player : opponent;
    const graveCreatures = owner.graveyard.filter(g => g.card.card_type === "creature").length;
    const conditionMet = graveCreatures >= FORCE_ANCETRES_GRAVEYARD_THRESHOLD;
    for (const c of board) {
      const active = conditionMet && hasKw(c, "force_des_ancetres");
      const { x, y } = active ? forceAncetresValues(c) : { x: 0, y: 0 };
      if (x > 0) c.currentAttack += x;
      const oldHP = c.forceAncetresHealthBonus ?? 0;
      if (y !== oldHP) {
        const diff = y - oldHP;
        c.maxHealth += diff;
        c.currentHealth += diff;
        if (c.currentHealth < 1 && y < oldHP) c.currentHealth = 1; // don't kill via aura removal
        c.forceAncetresHealthBonus = y;
      }
    }
  }

  // Pureté +X/+Y : miroir de Force des ancêtres — le bonus tient tant que le
  // cimetière du propriétaire est VIDE, et tombe à la première carte qui y
  // arrive. « Vide » au sens strict : sorts compris, pas seulement les
  // créatures — c'est ce qui distingue Pureté d'un simple seuil bas.
  // Même comptabilité par différentiel que sa jumelle : l'ATK est ré-ajoutée ici
  // (reset en tête de fonction), les PV suivent via `pureteHealthBonus` pour
  // monter ET redescendre, avec la garde « ne pas tuer par retrait d'aura ».
  for (const board of [player.board, opponent.board]) {
    const owner = board === player.board ? player : opponent;
    const conditionMet = owner.graveyard.length === 0;
    for (const c of board) {
      const active = conditionMet && hasKw(c, "purete");
      const { x, y } = active ? pureteValues(c) : { x: 0, y: 0 };
      if (x > 0) c.currentAttack += x;
      const oldHP = c.pureteHealthBonus ?? 0;
      if (y !== oldHP) {
        const diff = y - oldHP;
        c.maxHealth += diff;
        c.currentHealth += diff;
        if (c.currentHealth < 1 && y < oldHP) c.currentHealth = 1; // don't kill via aura removal
        c.pureteHealthBonus = y;
      }
    }
  }

  // Seuil Sacrificiel +X/+Y : jumelle de Force des ancêtres, adossée au DECK.
  // Tant que le deck du PROPRIÉTAIRE est descendu à SEUIL_DECK_THRESHOLD cartes
  // ou moins, l'unité gagne +X ATK / +Y PV. Même comptabilité par différentiel :
  // l'ATK est ré-ajoutée ici (reset en tête de fonction), les PV suivent via
  // seuilSacrificielHealthBonus pour monter ET redescendre — le seuil se
  // refranchit dans les deux sens, Incinération et Retour différé remettant des
  // cartes sous le deck. La réconciliation tourne pour TOUTE créature : sans le
  // mot-clé (Silence) le bonus visé vaut 0 et les PV retombent.
  for (const board of [player.board, opponent.board]) {
    const owner = board === player.board ? player : opponent;
    const conditionMet = owner.deck.length <= SEUIL_DECK_THRESHOLD;
    for (const c of board) {
      const active = conditionMet && hasKw(c, "seuil_sacrificiel");
      const { x, y } = active ? seuilSacrificielValues(c) : { x: 0, y: 0 };
      if (x > 0) c.currentAttack += x;
      const oldHP = c.seuilSacrificielHealthBonus ?? 0;
      if (y !== oldHP) {
        const diff = y - oldHP;
        c.maxHealth += diff;
        c.currentHealth += diff;
        if (c.currentHealth < 1 && y < oldHP) c.currentHealth = 1; // don't kill via aura removal
        c.seuilSacrificielHealthBonus = y;
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
  const allPool = state.allSpellsPool;
  const newState = cloneStateForAction(state);
  newState.factionCardPool = pool;
  newState.allSpellsPool = allPool;
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
      creature.trueOwnerId = null;
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
    // Untap at the start of OWNER's turn — MTG-strict semantics.
    creature.tapped = false;

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
      creature.currentAttack = x + creature.summonBonusATK + creature.necrophagieATKBonus + creature.richesseATKBonus + creature.loyauteATKBonus + creature.auraHealthBonus;
      creature.currentHealth = x + creature.necrophagiePVBonus + creature.richessePVBonus + creature.loyautePVBonus;
      creature.maxHealth = x + creature.necrophagiePVBonus + creature.richessePVBonus + creature.loyautePVBonus;
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

  // Fatigue: drawCard above can take HP ≤ 0 when the deck is empty. Without
  // this check the game loop continues silently — the victory/defeat screen
  // is gated by state.phase === "finished", which is only set inside
  // checkWinCondition. Other actions (playCard / attack / hero_power)
  // already run it at their tail; startTurn was missing.
  checkWinCondition(newState);

  return newState;
}

function drawCard(player: PlayerState, autoPlayDepth = 0): CardInstance | null {
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
    // La créature recyclée ARRIVE EN JEU au lieu de rejoindre la main : elle ne
    // doit donc pas consommer la pioche. On tire une carte de REMPLACEMENT.
    // La chaîne s'arrête d'elle-même (plateau plein ⇒ plus d'auto-play, deck
    // vide ⇒ fatigue) ; le compteur de profondeur reste un garde-fou explicite,
    // borné par le nombre de places sur le plateau.
    if (autoPlayDepth < MAX_BOARD_SIZE) drawCard(player, autoPlayDepth + 1);
    return card;
  }
  if (player.hand.length >= MAX_HAND_SIZE) {
    player.graveyard.push(card);
    return null;
  }
  player.hand.push(card);
  // La carte a ATTEINT LA MAIN : c'est la seule situation où le déclencheur
  // « à la pioche » part (cf. triggerOnDraw pour les trois sorties écartées
  // au-dessus : fatigue, main pleine, auto-jeu de Cycle éternel).
  triggerOnDraw(card, player);
  return card;
}

/** Profondeur maximale d'ENCHAÎNEMENT des déclencheurs « à la pioche ».
 *
 *  Un effet « à la pioche : piochez une carte » se rappelle par un chemin que
 *  le paramètre `autoPlayDepth` de `drawCard` ne voit pas : l'effet repart d'un
 *  résolveur, qui appelle `drawCard` à neuf, à profondeur 0. Il faut donc un
 *  compteur de RÉ-ENTRANCE, tenu ici.
 *
 *  Sans lui, la chaîne ne s'arrête aujourd'hui que par accident — main pleine
 *  ou deck vide. Une carte qui se remet elle-même dans le deck (Retour différé,
 *  Creuser) tournerait sans fin.
 *
 *  8 : une profondeur déjà absurde en jeu, assez basse pour couper net. */
const MAX_DRAW_TRIGGER_DEPTH = 8;
let drawTriggerDepth = 0;

/** Déclencheur « À LA PIOCHE » : exécute les effets de la carte tirée dont le
 *  mode vaut "draw". Même patron que `triggerReturnToHand` — la source est en
 *  MAIN, pas en jeu.
 *
 *  Ne concerne QUE la carte qui vient d'être tirée : ce n'est pas un réactif
 *  « chaque fois que vous piochez » porté par une unité du plateau.
 *
 *  Trois pioches ne le déclenchent PAS, et c'est voulu :
 *   - la fatigue (aucune carte n'est tirée) ;
 *   - la main pleine (la carte part au cimetière — elle n'atteint pas la main) ;
 *   - l'auto-jeu de Cycle éternel (la carte arrive sur le PLATEAU).
 *  Même règle que `on_return`, qui ne se déclenche que si la créature atteint
 *  effectivement la main. La main de départ et le mulligan n'en relèvent pas
 *  non plus : ils prennent leurs cartes par `deck.splice`, sans passer ici.
 *
 *  `opponent` est retrouvé via `currentBoardPlayers`, publié par
 *  `cloneStateForAction` — `drawCard` ne reçoit que son joueur, et les 16 sites
 *  d'appel n'ont pas à changer de signature pour autant. Hors action (test
 *  appelant un handler en direct) la référence est vide : le déclencheur
 *  fizzle proprement, comme le fait déjà `currentCardPools`.
 *
 *  L'enchaînement est borné par `drawTriggerDepth` (cf. MAX_DRAW_TRIGGER_DEPTH). */
function triggerOnDraw(ci: CardInstance, owner: PlayerState): void {
  if (drawTriggerDepth >= MAX_DRAW_TRIGGER_DEPTH) return;
  const insts = (ci.card.keyword_instances ?? []).filter(k => k.mode === "draw");
  const composedCaps = getCapabilities(ci.card).some(c => c.composed && c.trigger === "on_draw");
  if (insts.length === 0 && !composedCaps) return;

  const opponent = currentBoardPlayers.find(p => p !== owner);
  if (!opponent) return; // hors action : rien à résoudre proprement

  // Poussé APRÈS toutes les sorties sèches : on n'annonce que les pioches dont
  // l'effet part vraiment (une carte sans mode "draw" ne révèle rien).
  drawTriggerSink.push({ card: ci.card, ownerId: owner.id });

  drawTriggerDepth++;
  try {
    for (const inst of insts) {
      resolveCuratedKeywordEffect(inst.id, inst.x ?? 1, ci, owner, opponent, undefined, inst);
    }
    // Effets composés à la pioche (modèle hybride).
    runComposedCapsForCard(ci.card, "on_draw", ci, owner, opponent);
  } finally {
    drawTriggerDepth--;
  }

  // Règlement des morts, sur les DEUX camps. Indispensable ici et pas
  // délégable à l'appelant : la pioche principale a lieu dans `startTurn`, qui
  // ne balaie que le plateau du joueur actif (ses morts par poison). Un effet
  // à la pioche qui tue une unité ADVERSE laissait donc un cadavre à 0 PV sur
  // le plateau — vu en partie avec « Présage du Masque Courroucé ».
  // Même forme et même ORDRE que les autres sites autonomes (tapActivate,
  // settleSpellDeaths) : propriétaire d'abord, adversaire ensuite, parce que
  // `processDeathTriggers` consomme de la RNG et qu'inverser les deux ferait
  // diverger les clients d'une partie en ligne.
  settleDeathsBothSides(owner, opponent);
  recalculateAuras(owner, opponent);
}

// Concentration X: replace each spell currently in `player.hand` with a
// random spell drawn from `pool` whose mana_cost is exactly `original + x`.
// The replacement instance carries `manaCostReduction = x` so playing it
// costs the same as the original (effective cost = mana_cost − reduction).
// If no candidate exists for a given spell, the original is kept untouched
// (fail-safe). Creatures in hand are never touched.
function applyConcentration(player: PlayerState, x: number, pool: Card[] | undefined): void {
  if (x <= 0 || !pool || pool.length === 0) return;
  for (let i = 0; i < player.hand.length; i++) {
    const inst = player.hand[i];
    if (inst.card.card_type !== "spell") continue;
    const targetCost = inst.card.mana_cost + x;
    const candidates = pool.filter(c => c.card_type === "spell" && c.mana_cost === targetCost);
    if (candidates.length === 0) continue;
    const picked = candidates[Math.floor(rng() * candidates.length)];
    const replacement = createCardInstance(picked);
    replacement.manaCostReduction = x;
    player.hand[i] = replacement;
  }
}

export function endTurn(state: GameState): GameState {
  // IDEMPOTENCE. Une fin de tour déjà EN PAUSE sur un choix ne doit jamais être
  // relancée : `endTurn` reconstruit la file depuis zéro, donc un second
  // `end_turn` rejouait TOUTE la séquence et ré-empilait ses déclencheurs
  // (constaté : pending=1 → pending=2, effets de fin de tour doublés).
  // La garde du store (« aucune action tant que pendingTriggers n'est pas
  // vide ») ne suffit pas : elle n'est pas autoritaire, et le rejeu d'actions
  // (gap-recovery, resync) entre directement ici.
  if (state.endTurnPending) {
    console.warn("[end-turn] end_turn ignoré : une fin de tour est déjà en pause sur un choix");
    return state;
  }
  const pool = state.factionCardPool;
  const allPool = state.allSpellsPool;
  const newState = cloneStateForAction(state);
  newState.factionCardPool = pool;
  newState.allSpellsPool = allPool;

  // Option B : un effet composé « au choix » resté EN SUSPENS à la fin du tour
  // de son propriétaire (chrono expiré, aucune cible désignée) ne doit pas
  // fuiter au tour adverse — où il se résoudrait automatiquement, potentiellement
  // contre son propre camp. On draine la pile en mode « fizzle » TANT QUE c'est
  // encore son tour : les choix non désignés sont abandonnés, les effets non
  // interactifs empilés se résolvent normalement. (cf. drainStack / Jeune Archère)
  drainStack(newState, { fizzleUnresolvedChoices: true });

  // Déclencheurs « fin de tour » du joueur SORTANT (contrôleur), avant la purge
  // des statuts et la bascule, pendant que c'est encore son tour. Les effets à
  // cible « au choix » sont mis en file (pendingTriggers) et résolus par le
  // joueur ; les autres (soi/auto/aléatoire/toutes) sont appliqués tout de suite.
  // Séquence de fin de tour STRICTEMENT ordonnée gauche→droite (tous régimes
  // confondus). On construit la file ordonnée des effets du joueur sortant puis
  // on la traite : les automatiques se résolvent en ligne, et dès qu'un effet
  // INTERACTIF est atteint la séquence se met en pause (endOfTurnQueue persistée)
  // et reprend — automatiques suivants compris — après la résolution du joueur.
  // Cf. advanceEndOfTurn / resolvePendingTrigger.
  newState.endOfTurnQueue = buildEndOfTurnQueue(newState.players[newState.currentPlayerIndex]);
  return advanceEndOfTurn(newState);
}

/** Construit la file ORDONNÉE des effets « fin de tour » du joueur sortant, dans
 *  l'ordre strict du plateau (gauche→droite), et pour chaque créature : d'abord
 *  ses mots-clés curés en mode end_of_turn (ordre du tableau), puis ses capacités
 *  composées on_end_of_turn (ordre de getCapabilities). */
function buildEndOfTurnQueue(outgoing: PlayerState): import("./types").EndOfTurnStep[] {
  const steps: import("./types").EndOfTurnStep[] = [];
  for (const creature of outgoing.board) {
    for (const inst of creature.card.keyword_instances ?? []) {
      if (inst.mode === "end_of_turn") steps.push({ sourceInstanceId: creature.instanceId, curated: inst });
    }
    for (const cap of getCapabilities(creature.card)) {
      if (cap.composed && cap.trigger === "on_end_of_turn") {
        steps.push({ sourceInstanceId: creature.instanceId, capUid: cap.uid });
      }
    }
  }
  return steps;
}

/** Traite la file `endOfTurnQueue` DANS L'ORDRE : résout les effets automatiques
 *  en ligne et, au premier effet interactif (Sélection* ou composé « au choix »
 *  non-self avec cible éligible), met UN pendingTrigger et rend la main (pause,
 *  endTurnPending). Reprend à la même position au prochain appel. File épuisée →
 *  finalisation (finalizeEndOfTurn). C'est ce qui garantit l'ordre strict
 *  gauche→droite tous régimes confondus : un automatique situé après un
 *  interactif ne se résout qu'une fois cet interactif tranché. */
function advanceEndOfTurn(newState: GameState): GameState {
  const outgoing = newState.players[newState.currentPlayerIndex];
  const opponent = newState.players[newState.currentPlayerIndex === 0 ? 1 : 0];
  const queue = newState.endOfTurnQueue;
  if (!queue) return finalizeEndOfTurn(newState);

  while (queue.length > 0) {
    const step = queue[0];
    const creature = outgoing.board.find(c => c.instanceId === step.sourceInstanceId);
    // Source partie du plateau entre pause et reprise → on saute ses effets.
    if (!creature) { queue.shift(); continue; }
    // Source ABATTUE par un effet situé à sa GAUCHE : elle ne parle plus. Les
    // morts n'étant balayées qu'à la fin de la séquence (finalizeEndOfTurn),
    // elle est encore physiquement sur le plateau — d'où ce test explicite sur
    // les PV. Sans lui, une créature tuée par son voisin résolvait quand même
    // son propre effet avant de rejoindre le cimetière.
    // Même doctrine que le ciblage, qui écarte déjà les unités à 0 PV du
    // plateau comme des « cadavres en sursis », et que la résolution des sorts,
    // qui règle ses morts après chaque effet.
    if (creature.currentHealth <= 0) { queue.shift(); continue; }

    if (step.curated) {
      const inst = step.curated;
      queue.shift();
      // Sélection / Sélection magique / Renfort Royal : interactif (modale
      // « 1 parmi 3 »). File seulement s'il existe une carte éligible.
      if (inst.id === "selection" || inst.id === "selection_magique" || inst.id === "renfort_royal") {
        const options = selectionCardsForKeyword(inst.id, newState, inst.x ?? 0, creature.card, undefined, creature.instanceId);
        if (options.length > 0) {
          (newState.pendingTriggers ??= []).push({
            id: `${creature.instanceId}#${inst.id}`,
            controllerId: outgoing.id,
            sourceInstanceId: creature.instanceId,
            selectionType: inst.id,
            selectionOptionIds: options.map(c => c.id),
          });
          newState.endTurnPending = true;
          return newState; // PAUSE
        }
        continue; // aucune carte offerte → no-op
      }
      // Autres mots-clés curés : résolution immédiate (non interactive).
      resolveCuratedKeywordEffect(inst.id, inst.x ?? 1, creature, outgoing, opponent, undefined, inst);
      continue;
    }

    // Effet composé on_end_of_turn.
    const cap = getCapabilities(creature.card).find(c => c.uid === step.capUid && c.composed);
    queue.shift();
    if (!cap || !cap.composed) continue;
    // `entity: "self"` vise toujours la source → jamais mis en file de choix
    // (déterministe, cf. régression Ours Maudit). Un « au choix » non-self avec
    // au moins une cible éligible met le tour en pause.
    if (cap.composed.target?.designation === "choice" && cap.composed.target?.entity !== "self") {
      const trig: import("./types").PendingTrigger = {
        id: `${creature.instanceId}#${cap.uid}`,
        controllerId: outgoing.id,
        sourceInstanceId: creature.instanceId,
        capUid: cap.uid,
      };
      if (endOfTurnTriggerTargets(newState, trig).length > 0) {
        (newState.pendingTriggers ??= []).push(trig);
        newState.endTurnPending = true;
        return newState; // PAUSE
      }
      continue; // aucune cible éligible → no-op (pas de soft-lock)
    }
    withComposedMode("end_of_turn", () =>
      resolveComposedEffect(cap.composed!, creature, outgoing, opponent, undefined, false,
        { trigger: "on_end_of_turn", capUid: cap.uid }));
  }

  // File épuisée : plus aucun effet fin-de-tour → finalisation.
  newState.endOfTurnQueue = undefined;
  return finalizeEndOfTurn(newState);
}

/** Un déclencheur en attente offre-t-il ENCORE un choix au joueur ?
 *
 *  `advanceEndOfTurn` vérifie l'éligibilité AVANT d'empiler, mais les cibles
 *  peuvent s'évaporer entre la mise en file et la résolution : un effet
 *  automatique situé plus à droite dans la même file tue le dernier allié
 *  éligible, une Sélection voit son pool disparaître… Le déclencheur devient
 *  alors ORPHELIN — et c'était un blocage total : côté client
 *  `pendingTriggerOverlay` n'a rien à proposer (aucune modale, aucun surlignage)
 *  pendant que la garde de `dispatchAction` refuse en silence toute action tant
 *  que la file n'est pas vide. Le plateau restait cliquable et inerte.
 *
 *  On le teste donc côté MOTEUR, seul endroit autoritaire, et les orphelins
 *  sont purgés (cf. pruneUnresolvableTriggers). */
function triggerIsResolvable(state: GameState, trigger: import("./types").PendingTrigger): boolean {
  if (trigger.selectionType) {
    const ids = new Set([
      ...(state.factionCardPool ?? []).map(c => c.id),
      ...(state.allSpellsPool ?? []).map(c => c.id),
    ]);
    return (trigger.selectionOptionIds ?? []).some(id => ids.has(id));
  }
  if (trigger.capUid) return endOfTurnTriggerTargets(state, trigger).length > 0;
  if (trigger.kw) {
    const controller = state.players.find(p => p.id === trigger.controllerId);
    const other = state.players.find(p => p.id !== trigger.controllerId);
    if (!controller || !other) return false;
    return deferredKwTargetIds(trigger.kw, controller, other, trigger.sourceInstanceId).length > 0;
  }
  // Ni sélection, ni capacité, ni mot-clé : rien à demander au joueur. Le
  // client n'en ferait rien non plus — on ne le garde pas en file.
  return false;
}

/** Retire de la file les déclencheurs devenus insolubles. Retourne true si la
 *  file a changé, pour que l'appelant relance la séquence. */
function pruneUnresolvableTriggers(state: GameState): boolean {
  const queue = state.pendingTriggers;
  if (!queue || queue.length === 0) return false;
  const kept = queue.filter(t => triggerIsResolvable(state, t));
  if (kept.length === queue.length) return false;
  for (const t of queue) {
    if (!kept.includes(t)) console.warn(`[end-turn] déclencheur orphelin purgé (plus aucun choix possible) : ${t.id}`);
  }
  state.pendingTriggers = kept;
  return true;
}

/** Finalise la fin de tour une fois TOUS les effets fin-de-tour traités :
 *  nettoyage des morts + râles d'agonie (deux camps), auras, victoire. Si des
 *  choix interactifs (ex. Remontée à la mort) restent, on diffère la bascule ;
 *  sinon on bascule (finishEndTurn). */
function finalizeEndOfTurn(newState: GameState): GameState {
  const outgoing = newState.players[newState.currentPlayerIndex];
  const opponent = newState.players[newState.currentPlayerIndex === 0 ? 1 : 0];
  const deadOut = cleanDeadCreatures(outgoing);
  const deadOpp = cleanDeadCreatures(opponent);
  processDeathTriggers(deadOut, outgoing, opponent);
  processDeathTriggers(deadOpp, opponent, outgoing);
  recalculateAuras(outgoing, opponent);
  checkWinCondition(newState);

  // Les râles d'agonie ci-dessus peuvent avoir empilé des choix devenus
  // insolubles (leur cible est morte dans la même fournée). Différer la bascule
  // sur un tel déclencheur, c'est bloquer la partie : on purge d'abord.
  pruneUnresolvableTriggers(newState);
  if ((newState.pendingTriggers?.length ?? 0) > 0) {
    newState.endTurnPending = true;
    return newState;
  }
  return finishEndTurn(newState);
}

// Purge des statuts du joueur sortant + bascule du tour + startTurn. Séparé
// d'endTurn pour pouvoir être différé après la résolution des déclencheurs
// « fin de tour » interactifs. `newState` est déjà cloné par l'appelant.
function finishEndTurn(newState: GameState): GameState {
  newState.endTurnPending = false;
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
    // Reset Fureur's trigger guard at end of turn so the creature can
    // fire again next turn if hit. No ATK to revert — Fureur is now a
    // pure extra-attack effect.
    creature.fureurActive = false;
  }

  newState.currentPlayerIndex = newState.currentPlayerIndex === 0 ? 1 : 0;
  // Trace de la SEULE bascule de tour du moteur. Le symptôme « le joueur rejoue
  // un tour » n'a pas pu être reproduit hors partie : ce repère permet de voir,
  // dans la console des deux clients, si la bascule part deux fois ou revient en
  // arrière — et lequel des deux a divergé.
  console.info(`[end-turn] bascule ${outgoing.id} → ${newState.players[newState.currentPlayerIndex].id} (tour ${newState.turnNumber})`);
  newState.lastAction = { type: "end_turn" };
  return startTurn(newState);
}

// ============================================================
// PLAY CARD
// ============================================================

export function playCard(state: GameState, action: PlayCardAction): GameState {
  // Exclude factionCardPool and allSpellsPool from deep clone for performance — both are read-only
  const pool = state.factionCardPool;
  const allPool = state.allSpellsPool;
  const newState = cloneStateForAction(state);
  newState.factionCardPool = pool;
  newState.allSpellsPool = allPool;
  const player = newState.players[newState.currentPlayerIndex];
  const opponent = newState.players[newState.currentPlayerIndex === 0 ? 1 : 0];

  // SECONDE VIE X : la carte peut être jouée depuis le CIMETIÈRE pour son coût
  // alternatif. Seule la zone SOURCE change — tout le flux d'invocation qui
  // suit (coûts alternatifs, placement, effets d'arrivée en jeu) est commun,
  // ce qui garantit que les déclencheurs se comportent « comme depuis la main »
  // sans les redéclarer.
  const fromGraveyard = action.fromGraveyard === true;
  const zone = fromGraveyard ? player.graveyard : player.hand;
  const cardIndex = zone.findIndex(c => c.instanceId === action.cardInstanceId);
  if (cardIndex === -1) return state;

  const cardInstance = zone[cardIndex];
  const card = cardInstance.card;

  // Depuis le cimetière : réservé aux CRÉATURES portant encore Seconde vie.
  // Re-validé ici parce que le moteur rejoue l'action chez l'adversaire.
  if (fromGraveyard && (card.card_type !== "creature" || !hasKw(cardInstance, "seconde_vie"))) {
    return state;
  }

  // Canalisation: reduce spell cost by 1 per unit with Canalisation on board.
  // Entraide: reduce creature cost by 1 per allied creature whose race
  // matches the card's `entraide_race` (the card itself is in hand so it can
  // never count towards its own reduction).
  // Concentration X: persistent reduction stamped on the instance when this
  // card was generated by a Concentration trigger. Stacks below Canalisation
  // / Entraide (those reduce on top of the already-discounted baseline).
  // Tokens (token_id != null) override the baseline 0 mana_cost with
  // floor((attack+health)/2) so a token bounced/recalled into the hand isn't
  // free to re-cast.
  // Depuis le cimetière, le coût est celui de Seconde vie — les réductions de
  // coût de main (Canalisation, Entraide, Concentration) ne s'y appliquent pas.
  const manaCost = fromGraveyard
    ? getKwX(cardInstance, "seconde_vie", undefined, 1)
    : effectiveManaCost(cardInstance, player);

  if (manaCost > player.mana) return state;

  // Alternative costs — re-validate (UI may be stale) and reject silently if
  // the requested payment doesn't match the card's declared costs.
  const lifeCost = getLifeCost(card);
  const discardCost = getDiscardCost(card);
  const sacrificeCost = getSacrificeCost(card);
  const exileCost = getExileCost(card);
  const requestedDiscards = action.discardInstanceIds ?? [];
  const requestedSacrifices = action.sacrificeInstanceIds ?? [];
  if (lifeCost > 0 && player.hero.hp - lifeCost <= 0) return state;
  // Un coût qui ne peut pas être payé INTÉGRALEMENT interdit de jouer la carte —
  // même règle que le coût en PV, qu'on ne paie pas « autant que possible ».
  // Le deck est donc un vrai plafond : plus rien à exiler, plus de carte à jouer.
  if (exileCost > 0 && player.deck.length < exileCost) return state;
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
  // EXIL : les cartes quittent le deck sans rejoindre AUCUNE zone. Un simple
  // `splice` suffit donc — les pousser au cimetière les rendrait récupérables
  // (Exhumation, Résurrection, Rappel), ce qui viderait le coût de son sens.
  if (exileCost > 0) {
    player.deck.splice(0, exileCost);
    exileCostSink.push({ ownerId: player.id, count: exileCost });
  }
  // Remove the played card from hand FIRST so it can never be its own discard
  // target and so hand-size checks downstream are accurate.
  zone.splice(cardIndex, 1);
  // La créature ressuscitée PERD Seconde vie : sans ça elle retournerait au
  // cimetière avec sa capacité intacte et serait rejouable indéfiniment.
  if (fromGraveyard) {
    cardInstance.card = {
      ...cardInstance.card,
      keywords: cardInstance.card.keywords.filter(k => k !== "seconde_vie"),
      keyword_instances: (cardInstance.card.keyword_instances ?? []).filter(k => k.id !== "seconde_vie"),
    };
  }
  // Discard chosen hand cards.
  for (const id of requestedDiscards) {
    const idx = player.hand.findIndex(c => c.instanceId === id);
    if (idx !== -1) discardFromHand(player, idx, [player, opponent]);
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
    // Une créature qui (re)entre en jeu n'est jamais engagée — sinon une créature
    // renvoyée en main alors qu'elle était engagée (Remontée / bounce) resterait
    // engagée à la replay et ne pourrait pas réutiliser son pouvoir en tap.
    cardInstance.tapped = false;
    const pos = action.boardPosition ?? player.board.length;
    player.board.splice(pos, 0, cardInstance);

    // ── On-summon triggers ──

    // Douleur X: drawback — la créature inflige X dégâts à votre héros
    // dès son arrivée en jeu, avant tout autre effet d'invocation. Le
    // moteur ne s'arrête pas si l'auto-dégât est létal — checkWinCondition
    // appelé en fin de playCard détectera la défaite.
    if (hasKwOnPlay(cardInstance, "douleur")) {
      const douleurXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      const x = douleurXVals["douleur"] ?? 1;
      // Source passée pour l'uniformité : c'est un COÛT payé sur son propre
      // héros, donc la restriction « camp adverse » d'applyLifesteal l'empêche
      // de se rembourser via Drain de vie.
      dealDamageToHero(player.hero, x, cardInstance);
    }

    // Inspiration X: pioche X cartes à l'invocation.
    if (hasKwOnPlay(cardInstance, "inspiration")) {
      const inspXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      const x = inspXVals["inspiration"] ?? 1;
      for (let i = 0; i < x; i++) drawCard(player);
    }

    // Incinération X : recycle X cartes du cimetière ciblé sous son deck. Le
    // camp visé est déduit de la CIBLE choisie (une unité ou un héros) : viser
    // son propre camp recycle son cimetière, viser l'adverse recycle le sien.
    if (hasKwOnPlay(cardInstance, "incineration")) {
      const victim = incinerationVictim(action.targetInstanceId, player, opponent);
      resolveIncineration(victim, getKwX(cardInstance, "incineration", undefined, 1));
    }

    // Creuser X : regarde le dessous du deck du contrôleur, en remonte une.
    if (hasKwOnPlay(cardInstance, "creuser")) {
      resolveCreuser(player, getKwX(cardInstance, "creuser", undefined, 1), action.divinationChoiceIndex);
    }

    // Retour différé : l'unité ciblée repart sous le deck de son propriétaire.
    if (hasKwOnPlay(cardInstance, "retour_differe")) {
      resolveRetourDiffere(action.targetInstanceId, cardInstance.instanceId, player, opponent);
    }

    // Dévoration : détruit l'unité ciblée et absorbe ses stats.
    if (hasKwOnPlay(cardInstance, "devoration")) {
      resolveDevoration(cardInstance, action.targetInstanceId, player, opponent);
    }

    // Épargne X : alimente le compteur du contrôleur à l'invocation. Les autres
    // modes (mort, tap, retour, fin de tour, attaque) passent par
    // resolveCuratedKeywordEffect — ce bloc ne couvre QUE l'entrée en jeu.
    if (hasKwOnPlay(cardInstance, "epargne")) {
      addEpargne(player, getKwX(cardInstance, "epargne", undefined, 1));
    }

    // Concentration X: remplace chaque sort en main par un sort aléatoire
    // (toutes factions) de coût supérieur de X ; le nouveau sort est marqué
    // d'une réduction permanente de coût égale à X.
    if (hasKwOnPlay(cardInstance, "concentration")) {
      const concXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      const x = concXVals["concentration"] ?? Math.max(1, Math.floor(cardInstance.card.mana_cost / 3));
      applyConcentration(player, x, newState.allSpellsPool);
    }

    // Loyauté: +1 ATK et +1 PV permanent par allié de même race (effet d'invocation)
    if (hasKwOnPlay(cardInstance, "loyaute") && cardInstance.card.race) {
      const sameRaceCount = player.board.filter(a => a !== cardInstance && a.card.race === cardInstance.card.race).length;
      if (sameRaceCount > 0) {
        cardInstance.loyauteATKBonus = sameRaceCount;
        cardInstance.loyautePVBonus = sameRaceCount;
        cardInstance.currentHealth += sameRaceCount;
        cardInstance.maxHealth += sameRaceCount;
      }
    }

    // Sacrifice: détruisez un allié pour gagner ses PV et ATK permanents
    if (hasKwOnPlay(cardInstance, "sacrifice") && action.targetInstanceId) {
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
    if (hasKwOnPlay(cardInstance, "corruption") && opponent.board.length > 0) {
      const targetId = action.targetInstanceId;
      const stealTarget = targetId
        ? opponent.board.find(c => c.instanceId === targetId)
        : opponent.board[Math.floor(rng() * opponent.board.length)];
      if (stealTarget && player.board.length < MAX_BOARD_SIZE) {
        opponent.board = opponent.board.filter(c => c !== stealTarget);
        stealTarget.originalOwnerId = opponent.id;
        stealTarget.trueOwnerId = opponent.id;
        resetTurnStateForNewController(stealTarget); // Traque + compteurs de tour
        if (!stealTarget.card.keywords.includes("charge")) {
          stealTarget.card = { ...stealTarget.card, keywords: [...stealTarget.card.keywords, "charge"] };
        }
        player.board.push(stealTarget);
      }
    }

    // Domination: take control of random enemy (permanent)
    if (hasKwOnPlay(cardInstance, "domination") && opponent.board.length > 0) {
      if (player.board.length < MAX_BOARD_SIZE) {
        const idx = Math.floor(rng() * opponent.board.length);
        const stolen = opponent.board.splice(idx, 1)[0];
        stolen.hasSummoningSickness = true;
        // Contrôle permanent, mais on mémorise le propriétaire d'origine (Remontée).
        stolen.trueOwnerId = opponent.id;
        player.board.push(stolen);
      }
    }

    // Remontée (invocation) : renvoie une unité ciblée dans la main de son
    // propriétaire d'origine. Cible choisie par le joueur (action.targetInstanceId).
    if (hasKwOnPlay(cardInstance, "remontee")) {
      resolveRemontee(action.targetInstanceId, cardInstance.instanceId, player, opponent);
    }

    // Renforcement multiple (invocation) : +X/+Y à vos créatures de la race/clan
    // ciblé (lu depuis l'instance on-play du mot-clé). Source exclue.
    if (hasKwOnPlay(cardInstance, "renforcement_multiple")) {
      const rm = cardInstance.card.keyword_instances?.find(i => i.id === "renforcement_multiple" && !i.mode);
      if (rm) applyRenforcementMultiple(player, rm.x ?? 0, rm.y ?? 0, rm.race, rm.clan, cardInstance.instanceId);
    }

    // Renforcement (invocation) : la créature se buffe elle-même de +X/+Y.
    if (hasKwOnPlay(cardInstance, "renforcement")) {
      const rf = cardInstance.card.keyword_instances?.find(i => i.id === "renforcement" && !i.mode);
      applyRenforcementSelf(cardInstance, rf?.x ?? 0, rf?.y ?? 0);
    }

    // Entrainement X (invocation) : +X/+X aux créatures en main de même faction.
    if (hasKwOnPlay(cardInstance, "entrainement")) {
      applyEntrainement(player, cardInstance.card.faction, getKwX(cardInstance, "entrainement", undefined, 1), cardInstance.instanceId);
    }

    // Fortifier +X/+Y (invocation) : buff permanent de la 1re créature du deck.
    if (hasKwOnPlay(cardInstance, "fortifier")) {
      const fo = cardInstance.card.keyword_instances?.find(i => i.id === "fortifier" && !i.mode);
      applyFortifier(player, fo?.x ?? 0, fo?.y ?? 0);
    }

    // Préincanter X (invocation) : le 1er sort du deck coûte X de moins (min 1).
    if (hasKwOnPlay(cardInstance, "preincanter")) {
      applyPreincanter(player, getKwX(cardInstance, "preincanter", undefined, 1));
    }

    // Pillage X: l'adversaire défausse X cartes aléatoires de sa main.
    // Gated on hasKwOnPlay pour qu'une instance en mode death/tap/return ne
    // se déclenche pas aussi à l'invocation (elle passe par
    // resolveCuratedKeywordEffect).
    if (hasKwOnPlay(cardInstance, "pillage")) {
      const x = getKwX(cardInstance, "pillage", undefined, 1);
      for (let i = 0; i < x && opponent.hand.length > 0; i++) {
        discardFromHand(opponent, Math.floor(rng() * opponent.hand.length), [player, opponent]);
      }
    }

    // Contresort: annule le prochain sort adverse
    if (hasKwOnPlay(cardInstance, "contresort")) {
      cardInstance.contresortActive = true;
    }

    // Convocation X: crée un token X/X depuis le template choisi.
    // Si X est absent du texte, on tombe sur les stats par défaut du token.
    if (hasKwOnPlay(cardInstance, "convocation") && player.board.length < MAX_BOARD_SIZE) {
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
          effect_text: "",
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

    // Invocation X : invoque une créature aléatoire de coût exactement X issue
    // de la collection du joueur (communes + éditions limitées possédées),
    // même alignement que cette carte, légale dans le format du match.
    // Polymorphe : même mot-clé disponible côté sort dans resolveSpellKeywords.
    if (hasKwOnPlay(cardInstance, "invocation")) {
      const x = getKwX(cardInstance, "invocation", undefined, 1);
      resolveInvocationSummon(player, cardInstance.card, x, newState.factionCardPool, newState.formatCode ?? null);
    }

    // Invocations multiples : une Invocation par coût listé, dans l'ordre.
    if (hasKwOnPlay(cardInstance, "invocations_multiples")) {
      resolveMultipleInvocations(player, cardInstance.card, newState.factionCardPool, newState.formatCode ?? null);
    }

    // Déchainement X/Y : lance X sorts aléatoires de coût exactement Y issus de
    // la collection du joueur, même alignement que cette carte, cibles au
    // hasard. X/Y lus depuis keyword_instances (patron Affaiblissement).
    // Polymorphe : même mot-clé disponible côté sort dans resolveSpellKeywords.
    if (hasKwOnPlay(cardInstance, "dechainement")) {
      const inst = cardInstance.card.keyword_instances?.find(i => i.id === "dechainement" && !i.mode);
      const x = inst?.x ?? getKwX(cardInstance, "dechainement", undefined, 1);
      const y = inst?.y ?? 1;
      resolveDechainement(newState, player, opponent, cardInstance.card, x, y);
    }

    // Convocation (sans X) : variante non scalable de Convocation X. Crée le
    // token configuré (`convocation_token_id`) avec ses stats par défaut, sans
    // formule X/X. Polymorphe : même mot-clé disponible côté sort dans
    // resolveSpellKeywords.
    if (hasKwOnPlay(cardInstance, "convocation_simple") && player.board.length < MAX_BOARD_SIZE) {
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
          effect_text: "",
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
    if (hasKwOnPlay(cardInstance, "convocations_multiples")) {
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
          effect_text: "",
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
    if (hasKwOnPlay(cardInstance, "malediction") && action.targetInstanceId) {
      const cursedTarget = opponent.board.find(c => c.instanceId === action.targetInstanceId);
      if (cursedTarget) {
        cardInstance.maledictionTargetId = cursedTarget.instanceId;
      }
    }

    // Affaiblissement -X/-Y (invocation) : -X ATK / -Y PV à la créature ennemie
    // ciblée. X/Y lus depuis keyword_instances (comme renforcement_multiple).
    if (hasKwOnPlay(cardInstance, "affaiblissement") && action.targetInstanceId) {
      const inst = cardInstance.card.keyword_instances?.find(i => i.id === "affaiblissement" && !i.mode);
      const target = opponent.board.find(c => c.instanceId === action.targetInstanceId);
      if (inst && target) applyAffaiblissement(target, inst.x ?? 0, inst.y ?? 0);
    }

    // Impact X (invocation) : X dégâts à la cible choisie (créature OU héros,
    // tout bord). applyImpactTo gère les sentinelles héros avant tout board.find.
    if (hasKwOnPlay(cardInstance, "impact") && action.targetInstanceId) {
      applyImpactTo(action.targetInstanceId, getKwX(cardInstance, "impact", undefined, 1), cardInstance, player, opponent);
    }

    // Paralysie: now a combat effect (applied when dealing damage, like poison)

    // Permutation: échange les PV de deux unités (une alliée, une ennemie)
    if (hasKwOnPlay(cardInstance, "permutation") && action.targetInstanceId) {
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
    if (hasKwOnPlay(cardInstance, "vampirisme") && action.targetInstanceId) {
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
    if (hasKwOnPlay(cardInstance, "mimique") && action.targetInstanceId) {
      const mimicTarget = findCreatureOnBoard(player, action.targetInstanceId) ?? findCreatureOnBoard(opponent, action.targetInstanceId);
      if (mimicTarget) {
        const newKeywords = [...new Set([...cardInstance.card.keywords, ...mimicTarget.card.keywords])];
        const newInstances = mergeKeywordInstances(cardInstance.card.keyword_instances, mimicTarget.card.keyword_instances);
        const newCapabilities = mergeComposedCapabilities(cardInstance.card.capabilities, mimicTarget.card.capabilities);
        cardInstance.card = { ...cardInstance.card, keywords: newKeywords, keyword_instances: newInstances, capabilities: newCapabilities };
        // Copy runtime state flags
        if (mimicTarget.hasDivineShield) cardInstance.hasDivineShield = true;
      }
    }

    // Métamorphose: devient une copie exacte d'une unité ciblée
    if (hasKwOnPlay(cardInstance, "metamorphose") && action.targetInstanceId) {
      const morphTarget = findCreatureOnBoard(player, action.targetInstanceId) ?? findCreatureOnBoard(opponent, action.targetInstanceId);
      if (morphTarget) {
        cardInstance.card = { ...morphTarget.card };
        cardInstance.currentAttack = morphTarget.currentAttack;
        cardInstance.currentHealth = morphTarget.currentHealth;
        cardInstance.maxHealth = morphTarget.maxHealth;
        cardInstance.hasDivineShield = morphTarget.hasDivineShield;
      }
    }

    // Dédoublement (mode invocation) : crée en jeu une copie exacte de cette
    // créature. Les autres déclencheurs (mort, tap, retour, fin de tour,
    // attaque) passent par resolveCuratedKeywordEffect ; le gate hasKwOnPlay
    // garantit qu'une instance en mode non-invocation ne se dédouble pas ici.
    if (hasKwOnPlay(cardInstance, "dedoublement") && player.board.length < MAX_BOARD_SIZE) {
      player.board.push(makeDedoublementClone(cardInstance));
    }

    // Combustion: défaussez une carte de votre main, piochez deux.
    // Gated on the play-mode instance so a Combustion entry living
    // only in tap/death mode doesn't auto-fire on summon.
    if (hasKwOnPlay(cardInstance, "combustion") && player.hand.length > 0) {
      discardFromHand(player, Math.floor(rng() * player.hand.length), [player, opponent]);
      drawCard(player);
      drawCard(player);
    }

    // Catalyse: réduit de 1 le coût en mana des unités de même race en main
    if (hasKwOnPlay(cardInstance, "catalyse") && cardInstance.card.race) {
      for (const handCard of player.hand) {
        if (handCard.card.race === cardInstance.card.race && handCard.card.card_type === "creature") {
          handCard.card = { ...handCard.card, mana_cost: Math.max(0, handCard.card.mana_cost - 1) };
        }
      }
    }

    // Prescience X: piochez jusqu'à X cartes en main
    if (hasKwOnPlay(cardInstance, "prescience")) {
      const x = Math.min(7, Math.max(3, cardInstance.card.mana_cost)); // X = mana cost capped
      while (player.hand.length < x && player.deck.length > 0) {
        drawCard(player);
      }
    }

    // Suprématie: +1 ATK et +1 PV par carte en main
    if (hasKwOnPlay(cardInstance, "suprematie")) {
      const handSize = player.hand.length;
      cardInstance.summonBonusATK += handSize;
      cardInstance.currentAttack += handSize;
      cardInstance.currentHealth += handSize;
      cardInstance.maxHealth += handSize;
    }

    // Ombre du passé: +1 ATK et +1 PV par unité de même race au cimetière
    if (hasKwOnPlay(cardInstance, "ombre_du_passe") && cardInstance.card.race) {
      const graveCount = player.graveyard.filter(c => c.card.race === cardInstance.card.race && c.card.card_type === "creature").length;
      cardInstance.summonBonusATK += graveCount;
      cardInstance.currentAttack += graveCount;
      cardInstance.currentHealth += graveCount;
      cardInstance.maxHealth += graveCount;
    }

    // Savant: +1 ATK et +1 PV par sort dans votre cimetière (X non-paramétré,
    // dérivé de l'état au moment de l'invocation — comme Suprématie/Ombre du passé).
    if (hasKwOnPlay(cardInstance, "savant")) {
      const spellCount = player.graveyard.filter(c => c.card.card_type === "spell").length;
      cardInstance.summonBonusATK += spellCount;
      cardInstance.currentAttack += spellCount;
      cardInstance.currentHealth += spellCount;
      cardInstance.maxHealth += spellCount;
    }

    // Profanation X: exile X cartes du cimetière, +1/+1 par carte
    if (hasKwOnPlay(cardInstance, "profanation")) {
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
    if (hasKwOnPlay(cardInstance, "exhumation")) {
      const x = Math.max(1, cardInstance.card.mana_cost - 1);
      const resurrectable = player.graveyard.filter(c => c.card.card_type === "creature" && c.card.mana_cost <= x);
      if (resurrectable.length > 0 && player.board.length < MAX_BOARD_SIZE) {
        const target = (action.graveyardTargetInstanceId
          ? resurrectable.find(c => c.instanceId === action.graveyardTargetInstanceId)
          : resurrectable[resurrectable.length - 1]) ?? resurrectable[resurrectable.length - 1];
        player.graveyard = player.graveyard.filter(c => c !== target);
        // Réutilise l'instance du cimetière pour CONSERVER ses bonus accumulés
        // (nouvelle identité pour éviter toute référence obsolète).
        returnInstanceToPlay(target);
        target.instanceId = generateInstanceId();
        // Traque (charge) → pas de mal d'invocation, même ressuscitée.
        target.hasSummoningSickness = !target.card.keywords.includes("charge");
        player.board.push(target);
      }
    }

    // Héritage du cimetière: copie les capacités d'une unité du cimetière
    if (hasKwOnPlay(cardInstance, "heritage_du_cimetiere")) {
      const graveCreatures = player.graveyard.filter(c => c.card.card_type === "creature");
      if (graveCreatures.length > 0) {
        const graveTarget = (action.graveyardTargetInstanceId
          ? graveCreatures.find(c => c.instanceId === action.graveyardTargetInstanceId)
          : graveCreatures[graveCreatures.length - 1]) ?? graveCreatures[graveCreatures.length - 1];
        const newKeywords = [...new Set([...cardInstance.card.keywords, ...graveTarget.card.keywords])];
        const newInstances = mergeKeywordInstances(cardInstance.card.keyword_instances, graveTarget.card.keyword_instances);
        const newCapabilities = mergeComposedCapabilities(cardInstance.card.capabilities, graveTarget.card.capabilities);
        cardInstance.card = { ...cardInstance.card, keywords: newKeywords, keyword_instances: newInstances, capabilities: newCapabilities };
      }
    }

    // Rappel: remettre une carte du cimetière en main
    if (hasKwOnPlay(cardInstance, "rappel") && player.graveyard.length > 0) {
      const recallTarget = (action.graveyardTargetInstanceId
        ? player.graveyard.find(c => c.instanceId === action.graveyardTargetInstanceId)
        : player.graveyard[player.graveyard.length - 1]) ?? player.graveyard[player.graveyard.length - 1];
      if (recallTarget && player.hand.length < MAX_HAND_SIZE) {
        player.graveyard = player.graveyard.filter(c => c !== recallTarget);
        // Conserve les bonus accumulés (nouvelle identité d'instance).
        returnInstanceToPlay(recallTarget);
        recallTarget.instanceId = generateInstanceId();
        player.hand.push(recallTarget);
        triggerReturnToHand(recallTarget, player, opponent);
      }
    }

    // Divination: reveal top 3 cards, player chooses 1 to keep on top
    if (hasKwOnPlay(cardInstance, "divination") && player.deck.length > 0) {
      const count = Math.min(3, player.deck.length);
      const top3 = player.deck.splice(0, count);
      const chosenIdx = Math.min(action.divinationChoiceIndex ?? 0, top3.length - 1);
      player.deck.unshift(top3[chosenIdx]); // chosen goes on top
      for (let i = 0; i < top3.length; i++) {
        if (i !== chosenIdx) player.deck.push(top3[i]); // rest on bottom
      }
    }

    // Sélection X / Renfort Royal X / Sélection magique X : same picker
    // flow, all resolve by looking up `selectionCardId`. Lookup tries the
    // factionCardPool first (Sélection / Renfort Royal) and falls back to
    // allSpellsPool (Sélection magique sources its choices there).
    if (
      (cardHasKwOnPlay(cardInstance.card, "selection") || cardHasKwOnPlay(cardInstance.card, "renfort_royal") || cardHasKwOnPlay(cardInstance.card, "selection_magique"))
      && action.selectionCardId != null
    ) {
      const chosenCard = newState.factionCardPool?.find(c => c.id === action.selectionCardId)
        ?? newState.allSpellsPool?.find(c => c.id === action.selectionCardId);
      if (chosenCard && player.hand.length < MAX_HAND_SIZE) {
        const chosen = createCardInstance(chosenCard);
        player.hand.push(chosen);
      }
    }

    // Bénédiction: soigne complètement une unité ciblée
    if (hasKwOnPlay(cardInstance, "benediction") && action.targetInstanceId) {
      const healTarget = player.board.find(c => c.instanceId === action.targetInstanceId);
      if (healTarget) {
        healTarget.currentHealth = healTarget.maxHealth;
        healTarget.isPoisoned = false;
      }
    }

    // Traque du destin X: révèle X premières cartes du deck, le joueur en
    // choisit une (action.divinationChoiceIndex — reuse of the divination
    // picker UI), reste en dessous dans un ordre aléatoire.
    if (hasKwOnPlay(cardInstance, "traque_du_destin") && player.deck.length > 0) {
      const x = getTraqueDuDestinX(cardInstance.card);
      const count = Math.min(x, player.deck.length);
      const revealed = player.deck.splice(0, count);
      if (revealed.length > 0 && player.hand.length < MAX_HAND_SIZE) {
        const chosenIdx = Math.min(
          Math.max(0, action.divinationChoiceIndex ?? 0),
          revealed.length - 1,
        );
        player.hand.push(revealed[chosenIdx]);
        revealed.splice(chosenIdx, 1);
        shuffleArray(revealed);
        player.deck.push(...revealed);
      }
    }

    // Sang mêlé (+1 ATK / +1 PV par race alliée différente) est désormais une
    // aura DYNAMIQUE entièrement gérée par recalculateAuras (ATK + PV via
    // sangMeleHealthBonus), appelé juste après la mise en jeu. Plus de bonus PV
    // permanent cuit ici — sinon le PV ne redescendait jamais (bug signalé).

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
    if (hasKwOnPlay(cardInstance, "solidarite") && cardInstance.card.race) {
      const sameRaceCount = player.board.filter(a => a !== cardInstance && a.card.race === cardInstance.card.race).length;
      if (sameRaceCount >= 2) {
        const solXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
        const x = solXVals["solidarite"] || Math.max(1, Math.floor(cardInstance.card.mana_cost / 3));
        for (let i = 0; i < x; i++) drawCard(player);
      }
    }

    // Appel du clan X: met en jeu la première unité de même clan (coût ≤ X) depuis le deck.
    // Gated sur hasKwOnPlay pour qu'une instance en mode mort/attaque/retour/fin-de-tour/
    // tap ne se déclenche PAS à l'invocation ; elle passe alors par resolveCuratedKeywordEffect.
    if (hasKwOnPlay(cardInstance, "appel_du_clan") && cardInstance.card.clan && player.board.length < MAX_BOARD_SIZE) {
      const adcXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      const x = adcXVals["appel_du_clan"] || Math.max(1, cardInstance.card.mana_cost - 1);
      const idx = player.deck.findIndex(c => c.card.clan === cardInstance.card.clan && c.card.card_type === "creature" && c.card.mana_cost <= x);
      if (idx >= 0) {
        const [called] = player.deck.splice(idx, 1);
        const calledInstance = createCardInstance(called.card);
        // Mal d'invocation par défaut, sauf Traque portée par l'appelée (même
        // règle que la main / Exhumation / Invocation X).
        calledInstance.hasSummoningSickness = !hasKw(calledInstance, "charge");
        player.board.push(calledInstance);
      }
    }

    // Appel Suprême: récupère en main la créature de la race fixée au coût en
    // mana le plus élevé restante dans le deck (au hasard si égalité). La race
    // est portée par la capacité (keyword_instances[i].race).
    if (hasKwOnPlay(cardInstance, "appel_supreme")) {
      const race = getCapabilities(cardInstance.card).find(c => c.abilityId === "appel_supreme")?.race;
      if (race) appelSupreme(player, race);
    }

    // Rassemblement X: révèle X premières cartes du deck, unités de même race en main, reste défaussé
    if (hasKwOnPlay(cardInstance, "rassemblement") && cardInstance.card.race && player.deck.length > 0) {
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
    // taking hits). Does not target the enemy hero. Gated on hasKwOnPlay so
    // a Tempête instance set to "death"/"tap" mode doesn't ALSO fire here at
    // summon — it resolves from resolveCuratedKeywordEffect instead.
    if (hasKwOnPlay(cardInstance, "tempete")) {
      const total = getKwX(cardInstance, "tempete", undefined, Math.max(1, Math.floor(cardInstance.card.mana_cost / 3)));
      for (let drop = 0; drop < total; drop++) {
        const alive = opponent.board.filter((u) => u.currentHealth > 0);
        if (alive.length === 0) break;
        const target = alive[Math.floor(rng() * alive.length)];
        dealDamageToCreature(target, 1, false, true, player.hero);
        sequentialHitsSink.push({ targetInstanceId: target.instanceId, type: "damage" });
      }
    }

    // Cataclysme X — invocation : X dégâts (plein, déterministe) à TOUTES les
    // créatures des deux camps, la source COMPRISE (elle est sur player.board).
    if (hasKwOnPlay(cardInstance, "cataclysme")) {
      const x = getKwX(cardInstance, "cataclysme", undefined, Math.max(1, Math.floor(cardInstance.card.mana_cost / 3)));
      for (const c of [...opponent.board, ...player.board]) {
        dealDamageToCreature(c, x, false, true, player.hero, false);
        sequentialHitsSink.push({ targetInstanceId: c.instanceId, type: "damage" });
      }
    }

    // Instinct de meute X — on-play, fires once if any same-faction ally
    // (owned by this player) joined the graveyard during the CURRENT
    // turn. Single +X/+X grant; does not stack with the number of dead
    // allies. Reads `diedOnTurn` stamped by cleanDeadCreatures.
    if (hasKwOnPlay(cardInstance, "instinct_de_meute")) {
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

    // Persécution / Riposte / Carnage / Sacrifice démoniaque / Héritage : X
    // figés sur l'instance. Reposés ici — après les dons éventuels de cette
    // entrée en jeu, qui peuvent avoir ajouté un de ces mots-clés — par le
    // MÊME helper qu'à la création de l'instance (cf. stampKeywordXValues).
    stampKeywordXValues(cardInstance);

    // Tactique X: attribue X capacités choisies à un allié (simplified: copy 1 keyword)
    if (hasKwOnPlay(cardInstance, "tactique") && action.targetInstanceId) {
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

    // Conférer : confère la capacité choisie à une/aux unité(s) alliée(s).
    if (hasKwOnPlay(cardInstance, "conferer")) {
      const inst = cardInstance.card.keyword_instances?.find(k => k.id === "conferer" && !k.mode);
      const abilityId = inst?.grantAbilityId;
      if (abilityId) {
        const scope = inst?.grantScope ?? "target";
        // L'instance « conferer » n'a pas de X à elle : ses x/y portent
        // l'amplitude de la capacité CONFÉRÉE (Conférer → Gloire +2/+1).
        const params = grantParamsFor(abilityId, inst?.x, inst?.y);
        if (scope === "all_allies") {
          for (const ally of player.board) applyGrantedKeyword(ally, abilityId, params, true);
        } else if (action.targetInstanceId) {
          const t = findCreatureOnBoard(player, action.targetInstanceId);
          if (t) applyGrantedKeyword(t, abilityId, params, true);
        }
      }
    }

    // Bruitage des capacités CURÉES à l'entrée en jeu. Émis ici, en un point,
    // plutôt qu'aux ~40 blocs `if (hasKwOnPlay(...))` qui précèdent : ils n'ont
    // aucun point de passage commun, et quarante sites à tenir d'accord est
    // exactement le motif d'inventaire dupliqué qui a déjà dérivé plusieurs fois
    // ici. On balaie donc les capacités déclarées on_play de la carte.
    //
    // Nuance ASSUMÉE : une capacité qui fizzle (aucune cible, plateau plein…)
    // sonnera quand même. Pour un bruitage, le faux positif est préférable au
    // silence — et l'alternative coûterait quarante instrumentations.
    // Les composés sont exclus ici : ils sonnent depuis buildComposedFrames.
    for (const cap of getCapabilities(cardInstance.card)) {
      if (cap.trigger === "on_play" && !cap.composed) noteAbilitySfx(cap.abilityId, "on_play");
    }

    // Effets composés à l'entrée en jeu (modèle hybride) → pile LIFO. Un effet
    // poussé pendant la résolution (ex. mort déclenchée par un dégât on_play) se
    // résout avant la frame sœur suivante (interruption). Les morts sont
    // traitées par settleDeaths pendant le drain.
    pushFrames(newState, buildComposedFrames(
      cardInstance.card, "on_play", cardInstance, player.id, action.targetMap, action.targetInstanceId,
    ));
    drainStack(newState);

    // Déclenchement : le porteur rejoue une fois les effets composés des AUTRES
    // alliés (sous-ensemble figé), après que ses propres effets d'entrée aient
    // résolu. Pousse les frames source = l'allié d'origine puis draine.
    if (hasKwOnPlay(cardInstance, "declenchement")) {
      runDeclenchement(newState, cardInstance, getDeclenchementTriggers(cardInstance.card), player);
    }

    // Filet : nettoie les morts causées par les effets curated on-play inline
    // (tactique / relancer / conférer…) — encore résolus hors pile à ce palier
    // (migration des curated = palier g). Idempotent si la pile a déjà tout
    // nettoyé. Recalcul d'auras garanti (parité avec l'ancien comportement).
    settleDeaths(newState, 0);
    recalculateAuras(player, opponent);

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

    // Touché mortel porté par le SORT : modificateur global de sa résolution —
    // toute créature qu'il blesse meurt. Remis à false au début de chaque action.
    lethalSpellActive = cardHasLethalTouch(card);

    // Build target map from action
    const targetMap: Record<string, string> = { ...(action.targetMap ?? {}) };
    // Backward compat: single targetInstanceId → target_0
    if (action.targetInstanceId && !action.targetMap) {
      targetMap["target_0"] = action.targetInstanceId;
    }
    // CREUSER : le picker de choix « 1 parmi X » est le même que Divination et
    // renvoie donc un `divinationChoiceIndex`. On le convertit ici dans le slot
    // que lit la forme SORT, pour que les deux formes partagent un seul chemin
    // d'interface au lieu d'en maintenir deux.
    if (action.divinationChoiceIndex != null && targetMap["creuser_0"] == null) {
      targetMap["creuser_0"] = String(action.divinationChoiceIndex);
    }

    // Track spell in history (exclude spells with "relancer" to prevent loops)
    const hasRelancer = card.spell_keywords?.some(kw => kw.id === "relancer") ?? false;
    if (!hasRelancer) {
      player.spellHistory.push({ card, targetMap: { ...targetMap } });
    }

    // Corps de résolution PARTAGÉ avec les sorts relancés / déchaînés. Le repli
    // legacy garde `action.targetInstanceId` : sur ce chemin il n'existe pas de
    // targetMap moderne, et les deux ne coïncident que par la compatibilité
    // ascendante posée plus haut (`targetMap["target_0"] = targetInstanceId`).
    const ctx = resolveSpellCard(newState, player, opponent, card, targetMap, action.targetInstanceId);

    // Morts causées par les phases 2/3, les composés et le repli legacy.
    settleSpellDeaths(ctx);
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
            if (target) dealDamageToCreature(target, amount, false, true, caster.hero);
          }
          break;
        }
        case "all_enemy_creatures":
          [...opponent.board].forEach(c => dealDamageToCreature(c, amount, false, true, caster.hero));
          break;
        case "all_enemies":
          dealDamageToHero(opponent.hero, amount);
          [...opponent.board].forEach(c => dealDamageToCreature(c, amount, false, true, caster.hero));
          break;
        case "all_friendly_creatures":
          [...caster.board].forEach(c => dealDamageToCreature(c, amount, false, true, caster.hero));
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
          // Don PONCTUEL : passe par le chemin commun pour réarmer les
          // capacités à usage (Ombre révélée, esquive dépensée…) au lieu de
          // ne poser que le mot-clé.
          applyGrantedKeyword(target, effect.keyword, undefined, true);
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
          if (caster.hand.length < MAX_HAND_SIZE) {
            caster.hand.push(creature);
            triggerReturnToHand(creature, caster, opponent);
          }
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
  // MUST use the shared seeded rng (not Math.random) — this runs during action
  // replay on BOTH clients, so a non-deterministic draw makes each client pick a
  // different target, permanently desyncing the match (divergent board / HP /
  // graveyard). All other engine randomness already goes through rng().
  return candidates[Math.floor(rng() * candidates.length)];
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

    castSpellWithRandomTargets(state, player, opponent, card);
  }
}

/** Lance `card` (un sort) comme s'il venait de la main, avec des cibles tirées
 *  au hasard (RNG semé partagé) — corps commun de Relancer X (recastSpells) et
 *  de Déchainement X/Y. Pousse l'événement d'animation `recastEvents` (overlay
 *  + flèches vers les cibles réelles), résout les mots-clés de sort puis les
 *  effets composables, et balaie les morts. N'ajoute PAS le sort à
 *  l'historique (spellHistory ne trace que les sorts joués depuis la main). */
function castSpellWithRandomTargets(
  state: GameState,
  player: PlayerState,
  opponent: PlayerState,
  card: Card,
): void {
  // Build random target map
  const targetMap: Record<string, string> = {};
  // Vraies cibles du sort (pour l'animation « comme depuis la main »), hors
  // fallback target_0 défensif ci-dessous — sinon un sort de zone afficherait
  // une flèche parasite vers une créature aléatoire.
  const realTargetIds: string[] = [];
  if (card.spell_keywords?.length) {
    for (let i = 0; i < card.spell_keywords.length; i++) {
      const kw = card.spell_keywords[i];
      const def = SPELL_KEYWORDS[kw.id];
      if (!def) continue;
      if (def.needsTarget) {
        // Cible cimetière : `pickRandomTarget` tire parmi TOUTES les créatures
        // du cimetière, sans appliquer les règles d'éligibilité propres au
        // mot-clé. Exhumation X plafonne le coût des ressuscitables : un tirage
        // qui tombait sur une créature trop chère faisait fizzler l'effet alors
        // qu'une cible valide attendait juste à côté (échec ~1 fois sur 2 selon
        // la graine). On réutilise donc le provider du picker interactif, seule
        // définition faisant autorité sur ce qui est ressuscitable.
        const graveyardSlot = def.targetType === "friendly_graveyard"
          || def.targetType === "friendly_graveyard_to_board";
        let target: string | undefined;
        if (graveyardSlot) {
          const eligible = getSpellGraveyardTargets(
            { players: [player, opponent], currentPlayerIndex: 0 } as unknown as GameState,
            card, i,
          );
          target = eligible.length > 0 ? eligible[Math.floor(rng() * eligible.length)] : undefined;
        } else {
          target = pickRandomTarget(player, opponent, def.targetType);
        }
        if (target) { targetMap[`kw_${i}`] = target; realTargetIds.push(target); }
      }
    }
  }
  // Sélection / Renfort Royal / Sélection magique attendent un ID DE CARTE
  // choisi par le joueur dans la modale « 1 parmi 3 » (slots nommés
  // `selection_0` / `renfort_royal_0` / `selection_magique_0`). Un sort
  // relancé n'a personne pour choisir : sans pré-tirage, resolveSpellKeywords
  // ne trouve aucun slot et l'effet disparaît EN SILENCE (ex. « Renfort des
  // Trois Peuples » relancé résolvait Tempête 3 mais pas Sélection 2). On tire
  // au hasard parmi les options éligibles avec le RNG semé partagé — même
  // parti pris que le chemin créature quand la modale ne peut pas s'ouvrir.
  const SELECTION_KW_IDS = ["selection", "renfort_royal", "selection_magique"] as const;
  for (const kw of card.spell_keywords ?? []) {
    const selId = SELECTION_KW_IDS.find((id) => id === kw.id);
    if (!selId) continue;
    // Les getters d'options lisent players[currentPlayerIndex] : on leur
    // présente une vue où le LANCEUR est le joueur courant (le reste de
    // l'état — pools, turnNumber pour la graine — est conservé).
    const selState = {
      ...state,
      players: [player, opponent],
      currentPlayerIndex: 0,
    } as GameState;
    const options = selectionCardsForKeyword(selId, selState, kw.amount ?? 0, card);
    if (options.length === 0) continue;
    targetMap[`${selId}_0`] = String(options[Math.floor(rng() * options.length)].id);
  }

  // Also set target_0 for composable effects / legacy
  if (card.spell_effects?.targets?.length) {
    for (const slot of card.spell_effects.targets) {
      const target = pickRandomTarget(player, opponent, slot.type as SpellTargetType);
      if (target) { targetMap[slot.slot] = target; realTargetIds.push(target); }
    }
  }
  if (!targetMap["target_0"]) {
    const fallback = pickRandomTarget(player, opponent, "any");
    if (fallback) targetMap["target_0"] = fallback;
  }

  // Indice d'animation : rejoue le sort relancé comme s'il venait de la main
  // (overlay + flèches vers ses cibles). Cibles héros caster-relatives →
  // sentinelles absolues __hero_<idx>__ (traduites par POV côté store).
  const pIdx = state.players.indexOf(player);
  const oIdx = state.players.indexOf(opponent);
  const animTargetIds = [...new Set(realTargetIds)].map(id =>
    id === "enemy_hero" ? `__hero_${oIdx}__`
    : id === "friendly_hero" ? `__hero_${pIdx}__`
    : id,
  );
  (state.recastEvents ??= []).push({ card, targetIds: animTargetIds });

  // Résolution COMPLÈTE, identique à un sort joué depuis la main : le sort
  // imbriqué garde ses effets composés et ses dons, qu'il perdait avant.
  resolveSpellCard(state, player, opponent, card, targetMap);
}

// ============================================================
// NEW SPELL SYSTEM — SPELL KEYWORD RESOLUTION
// ============================================================

/** Reconstruit la liste d'effets de sort (SpellKeywordInstance[]) depuis le
 *  modèle unifié, dans l'ordre — l'index i est conservé, donc les slots de
 *  cible `kw_${i}` restent valides. Permet à resolveSpellKeywords de consommer
 *  les capacités sans changer son corps ni le flux de ciblage. */
/** ⚠️ COUPLAGE POSITIONNEL — le slot de cible `kw_${i}` est numéroté par
 *  getSpellTargetSlots d'après la position dans `card.spell_keywords`, mais relu
 *  par resolveSpellKeywords d'après la position dans CETTE liste. Les deux ne
 *  coïncident que parce que l'adaptateur émet les mots-clés de sort en premier
 *  et dans l'ordre, les dons ensuite (écartés ici par le filtre `immediate`), et
 *  les composés en dernier. Réordonner les capacités ferait atterrir chaque
 *  cible sur le mauvais effet, en silence. Verrouillé par spell-slot-index.test.ts. */
function spellResolutionInstances(card: Card): SpellKeywordInstance[] {
  return getCapabilities(card)
    .filter((c) => c.trigger === "spell_resolution" && c.effectKind === "immediate")
    // `chanted` : Chant X majore ici les trois porteurs d'amplitude. Les couples
    // X/Y ne passent pas tous par les mêmes champs — Renforcement utilise
    // (attack, health), Déchainement (amount, health) — d'où les trois.
    .map((c) => ({
      id: c.abilityId as SpellKeywordInstance["id"],
      amount: chanted(c.abilityId, c.params?.x),
      attack: chanted(c.abilityId, c.params?.attack),
      health: chanted(c.abilityId, c.params?.health),
      race: c.race,
      clan: c.clan,
      token_id: c.tokenId ?? null,
    }));
}

/** Résolution COMPLÈTE d'un sort, indépendante de sa provenance : joué depuis
 *  la main, relancé par Relancer X, ou tiré par Déchainement X/Y. Enchaîne
 *  mots-clés → effets composables → dons → effets composés `spell_resolution`,
 *  avec règlement des morts après CHAQUE effet (cf. settleSpellDeaths).
 *
 *  Avant l'extraction, le chemin « sort imbriqué » ne faisait que les deux
 *  premières phases : un sort tiré par Déchainement perdait silencieusement ses
 *  effets composés ET ses dons. Un seul corps pour les deux appelants est la
 *  seule façon d'empêcher cet écart de revenir.
 *
 *  Restent chez l'appelant, car propres au fait de JOUER une carte : coût en
 *  mana, Contresort, `spellHistory`, mise au cimetière, construction du
 *  targetMap. Un sort relancé ne paie rien et n'a pas de carte à défausser.
 *
 *  `withLethalSpell` est ré-entrant : un sort imbriqué porte son propre Touché
 *  mortel sans contaminer le sort englobant. */
function resolveSpellCard(
  state: GameState,
  caster: PlayerState,
  opponent: PlayerState,
  card: Card,
  targetMap: Record<string, string>,
  legacyTargetId?: string,
): SpellResolutionContext {
  const ctx: SpellResolutionContext = { state, caster, opponent, card, targetMap, results: {} };
  // Seuil de colère : évalué UNE fois, à la résolution — le deck du lanceur peut
  // bouger pendant le sort (Incinération, pioche), la condition ne doit pas se
  // ré-évaluer en cours de route.
  const wrath = caster.deck.length <= SEUIL_DECK_THRESHOLD ? cardWrathAmount(card) : 0;
  // Chant : même règle d'INSTANTANÉ que Seuil de colère, et pour une raison plus
  // aiguë encore — un sort peut tuer sa propre chanteuse (Cataclysme frappe les
  // deux camps). Ré-évaluer en cours de route retirerait le bonus au milieu de
  // la résolution, avec des effets boostés avant et pas après.
  //
  // Ré-entrance : un sort imbriqué (Relancer, Déchainement) repasse par
  // resolveSpellCard, pose SON propre bonus et restaure celui-ci en sortant. Un
  // sort relancé sans Chant n'hérite donc de rien.
  const chant = boardHasChanter(caster) ? cardChantAmount(card) : 0;
  withChant(chant, () =>
  withWrathThreshold(wrath, () =>
  withLethalSpell(cardHasLethalTouch(card), () => {
    // Phase 1 — mots-clés de sort (règlent leurs morts effet par effet).
    const instances = spellResolutionInstances(card);
    if (instances.length) {
      resolveSpellKeywords(ctx, instances);
      settleSpellDeaths(ctx); // filet : la boucle a déjà réglé au fil de l'eau
    }

    // Phase 2 — effets composables (ancien système spell_effects).
    if (card.spell_effects?.effects?.length) {
      resolveComposableEffects(ctx, card.spell_effects.effects);
      settleSpellDeaths(ctx);
    }

    // Phase 3 — dons conférés par le sort (effectKind "grant"), lus depuis le
    // modèle unifié. L'adaptateur a déjà appliqué l'exclusion polymorphe
    // (isCreatureKwShadowedBySpell) et le grantScope.
    for (const cap of getCapabilities(card)) {
      if (cap.trigger === "spell_resolution" && cap.effectKind === "grant") {
        applyGrantCapability(cap, caster, targetMap);
      }
    }

    // Phase 4 — effets composés à la résolution du sort (modèle hybride).
    runComposedCapsForCard(card, "spell_resolution", null, caster, opponent, targetMap);
    settleSpellDeaths(ctx);

    // Repli legacy (cartes sans mots-clés ni effets composables).
    if (card.spell_effect && !card.spell_keywords?.length && !card.spell_effects?.effects?.length) {
      resolveSpellEffect(state, card.spell_effect, caster, opponent, legacyTargetId ?? targetMap["target_0"]);
      settleSpellDeaths(ctx);
    }

    recalculateAuras(caster, opponent);
  })));
  return ctx;
}

// Appel Suprême (créature on-play + sort) : déplace du deck vers la main la
// créature de la race donnée au coût en mana le plus élevé ; en cas d'égalité,
// tirage via la RNG seedée (déterministe sur les deux clients). No-op si aucune
// créature de cette race, main pleine, deck vide ou race absente. Les sorts de
// la race sont ignorés (créatures uniquement).
function appelSupreme(player: PlayerState, race: string): void {
  if (!race || player.hand.length >= MAX_HAND_SIZE) return;
  const cands = player.deck.filter(c => c.card.card_type === "creature" && c.card.race === race);
  if (cands.length === 0) return;
  const maxCost = Math.max(...cands.map(c => c.card.mana_cost));
  const tied = cands.filter(c => c.card.mana_cost === maxCost);
  const chosen = tied[Math.floor(rng() * tied.length)];
  player.deck = player.deck.filter(c => c !== chosen);
  player.hand.push(chosen);
}

/** Affaiblissement -X/-Y : baisse PERMANENTE d'ATK/PV d'une créature (miroir de
 *  Renforcement, même math que l'effet composé "debuff"). La baisse est CUITE
 *  dans `card` — sinon recalculateAuras/persistentStats, qui recomposent ATK/PV
 *  depuis `card` + bonus trackés, l'effacent. ATK plancher à 0 ; PV SANS plancher
 *  → PV ≤ 0 tue (via cleanDeadCreatures/settleDeaths du site appelant). */
function applyAffaiblissement(target: CardInstance, x: number, y: number): void {
  target.card = {
    ...target.card,
    attack: Math.max(0, (target.card.attack ?? 0) - x),
    health: y > 0 ? (target.card.health ?? 1) - y : (target.card.health ?? 1),
  };
  target.currentAttack = Math.max(0, target.currentAttack - x);
  if (y > 0) { target.currentHealth -= y; target.maxHealth = target.maxHealth - y; }
  target.lastBuffMode = composedStrikeMode; // couleur de l'effet → teinte du popup
}

/** FRONTIÈRE D'EFFET — règle les morts en attente AU MILIEU de la résolution
 *  d'une carte : balaie les deux camps, marque dans `ctx.results` les slots de
 *  cible dont l'occupant vient de mourir, joue les râles d'agonie, recalcule
 *  les auras. Retourne le nombre de morts réglées ; à 0 il ne fait rien du
 *  tout, ce qui le rend appelable inconditionnellement.
 *
 *  ⚠️ C'est ICI — et non plus dans un bloc post-boucle — que se fait le
 *  marquage `${slot}_destroyed`. Ce marquage lit la VALEUR DE RETOUR de
 *  `cleanDeadCreatures`, pas l'absence du plateau : un balayage intermédiaire
 *  viderait la liste du balayage suivant, et le drapeau ne serait plus jamais
 *  posé — toutes les conditions « si la cible est détruite » casseraient en
 *  silence. Déplacer le balayage sans déplacer le marquage est le piège
 *  principal de ce chemin.
 *
 *  Ordre `caster` puis `opponent` : `processDeathTriggers` consomme du `rng()`
 *  (Cycle éternel, Sacrifice démoniaque…), l'inverser décalerait le flux
 *  aléatoire et ferait diverger les deux clients d'une partie en ligne. */
function settleSpellDeaths(ctx: SpellResolutionContext): number {
  const pDead = cleanDeadCreatures(ctx.caster);
  const oDead = cleanDeadCreatures(ctx.opponent);
  if (pDead.length === 0 && oDead.length === 0) return 0;
  const deadIds = new Set([...pDead, ...oDead].map(c => c.instanceId));
  for (const [slot, instanceId] of Object.entries(ctx.targetMap)) {
    if (deadIds.has(instanceId)) {
      ctx.results[`${slot}_destroyed`] = true;
      ctx.results["target_destroyed"] = true;
    }
  }
  processDeathTriggers(pDead, ctx.caster, ctx.opponent);
  processDeathTriggers(oDead, ctx.opponent, ctx.caster);
  recalculateAuras(ctx.caster, ctx.opponent);
  return pDead.length + oDead.length;
}

function resolveSpellKeywords(
  ctx: SpellResolutionContext,
  keywords: SpellKeywordInstance[]
): void {
  // Précision, forme SORT : modificateur GLOBAL du sort, pas un don. Sa seule
  // présence dans la liste fait que TOUS les dégâts que ce sort inflige aux
  // créatures (Impact, Siphon, Déferlement, Cataclysme, Tempête) ignorent la
  // réduction — Résistance, Armure et Bouclier — via ignoreDR=true, exactement
  // comme la Précision d'une créature perce les défenses de sa cible. Le sort
  // « a » Précision ; il ne la confère à personne. Le picker ne demande donc
  // aucune cible pour ce mot-clé (needsTarget:false dans le registre).
  const spellPierces = keywords.some(k => k.id === "precision");
  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    const def = SPELL_KEYWORDS[kw.id];
    if (!def) continue;
    noteAbilitySfx(kw.id, "spell_resolution");
    // Resolve target: use keyword's implicit slot or first target slot
    const slot = def.needsTarget ? `kw_${i}` : undefined;
    const targetId = slot ? (ctx.targetMap[slot] ?? ctx.targetMap["target_0"]) : undefined;

    switch (kw.id) {
      case "remontee": {
        // Renvoie l'unité ciblée dans la main de son propriétaire d'origine.
        // Sort → respecte Transcendance.
        resolveRemontee(targetId, null, ctx.caster, ctx.opponent, true);
        break;
      }
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
          if (target) dealDamageToCreature(target, amount, spellPierces, true, ctx.caster.hero);
        }
        break;
      }
      case "deferlement": {
        const amount = kw.amount ?? 0;
        [...ctx.opponent.board].forEach(c => dealDamageToCreature(c, amount, spellPierces, true, ctx.caster.hero));
        break;
      }
      case "cataclysme": {
        // X dégâts à TOUTES les créatures des deux camps (vs Déferlement =
        // ennemis seuls). fromSpell non passé → vrai sort (respecte Transcendance).
        const amount = kw.amount ?? 0;
        [...ctx.opponent.board, ...ctx.caster.board].forEach(c => dealDamageToCreature(c, amount, spellPierces, true, ctx.caster.hero));
        break;
      }
      case "siphon": {
        const amount = kw.amount ?? 0;
        if (targetId && targetId !== "enemy_hero" && targetId !== "friendly_hero") {
          const target = findCreatureOnBoard(ctx.caster, targetId) ?? findCreatureOnBoard(ctx.opponent, targetId);
          if (target) dealDamageToCreature(target, amount, spellPierces, true, ctx.caster.hero);
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
      case "poison": {
        // Spell-side Poison: tags the targeted enemy creature as
        // poisoned. The end-of-turn tick (see startTurn) deals the
        // recurring 1 HP damage, just like the creature-side keyword.
        if (targetId) {
          const target = findCreatureOnBoard(ctx.opponent, targetId);
          if (target) target.isPoisoned = true;
        }
        break;
      }
      case "corruption": {
        // Le SORT convertit lui-même la cible CHOISIE. Contrôle TEMPORAIRE :
        // `originalOwnerId` la fait repartir chez son propriétaire au début de
        // son tour (cf. startTurn) — seule différence avec Domination, qui ne
        // pose que `trueOwnerId` et garde l'unité définitivement.
        // Sans cible explicite (sort relancé), tirage — comme le chemin créature.
        if (ctx.caster.board.length >= MAX_BOARD_SIZE || ctx.opponent.board.length === 0) break;
        const corrupted = targetId
          ? ctx.opponent.board.find(c => c.instanceId === targetId)
          : ctx.opponent.board[Math.floor(rng() * ctx.opponent.board.length)];
        if (!corrupted) break;
        ctx.opponent.board = ctx.opponent.board.filter(c => c !== corrupted);
        corrupted.originalOwnerId = ctx.opponent.id;
        corrupted.trueOwnerId = ctx.opponent.id;
        resetTurnStateForNewController(corrupted); // Traque + compteurs de tour
        if (!corrupted.card.keywords.includes("charge")) {
          corrupted.card = { ...corrupted.card, keywords: [...corrupted.card.keywords, "charge"] };
        }
        ctx.caster.board.push(corrupted);
        break;
      }
      case "domination": {
        // Le SORT prend lui-même le contrôle, sur la cible CHOISIE (la version
        // créature tire au hasard à son invocation, faute d'interlocuteur).
        // Sans cible explicite — sort relancé, cibles tirées au sort — on
        // retombe sur un tirage, comme le reste du chemin « Relancer ».
        if (ctx.caster.board.length >= MAX_BOARD_SIZE || ctx.opponent.board.length === 0) break;
        const domIdx = targetId
          ? ctx.opponent.board.findIndex(c => c.instanceId === targetId)
          : Math.floor(rng() * ctx.opponent.board.length);
        if (domIdx < 0) break;
        const dominated = ctx.opponent.board.splice(domIdx, 1)[0];
        dominated.hasSummoningSickness = true;
        // Contrôle permanent, mais on mémorise le propriétaire d'origine pour
        // que Remontée la renvoie dans la BONNE main (cf. version créature).
        dominated.trueOwnerId = ctx.opponent.id;
        ctx.caster.board.push(dominated);
        break;
      }
      case "touche_mortel": {
        // Marqueur, comme Précision : aucun effet ni cible propres. Sa présence
        // a déjà été captée en amont (lethalSpellActive), ce qui rend MORTELS
        // tous les dégâts que ce sort inflige aux créatures. Le sort « a »
        // Touché mortel, il ne le confère pas — pour le donner à une unité,
        // passer par l'effet composé « Conférer une capacité ».
        break;
      }
      case "precision": {
        // Spell-side Précision : simple MARQUEUR, sans effet ni cible propres.
        // Sa présence a déjà été captée en amont dans `spellPierces` (voir en
        // tête de fonction), qui fait que TOUS les dégâts infligés aux
        // créatures par ce sort ignorent Résistance, Armure et Bouclier — le
        // sort « a » Précision, il ne la confère pas. Conférer Précision à une
        // unité via un sort reste possible par l'effet composé « Conférer une
        // capacité » (precision fait partie des ids grantable).
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
            // Clear the legacy keywords array, keyword_instances AND the
            // unified `capabilities` (where composed/backfilled abilities live).
            // keyword_instances holds mode-aware powers (tap-activated, on-death
            // rattles, conferred scopes); `capabilities`, when set, is what
            // getCapabilities() reads — leaving it would let a backfilled
            // creature keep every curated AND composed ability through silence.
            target.card = { ...target.card, keywords: [], keyword_instances: null, capabilities: null };
            target.hasDivineShield = false;
            target.contresortActive = false;
            target.isParalyzed = false;
            target.fureurActive = false;
            target.fureurATKBonus = 0;
            // …et retour aux ATK/PV IMPRIMÉS : le Silence ne coupe pas que les
            // pouvoirs, il reprend TOUS les gains de stats accumulés (dont les
            // +X/+Y de Gloire et de Renforcement, cuits dans `card`).
            stripBoostsToBase(target);
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
      case "affaiblissement": {
        // Miroir debuff de Renforcement : -X ATK / -Y PV à la créature ennemie
        // ciblée. Peut la tuer (PV ≤ 0) → morts balayées après (cleanDeadCreatures).
        if (targetId) {
          const target = findCreatureOnBoard(ctx.caster, targetId) ?? findCreatureOnBoard(ctx.opponent, targetId);
          if (target) applyAffaiblissement(target, kw.attack ?? 0, kw.health ?? 0);
        }
        break;
      }
      case "renforcement_multiple": {
        // +X/+Y à toutes les créatures du lanceur de la race/clan ciblé.
        applyRenforcementMultiple(ctx.caster, kw.attack ?? 0, kw.health ?? 0, kw.race, kw.clan);
        break;
      }
      case "entrainement": {
        // +X/+X aux créatures en main du lanceur de la même faction que le sort.
        applyEntrainement(ctx.caster, ctx.card.faction, kw.amount ?? 0);
        break;
      }
      case "fortifier": {
        // Sans cible : +X/+Y permanent à la 1re créature du deck du LANCEUR.
        // attack/health transportés par spellResolutionInstances (majorés par
        // Chant, comme Renforcement).
        applyFortifier(ctx.caster, kw.attack ?? 0, kw.health ?? 0);
        break;
      }
      case "preincanter": {
        // Sans cible : le 1er sort du deck du lanceur coûte X de moins (min 1).
        applyPreincanter(ctx.caster, kw.amount ?? 0);
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
        // Invocation X : créature aléatoire de la collection au coût exact X.
        // Migration legacy : les sorts sauvés en « Invocation X/Y » (token)
        // n'ont pas de `amount` — leur ancienne ATK devient le coût X.
        const x = kw.amount ?? kw.attack ?? 1;
        resolveInvocationSummon(ctx.caster, ctx.card, x, ctx.state.factionCardPool, ctx.state.formatCode ?? null);
        break;
      }
      case "invocations_multiples": {
        // Une Invocation par coût listé (les coûts vivent sur l'instance de sort).
        resolveMultipleInvocations(ctx.caster, ctx.card, ctx.state.factionCardPool, ctx.state.formatCode ?? null, chantBonus);
        break;
      }
      case "dechainement": {
        // Déchainement X/Y : lance X sorts aléatoires (amount) de coût
        // exactement Y (health) de la collection, cibles au hasard.
        const x = kw.amount ?? 1;
        const y = kw.health ?? 1;
        resolveDechainement(ctx.state, ctx.caster, ctx.opponent, ctx.card, x, y);
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
          effect_text: "",
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
            effect_text: "",
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
      case "epargne": {
        addEpargne(ctx.caster, kw.amount ?? 1);
        break;
      }
      case "incineration": {
        resolveIncineration(incinerationVictim(targetId, ctx.caster, ctx.opponent), kw.amount ?? 1);
        break;
      }
      case "creuser": {
        // Le choix voyage dans targetMap sous un slot dédié, comme `selection_0`
        // — le contexte de sort n'a pas à grossir d'un champ par mécanique.
        const raw = ctx.targetMap["creuser_0"];
        const idx = raw != null ? parseInt(raw, 10) : 0;
        resolveCreuser(ctx.caster, kw.amount ?? 1, Number.isNaN(idx) ? 0 : idx);
        break;
      }
      case "retour_differe": {
        // Sort → respecte Transcendance, comme Remontée.
        resolveRetourDiffere(targetId, null, ctx.caster, ctx.opponent, true);
        break;
      }
      case "pillage": {
        // L'adversaire défausse X cartes aléatoires de sa main.
        const total = kw.amount ?? 1;
        for (let drop = 0; drop < total && ctx.opponent.hand.length > 0; drop++) {
          discardFromHand(ctx.opponent, Math.floor(rng() * ctx.opponent.hand.length), [ctx.caster, ctx.opponent]);
        }
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
          dealDamageToCreature(target, 1, spellPierces, true, ctx.caster.hero);
          sequentialHitsSink.push({ targetInstanceId: target.instanceId, type: "damage" });
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
              // Conserve les bonus accumulés (nouvelle identité d'instance).
              returnInstanceToPlay(target);
              target.instanceId = generateInstanceId();
              ctx.caster.hand.push(target);
              triggerReturnToHand(target, ctx.caster, ctx.opponent);
            }
          }
        }
        break;
      }
      case "selection":
      case "renfort_royal":
      case "selection_magique": {
        // All three routes look up the chosen card by id. Sélection /
        // Renfort Royal source from factionCardPool ; Sélection magique
        // sources from allSpellsPool. We try both pools so any of the
        // three keywords can resolve regardless of their source.
        const slotKey = kw.id === "selection" ? "selection_0"
          : kw.id === "renfort_royal" ? "renfort_royal_0"
          : "selection_magique_0";
        const slotVal = ctx.targetMap[slotKey]
          ?? ctx.targetMap["selection_0"]
          ?? ctx.targetMap["renfort_royal_0"]
          ?? ctx.targetMap["selection_magique_0"];
        const selCardId = slotVal ? parseInt(slotVal) : null;
        if (selCardId != null) {
          const chosenCard = ctx.state.factionCardPool?.find(c => c.id === selCardId)
            ?? ctx.state.allSpellsPool?.find(c => c.id === selCardId);
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
              // Conserve les bonus accumulés (nouvelle identité d'instance).
              returnInstanceToPlay(target);
              target.instanceId = generateInstanceId();
              // Traque (charge) → pas de mal d'invocation, même ressuscitée.
              target.hasSummoningSickness = !target.card.keywords.includes("charge");
              ctx.caster.board.push(target);
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
      case "appel_du_clan": {
        // Mirror the creature-side behaviour: put the first same-clan creature
        // (mana cost ≤ X) found in the deck directly into play, free and with
        // summoning sickness. Uses the spell's own clan — a no-op when the
        // spell has no clan or the board is full (same fail-safe as creatures).
        const x = kw.amount ?? 1;
        const clan = ctx.card.clan;
        if (!clan || ctx.caster.board.length >= MAX_BOARD_SIZE) break;
        const idx = ctx.caster.deck.findIndex(c => c.card.clan === clan && c.card.card_type === "creature" && c.card.mana_cost <= x);
        if (idx >= 0) {
          const [called] = ctx.caster.deck.splice(idx, 1);
          const calledInstance = createCardInstance(called.card);
          // Traque de l'appelée respectée (cf. chemin on-play / Invocation X).
          calledInstance.hasSummoningSickness = !hasKw(calledInstance, "charge");
          ctx.caster.board.push(calledInstance);
        }
        break;
      }
      case "appel_supreme": {
        // Récupère en main la créature de la race choisie (kw.race) au coût en
        // mana le plus élevé restante dans le deck (au hasard si égalité).
        if (kw.race) appelSupreme(ctx.caster, kw.race);
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
      case "concentration": {
        // Mirror the creature-side trigger: replace every spell in hand with
        // a random higher-cost spell, discounted by X. The spell that just
        // resolved has already left the hand at this point (it's the caster's
        // current play), so it cannot replace itself.
        const x = kw.amount ?? 1;
        applyConcentration(ctx.caster, x, ctx.state.allSpellsPool);
        break;
      }
    }

    // FRONTIÈRE D'EFFET. Les morts causées par CE mot-clé — et leurs râles
    // d'agonie, cascades comprises — sont réglées avant que le suivant ne
    // choisisse ses cibles. C'est la règle « Tempête 3 se résout entièrement
    // avant Déchainement » : sans elle, l'effet suivant travaille sur un
    // plateau jonché de cadavres à 0 PV (et `cataclysme` / `deferlement`, qui
    // itèrent le plateau sans filtre de vie, les frappent).
    settleSpellDeaths(ctx);
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

function resolveAtomicEffect(ctx: SpellResolutionContext, rawEffect: AtomicEffect): void {
  // Chant majore les amplitudes ici plutôt qu'au fil des ~20 `case` : une copie
  // boostée en tête, et tout le corps en dessous reste inchangé. Ce chemin
  // n'est atteint que depuis la phase 2 d'un sort, jamais par une créature.
  const effect: AtomicEffect = chantBonus > 0
    ? {
      ...rawEffect,
      amount: chanted(rawEffect.type, rawEffect.amount),
      attack: chanted(rawEffect.type, rawEffect.attack),
      health: chanted(rawEffect.type, rawEffect.health),
    }
    : rawEffect;
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
        if (target) dealDamageToCreature(target, amount, false, true, ctx.caster.hero);
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
        discardFromHand(ctx.opponent, Math.floor(rng() * ctx.opponent.hand.length), [ctx.caster, ctx.opponent]);
      }
      break;
    }
    case "grant_keyword": {
      if (targetId && effect.keyword) {
        const target = findCreatureOnBoard(ctx.caster, targetId) ?? findCreatureOnBoard(ctx.opponent, targetId);
        if (target) {
          // Don PONCTUEL : passe par le chemin commun pour réarmer les
          // capacités à usage (Ombre révélée, esquive dépensée…) au lieu de
          // ne poser que le mot-clé.
          applyGrantedKeyword(target, effect.keyword, undefined, true);
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
        // Prefer id-based lookup; race lookup is legacy fallback.
        const tmpl = findTokenTemplate(effect.tokenId) ?? findTokenTemplateByRace(effect.race);
        const resolvedRace = tmpl?.race ?? effect.race;
        let tokenCard: Card = {
          id: -1, name: resolvedRace ? `Token ${resolvedRace}` : "Token",
          mana_cost: 0, card_type: "creature",
          attack: effect.attack ?? 1, health: effect.health ?? 1,
          effect_text: "",
          keywords: [], spell_keywords: null, spell_effects: null, image_url: null,
          race: resolvedRace,
        };
        tokenCard = applyTokenTemplate(tokenCard, tmpl);
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
        // Alignement sur Exhumation : une créature ramenée du cimetière garde
        // sa Traque et peut donc attaquer dès son retour.
        creature.hasSummoningSickness = !hasKw(creature, "charge");
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
            target.trueOwnerId = ctx.opponent.id;
            resetTurnStateForNewController(target);
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
            // Strip keyword_instances (tap/death powers, conferred scopes) AND
            // the unified `capabilities` (composed/backfilled abilities) so a
            // transformed creature truly loses all its abilities.
            keywords: [],
            keyword_instances: null,
            capabilities: null,
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
              triggerReturnToHand(target, owner, ownerIsPlayer ? ctx.opponent : ctx.caster);
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

  // From spell keywords — l'index `kw_${i}` doit rester aligné sur l'ordre de
  // résolution (cf. spellResolutionInstances).
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

  // Conferred creature keywords with single-target scope need one allied
  // creature to receive them. A single shared slot serves every such keyword
  // on the spell (all target-scope grants land on the same chosen ally).
  if (card.card_type === "spell" && card.keywords?.length) {
    const needsGrantTarget = card.keywords.some((kw) => {
      // Un mot-clé "ombre" (ex. convocations_multiples) dont la version sort
      // est présente dans spell_keywords (invocation_multiple) n'est PAS conféré
      // à un allié — son effet passe par le sort. Il ne réclame donc pas de cible.
      if (isCreatureKwShadowedBySpell(kw, card.spell_keywords)) return false;
      const inst = card.keyword_instances?.find((k) => k.id === kw);
      return (inst?.grantScope ?? "target") === "target";
    });
    if (needsGrantTarget) {
      slots.push({ slot: "grant_target", type: "friendly_creature", label: "Cible du don" });
    }
  }

  // Effets composés à la résolution, en désignation "au choix" et count = 1.
  // Le slot est clé sur le uid de la capacité (lu par runComposedCapsForCard).
  // v1 : ciblage in-game limité au plateau / héros (le multi-cibles et les autres
  // zones suivront). Les désignations "hasard"/"toutes" ne réclament aucun slot.
  for (const cap of getCapabilities(card)) {
    const t = cap.composed?.target;
    if (!cap.composed || cap.trigger !== "spell_resolution" || !t) continue;
    if (t.designation !== "choice" || typeof t.count !== "number") continue; // "all"/hasard → pas de slot
    const type = composedSlotType(t);
    if (!type) continue;
    const n = Math.max(1, t.count);
    for (let i = 0; i < n; i++) {
      slots.push({ slot: `${cap.uid}#${i}`, type, label: n > 1 ? `Cible ${i + 1} (effet composé)` : "Cible (effet composé)" });
    }
  }

  return slots;
}

/** Mappe un TargetSpec (choix, count 1) vers un SpellTargetType pour le picker
 *  in-game. Retourne undefined si non ciblable en v1 (zone ≠ plateau pour les
 *  unités). */
function composedSlotType(t: import("./types").TargetSpec): SpellTargetType | undefined {
  if (t.entity === "self") return undefined; // déterministe (la source) → aucun picker
  if (t.entity === "hero") return t.side === "ally" ? "friendly_hero" : "enemy_hero";
  // "both" : héros OU unité. Side-aware — un effet OFFENSIF (side "enemy") ne
  // doit proposer QUE le camp ennemi (unité + héros ennemi), jamais ses propres
  // unités / son propre héros (sinon auto-dégâts au clic). Idem côté allié.
  // Sans side précisé → "any" (les deux camps, comportement historique).
  if (t.entity === "both") {
    return t.side === "enemy" ? "enemy_any"
         : t.side === "ally" ? "friendly_any"
         : "any";
  }
  // Exhumation composée : cible une créature du cimetière ALLIÉ (résurrection) →
  // picker cimetière existant. Cimetière ennemi non pris en charge.
  if (t.location === "graveyard") {
    return t.entity === "unit" && t.side === "ally" ? "friendly_graveyard_to_board" : undefined;
  }
  if (t.location !== "board") return undefined;
  return t.side === "ally" ? "friendly_creature" : t.side === "enemy" ? "enemy_creature" : "any_creature";
}

// ============================================================
// ATTACK
// ============================================================

export function attack(state: GameState, action: AttackAction): GameState {
  const pool = state.factionCardPool;
  const allPool = state.allSpellsPool;
  const newState = cloneStateForAction(state);
  newState.factionCardPool = pool;
  newState.allSpellsPool = allPool;
  const player = newState.players[newState.currentPlayerIndex];
  const opponent = newState.players[newState.currentPlayerIndex === 0 ? 1 : 0];

  const attacker = player.board.find(c => c.instanceId === action.attackerInstanceId);
  if (!attacker) return state;
  if (attacker.attacksRemaining <= 0) return state;
  // Tapped via a tap-mode keyword this turn → no attack allowed.
  if (attacker.tapped) return state;
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
  // Une Provocation TAPIE dans l'ombre ne provoque pas : elle est intargetable
  // tant qu'elle ne s'est pas révélée, si bien qu'elle interdisait toute
  // attaque — ni sur elle (intargetable), ni ailleurs (sa provocation
  // couvrait le reste). Situation de blocage total ; elle n'entre donc dans le
  // calcul qu'une fois sortie de l'ombre.
  const relevantTaunts = attackerFlies
    ? []
    : opponent.board.filter(c => hasKw(c, "taunt") && !isHiddenShadow(c));
  if (relevantTaunts.length > 0) {
    if (effectiveTarget === "enemy_hero") return state;
    const target = opponent.board.find(c => c.instanceId === effectiveTarget);
    if (target && !relevantTaunts.includes(target)) return state;
  }

  // Ombre: reveal stealth when attacking
  if (hasKw(attacker, "ombre")) {
    attacker.ombreRevealed = true;
  }

  // Validate a creature target exists BEFORE firing any on-attack power, so an
  // invalid attack stays a no-op — returning `state` AFTER the power would
  // discard the power's effects.
  if (effectiveTarget !== "enemy_hero" && !opponent.board.find(c => c.instanceId === effectiveTarget)) {
    return state;
  }

  // "À l'attaque" : les pouvoirs COMPOSÉS et les mots-clés CURÉS (mode "attack")
  // se résolvent AVANT les dégâts de combat. On snapshot l'état intermédiaire
  // (post-pouvoir / pré-combat) pour la 1re vague d'animation du store — APRÈS
  // les deux, sinon un buff curé tomberait dans la vague de combat et son popup
  // s'animerait EN MÊME TEMPS QUE / APRÈS les dégâts au lieu d'avant.
  const hasCuratedAttack = (attacker.card.keyword_instances ?? []).some(i => i.mode === "attack");
  if (hasOnAttackComposed(attacker.card) || hasCuratedAttack) {
    // Pouvoirs composés "à l'attaque". Les cibles choisies voyagent dans
    // action.targetMap. Double Attaque frappe deux fois "dans" la même attaque :
    // l'effet composé se déclenche une fois par frappe (ex. Commandant des
    // Griffes : +1/+1 → +2/+2 avec Double Attaque) ; on snapshot une seule fois.
    if (hasOnAttackComposed(attacker.card)) {
      const onAttackTriggers = hasKw(attacker, "double_attaque") ? 2 : 1;
      for (let t = 0; t < onAttackTriggers; t++) {
        // L'effet a pu tuer l'attaquant lui-même (AoE) → ne pas re-déclencher.
        if (!player.board.find(c => c.instanceId === attacker.instanceId)) break;
        runComposedCapsForCard(attacker.card, "on_attack", attacker, player, opponent, action.targetMap);
        const pDeadPow = cleanDeadCreatures(player);
        const oDeadPow = cleanDeadCreatures(opponent);
        processDeathTriggers(pDeadPow, player, opponent);
        processDeathTriggers(oDeadPow, opponent, player);
        recalculateAuras(player, opponent);
      }
    }

    // Mots-clés CURÉS "à l'attaque" (instances mode "attack"), appliqués AVANT le
    // snapshot pour s'animer dans la 1re vague comme les pouvoirs composés (ex.
    // Renforcement/Entrainement en mode attaque). Miroir de la boucle fin-de-tour.
    if (hasCuratedAttack && player.board.find(c => c.instanceId === attacker.instanceId)) {
      for (const inst of attacker.card.keyword_instances ?? []) {
        if (inst.mode !== "attack") continue;
        resolveCuratedKeywordEffect(inst.id, inst.x ?? 1, attacker, player, opponent, undefined, inst);
      }
      const pDeadAtk = cleanDeadCreatures(player);
      const oDeadAtk = cleanDeadCreatures(opponent);
      if (pDeadAtk.length || oDeadAtk.length) {
        processDeathTriggers(pDeadAtk, player, opponent);
        processDeathTriggers(oDeadAtk, opponent, player);
        recalculateAuras(player, opponent);
      }
    }

    // Snapshot for wave 1 — pools stripped (the store diffs boards only).
    const fp = newState.factionCardPool, ap = newState.allSpellsPool;
    newState.factionCardPool = undefined; newState.allSpellsPool = undefined;
    newState.onAttackWave = { intermediate: deepClone(newState) };
    newState.factionCardPool = fp; newState.allSpellsPool = ap;
    // Power could have killed the attacker itself (e.g. an AoE it's caught in)
    // → no combat, finalize.
    if (!player.board.find(c => c.instanceId === attacker.instanceId)) {
      newState.lastAction = action;
      checkWinCondition(newState);
      return newState;
    }
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
      [...opponent.board].forEach(c => dealDamageToCreature(c, fireX, false, false, attacker));
    }

    dealDamageToHero(opponent.hero, attackPower, attacker);
    // Double Attaque: second hit (mirrors the creature combat path).
    if (hasKw(attacker, "double_attaque")) {
      dealDamageToHero(opponent.hero, attackPower, attacker);
    }

    // Drain de vie : plus de bloc dédié ici — centralisé dans dealDamageToHero
    // via la source passée ci-dessus. Double Attaque le double naturellement
    // (deux frappes = deux soins), sans multiplication explicite.

    // Augure: piochez une carte quand dégâts au héros adverse
    if (hasKw(attacker, "augure")) {
      drawCard(player);
    }

    // Persécution X: dégâts bonus au héros adverse
    if (hasKw(attacker, "persecution") && attacker.persecutionX > 0) {
      dealDamageToHero(opponent.hero, attacker.persecutionX, attacker);
    }

    attacker.attacksRemaining--;
    attacker.targetsAttackedThisTurn.push(effectiveTarget);
    attacker.hasAttacked = attacker.attacksRemaining <= 0;
    // Tap only when no attack left this turn — Célérité needs to remain
    // untapped between its two attacks.
    attacker.tapped = attacker.attacksRemaining <= 0;

  } else {
    const target = opponent.board.find(c => c.instanceId === effectiveTarget);
    if (!target) {
      // The on-attack power killed/removed the defender before combat. The
      // target existed at the start (validated above), so this only happens
      // post-power → the attack whiffs but the attacker is still spent.
      attacker.attacksRemaining--;
      attacker.targetsAttackedThisTurn.push(effectiveTarget);
      attacker.hasAttacked = attacker.attacksRemaining <= 0;
      attacker.tapped = attacker.attacksRemaining <= 0;
      newState.lastAction = action;
      checkWinCondition(newState);
      return newState;
    }

    // Esquive: évite automatiquement la 1re attaque chaque tour
    if (hasKw(target, "esquive") && !target.esquiveUsedThisTurn) {
      target.esquiveUsedThisTurn = true;
      attacker.attacksRemaining--;
      attacker.targetsAttackedThisTurn.push(effectiveTarget);
      attacker.hasAttacked = attacker.attacksRemaining <= 0;
      attacker.tapped = attacker.attacksRemaining <= 0;
      newState.lastAction = action;
      return newState;
    }

    const attackerHasPrecision = hasKw(attacker, "precision");

    // Première Frappe: attacker deals damage first; target only
    // retaliates if it survives. Double Attaque is NOT first-strike
    // anymore — it just doubles the attacker's damage in normal
    // simultaneous-exchange timing (the target still gets to riposte).
    const hasFirstStrike = hasKw(attacker, "premiere_frappe");
    const hasDoubleAttack = hasKw(attacker, "double_attaque");

    // Piétinement: les dégâts excédentaires (au-delà des PV restants de la
    // cible) sont reportés sur le héros adverse. On capture les PV avant
    // dégâts pour calculer le surplus après que dealDamageToCreature a
    // appliqué Bouclier / Résistance / Armure (un Bouclier absorbe tout :
    // pas de surplus, conforme à l'esprit du keyword).
    const attackerHasTrample = hasKw(attacker, "pietinement");

    if (hasFirstStrike) {
      const targetHpBefore = target.currentHealth;
      dealDamageToCreature(target, attackPower, attackerHasPrecision, false, attacker, undefined, true);

      if (attackerHasTrample && target.currentHealth < 0 && targetHpBefore > 0) {
        dealDamageToHero(opponent.hero, -target.currentHealth, attacker);
      }

      // Apply poison from attacker
      if (hasKw(attacker, "poison") && target.currentHealth > 0) {
        target.isPoisoned = true;
      }
      // Apply paralysie from attacker
      if (hasKw(attacker, "paralysie") && target.currentHealth > 0) {
        target.isParalyzed = true;
      }

      // If target survived, it retaliates. NB : Première Frappe est séquentielle
      // par définition — si la cible a gagné une Gloire en encaissant le premier
      // coup, elle riposte donc avec son ATK déjà buffée. C'est voulu : c'est le
      // prix de frapper une unité qui grandit en survivant.
      if (target.currentHealth > 0) {
        dealDamageToCreature(attacker, target.currentAttack, false, false, target, undefined, true);
        if (hasKw(target, "poison") && attacker.currentHealth > 0) {
          attacker.isPoisoned = true;
        }
        if (hasKw(target, "paralysie") && attacker.currentHealth > 0) {
          attacker.isParalyzed = true;
        }
      }
    } else {
      // Simultaneous damage. Double Attaque doubles the attacker's
      // damage; the retaliation is unchanged.
      const finalAttackPower = hasDoubleAttack ? attackPower * 2 : attackPower;
      const targetHpBefore = target.currentHealth;
      // Riposte figée AVANT les dégâts : l'échange est simultané, la cible ne
      // doit donc pas riposter avec une ATK gonflée par la Gloire qu'elle vient
      // de gagner en survivant à ce même coup.
      const retaliationPower = target.currentAttack;
      dealDamageToCreature(target, finalAttackPower, attackerHasPrecision, false, attacker, undefined, true);

      if (attackerHasTrample && target.currentHealth < 0 && targetHpBefore > 0) {
        dealDamageToHero(opponent.hero, -target.currentHealth, attacker);
      }

      dealDamageToCreature(attacker, retaliationPower, hasKw(target, "precision"), false, target, undefined, true);

      // Poison application
      if (hasKw(attacker, "poison") && target.currentHealth > 0) target.isPoisoned = true;
      if (hasKw(target, "poison") && attacker.currentHealth > 0) attacker.isPoisoned = true;
      // Paralysie application
      if (hasKw(attacker, "paralysie") && target.currentHealth > 0) target.isParalyzed = true;
      if (hasKw(target, "paralysie") && attacker.currentHealth > 0) attacker.isParalyzed = true;
    }

    // Souffle de feu X: X dégâts à toutes les unités ennemies (cible incluse,
    // en plus des dégâts de combat — cohérent avec le bloc "attaque héros"
    // et avec la description abilities.ts: "toutes les unités ennemies").
    if (hasKw(attacker, "souffle_de_feu")) {
      const fireXVals = parseXValuesFromEffectText(attacker.card.effect_text);
      const fireX = fireXVals["souffle_de_feu"] || Math.max(1, Math.floor(attacker.card.mana_cost / 2));
      [...opponent.board].forEach(c => dealDamageToCreature(c, fireX, false, false, attacker));
    }

    // Drain de vie (attaquant ET défenseur) : plus de bloc dédié ici — les deux
    // sont centralisés dans dealDamageToCreature, qui reçoit déjà `attacker`
    // puis `target` comme source des deux volets de l'échange. Le soin porte
    // désormais sur les dégâts NETS (après Bouclier / Résistance / Armure) et
    // non plus sur l'ATK brute.

    // Liaison de vie: damage taken shared with enemy hero
    if (hasKw(target, "liaison_de_vie")) {
      dealDamageToHero(player.hero, attackPower, target);
    }

    // Riposte X : désormais centralisée dans dealDamageToCreature (déclenchée
    // par TOUTE source de dégât, pas seulement le combat) — cf. la passe de
    // `source` aux appels de combat ci-dessus. Plus de bloc dédié ici pour
    // éviter un double déclenchement.

    // Fureur: après avoir subi des dégâts en combat, la créature lance une
    // attaque supplémentaire sur une unité adverse aléatoire (héros si plus
    // aucune unité). C'est un vrai échange — la victime riposte aussi —
    // pour que Fureur reste un effet risqué et pas un coup gratuit. Le
    // flag fureurActive borne le trigger à une fois par tour (reset en
    // endTurn). Pas de bonus d'ATK persistant côté Fureur elle-même : c'est
    // Gloire qui récompense la survie à ces échanges (+X/+Y permanent).
    // Defender side: chain hits enemies on the attacker's board.
    const playerHeroIdx = newState.players.indexOf(player);
    runFureurChain(target, player.board, player.hero, `__hero_${playerHeroIdx}__`, null, newState);
    // Attacker side: first strike excludes the original combat target
    // ("attaque une AUTRE créature"); subsequent strikes pick any live enemy.
    const opponentHeroIdx = newState.players.indexOf(opponent);
    runFureurChain(attacker, opponent.board, opponent.hero, `__hero_${opponentHeroIdx}__`, target.instanceId, newState);

    // Augure: if attacker hits hero (doesn't apply in creature combat)
    // Persécution X: X dégâts au héros adverse on each attack
    if (hasKw(attacker, "persecution") && attacker.persecutionX > 0) {
      dealDamageToHero(opponent.hero, attacker.persecutionX, attacker);
    }

    attacker.attacksRemaining--;
    attacker.targetsAttackedThisTurn.push(effectiveTarget);
    attacker.hasAttacked = attacker.attacksRemaining <= 0;
    attacker.tapped = attacker.attacksRemaining <= 0;
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

/**
 * Resolve a Fureur trigger as a chain: while the Fureur creature is alive,
 * strike a random live enemy, take its retaliation, and repeat. Falls back
 * to a single hero hit (no retaliation, chain ends) when the enemy board is
 * empty. Each strike is recorded on `state.fureurStrikes` so the store can
 * sequence one attack-lunge per hit. `initialExcludeId` skips a creature on
 * the first iteration only — used by the attacker side so the first Fureur
 * strike picks a DIFFERENT unit than the one just attacked.
 */
function runFureurChain(
  creature: CardInstance,
  enemyBoard: CardInstance[],
  enemyHero: import("./types").HeroState,
  enemyHeroSentinel: string,
  initialExcludeId: string | null,
  state: GameState,
): void {
  if (!hasKw(creature, "fureur")) return;
  if (creature.fureurActive) return;
  if (creature.currentHealth <= 0) return;
  creature.fureurActive = true;
  const MAX_FUREUR_CHAIN = 20;
  let iteration = 0;
  while (creature.currentHealth > 0 && iteration < MAX_FUREUR_CHAIN) {
    const exclude = iteration === 0 ? initialExcludeId : null;
    const enemies = enemyBoard.filter(c => c.currentHealth > 0 && c.instanceId !== exclude);
    if (enemies.length === 0) {
      // Hero hit terminates the chain (no retaliation possible).
      dealDamageToHero(enemyHero, creature.currentAttack, creature);
      (state.fureurStrikes ??= []).push({
        attackerInstanceId: creature.instanceId,
        victimInstanceId: enemyHeroSentinel,
      });
      break;
    }
    const victim = enemies[Math.floor(rng() * enemies.length)];
    // Assaut Fureur = vrai échange de combat (il nourrit donc Gloire), et lui
    // aussi simultané : la riposte est figée avant les dégâts.
    const victimRetaliation = victim.currentAttack;
    dealDamageToCreature(victim, creature.currentAttack, false, false, creature, undefined, true);
    if (creature.currentHealth > 0 && victimRetaliation > 0) {
      dealDamageToCreature(creature, victimRetaliation, false, false, victim, undefined, true);
    }
    (state.fureurStrikes ??= []).push({
      attackerInstanceId: creature.instanceId,
      victimInstanceId: victim.instanceId,
    });
    iteration++;
  }
}

/** Clone d'entrée de handler. Identique au `deepClone` qu'il remplace (les
 *  pools de cartes sont écartés : volumineux, immuables, relus du state
 *  d'origine), mais publie en plus le plateau cloné dans `currentBoardPlayers`.
 *  C'est le seul point où cette référence est posée — elle pointe donc toujours
 *  sur les objets RÉELLEMENT mutés par l'action en cours. */
function cloneStateForAction(state: GameState): GameState {
  const next = deepClone({ ...state, factionCardPool: undefined, allSpellsPool: undefined } as GameState);
  currentBoardPlayers = next.players;
  return next;
}

/** Camp dont le cimetière est visé par Incinération.
 *
 *  La cible désigne un CAMP, pas une carte : on vise une unité ou un héros, et
 *  c'est le cimetière de son contrôleur qui est recyclé. Ça évite d'inventer un
 *  type de ciblage « cimetière adverse » que le moteur ne connaît pas, tout en
 *  laissant le choix des deux camps demandé par la règle.
 *  Sans cible exploitable, on vise l'ADVERSAIRE : c'est l'usage offensif, et le
 *  repli le moins surprenant pour un effet non ciblé (sort relancé, mode mort). */
function incinerationVictim(
  targetId: string | undefined,
  controller: PlayerState,
  other: PlayerState,
): PlayerState {
  if (!targetId) return other;
  if (targetId === "friendly_hero") return controller;
  if (targetId === "enemy_hero") return other;
  if (findCreatureOnBoard(controller, targetId)) return controller;
  if (findCreatureOnBoard(other, targetId)) return other;
  return other;
}

/** INCINÉRATION X — renvoie X cartes prises AU HASARD dans le cimetière de
 *  `victim` sous SON deck, dans un ordre lui aussi aléatoire.
 *
 *  Le tirage passe par `rng()` (flux partagé et sérialisé dans l'état) et non
 *  par un PRNG local : contrairement aux offres de Sélection, cet effet est
 *  résolu DANS `applyAction`, donc les deux clients consomment la même graine
 *  au même moment. */
function resolveIncineration(victim: PlayerState, x: number): void {
  if (x <= 0 || victim.graveyard.length === 0) return;
  const count = Math.min(x, victim.graveyard.length);
  const picked: CardInstance[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * victim.graveyard.length);
    picked.push(victim.graveyard.splice(idx, 1)[0]);
  }
  // Les cartes recyclées repartent « neuves » : sans cette remise à zéro, une
  // créature repiochée traînerait ses dégâts et ses bonus de la partie d'avant.
  for (const inst of picked) returnInstanceToPlay(inst);
  shuffleArray(picked);
  victim.deck.push(...picked);
}

/** Camp propriétaire du CIMETIÈRE où se trouve `id`.
 *
 *  `incinerationVictim` ne sait lire que le plateau et les sentinelles de héros :
 *  une cible désignée dans un cimetière lui est invisible et retombait sur son
 *  repli « adversaire ». */
function graveyardOwnerOf(
  id: string | undefined,
  a: PlayerState,
  b: PlayerState,
): PlayerState | null {
  if (!id) return null;
  if (a.graveyard.some(c => c.instanceId === id)) return a;
  if (b.graveyard.some(c => c.instanceId === id)) return b;
  return null;
}

/** INCINÉRATION X, forme DÉSIGNÉE — renvoie sous le deck les cartes que le
 *  joueur a lui-même cliquées dans le cimetière, et elles seules.
 *
 *  Aucun complément au hasard si le joueur en désigne moins que X : c'est la
 *  convention déjà retenue pour les autres contenus à cibles multiples (une
 *  désignation partielle vaut renoncement, pas tirage). L'ordre d'arrivée sous
 *  le deck reste mélangé pour ne pas divulguer l'ordre des clics. */
function resolveIncinerationChosen(
  victim: PlayerState,
  ids: string[],
  x: number,
): void {
  if (x <= 0) return;
  const picked: CardInstance[] = [];
  for (const id of ids.slice(0, x)) {
    const idx = victim.graveyard.findIndex(c => c.instanceId === id);
    if (idx >= 0) picked.push(victim.graveyard.splice(idx, 1)[0]);
  }
  if (picked.length === 0) return;
  for (const inst of picked) returnInstanceToPlay(inst);
  shuffleArray(picked);
  victim.deck.push(...picked);
}

/** RETOUR DIFFÉRÉ — place l'unité ciblée sous le deck de son PROPRIÉTAIRE.
 *
 *  Même parenté que Remontée (dont il reprend les règles de ciblage et
 *  l'immunité Transcendance côté sort), mais la destination est le dessous du
 *  deck et non la main : le propriétaire la reverra, beaucoup plus tard. */
function resolveRetourDiffere(
  targetInstanceId: string | undefined,
  sourceInstanceId: string | null,
  controller: PlayerState,
  other: PlayerState,
  sourceIsSpell = false,
): void {
  let target: CardInstance | undefined;
  if (targetInstanceId) {
    const cand = findCreatureOnBoard(controller, targetInstanceId)
      ?? findCreatureOnBoard(other, targetInstanceId);
    if (cand && canBeRemonteed(cand, sourceInstanceId, sourceIsSpell)) target = cand;
  } else {
    // Sans cible explicite (sort relancé, mode attaque) : tirage au sort, comme
    // Remontée — le flux synchrone ne peut pas ouvrir de picker.
    const pool = [...controller.board, ...other.board]
      .filter(c => canBeRemonteed(c, sourceInstanceId, sourceIsSpell));
    if (pool.length > 0) target = pool[Math.floor(rng() * pool.length)];
  }
  if (!target) return;

  const holder = controller.board.includes(target) ? controller : other;
  holder.board = holder.board.filter(c => c !== target);
  // Propriétaire d'origine lu AVANT returnInstanceToPlay, qui efface trueOwnerId
  // (une unité volée par Domination retourne dans SON deck, pas celui du voleur).
  const owner = target.trueOwnerId
    ? ([controller, other].find(p => p.id === target!.trueOwnerId) ?? holder)
    : holder;
  returnInstanceToPlay(target);
  target.instanceId = generateInstanceId();
  owner.deck.push(target);
}

/** CREUSER X — regarde les X cartes du DESSOUS du deck et en remonte une sur le
 *  dessus ; les autres retournent au fond dans leur ordre initial.
 *
 *  `choiceIndex` indexe la tranche révélée (du haut de la liste affichée vers
 *  le bas), pas le deck : deux exemplaires d'une même carte restent donc
 *  distinguables, là où un id de carte serait ambigu. */
function resolveCreuser(player: PlayerState, x: number, choiceIndex: number | undefined): void {
  if (x <= 0 || player.deck.length === 0) return;
  const count = Math.min(x, player.deck.length);
  const bottom = player.deck.splice(player.deck.length - count, count);
  const idx = Math.min(Math.max(0, choiceIndex ?? 0), bottom.length - 1);
  const chosen = bottom[idx];
  for (let i = 0; i < bottom.length; i++) {
    if (i !== idx) player.deck.push(bottom[i]); // les autres repartent au fond
  }
  player.deck.unshift(chosen); // la carte choisie passe sur le dessus
}

/** DÉVORATION — détruit l'unité ciblée ; la source absorbe définitivement son
 *  ATK et ses PV.
 *
 *  Les stats absorbées sont les stats COURANTES de la victime (buffs compris) :
 *  c'est ce que le joueur voit sur la carte au moment de dévorer. */
function resolveDevoration(
  source: CardInstance,
  targetInstanceId: string | undefined,
  controller: PlayerState,
  other: PlayerState,
): void {
  let target: CardInstance | undefined;
  if (targetInstanceId) {
    target = findCreatureOnBoard(controller, targetInstanceId)
      ?? findCreatureOnBoard(other, targetInstanceId);
  } else {
    // Repli sans cible désignée (râle d'agonie, attaque, tour adverse) : ENNEMIS
    // uniquement. Le joueur peut CHOISIR de dévorer son propre allié — sacrifier
    // une grosse unité pour en gonfler une autre est une option légitime — mais
    // un tirage au sort qui mange son propre camp n'est jamais voulu, et c'est
    // ce que faisait le pool à deux plateaux.
    const pool = other.board.filter(c => c !== source && c.currentHealth > 0);
    if (pool.length > 0) target = pool[Math.floor(rng() * pool.length)];
  }
  // On ne se dévore pas soi-même : le gain serait absurde et la source mourrait.
  if (!target || target === source) return;

  const gainedAtk = Math.max(0, target.currentAttack);
  const gainedHp = Math.max(0, target.currentHealth);
  // La victime meurt par mise à 0 des PV : elle passe donc par le traitement de
  // mort normal (râles d'agonie compris), au lieu d'être escamotée du plateau.
  target.currentHealth = 0;
  // Bonus SUIVIS, puis report immédiat sur les stats courantes. Le champ dédié
  // est indispensable : recalculateAuras rebâtit currentAttack depuis la base
  // et effacerait un simple `+=`, et persistentStats le rejoue lors des
  // changements de zone — c'est ce qui rend le gain réellement définitif.
  source.devorationATKBonus += gainedAtk;
  source.devorationPVBonus += gainedHp;
  source.currentAttack += gainedAtk;
  source.maxHealth += gainedHp;
  source.currentHealth += gainedHp;
}

/** Alimente le compteur d'Épargne d'un joueur, écrêté à MAX_EPARGNE.
 *
 *  `null` (jamais déclenchée) devient un nombre au premier appel : c'est ce
 *  passage qui fait APPARAÎTRE le compteur à l'écran, définitivement. Il ne
 *  redeviendra jamais `null`, même une fois dépensé.
 *
 *  Point d'entrée UNIQUE des trois chemins (mot-clé de créature, mot-clé de
 *  sort, effet composé) pour que l'écrêtage et la règle d'apparition ne
 *  puissent pas diverger entre eux. */
function addEpargne(player: PlayerState, x: number): void {
  if (x <= 0) return;
  player.epargne = Math.min(MAX_EPARGNE, (player.epargne ?? 0) + x);
}

/** Retrouve le contrôleur d'une instance dans l'état en cours de mutation.
 *  Le cimetière est inclus : un râle d'agonie (Maléfice, Carnage) est résolu
 *  alors que sa créature source y a DÉJÀ été déplacée. */
function findControllerOf(inst: CardInstance): PlayerState | undefined {
  return currentBoardPlayers.find(
    p => p.board.some(c => c.instanceId === inst.instanceId)
      || p.graveyard.some(c => c.instanceId === inst.instanceId)
  );
}

/** Drain de vie, centralisé : toute source qui BLESSE réellement une entité
 *  adverse soigne le héros de son contrôleur du montant réellement infligé.
 *
 *  Centralisé plutôt que réparti sur chaque capacité — même choix que Riposte —
 *  parce que le texte du mot-clé (« Soigne votre héros des dégâts infligés »)
 *  n'a jamais restreint au combat, alors que l'implémentation, elle, ne vivait
 *  que dans le flux d'attaque : Impact, Souffle de feu, Tempête, Carnage,
 *  Cataclysme et Maléfice ne soignaient rien.
 *
 *  Restriction au camp ADVERSE : sans elle, le coût de Douleur (la créature
 *  blesse SON propre héros à l'invocation) se rembourserait tout seul, et
 *  Cataclysme / Maléfice, qui frappent aussi les alliés, soigneraient pour les
 *  dégâts infligés à son propre camp. */
function applyLifesteal(
  source: CardInstance | import("./types").HeroState | null | undefined,
  victim: CardInstance | import("./types").HeroState,
  dealt: number,
): void {
  if (!source || dealt <= 0) return;
  // Un héros ne porte pas de mot-clé de créature.
  if (!("instanceId" in source)) return;
  if (source === victim) return;
  if (!hasKw(source, "drain_de_vie")) return;

  const owner = findControllerOf(source);
  if (!owner) return;
  if ("instanceId" in victim) {
    if (owner.board.some(c => c.instanceId === victim.instanceId)) return;
  } else if (owner.hero === victim) {
    return;
  }
  owner.hero.hp += dealt;
}

// `source` = ce qui inflige les dégâts. Optionnel : les sources sans agresseur
// (fatigue, effets qui écrivent directement les PV) ne le passent pas et ne
// déclenchent donc pas Drain de vie.
function dealDamageToHero(
  hero: import("./types").HeroState,
  damage: number,
  source?: CardInstance | import("./types").HeroState | null,
) {
  if (damage <= 0) return;
  // Seuil de colère, versant héros. Pas de garde `fromSpell` ici : cette
  // fonction n'en prend pas, et le compteur n'est non nul QUE pendant la
  // résolution d'un sort — les 28 autres sites d'appel (fatigue, Douleur,
  // Persécution, combat) sont hors de cette fenêtre.
  // Un râle d'agonie déclenché par le sort ne peut pas le voler non plus : les
  // morts ne sont réglées qu'aux frontières d'effet (settleSpellDeaths), donc
  // les dégâts du sort ont déjà consommé le bonus quand le râle part.
  if (wrathPending > 0) damage += consumeWrathBonus();
  if (hero.armor > 0) {
    if (hero.armor >= damage) {
      hero.armor -= damage;
      // Intégralement absorbé : aucun dégât infligé, donc rien à drainer.
      return;
    } else {
      damage -= hero.armor;
      hero.armor = 0;
    }
  }
  hero.hp -= damage;
  applyLifesteal(source, hero, damage);
}

// `source` = ce qui inflige les dégâts (unité OU héros). Optionnel : les sources
// sans agresseur vivant (poison, fatigue, effets qui écrivent directement les PV)
// ne le passent pas et ne déclenchent donc pas Riposte.
function dealDamageToCreature(
  creature: CardInstance,
  damage: number,
  ignoreDR = false,
  isSpellDamage = false,
  source?: CardInstance | import("./types").HeroState | null,
  // Transcendance = immunité aux SORTS uniquement. `isSpellDamage` sert aussi à
  // marquer les dégâts « non-combat » (capacités de créature composées, Maléfice,
  // Carnage…) pour qu'ils ignorent Indestructible/Armure — mais ceux-là NE sont
  // PAS des sorts et ne doivent donc pas être bloqués par Transcendance. Ce
  // drapeau distingue la vraie source-sort. undefined ⇒ on retombe sur
  // isSpellDamage (compat : les vrais sorts passent déjà isSpellDamage=true).
  fromSpell?: boolean,
  // Dégâts d'un VRAI échange de combat (attaque + riposte du défenseur, ou
  // assaut Fureur). Volontairement plus étroit que `!isSpellDamage` : les
  // capacités de créature (Souffle de feu, Carnage, Maléfice, Piétinement…)
  // ne sont ni des sorts ni du combat, et ne doivent donc pas nourrir Gloire.
  // Seuls les sites d'appel du flux d'attaque passent `true`.
  isCombatDamage = false,
) {
  if (damage <= 0) return;

  // Seuil de colère : le premier paquet de dégâts DU SORT emporte le bonus.
  // Garde `(fromSpell ?? isSpellDamage)`, le même idiome que Transcendance juste
  // en dessous : les dégâts de sort passent `isSpellDamage: true` sans préciser
  // `fromSpell`, tandis que les capacités de créature qui empruntent le canal
  // « sort » pour percer Armure/Indestructible (Carnage, Maléfice) passent
  // `fromSpell: false` — elles sont donc exclues, comme voulu.
  if ((fromSpell ?? isSpellDamage) && wrathPending > 0) {
    damage += consumeWrathBonus();
  }

  // Transcendance: immunité totale aux sorts (y compris zone), mais pas aux
  // capacités de créatures.
  if (hasKw(creature, "transcendance") && (fromSpell ?? isSpellDamage)) {
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
  damageLedgerSink.push({ targetInstanceId: creature.instanceId, amount: damage });

  // Touché mortel : la blessure est mortelle quels que soient les PV restants.
  // Placé APRÈS toutes les immunités et réductions — un Bouclier qui absorbe
  // tout, une Transcendance ou un Indestructible sortent plus haut sans dégât,
  // donc sans mort : il faut avoir été RÉELLEMENT blessé.
  if (creature.currentHealth > 0 && isLethalTouch(source, isSpellDamage)) {
    creature.currentHealth = 0;
  }

  // Gloire +X/+Y : l'unité qui encaisse des dégâts de COMBAT et y survit gagne
  // +X/+Y de façon permanente, cumulable à chaque survie. On se place après
  // toutes les réductions (Bouclier / Résistance / Armure) et après la
  // soustraction des PV : « survivre » se juge sur les dégâts réellement subis.
  // Un Bouclier qui absorbe tout ne déclenche donc rien — il n'y a pas eu de
  // blessure à surmonter.
  if (isCombatDamage && creature.currentHealth > 0 && hasKw(creature, "gloire")) {
    applyGloire(creature);
  }

  // Riposte X : dès que cette unité subit RÉELLEMENT des dégâts (on est passé
  // après Bouclier / Résistance / Armure / immunités), elle renvoie X dégâts à
  // la source de l'attaque — unité ou héros — quelle que soit son origine
  // (combat, sort, zone, râle d'agonie…). La contre-riposte est infligée SANS
  // source, donc elle ne peut pas re-déclencher une riposte : pas de boucle
  // riposte↔riposte. On ne se riposte jamais soi-même.
  if (source && source !== creature && hasKw(creature, "riposte") && creature.riposteX > 0) {
    if ("instanceId" in source) {
      dealDamageToCreature(source, creature.riposteX);
    } else {
      dealDamageToHero(source, creature.riposteX, creature);
    }
  }

  // Drain de vie : après toutes les réductions et la soustraction des PV, on
  // soigne du montant RÉELLEMENT infligé. Un Bouclier divin qui absorbe tout,
  // une Transcendance ou un Indestructible sortent plus haut sans dégât — donc
  // sans soin. Placé en dernier pour que `damage` soit la valeur nette.
  applyLifesteal(source, creature, damage);
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

// Déclencheur "retour en main" : quand une créature revient en main (renvoi
// depuis le plateau, Rappel/Résurrection depuis le cimetière), exécute les
// effets de ses mots-clés réglés sur le mode "return". Même patron que la
// boucle on-death de processDeathTriggers. À n'appeler que lorsque la créature
// atteint effectivement la main (le mode "return" perd son sens sinon).
function triggerReturnToHand(ci: CardInstance, owner: PlayerState, opponent: PlayerState) {
  if (ci.card.card_type !== "creature") return;
  for (const inst of ci.card.keyword_instances ?? []) {
    if (inst.mode === "return") {
      resolveCuratedKeywordEffect(inst.id, inst.x ?? 1, ci, owner, opponent, undefined, inst);
    }
  }
  // Effets composés au retour en main (modèle hybride).
  runComposedCapsForCard(ci.card, "on_return", ci, owner, opponent);

  // Règle générale : si un effet de retour (ex. auto-debuff d'Ombre
  // Insaisissable) a réduit la PV permanente à ≤0, la créature meurt pour de
  // bon — retirée de la main, envoyée au cimetière. On NE re-déclenche PAS
  // on_death (sinon boucle infinie self-bounce) : elle part silencieusement.
  // C'est le pendant « en main » des death-checks (cleanDeadCreatures) du
  // plateau, pour que la mort à 0 PV soit uniforme partout.
  if (persistentStats(ci).health <= 0 && owner.hand.includes(ci)) {
    owner.hand = owner.hand.filter(x => x !== ci);
    owner.graveyard.push(ci);
  }
}

// ── Remontée ──
// Une unité est « remontable » si elle n'est pas la source, pas Ancré, et
// ciblable (ni Invisible, ni Transcendance, ni Ombre non révélée).
// `sourceIsSpell` : Transcendance n'immunise que les sorts. Un renvoi en main
// (Remontée) déclenché par une capacité de créature peut donc viser une unité
// transcendante ; seul un sort la respecte. Défaut true (compat sûre).
function canBeRemonteed(c: CardInstance, sourceInstanceId: string | null, sourceIsSpell = true): boolean {
  return c.instanceId !== sourceInstanceId
    && !hasKw(c, "ancre")
    && !hasKw(c, "invisible")
    && (!sourceIsSpell || !hasKw(c, "transcendance"))
    && !(hasKw(c, "ombre") && !c.ombreRevealed);
}

// Auto-renvoi à la mort, exprimé par le modèle COMPOSÉ : une capacité « bounce » sur on_death
// ciblant la créature elle-même (entity "self") = « quand je meurs, je remonte
// en main » (cf. Ombre Insaisissable). Le chemin composé générique ne sait pas
// la résoudre (la source est déjà au cimetière et resolveRemontee exclut la
// source → no-op), d'où ce repérage explicite pour la router vers l'auto-renvoi.
function hasComposedSelfBounceOnDeath(c: CardInstance): boolean {
  return getCapabilities(c.card).some(cap =>
    cap.trigger === "on_death"
    && cap.composed?.content === "bounce"
    && cap.composed?.target?.entity === "self");
}

// La créature morte doit-elle se renvoyer ELLE-MÊME en main ?
//
// UNIQUEMENT via le modèle composé (bounce + entity "self" + on_death), qui
// dit explicitement « c'est MOI que je renvoie » — cf. Lame Revenante, Ombre
// Insaisissable. Le mot-clé curé `remontee` en mode mort, lui, signifie « à ma
// mort, je renvoie une créature CIBLÉE » : il ouvre un sélecteur
// (KW_PROMPTS.remontee, deferredKwTargetIds) et se résout au hasard quand la
// modale ne peut pas s'ouvrir.
//
// Les deux intentions partageaient ce test, et l'auto-renvoi passant en
// premier, il retirait la dépouille du cimetière avant que le sélecteur ne soit
// proposé : le Ronin Dévoué se remontait systématiquement lui-même au lieu de
// remonter la créature visée.
function wantsSelfReturnOnDeath(c: CardInstance): boolean {
  return hasComposedSelfBounceOnDeath(c);
}

// Auto-renvoi en main d'une créature morte porteuse d'une remontée/bounce en
// mode mort. La dépouille a transité par le cimetière (pour les comptages
// « morts ce tour » + triggers mort des autres) ; on l'en retire et on la
// pousse dans la main de son propriétaire d'origine, bonus permanents conservés
// (returnInstanceToPlay), soin complet. Comme Résurrection / Cycle éternel.
// Main pleine → la dépouille reste au cimetière (repli standard).
function returnDeadCreatureToHand(c: CardInstance, owner: PlayerState, enemy: PlayerState): void {
  // Propriétaire d'origine (trueOwnerId) à lire AVANT returnInstanceToPlay,
  // qui le remet à null. Sinon, détenteur courant du cimetière (owner).
  const realOwner = c.trueOwnerId
    ? ([owner, enemy].find(p => p.id === c.trueOwnerId) ?? owner)
    : owner;
  const realOwnerOpp = realOwner === owner ? enemy : owner;
  returnInstanceToPlay(c);
  c.instanceId = generateInstanceId();
  owner.graveyard = owner.graveyard.filter(g => g !== c);
  if (realOwner.hand.length < MAX_HAND_SIZE) {
    realOwner.hand.push(c);
    triggerReturnToHand(c, realOwner, realOwnerOpp);
  } else {
    realOwner.graveyard.push(c);
  }
}

// Cibles valides de Remontée (les 2 plateaux, hors source / Ancré / non-ciblable).
// Exporté pour l'UI (sélecteur du déclencheur interactif en attente).
export function remonteeTargetIds(controller: PlayerState, other: PlayerState, sourceInstanceId: string | null, sourceIsSpell = false): string[] {
  return [...controller.board, ...other.board]
    .filter(c => canBeRemonteed(c, sourceInstanceId, sourceIsSpell))
    .map(c => c.instanceId);
}

// Renvoie une unité du plateau dans la main de son propriétaire d'origine
// (trueOwnerId), sinon du contrôleur actuel. Cible explicite (invocation / tap /
// sort) ; en l'absence de cible (mort / retour), tirage aléatoire parmi les
// unités valides. Aucune cible valide → no-op (fizzle).
function resolveRemontee(
  targetInstanceId: string | undefined,
  sourceInstanceId: string | null,
  controller: PlayerState,
  other: PlayerState,
  // Transcendance n'immunise que des sorts : par défaut (capacité de créature)
  // une unité transcendante est renvoyable. Les sorts passent sourceIsSpell=true.
  sourceIsSpell = false,
): void {
  const sourceId = sourceInstanceId;
  let target: CardInstance | undefined;
  if (targetInstanceId) {
    const cand = findCreatureOnBoard(controller, targetInstanceId)
      ?? findCreatureOnBoard(other, targetInstanceId);
    if (cand && canBeRemonteed(cand, sourceId, sourceIsSpell)) target = cand;
  } else {
    const pool = [...controller.board, ...other.board].filter(c => canBeRemonteed(c, sourceId, sourceIsSpell));
    if (pool.length > 0) target = pool[Math.floor(rng() * pool.length)];
  }
  if (!target) return;
  moveBoardUnitToOwnerHand(target, controller, other);
}

/** Retire une unité du PLATEAU et la met dans la main de son propriétaire
 *  d'origine. Cœur commun de Remontée (cible désignée ou tirée) et de
 *  l'auto-renvoi `entity: "self"` — les deux ne diffèrent que par le CHOIX de la
 *  cible, jamais par le déplacement lui-même. */
function moveBoardUnitToOwnerHand(
  target: CardInstance,
  controller: PlayerState,
  other: PlayerState,
): void {
  const holder = controller.board.includes(target) ? controller : other;
  holder.board = holder.board.filter(c => c !== target);

  // Propriétaire d'origine (trueOwnerId), sinon le détenteur actuel. À lire
  // AVANT returnInstanceToPlay, qui remet trueOwnerId à null.
  const owner = target.trueOwnerId
    ? ([controller, other].find(p => p.id === target.trueOwnerId) ?? holder)
    : holder;
  const ownerOpponent = owner === controller ? other : controller;

  // Retour en main en CONSERVANT les bonus permanents accumulés (au lieu d'un
  // reset à la base) ; soin complet, états de tour réinitialisés, vol annulé.
  returnInstanceToPlay(target);

  if (owner.hand.length < MAX_HAND_SIZE) {
    owner.hand.push(target);
    triggerReturnToHand(target, owner, ownerOpponent);
  } else {
    owner.graveyard.push(target);
  }
}

/** AUTO-RENVOI depuis le plateau : « Se renvoie en main » (`bounce` + `entity:
 *  "self"`), pour tout déclencheur autre que la mort.
 *
 *  Ne passe PAS par `resolveRemontee`, qui exclurait la cible : `canBeRemonteed`
 *  écarte la source, ainsi qu'Ombre non révélée, Invisible et Transcendance. Ces
 *  garde-fous répondent à la question « une AUTRE carte peut-elle me viser ? »,
 *  qui n'a aucun sens quand la carte se vise elle-même — et la Louve kiptchake
 *  les cumulait (Ombre + auto-renvoi), donc échouait deux fois.
 *
 *  Ancré reste respecté : la capacité dit « je me renvoie », Ancré dit « je ne
 *  quitte pas le plateau » ; c'est la seule des cinq conditions qui porte sur le
 *  déplacement lui-même et non sur le ciblage par autrui. */
function resolveSelfBounce(
  self: CardInstance,
  controller: PlayerState,
  other: PlayerState,
): void {
  if (hasKw(self, "ancre")) return;
  if (!controller.board.includes(self) && !other.board.includes(self)) return;
  moveBoardUnitToOwnerHand(self, controller, other);
}

// Sacrifice démoniaque X : répartit X réductions de -1 mana parmi les Démons
// de la main du joueur. Chaque point est attribué à un Démon tiré aléatoirement
// (RNG seedé) PARMI ceux encore réductibles (coût effectif > 1), ce qui garantit
// qu'aucun Démon ne passe sous 1 mana et qu'aucun point n'est gaspillé tant
// qu'il reste à réduire. S'il n'y a plus de Démon réductible, le surplus de
// points est perdu. La réduction est permanente (persiste en main via
// manaCostReduction jusqu'à ce que le Démon soit joué).
function distributeDemonCostReductions(player: PlayerState, x: number) {
  for (let i = 0; i < x; i++) {
    const reducible = player.hand.filter(
      (c) =>
        c.card.race === "Démons" &&
        Math.max(0, getTokenManaCost(c.card) - (c.manaCostReduction ?? 0)) > 1,
    );
    if (reducible.length === 0) break;
    const target = reducible[Math.floor(rng() * reducible.length)];
    target.manaCostReduction = (target.manaCostReduction ?? 0) + 1;
  }
}

// ============================================================
// EFFECT STACK (LIFO) — résolution unifiée des déclencheurs
// ============================================================
// Pile d'effets LIFO unifiée (cf. plan maître). Les frames sont des données JSON
// pures (créatures réf. par instanceId, joueurs par id) pour survivre au
// deepClone et au snapshot multijoueur. `drainStack` résout en LIFO : un effet
// poussé pendant la résolution d'un autre se résout AVANT la reprise
// (interruption façon Magic). Migration incrémentale : à ce palier le cœur est
// en place mais aucun producteur ne pousse encore de frame (no-op).

const MAX_STACK_DEPTH = 64;

/** Localise une instance par id sur les 2 plateaux + cimetières + mains. La
 *  source d'une frame peut avoir changé de zone (mort, retour) depuis la poussée. */
function findInstanceById(state: GameState, instanceId: string): CardInstance | null {
  for (const p of state.players) {
    for (const zone of [p.board, p.graveyard, p.hand]) {
      const found = zone.find(c => c.instanceId === instanceId);
      if (found) return found;
    }
  }
  return null;
}

/** Une frame composée « au choix » suspend la pile si son contrôleur est le
 *  joueur actif, qu'aucune cible n'a encore été fixée et qu'au moins une cible
 *  est éligible. Sinon elle se résout immédiatement (repli déterministe/aléatoire
 *  de selectComposedTargets, ou tirage auto au tour adverse). */
function frameNeedsChoice(state: GameState, frame: StackFrame): boolean {
  if (frame.noSuspend) return false; // Déclenchement : ciblage déterministe, jamais d'UI
  if (frame.kind !== "composed" || !frame.composed) return false;
  if (frame.composed.target?.designation !== "choice") return false;
  if (frame.chosenTargetIds && frame.chosenTargetIds.length > 0) return false;
  const owner = state.players.find(p => p.id === frame.ownerId);
  const opponent = state.players.find(p => p.id !== frame.ownerId);
  if (!owner || !opponent) return false;
  if (owner.id !== currentPlayerId) return false; // tour adverse → résolution auto, pas d'UI
  return composedChoiceTargetIds(frame.composed.target, owner, opponent, frame.trigger === "spell_resolution").length > 0;
}

/** Contenus composés « auto-suppression » : sautés en mode valeur (Déclenchement
 *  rejoue le payoff sortant sans tuer/renvoyer la source). Cf. plan §7. */
function isSelfRemovalComposed(c: import("./types").ComposedEffect): boolean {
  if (c.target?.entity !== "self") return false;
  if (c.content === "bounce" || c.content === "destroy" || c.content === "deal_damage") return true;
  if (c.content === "debuff" && (c.magnitude?.y ?? 0) > 0) return true;
  return false;
}

/** Résout une frame (composée : chemin générique ; curated/death_nature : chemin
 *  abilityId). La source est re-localisée par id (peut être au cimetière). */
function resolveFrame(state: GameState, frame: StackFrame): void {
  const owner = state.players.find(p => p.id === frame.ownerId);
  const opponent = state.players.find(p => p.id !== frame.ownerId);
  if (!owner || !opponent) return;
  const source = frame.sourceInstanceId ? findInstanceById(state, frame.sourceInstanceId) : null;

  if (frame.kind === "composed" && frame.composed) {
    if (frame.valueMode && isSelfRemovalComposed(frame.composed)) return; // mode valeur : saute l'auto-suppression
    withComposedMode(triggerToKeywordMode(frame.trigger), () =>
      resolveComposedEffect(frame.composed!, source, owner, opponent, frame.chosenTargetIds, frame.trigger === "spell_resolution",
        { trigger: frame.trigger, capUid: frame.capUid, noSuspend: frame.noSuspend }));
    return;
  }
  // curated / death_nature : producteurs branchés aux paliers (c)/(g).
  if (frame.curatedKw && source) {
    resolveCuratedKeywordEffect(frame.curatedKw, frame.curatedX ?? 1, source, owner, opponent, undefined, frame.curatedInst);
  }
}

/** Nettoie les morts des 2 bords et réinjecte leurs déclencheurs de mort.
 *  Palier (a)/(b) : pont vers le système de mort existant (processDeathTriggers).
 *  Palier (c) : remplacé par une production de frames on_death sur la pile (ce
 *  qui ferme la fenêtre d'auras périmées et supprime le drop silencieux). */
function settleDeaths(state: GameState, _depth: number): void {
  const [p0, p1] = state.players;
  const d0 = cleanDeadCreatures(p0);
  const d1 = cleanDeadCreatures(p1);
  if (d0.length > 0) processDeathTriggers(d0, p0, p1);
  if (d1.length > 0) processDeathTriggers(d1, p1, p0);
}

/** Empile un lot de frames : `batch[0]` sera résolu EN PREMIER, et tout le lot
 *  avant ce qui est déjà sur la pile (primitive d'interruption LIFO). Applique
 *  la garde de profondeur unifiée : au dépassement, PAS de drop silencieux
 *  (corrige bug #1) — télémétrie + arrêt d'expansion de cette frame. */
function pushFrames(state: GameState, frames: StackFrame[]): void {
  if (frames.length === 0) return;
  const stack = (state.effectStack ??= []);
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i];
    if (f.depth > MAX_STACK_DEPTH) {
      console.warn("[effect-stack] profondeur max atteinte", { originTag: f.originTag, depth: f.depth });
      state.stackOverflowCount = (state.stackOverflowCount ?? 0) + 1;
      continue;
    }
    stack.push(f);
  }
}

/** Vide la pile en LIFO. Après CHAQUE frame : nettoyage des morts puis
 *  recalcul des auras (auras jamais périmées — corrige bug #2). Rend la main en
 *  laissant la frame au sommet si un choix joueur est requis : la pile suspendue
 *  persiste dans l'état (hashée + snapshotée), reprise par
 *  resolvePendingTrigger / autoResolvePendingTriggers. */
function drainStack(state: GameState, opts?: { fizzleUnresolvedChoices?: boolean }): void {
  const stack = state.effectStack;
  if (!stack || stack.length === 0) return;
  let iterations = 0;
  while (stack.length > 0) {
    if (++iterations > 10000) { // garde-fou ultime (ne devrait jamais se déclencher avec MAX_STACK_DEPTH)
      console.warn("[effect-stack] garde-fou d'itérations déclenché");
      break;
    }
    const top = stack[stack.length - 1];
    if (frameNeedsChoice(state, top)) {
      // Option B : à la fin du tour du propriétaire, un « au choix » resté sans
      // désignation (chrono expiré) NE fuite PAS au tour adverse — il fizzle.
      // On dépile la frame sans la résoudre ; les effets NON interactifs
      // éventuellement empilés en dessous se résolvent normalement.
      if (opts?.fizzleUnresolvedChoices) { stack.pop(); continue; }
      top.awaitingChoice = true;
      return;
    }
    stack.pop();
    resolveFrame(state, top);
    settleDeaths(state, top.depth);
    recalculateAuras(state.players[0], state.players[1]);
    // « Sous 15 PV » : une frame vient peut-être de faire franchir le seuil à
    // un héros — interruption LIFO avec profondeur héritée (garde unifiée).
    checkLowHpTriggers(state, top.depth + 1);
  }
  if (stack.length === 0) delete state.effectStack;
}

/** Construit les frames composées d'une carte pour un déclencheur donné. Reproduit
 *  le mapping `targetMap`/`fallbackTargetId` de `runComposedCapsForCard` (slots
 *  `${uid}#${i}` multi, `${uid}` simple) mais produit des frames de pile au lieu
 *  de résoudre inline. `sourceIdOverride` permet à Déclenchement de rejouer
 *  l'effet d'un allié avec une autre source. */
function buildComposedFrames(
  card: Card,
  trigger: import("./types").CapabilityTrigger,
  source: CardInstance | null,
  ownerId: string,
  targetMap?: Record<string, string>,
  fallbackTargetId?: string,
  opts?: { valueMode?: boolean; depth?: number; originTag?: string; sourceIdOverride?: string | null; noSuspend?: boolean },
): StackFrame[] {
  const frames: StackFrame[] = [];
  const sourceId = opts && "sourceIdOverride" in opts ? opts.sourceIdOverride ?? null : (source?.instanceId ?? null);
  const baseTag = opts?.originTag ?? `${sourceId}#${trigger}`;
  let seq = 0;
  for (const cap of getCapabilities(card)) {
    if (!cap.composed || cap.trigger !== trigger) continue;
    // Chemin pile LIFO : mêmes capacités, autre mécanique d'exécution.
    noteAbilitySfx(cap.abilityId, trigger);
    let chosen: string[] | undefined;
    if (targetMap) {
      const multi: string[] = [];
      for (let i = 0; targetMap[`${cap.uid}#${i}`] != null; i++) multi.push(targetMap[`${cap.uid}#${i}`]);
      if (multi.length) chosen = multi;
      else if (targetMap[cap.uid] != null) chosen = [targetMap[cap.uid]];
    }
    if (!chosen && fallbackTargetId) chosen = [fallbackTargetId];
    frames.push({
      frameId: `${sourceId}#${trigger}#${seq++}`,
      kind: "composed",
      ownerId,
      sourceInstanceId: sourceId,
      trigger,
      composed: cap.composed,
      capUid: cap.uid,
      chosenTargetIds: chosen,
      valueMode: opts?.valueMode,
      noSuspend: opts?.noSuspend,
      depth: opts?.depth ?? 0,
      originTag: baseTag,
    });
  }
  return frames;
}

/** Déclencheur « SOUS 15 PV » (on_low_hp / mode "low_hp") : balayage idempotent.
 *
 *  Pour chaque joueur encore vivant dont le héros est STRICTEMENT sous
 *  LOW_HP_TRIGGER_THRESHOLD, déclenche les cartes de SON plateau portant une
 *  capacité on_low_hp et pas encore parties (flag one-shot
 *  `CardInstance.lowHpTriggerFired`, jamais réarmé — même resoigné au-dessus
 *  du seuil, la capacité ne repart pas).
 *
 *  Balayage plutôt que détection de franchissement : le flag rend l'appel
 *  idempotent, donc deux points d'ancrage suffisent (fin d'applyAction + après
 *  chaque frame de drainStack) sans instrumenter les écritures de `hero.hp`
 *  une à une — et une carte posée alors que son contrôleur est DÉJÀ sous le
 *  seuil se déclenche au balayage suivant (règle voulue). Les deux seules
 *  écritures qui BAISSENT les PV (dealDamageToHero et le coût en vie de
 *  playCard) sont couvertes par ces deux points.
 *
 *  Le flag est posé AVANT résolution : un effet low_hp qui blesse son propre
 *  héros ne se re-déclenche pas. Les cascades (effet low_hp → dégâts → autre
 *  low_hp…) passent par la pile LIFO avec `depth` hérité, bornées par la garde
 *  unifiée MAX_STACK_DEPTH de pushFrames.
 *
 *  Ordre déterministe entre clients : joueurs dans l'ordre du tableau
 *  `players`, plateau de gauche à droite. Le ciblage suit la règle commune :
 *  tour du contrôleur → choix différé (frameNeedsChoice / deferOrRandomTarget),
 *  tour adverse → cible aléatoire (rng semée). */
function checkLowHpTriggers(state: GameState, depth = 0): void {
  if (state.phase === "finished" || state.winner) return;
  for (const p of state.players) {
    // Héros mort : checkWinCondition tranche, pas de « dernier souffle » à 0 PV.
    if (p.hero.hp <= 0 || p.hero.hp >= LOW_HP_TRIGGER_THRESHOLD) continue;
    const frames: StackFrame[] = [];
    for (const ci of p.board) {
      if (ci.lowHpTriggerFired) continue;
      const insts = (ci.card.keyword_instances ?? []).filter(k => k.mode === "low_hp");
      const hasComposed = getCapabilities(ci.card).some(c => c.composed && c.trigger === "on_low_hp");
      if (insts.length === 0 && !hasComposed) continue;
      ci.lowHpTriggerFired = true; // AVANT résolution (anti ré-entrance)
      frames.push(...buildComposedFrames(ci.card, "on_low_hp", ci, p.id, undefined, undefined, { depth }));
      // Mots-clés curés en mode "low_hp" : une frame par instance.
      // resolveCuratedKeywordEffect (via resolveFrame) gère bruitage et
      // ciblage différé/aléatoire (deferOrRandomTarget).
      let seq = 0;
      for (const inst of insts) {
        frames.push({
          frameId: `${ci.instanceId}#on_low_hp#kw${seq++}`,
          kind: "curated",
          ownerId: p.id,
          sourceInstanceId: ci.instanceId,
          trigger: "on_low_hp",
          curatedKw: inst.id,
          curatedX: inst.x ?? 1,
          curatedInst: inst,
          depth,
          originTag: `${ci.instanceId}#on_low_hp`,
        });
      }
    }
    pushFrames(state, frames);
  }
}

/** Lit le sous-ensemble de déclencheurs rejoués par Déclenchement (capabilities
 *  backfillées d'abord, sinon keyword_instances legacy). */
function getDeclenchementTriggers(card: Card): import("./types").CapabilityTrigger[] {
  const cap = getCapabilities(card).find(c => c.abilityId === "declenchement" && (c.replayTriggers?.length ?? 0) > 0);
  if (cap?.replayTriggers?.length) return cap.replayTriggers;
  const inst = (card.keyword_instances ?? []).find(k => k.id === "declenchement" && !k.mode);
  return inst?.replayTriggers ?? [];
}

/** Déclenchement : à l'entrée du porteur, rejoue UNE FOIS les capacités COMPOSÉES
 *  des AUTRES alliés (hors autres porteurs de Déclenchement) pour chaque
 *  déclencheur du sous-ensemble figé. Frames source = l'allié A (self/scatter/
 *  buff-self ciblent A ; invocation à la faction de A) ; mode valeur pour
 *  mort/retour (payoff sortant sans auto-suppression) ; ciblage déterministe
 *  (noSuspend). La garde de pile (depth/originTag) borne la récursion. */
function runDeclenchement(
  state: GameState,
  carrier: CardInstance,
  replayTriggers: import("./types").CapabilityTrigger[],
  owner: PlayerState,
): void {
  if (replayTriggers.length === 0) return;
  const frames: StackFrame[] = [];
  for (const ally of [...owner.board]) {
    if (ally.instanceId === carrier.instanceId) continue; // exclut le porteur
    if (hasKw(ally, "declenchement")) continue;           // exclut les autres Déclenchements (anti-miroir)
    for (const trigger of replayTriggers) {
      const valueMode = trigger === "on_death" || trigger === "on_return";
      frames.push(...buildComposedFrames(
        ally.card, trigger, ally, owner.id, undefined, undefined,
        { valueMode, noSuspend: true, depth: 1, originTag: `declenchement#${carrier.instanceId}`, sourceIdOverride: ally.instanceId },
      ));
    }
  }
  pushFrames(state, frames);
  drainStack(state);
}

/** Résout les déclencheurs de mort D'UNE créature (Maléfice, Carnage, Héritage,
 *  Résurrection, Pacte de sang, Martyr, Cycle éternel, auto-renvoi, instances
 *  curated mode death, composés on_death, Nécrophagie). Extrait de l'ancienne
 *  boucle de processDeathTriggers. `owner` = contrôleur de la créature morte. */
function resolveCreatureDeath(c: CardInstance, owner: PlayerState, enemy: PlayerState): void {
  {
    // Maléfice: inflige X dégâts à TOUTES les unités (alliés et ennemis), X = ATK
    if (hasKw(c, "malefice")) {
      const maleficeDmg = c.card.attack ?? 0;
      dealDamageToHero(enemy.hero, maleficeDmg, c);
      // Capacités de créature (Maléfice/Carnage) : non bloquées par Transcendance.
      [...enemy.board].forEach(e => dealDamageToCreature(e, maleficeDmg, false, true, c, false));
      [...owner.board].forEach(e => dealDamageToCreature(e, maleficeDmg, false, true, c, false));
    }

    // Carnage X: inflige X dégâts à TOUTES les unités en jeu
    if (hasKw(c, "carnage") && c.carnageX > 0) {
      [...enemy.board].forEach(e => dealDamageToCreature(e, c.carnageX, false, true, c, false));
      [...owner.board].forEach(e => dealDamageToCreature(e, c.carnageX, false, true, c, false));
    }

    // Sacrifice démoniaque X: répartit X réductions de coût parmi les Démons
    // de la main du contrôleur (owner). X vient de la mise en cache à
    // l'invocation (cartes forgées) ; repli runtime (effect_text / conféré /
    // défaut 1) pour les instances qui ne passent pas par playCard — notamment
    // les TOKENS, qui sinon auraient sacrificeDemoniaqueX = 0.
    if (hasKw(c, "sacrifice_demoniaque")) {
      const sdX = c.sacrificeDemoniaqueX > 0
        ? c.sacrificeDemoniaqueX
        : (parseXValuesFromEffectText(c.card.effect_text)["sacrifice_demoniaque"]
            ?? c.grantedKeywordX["sacrifice_demoniaque"] ?? 1);
      distributeDemonCostReductions(owner, sdX);
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
        // Réutilise l'instance pour CONSERVER ses bonus ; elle perd Résurrection
        // (gravée dans son card). returnInstanceToPlay recompose maxHealth avec
        // les bonus conservés, puis on applique la règle propre à Résurrection :
        // revient à 1 PV (pas de soin complet pour ce mot-clé).
        //
        // La capacité doit être retirée des DEUX représentations : sur une carte
        // backfillée, getCapabilities renvoie `capabilities` tel quel et ignore
        // `keywords` — filtrer les seuls keywords laissait donc hasKw(…,
        // "resurrection") vrai, l'icône affichée, et ne laissait que le drapeau
        // d'instance pour empêcher une seconde résurrection.
        c.card = {
          ...c.card,
          keywords: newKeywords,
          capabilities: c.card.capabilities
            ? c.card.capabilities.filter(cap => cap.abilityId !== "resurrection")
            : c.card.capabilities,
        };
        returnInstanceToPlay(c);
        c.instanceId = generateInstanceId();
        c.currentHealth = 1;
        c.hasUsedResurrection = true;
        // Traque (charge) → pas de mal d'invocation, même ressuscitée.
        c.hasSummoningSickness = !c.card.keywords.includes("charge");
        owner.board.push(c);
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
          effect_text: "",
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

    // Cycle éternel: la créature retourne dans le deck (copie marquée pour
    // auto-play) au lieu de finir au cimetière. Comme la Résurrection plus
    // haut, elle transite par le graveyard pour déclencher les triggers
    // « Mort », puis on retire aussitôt la dépouille d'origine — sinon on
    // garderait à la fois la copie recyclée dans le deck ET un doublon au
    // cimetière.
    // `owner.graveyard.includes(c)` : même garde que la Remontée-mort plus bas.
    // Sans elle, une créature DÉJÀ sortie du cimetière par la Résurrection
    // (juste au-dessus) était en plus recyclée ici : le MÊME objet se
    // retrouvait à la fois sur le plateau et dans le deck, et le
    // returnInstanceToPlay ci-dessous remettait `hasUsedResurrection` à false
    // → elle ressuscitait à chaque mort, indéfiniment. La première règle qui
    // réclame la dépouille l'emporte.
    if (hasKw(c, "cycle_eternel") && owner.graveyard.includes(c)) {
      // Réutilise l'instance pour CONSERVER ses bonus accumulés (au lieu d'une
      // copie neuve) ; nouvelle identité, marquée pour auto-play à la pioche.
      returnInstanceToPlay(c);
      c.instanceId = generateInstanceId();
      c.cycleEternelAutoPlay = true;
      // Insert at random position in deck
      const insertIdx = Math.floor(rng() * (owner.deck.length + 1));
      owner.deck.splice(insertIdx, 0, c);
      owner.graveyard = owner.graveyard.filter(g => g !== c);
    }

    // Remontée en mode « mort » : auto-renvoi en main au lieu de finir au
    // cimetière (« quand je meurs, je remonte »), que ce soit exprimé par le
    // mot-clé (keyword_instances mode death) ou par une capacité composée
    // bounce/self/on_death. Pas de ciblage ni d'UI : la créature se renvoie
    // ELLE-MÊME, donc ça marche aussi pendant le tour adverse. Le
    // `owner.graveyard.includes(c)` évite un double traitement si une autre
    // règle (Résurrection / Cycle éternel) a déjà sorti l'instance plus haut.
    if (wantsSelfReturnOnDeath(c) && owner.graveyard.includes(c)) {
      returnDeadCreatureToHand(c, owner, enemy);
    }

    // Custom on-death triggers from keywordInstances metadata. Curated
    // keywords (see plan) can opt into mode "death" so their on-play
    // effect fires from the death rattle slot instead. The on-play block
    // is skipped for these instances via the hasKwOnPlay gate elsewhere,
    // so each instance fires exactly once at the right time.
    const customDeathInstances = c.card.keyword_instances ?? [];
    for (const inst of customDeathInstances) {
      if (inst.mode === "death") {
        // Remontée-mort passe désormais ICI comme les autres mots-clés curés :
        // c'est un renvoi CIBLÉ (sélecteur sur le tour du contrôleur, tirage
        // sinon). Elle était sautée tant que l'auto-renvoi la traitait plus
        // haut ; sans ce retrait, le mot-clé ne ferait plus rien du tout.
        resolveCuratedKeywordEffect(inst.id, inst.x ?? 1, c, owner, enemy, undefined, inst);
      }
    }

    // Effets composés à la mort (modèle hybride).
    runComposedCapsForCard(c.card, "on_death", c, owner, enemy);

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

}

/** Traite les morts via une pile LIFO locale (remplace l'ancienne récursion
 *  breadth-first plafonnée à 5). Chaque mort résout ses déclencheurs, PUIS on
 *  recalcule les auras (jamais périmées — corrige bug #2) et on ré-empile les
 *  morts en cascade qu'elle a provoquées : elles sont traitées AVANT les morts
 *  sœurs restantes (interruption LIFO). Plus de drop silencieux (corrige bug #1)
 *  : garde-fou large + télémétrie. Signature préservée (les 12 sites d'appel
 *  passent (dead, owner, enemy) — l'ancien 4e paramètre `depth` disparaît). */
function processDeathTriggers(dead: CardInstance[], owner: PlayerState, enemy: PlayerState): void {
  if (dead.length === 0) return;
  type DeathWork = { c: CardInstance; owner: PlayerState; enemy: PlayerState };
  const work: DeathWork[] = [];
  // dead[0] doit être traité en premier → empilé en dernier (pop = LIFO).
  for (let i = dead.length - 1; i >= 0; i--) work.push({ c: dead[i], owner, enemy });
  let guard = 0;
  while (work.length > 0) {
    if (++guard > 100000) { console.warn("[death] garde-fou d'itérations déclenché"); break; }
    const w = work.pop()!;
    resolveCreatureDeath(w.c, w.owner, w.enemy);
    recalculateAuras(owner, enemy);
    // Cascade : Maléfice/Carnage/auto-débuff ont pu tuer d'autres unités. On
    // ré-empile (ennemi d'abord puis allié → allié traité en premier, ordre
    // plateau) ; elles passent avant les morts sœurs restantes (LIFO).
    const ed = cleanDeadCreatures(enemy);
    const od = cleanDeadCreatures(owner);
    for (let i = ed.length - 1; i >= 0; i--) work.push({ c: ed[i], owner: enemy, enemy: owner });
    for (let i = od.length - 1; i >= 0; i--) work.push({ c: od[i], owner, enemy });
  }
}

// ============================================================
// CURATED TRIGGER MODES (death / tap) — shared effect resolvers
// ============================================================

/** Resolve the effect of a curated keyword from a non-default trigger
 *  context (on-death or on-tap). Mirrors the on-play implementation in
 *  `playCard` for the supported subset — keep the two paths in sync
 *  when extending the list. Source is the creature carrying the keyword
 *  (already dead for on-death; still alive for on-tap). */
// Renforcement (créature) : +X/+Y PERMANENT à la créature elle-même (buff cuit
// dans `card`, comme le sort renforcement / applyRenforcementMultiple, pour
// survivre à recalculateAuras et persister en main/cimetière).
function applyRenforcementSelf(inst: CardInstance, x: number, y: number): void {
  inst.card = { ...inst.card, attack: (inst.card.attack ?? 0) + x, health: (inst.card.health ?? 0) + y };
  inst.currentAttack += x;
  inst.currentHealth += y;
  inst.maxHealth += y;
  inst.lastBuffMode = composedStrikeMode; // couleur de l'effet → teinte du popup
}

// Gloire +X/+Y : récompense permanente d'une survie à des dégâts de combat.
// Réutilise exactement le buff de Renforcement (stats cuites dans `card`), donc
// le gain survit à recalculateAuras et au passage en main/cimetière. En
// revanche il NE survit PAS au Silence, qui rend l'unité à ses stats imprimées
// (cf. stripBoostsToBase).
//
// Résolution de X/Y, dans l'ordre :
//   1. l'instance de mot-clé de la carte (forge : +X = ATK, +Y = PV) ;
//   2. `grantedKeywordX` / `grantedKeywordY` quand la Gloire a été CONFÉRÉE à
//      l'exécution (sort « Rage Gobeline », aura de héros Sigurd…) ;
//   3. 1/1 par défaut, valeur de repli des mots-clés scalables du moteur.
function applyGloire(inst: CardInstance): void {
  const kwInst = inst.card.keyword_instances?.find(i => i.id === "gloire");
  const x = kwInst?.x ?? inst.grantedKeywordX["gloire"] ?? 1;
  const y = kwInst?.y ?? inst.grantedKeywordY?.["gloire"] ?? 1;
  if (x <= 0 && y <= 0) return;
  applyRenforcementSelf(inst, Math.max(0, x), Math.max(0, y));
  inst.gloireStacks = (inst.gloireStacks ?? 0) + 1;
}

// Renforcement multiple : +X/+Y permanent à toutes les créatures du contrôleur
// de la race ou du clan ciblé (clan prioritaire). La source est exclue. Même
// pattern de buff permanent que le sort "renforcement" (modifie card + stats).
function applyRenforcementMultiple(
  controller: PlayerState,
  x: number,
  y: number,
  race?: string | null,
  clan?: string | null,
  sourceInstanceId?: string | null,
): void {
  for (const ally of controller.board) {
    if (sourceInstanceId && ally.instanceId === sourceInstanceId) continue;
    // Ni race ni clan ⇒ TOUTES les créatures alliées. Le repli était `false`,
    // c'est-à-dire « personne » : un Renforcement multiple sans cible désignée
    // ne faisait rien du tout, d'où la validation serveur qui l'interdisait.
    const match = clan ? ally.card.clan === clan : (race ? ally.card.race === race : true);
    if (!match) continue;
    ally.card = { ...ally.card, attack: (ally.card.attack ?? 0) + x, health: (ally.card.health ?? 0) + y };
    ally.currentAttack += x;
    ally.currentHealth += y;
    ally.maxHealth += y;
    ally.lastBuffMode = composedStrikeMode; // couleur de l'effet → teinte du popup
  }
}

/** Entrainement X : +X/+X à toutes les créatures EN MAIN du contrôleur de la
 *  même faction que la source (snapshot au moment du déclenchement). Buff cuit
 *  dans `card.attack/health` (patron permanent, cf. applyRenforcementMultiple)
 *  → il persiste ensuite quand la carte est jouée. Les cartes en main sont des
 *  CardInstance affichés avec current*, d'où la mise à jour de current/max. */
function applyEntrainement(
  controller: PlayerState,
  faction: string | null | undefined,
  x: number,
  sourceInstanceId?: string | null,
): void {
  if (!faction || x <= 0) return;
  for (const c of controller.hand) {
    if (sourceInstanceId && c.instanceId === sourceInstanceId) continue;
    if (c.card.card_type !== "creature") continue;
    if (c.card.faction !== faction) continue;
    c.card = { ...c.card, attack: (c.card.attack ?? 0) + x, health: (c.card.health ?? 0) + x };
    c.currentAttack += x;
    c.currentHealth += x;
    c.maxHealth += x;
    c.lastBuffMode = composedStrikeMode; // couleur de l'effet → teinte du popup
  }
}

// Fortifier +X/+Y : buff PERMANENT de la PREMIÈRE créature du deck du
// propriétaire en partant du dessus (deck[0] = dessus — les sorts au-dessus
// sont sautés). SILENCIEUX : aucune révélation ni animation (décision
// produit), le joueur découvre le bonus en piochant. Deck vide ou sans
// créature → effet perdu sans bruit. Cumulable (deux Fortifier s'empilent).
// Spread OBLIGATOIRE : les exemplaires d'une même carte du deck PARTAGENT le
// même objet Card (createDeckInstances) — muter en place bufferait tous les
// doubles. Le buff voyage avec l'instance à la pioche (drawCard shift→push).
function applyFortifier(owner: PlayerState, x: number, y: number): void {
  if (x <= 0 && y <= 0) return;
  const target = owner.deck.find(c => c.card.card_type === "creature");
  if (!target) return;
  target.card = { ...target.card, attack: (target.card.attack ?? 0) + x, health: (target.card.health ?? 0) + y };
  target.currentAttack += x;
  target.currentHealth += y;
  target.maxHealth += y;
  target.lastBuffMode = composedStrikeMode; // teinte du popup si révélée plus tard
}

// Préincanter X : réduction PERMANENTE du coût du PREMIER sort du deck en
// partant du dessus, via manaCostReduction (survit à la pioche : même
// instance). Écrêtage À LA SOURCE (patron distributeDemonCostReductions) :
// le coût effectif ne descend jamais sous 1 ; un sort déjà à coût effectif
// ≤ 1 CONSOMME l'effet sans changement — on ne passe PAS au sort suivant
// (décision produit). Un sort à 0 reste à 0 (pas de réduction négative).
// Silencieux, cumulable jusqu'au plancher.
function applyPreincanter(owner: PlayerState, x: number): void {
  if (x <= 0) return;
  const target = owner.deck.find(c => c.card.card_type === "spell");
  if (!target) return;
  const effective = Math.max(0, getTokenManaCost(target.card) - (target.manaCostReduction ?? 0));
  const applied = Math.min(x, Math.max(0, effective - 1));
  if (applied <= 0) return; // déjà à ≤1 : effet consommé, aucun changement
  target.manaCostReduction = (target.manaCostReduction ?? 0) + applied;
}

function resolveCuratedKeywordEffect(
  kw: Keyword,
  x: number,
  source: CardInstance,
  owner: PlayerState,
  opponent: PlayerState,
  targetInstanceId?: string,
  inst?: KeywordInstance,
): void {
  // Bruitage de la capacité. Ici plutôt qu'aux 9 appelants : ce résolveur est le
  // point de passage de TOUS les déclencheurs curés hors entrée en jeu (tap,
  // mort, retour, fin de tour, attaque, pioche). `inst.mode` porte le
  // déclencheur réel.
  noteAbilitySfx(kw, keywordModeToTrigger(inst?.mode));
  switch (kw) {
    case "renforcement_multiple": {
      // Tap / mort / retour : lit +X/+Y et race/clan depuis l'instance du mot-clé.
      // withComposedMode(inst.mode) : pose le mode ambiant pour que le buff
      // estampille lastBuffMode (teinte du popup par la couleur de l'effet).
      withComposedMode(inst?.mode, () =>
        applyRenforcementMultiple(owner, inst?.x ?? 0, inst?.y ?? 0, inst?.race, inst?.clan, source.instanceId));
      return;
    }
    case "renforcement": {
      // Tap / mort / retour / fin de tour : +X/+Y permanent à la source elle-même.
      withComposedMode(inst?.mode, () =>
        applyRenforcementSelf(source, inst?.x ?? 0, inst?.y ?? 0));
      return;
    }
    case "entrainement": {
      // Mort / tap / retour / fin-de-tour : +X/+X aux créatures en main de même
      // faction que la source (snapshot). La source est exclue (utile en mode
      // retour, où elle vient de rejoindre la main).
      withComposedMode(inst?.mode, () =>
        applyEntrainement(owner, source.card.faction, inst?.x ?? x, source.instanceId));
      return;
    }
    case "fortifier": {
      // Mort / tap / retour / fin de tour / attaque / pioche / low_hp :
      // +X/+Y permanent à la 1re créature du deck du contrôleur — l'effet ne
      // dépend pas de la présence de la source en jeu.
      withComposedMode(inst?.mode, () =>
        applyFortifier(owner, inst?.x ?? 0, inst?.y ?? 0));
      return;
    }
    case "preincanter": {
      // Idem : le 1er sort du deck du contrôleur coûte X de moins (min 1).
      withComposedMode(inst?.mode, () =>
        applyPreincanter(owner, inst?.x ?? x));
      return;
    }
    case "remontee": {
      // Tap (ou résolution différée) : cible explicite → on résout tout de suite.
      if (targetInstanceId) {
        resolveRemontee(targetInstanceId, source.instanceId, owner, opponent);
        return;
      }
      // Mort / retour : si c'est le tour du contrôleur ET qu'au moins une cible
      // valide existe, on DIFFÈRE le choix (déclencheur interactif en attente).
      // Sinon (tour adverse, mode attaque — flux synchrone sans pause — ou
      // aucune cible) → cible aléatoire / fizzle.
      if (inst?.mode !== "attack" && owner.id === currentPlayerId && remonteeTargetIds(owner, opponent, source.instanceId).length > 0) {
        pendingTriggerSink.push({
          id: source.instanceId,
          kw: "remontee",
          controllerId: owner.id,
          sourceInstanceId: source.instanceId,
        });
        return;
      }
      resolveRemontee(undefined, source.instanceId, owner, opponent);
      return;
    }
    case "impact": {
      // Tap (ou résolution différée) : cible explicite → dégâts immédiats.
      if (targetInstanceId) { applyImpactTo(targetInstanceId, x, source, owner, opponent); return; }
      // Mort / retour / fin de tour : sur le tour du contrôleur ET s'il existe
      // une cible → on DIFFÈRE (picker interactif). Sur le tour adverse, en
      // mode attaque (flux synchrone sans pause) ou sans cible → cible
      // ALÉATOIRE déterministe (rng semée, comme Remontée).
      const pool = impactTargetIds(owner, opponent);
      if (inst?.mode !== "attack" && owner.id === currentPlayerId && pool.length > 0) {
        pendingTriggerSink.push({ id: source.instanceId, kw: "impact", x, controllerId: owner.id, sourceInstanceId: source.instanceId });
        return;
      }
      if (pool.length > 0) applyImpactTo(pool[Math.floor(rng() * pool.length)], x, source, owner, opponent);
      return;
    }
    case "convocation": {
      if (owner.board.length >= MAX_BOARD_SIZE) return;
      const tmpl = findTokenTemplate(source.card.convocation_token_id);
      if (!tmpl) return;
      const atk = x > 0 ? x : tmpl.attack;
      const hp = x > 0 ? x : tmpl.health;
      let tokenCard: Card = {
        id: -1, name: `Token ${tmpl.race}`.trim(),
        mana_cost: 0, card_type: "creature",
        attack: atk, health: hp,
        effect_text: "",
        keywords: [], spell_keywords: null, spell_effects: null, image_url: null,
        race: tmpl.race,
        faction: getFactionForRace(tmpl.race) ?? source.card.faction,
        clan: source.card.clan,
      };
      tokenCard = applyTokenTemplate(tokenCard, tmpl);
      const token = createCardInstance(tokenCard);
      token.hasSummoningSickness = true;
      owner.board.push(token);
      break;
    }
    case "dedoublement": {
      // Mort / tap / retour / fin de tour / attaque : crée une copie exacte de
      // la source (même logique que l'effet on-play). Le clone entre frais ;
      // pas de récursion (il n'est pas repassé par un flux de déclenchement).
      if (owner.board.length >= MAX_BOARD_SIZE) return;
      owner.board.push(makeDedoublementClone(source));
      break;
    }
    case "invocations_multiples": {
      // Mort / attaque / retour / fin de tour / activation : rejoue la série
      // d'invocations. Pool et format viennent des vars module (ce résolveur
      // n'a pas accès au GameState), comme pour "invocation".
      resolveMultipleInvocations(owner, source.card, currentCardPools.factionCardPool, currentFormatCode);
      break;
    }
    case "convocations_multiples": {
      // Crée tous les tokens configurés (mêmes que l'effet on-play) lors d'un
      // déclenchement mort / tap / retour en main.
      for (const tokenDef of source.card.convocation_tokens ?? []) {
        if (owner.board.length >= MAX_BOARD_SIZE) break;
        const tmpl = findTokenTemplate(tokenDef.token_id);
        if (!tmpl) continue;
        const atk = tokenDef.attack ?? tmpl.attack;
        const hp = tokenDef.health ?? tmpl.health;
        let tokenCard: Card = {
          id: -1, name: `Token ${tmpl.race}`.trim(),
          mana_cost: 0, card_type: "creature",
          attack: atk, health: hp,
          effect_text: "",
          keywords: [], spell_keywords: null, spell_effects: null, image_url: null,
          race: tmpl.race,
          faction: getFactionForRace(tmpl.race) ?? source.card.faction,
        };
        tokenCard = applyTokenTemplate(tokenCard, tmpl);
        const token = createCardInstance(tokenCard);
        token.hasSummoningSickness = true;
        owner.board.push(token);
      }
      break;
    }
    case "suprematie": {
      // +1/+1 par carte dans la main du contrôleur (buff de la source).
      const n = owner.hand.length;
      source.summonBonusATK += n;
      source.currentAttack += n;
      source.currentHealth += n;
      source.maxHealth += n;
      break;
    }
    case "ombre_du_passe": {
      // +1/+1 par unité de même race au cimetière (la source est exclue du
      // décompte — utile en mode mort où elle vient d'y être placée).
      if (!source.card.race) break;
      const n = owner.graveyard.filter(c => c.instanceId !== source.instanceId && c.card.race === source.card.race && c.card.card_type === "creature").length;
      source.summonBonusATK += n;
      source.currentAttack += n;
      source.currentHealth += n;
      source.maxHealth += n;
      break;
    }
    case "savant": {
      // +1/+1 par sort dans le cimetière du contrôleur (buff de la source).
      const n = owner.graveyard.filter(c => c.card.card_type === "spell").length;
      source.summonBonusATK += n;
      source.currentAttack += n;
      source.currentHealth += n;
      source.maxHealth += n;
      break;
    }
    case "inspiration": {
      for (let i = 0; i < x; i++) drawCard(owner);
      break;
    }
    case "incineration": {
      resolveIncineration(incinerationVictim(targetInstanceId, owner, opponent), x);
      break;
    }
    case "creuser": {
      // Modes curés : aucun picker possible (mort, attaque, tour adverse) — on
      // remonte la première carte révélée, choix par défaut assumé.
      resolveCreuser(owner, x, 0);
      break;
    }
    case "retour_differe": {
      resolveRetourDiffere(targetInstanceId, source.instanceId, owner, opponent);
      break;
    }
    case "devoration": {
      resolveDevoration(source, targetInstanceId, owner, opponent);
      break;
    }
    case "epargne": {
      // `owner` = contrôleur de la créature source, quel que soit le mode
      // (invocation, mort, tap, retour, fin de tour, attaque).
      addEpargne(owner, x);
      break;
    }
    case "pillage": {
      for (let i = 0; i < x && opponent.hand.length > 0; i++) {
        discardFromHand(opponent, Math.floor(rng() * opponent.hand.length), [owner, opponent]);
      }
      break;
    }
    case "douleur": {
      // In on-play, Douleur damages the OWN hero (cost). In the new
      // death/tap modes the trigger represents the creature lashing out,
      // so we point it at the OPPONENT's hero — more interesting design.
      dealDamageToHero(opponent.hero, x, source);
      break;
    }
    case "vampirisme": {
      // Tap mode: drain X from a chosen enemy creature (mirrors on-play).
      // Death / no-target fallback: hit the opposing hero.
      if (targetInstanceId) {
        const target = opponent.board.find(c => c.instanceId === targetInstanceId);
        if (target) {
          const stolen = Math.min(x, target.currentHealth);
          target.currentHealth -= stolen;
          source.currentHealth += stolen;
          source.maxHealth += stolen;
          break;
        }
      }
      // Mode attaque : draine une créature ennemie AU HASARD (le flux d'attaque
      // ne peut pas ouvrir de picker) ; à défaut de créature, le héros adverse.
      if (inst?.mode === "attack") {
        const poolV = opponent.board.filter(c => c.currentHealth > 0 && !hasKw(c, "invisible") && !(hasKw(c, "ombre") && !c.ombreRevealed));
        if (poolV.length > 0) {
          const targetV = poolV[Math.floor(rng() * poolV.length)];
          const stolenV = Math.min(x, targetV.currentHealth);
          targetV.currentHealth -= stolenV;
          source.currentHealth += stolenV;
          source.maxHealth += stolenV;
          break;
        }
      }
      const before = opponent.hero.hp;
      dealDamageToHero(opponent.hero, x, source);
      const dealt = before - opponent.hero.hp;
      owner.hero.hp += dealt;
      break;
    }
    case "prescience": {
      // Tap-mode only per plan — draw up to X cards.
      for (let i = 0; i < x; i++) drawCard(owner);
      break;
    }
    case "combustion": {
      // Discard one random card from the owner's hand and draw two.
      // Mirrors the on-play effect; safe to fire in death mode too
      // since the owner is still around to draw.
      if (owner.hand.length > 0) {
        discardFromHand(owner, Math.floor(rng() * owner.hand.length), [owner, opponent]);
      }
      drawCard(owner);
      drawCard(owner);
      break;
    }
    case "tempete": {
      // Inflige X dégâts répartis un par un sur les créatures ennemies
      // encore vivantes (cible recalculée à chaque goutte pour ne pas
      // frapper les morts). Ne touche pas le héros. Identique à l'effet
      // d'invocation, rejoué depuis le râle d'agonie (death) ou
      // l'activation (tap).
      for (let drop = 0; drop < x; drop++) {
        const alive = opponent.board.filter((u) => u.currentHealth > 0);
        if (alive.length === 0) break;
        const target = alive[Math.floor(rng() * alive.length)];
        // Capacité de créature (Tempête) : non bloquée par Transcendance.
        dealDamageToCreature(target, 1, false, true, source, false);
      }
      break;
    }
    case "cataclysme": {
      // X dégâts (plein) à TOUTES les créatures des deux camps, source comprise.
      // Rejoué depuis le râle d'agonie (death) / l'activation (tap) / le retour.
      // Capacité de créature → non bloquée par Transcendance (fromSpell=false).
      for (const c of [...opponent.board, ...owner.board]) {
        dealDamageToCreature(c, x, false, true, source, false);
      }
      break;
    }
    case "appel_du_clan": {
      // Mort / attaque / retour / fin de tour / tap : rejoue l'effet
      // d'invocation. Met en jeu gratuitement la 1re unité de même clan
      // (coût ≤ X) trouvée dans le deck, avec mal d'invocation. No-op si la
      // source n'a pas de clan ou si le plateau est plein — mêmes garde-fous
      // que le chemin on-play (engine.ts:playCard). En mode curé, le X vient
      // de l'instance (inst.x) ; à défaut on retombe sur max(1, coût − 1).
      const clan = source.card.clan;
      if (!clan || owner.board.length >= MAX_BOARD_SIZE) break;
      const cost = inst?.x ?? Math.max(1, source.card.mana_cost - 1);
      const idx = owner.deck.findIndex(c => c.card.clan === clan && c.card.card_type === "creature" && c.card.mana_cost <= cost);
      if (idx >= 0) {
        const [called] = owner.deck.splice(idx, 1);
        const calledInstance = createCardInstance(called.card);
        // Traque de l'appelée respectée (cf. chemin on-play / Invocation X).
        calledInstance.hasSummoningSickness = !hasKw(calledInstance, "charge");
        owner.board.push(calledInstance);
      }
      break;
    }
    case "invocation": {
      // Mort / attaque / retour / fin de tour / tap : rejoue l'effet
      // d'invocation. Créature aléatoire de la collection au coût exact X
      // (même alignement que la source, format du match). Le pool et le
      // format viennent des vars module — ce résolveur n'a pas accès au
      // GameState (même patron que Sélection / Concentration).
      resolveInvocationSummon(owner, source.card, x, currentCardPools.factionCardPool, currentFormatCode);
      break;
    }
    // ─── Chantier « tous déclencheurs » : effets d'invocation rejoués depuis
    // mort / attaque / retour / fin de tour / activation. Règle générale :
    // cible explicite → résolution directe ; sinon, sur le tour du contrôleur
    // (hors mode attaque, flux synchrone sans pause) le choix est DIFFÉRÉ
    // (picker interactif) ; sur le tour adverse ou à l'attaque, cible AU
    // HASARD (rng semée, déterministe entre clients). ───────────────────────
    case "concentration": {
      const xC = inst?.x ?? (parseXValuesFromEffectText(source.card.effect_text)["concentration"] || Math.max(1, Math.floor(source.card.mana_cost / 3)));
      applyConcentration(owner, xC, currentCardPools.allSpellsPool);
      return;
    }
    case "loyaute": {
      // +1 ATK / +1 PV par allié de même race (recompte au déclenchement).
      if (!source.card.race) return;
      const n = owner.board.filter(a => a.instanceId !== source.instanceId && a.card.race === source.card.race).length;
      if (n > 0) {
        source.loyauteATKBonus += n;
        source.loyautePVBonus += n;
        source.currentHealth += n;
        source.maxHealth += n;
      }
      return;
    }
    case "catalyse": {
      if (!source.card.race) return;
      for (const handCard of owner.hand) {
        if (handCard.card.race === source.card.race && handCard.card.card_type === "creature") {
          handCard.card = { ...handCard.card, mana_cost: Math.max(0, handCard.card.mana_cost - 1) };
        }
      }
      return;
    }
    case "profanation": {
      // Restreint aux déclencheurs « sur plateau » (tap / fin de tour / attaque)
      // pour ne jamais auto-exiler la source depuis son propre cimetière.
      const xP = inst?.x ?? (parseXValuesFromEffectText(source.card.effect_text)["profanation"] || Math.max(1, Math.floor(source.card.mana_cost / 2)));
      const toExile = Math.min(xP, owner.graveyard.length);
      for (let i = 0; i < toExile; i++) owner.graveyard.pop();
      source.summonBonusATK += toExile;
      source.currentAttack += toExile;
      source.currentHealth += toExile;
      source.maxHealth += toExile;
      return;
    }
    case "contresort": {
      source.contresortActive = true;
      return;
    }
    case "solidarite": {
      if (!source.card.race) return;
      const sameRace = owner.board.filter(a => a.instanceId !== source.instanceId && a.card.race === source.card.race).length;
      if (sameRace >= 2) {
        const xS = inst?.x ?? (parseXValuesFromEffectText(source.card.effect_text)["solidarite"] || Math.max(1, Math.floor(source.card.mana_cost / 3)));
        for (let i = 0; i < xS; i++) drawCard(owner);
      }
      return;
    }
    case "appel_supreme": {
      const race = inst?.race ?? getCapabilities(source.card).find(c => c.abilityId === "appel_supreme")?.race;
      if (race) appelSupreme(owner, race);
      return;
    }
    case "rassemblement": {
      if (!source.card.race || owner.deck.length === 0) return;
      const xR = inst?.x ?? (parseXValuesFromEffectText(source.card.effect_text)["rassemblement"] || Math.max(1, Math.floor(source.card.mana_cost / 2)));
      const count = Math.min(xR, owner.deck.length);
      const revealed = owner.deck.splice(0, count);
      for (const c of revealed) {
        if (c.card.race === source.card.race && c.card.card_type === "creature" && owner.hand.length < MAX_HAND_SIZE) {
          owner.hand.push(c);
        } else {
          owner.graveyard.push(c);
        }
      }
      return;
    }
    case "instinct_de_meute": {
      const xI = inst?.x ?? (parseXValuesFromEffectText(source.card.effect_text)["instinct_de_meute"] || Math.max(1, Math.floor(source.card.mana_cost / 3)));
      source.instinctDeMeuteX = xI;
      const died = source.card.faction
        ? owner.graveyard.some(g => g.instanceId !== source.instanceId && g.diedOnTurn === currentTurnNumber && g.card.faction === source.card.faction)
        : false;
      if (died) {
        source.instinctDeMeuteATKBonus += xI;
        source.currentAttack += xI;
        source.currentHealth += xI;
        source.maxHealth += xI;
      }
      return;
    }
    case "convocation_simple": {
      if (owner.board.length >= MAX_BOARD_SIZE) return;
      const tmplS = findTokenTemplate(source.card.convocation_token_id);
      if (!tmplS) return;
      let tokenCardS: Card = {
        id: -1, name: `Token ${tmplS.race}`.trim(),
        mana_cost: 0, card_type: "creature",
        attack: tmplS.attack, health: tmplS.health,
        effect_text: "",
        keywords: [], spell_keywords: null, spell_effects: null, image_url: null,
        race: tmplS.race,
        faction: getFactionForRace(tmplS.race) ?? source.card.faction,
        clan: source.card.clan,
      };
      tokenCardS = applyTokenTemplate(tokenCardS, tmplS);
      const tokenS = createCardInstance(tokenCardS);
      tokenS.hasSummoningSickness = true;
      owner.board.push(tokenS);
      return;
    }
    case "domination": {
      // Prend le contrôle PERMANENT d'une unité ennemie au hasard (comme
      // l'effet d'invocation — déjà aléatoire, aucun picker à différer).
      if (opponent.board.length === 0 || owner.board.length >= MAX_BOARD_SIZE) return;
      const idxD = Math.floor(rng() * opponent.board.length);
      const stolen = opponent.board.splice(idxD, 1)[0];
      stolen.hasSummoningSickness = true;
      stolen.trueOwnerId = opponent.id;
      owner.board.push(stolen);
      return;
    }
    case "corruption": {
      // Vole une unité ennemie AU HASARD (le fallback aléatoire existe déjà à
      // l'invocation) ; elle gagne Traque et l'agressivité immédiate.
      if (opponent.board.length === 0 || owner.board.length >= MAX_BOARD_SIZE) return;
      const stealTarget = opponent.board[Math.floor(rng() * opponent.board.length)];
      opponent.board = opponent.board.filter(c => c !== stealTarget);
      stealTarget.originalOwnerId = opponent.id;
      stealTarget.trueOwnerId = opponent.id;
      resetTurnStateForNewController(stealTarget);
      if (!stealTarget.card.keywords.includes("charge")) {
        stealTarget.card = { ...stealTarget.card, keywords: [...stealTarget.card.keywords, "charge"] };
      }
      owner.board.push(stealTarget);
      return;
    }
    case "exhumation": {
      // Ressuscite une unité du cimetière (coût ≤ X) au hasard — la source est
      // toujours EXCLUE (sinon une Exhumation-mort à X élevé se ressusciterait
      // elle-même en boucle à chaque mort).
      const xE = inst?.x ?? Math.max(1, source.card.mana_cost - 1);
      const resurrectable = owner.graveyard.filter(c => c.instanceId !== source.instanceId && c.card.card_type === "creature" && c.card.mana_cost <= xE);
      if (resurrectable.length === 0 || owner.board.length >= MAX_BOARD_SIZE) return;
      const targetE = resurrectable[Math.floor(rng() * resurrectable.length)];
      owner.graveyard = owner.graveyard.filter(c => c !== targetE);
      returnInstanceToPlay(targetE);
      targetE.instanceId = generateInstanceId();
      targetE.hasSummoningSickness = !targetE.card.keywords.includes("charge");
      owner.board.push(targetE);
      return;
    }
    case "rappel": {
      // Renvoie une carte du cimetière en main, au hasard, source exclue
      // (le retour-de-soi à la mort est le rôle de Remontée/Résurrection).
      const recallPool = owner.graveyard.filter(c => c.instanceId !== source.instanceId);
      if (recallPool.length === 0 || owner.hand.length >= MAX_HAND_SIZE) return;
      const targetR = recallPool[Math.floor(rng() * recallPool.length)];
      owner.graveyard = owner.graveyard.filter(c => c !== targetR);
      returnInstanceToPlay(targetR);
      targetR.instanceId = generateInstanceId();
      owner.hand.push(targetR);
      if (targetR.card.card_type === "creature") triggerReturnToHand(targetR, owner, opponent);
      return;
    }
    case "heritage_du_cimetiere": {
      // Copie les capacités d'une unité du cimetière au hasard (source exclue).
      const graveCreatures = owner.graveyard.filter(c => c.instanceId !== source.instanceId && c.card.card_type === "creature");
      if (graveCreatures.length === 0) return;
      const graveTarget = graveCreatures[Math.floor(rng() * graveCreatures.length)];
      const hKeywords = [...new Set([...source.card.keywords, ...graveTarget.card.keywords])];
      const hInstances = mergeKeywordInstances(source.card.keyword_instances, graveTarget.card.keyword_instances);
      const hCapabilities = mergeComposedCapabilities(source.card.capabilities, graveTarget.card.capabilities);
      source.card = { ...source.card, keywords: hKeywords, keyword_instances: hInstances, capabilities: hCapabilities };
      return;
    }
    case "divination": {
      // Révèle les 3 cartes du dessus, en garde une AU HASARD sur le dessus,
      // replace les autres dessous (pas de modale hors invocation).
      if (owner.deck.length === 0) return;
      const countDiv = Math.min(3, owner.deck.length);
      const topDiv = owner.deck.splice(0, countDiv);
      const keepIdx = Math.floor(rng() * topDiv.length);
      owner.deck.unshift(topDiv[keepIdx]);
      for (let i = 0; i < topDiv.length; i++) {
        if (i !== keepIdx) owner.deck.push(topDiv[i]);
      }
      return;
    }
    case "traque_du_destin": {
      // Révèle X cartes, en ajoute une AU HASARD en main, replace le reste
      // dessous dans un ordre aléatoire (pas de modale hors invocation).
      if (owner.deck.length === 0) return;
      const xT = inst?.x ?? getTraqueDuDestinX(source.card);
      const countT = Math.min(xT, owner.deck.length);
      const revealedT = owner.deck.splice(0, countT);
      if (owner.hand.length < MAX_HAND_SIZE) {
        const pickIdx = Math.floor(rng() * revealedT.length);
        owner.hand.push(revealedT[pickIdx]);
        revealedT.splice(pickIdx, 1);
      }
      shuffleArray(revealedT);
      owner.deck.push(...revealedT);
      return;
    }
    case "selection":
    case "selection_magique":
    case "renfort_royal": {
      // Sélection « 1 parmi 3 » : modale sur le tour du contrôleur (déclencheur
      // différé), tirage AU HASARD parmi les options révélées sinon (tour
      // adverse ou mode attaque — la modale ne peut pas s'ouvrir).
      const selState = {
        factionCardPool: currentCardPools.factionCardPool,
        allSpellsPool: currentCardPools.allSpellsPool,
        players: [owner, opponent],
        currentPlayerIndex: 0,
        // `turnNumber` EST load-bearing : c'est la seule part du germe de tirage
        // qui bouge d'une activation à l'autre. Absent, `state.turnNumber * 1000`
        // vaut NaN, et `NaN & 0xfffffff` vaut 0 — le pseudo-RNG rend alors 0 à
        // chaque appel et propose éternellement les 3 MÊMES cartes, sans la
        // moindre erreur pour le signaler.
        turnNumber: currentTurnNumber,
      } as unknown as GameState;
      const options = selectionCardsForKeyword(kw, selState, inst?.x ?? 0, source.card, undefined, source.instanceId);
      if (options.length === 0) return;
      // "attack" et "draw" : flux SYNCHRONE, sans point de pause possible (le
  // premier est au milieu du flux de combat, le second au milieu de startTurn
  // ou d'un autre effet). On tire donc toujours au hasard, via la RNG semée —
  // donc à l'identique sur les deux clients.
  if (inst?.mode !== "attack" && inst?.mode !== "draw" && owner.id === currentPlayerId) {
        pendingTriggerSink.push({
          id: `${source.instanceId}#${kw}`,
          controllerId: owner.id,
          sourceInstanceId: source.instanceId,
          selectionType: kw,
          selectionOptionIds: options.map(c => c.id),
        });
        return;
      }
      const picked = options[Math.floor(rng() * options.length)];
      if (owner.hand.length < MAX_HAND_SIZE) owner.hand.push(createCardInstance(picked));
      return;
    }
    case "affaiblissement": {
      const ax = inst?.x ?? 0;
      const ay = inst?.y ?? 0;
      const resolveAff = (tid: string) => {
        const t = opponent.board.find(c => c.instanceId === tid);
        if (t) applyAffaiblissement(t, ax, ay);
      };
      if (targetInstanceId) { resolveAff(targetInstanceId); return; }
      const tidA = deferOrRandomTarget(kw, source, owner, opponent, inst, ax, ay);
      if (tidA) resolveAff(tidA);
      return;
    }
    case "benediction": {
      const resolveBen = (tid: string) => {
        const t = owner.board.find(c => c.instanceId === tid);
        if (t) { t.currentHealth = t.maxHealth; t.isPoisoned = false; }
      };
      if (targetInstanceId) { resolveBen(targetInstanceId); return; }
      const tidB = deferOrRandomTarget(kw, source, owner, opponent, inst);
      if (tidB) resolveBen(tidB);
      return;
    }
    case "tactique": {
      // Attribue la 1re capacité transmissible de la source à un allié (même
      // repli que l'invocation sans choix explicite de capacités).
      const resolveTac = (tid: string) => {
        const t = owner.board.find(c => c.instanceId === tid && c.instanceId !== source.instanceId);
        if (!t) return;
        const kwsToGrant = source.card.keywords.filter(k => k !== "tactique" && !t.card.keywords.includes(k)).slice(0, 1);
        for (const k of kwsToGrant) {
          t.card = { ...t.card, keywords: [...t.card.keywords, k] };
        }
      };
      if (targetInstanceId) { resolveTac(targetInstanceId); return; }
      const tidT = deferOrRandomTarget(kw, source, owner, opponent, inst);
      if (tidT) resolveTac(tidT);
      return;
    }
    case "sacrifice": {
      // Détruit un allié ciblé, la source gagne ses ATK/PV. Restreint aux
      // déclencheurs « sur plateau » (la source doit profiter du gain).
      const resolveSac = (tid: string) => {
        const t = owner.board.find(c => c.instanceId === tid && c.instanceId !== source.instanceId);
        if (!t) return;
        source.summonBonusATK += t.currentAttack;
        source.currentAttack += t.currentAttack;
        source.currentHealth += t.currentHealth;
        source.maxHealth += t.currentHealth;
        owner.board = owner.board.filter(c => c !== t);
        owner.graveyard.push(t);
        processDeathTriggers([t], owner, opponent);
      };
      if (targetInstanceId) { resolveSac(targetInstanceId); return; }
      const tidS = deferOrRandomTarget(kw, source, owner, opponent, inst);
      if (tidS) resolveSac(tidS);
      return;
    }
    case "permutation": {
      // Échange les PV (courants + max) de la source et d'une unité ennemie.
      // Restreint aux déclencheurs « sur plateau » (l'échange n'a de sens que
      // si la source est vivante).
      const resolvePerm = (tid: string) => {
        const t = opponent.board.find(c => c.instanceId === tid);
        if (!t) return;
        const tempHP = source.currentHealth;
        const tempMaxHP = source.maxHealth;
        source.currentHealth = t.currentHealth;
        source.maxHealth = t.maxHealth;
        t.currentHealth = tempHP;
        t.maxHealth = tempMaxHP;
      };
      if (targetInstanceId) { resolvePerm(targetInstanceId); return; }
      const tidP = deferOrRandomTarget(kw, source, owner, opponent, inst);
      if (tidP) resolvePerm(tidP);
      return;
    }
    case "malediction": {
      // Marque une unité ennemie (exil différé porté par la source — la source
      // doit rester en jeu, d'où la restriction aux déclencheurs sur plateau).
      const resolveMal = (tid: string) => {
        const t = opponent.board.find(c => c.instanceId === tid);
        if (t) source.maledictionTargetId = t.instanceId;
      };
      if (targetInstanceId) { resolveMal(targetInstanceId); return; }
      const tidM = deferOrRandomTarget(kw, source, owner, opponent, inst);
      if (tidM) resolveMal(tidM);
      return;
    }
    case "mimique": {
      // Copie les capacités d'une unité ciblée sur la source (sur plateau).
      const resolveMim = (tid: string) => {
        const t = findCreatureOnBoard(owner, tid) ?? findCreatureOnBoard(opponent, tid);
        if (!t || t.instanceId === source.instanceId) return;
        const mKeywords = [...new Set([...source.card.keywords, ...t.card.keywords])];
        const mInstances = mergeKeywordInstances(source.card.keyword_instances, t.card.keyword_instances);
        const mCapabilities = mergeComposedCapabilities(source.card.capabilities, t.card.capabilities);
        source.card = { ...source.card, keywords: mKeywords, keyword_instances: mInstances, capabilities: mCapabilities };
        if (t.hasDivineShield) source.hasDivineShield = true;
      };
      if (targetInstanceId) { resolveMim(targetInstanceId); return; }
      const tidMi = deferOrRandomTarget(kw, source, owner, opponent, inst);
      if (tidMi) resolveMim(tidMi);
      return;
    }
    case "metamorphose": {
      // La source devient une copie exacte d'une unité ciblée (sur plateau).
      const resolveMet = (tid: string) => {
        const t = findCreatureOnBoard(owner, tid) ?? findCreatureOnBoard(opponent, tid);
        if (!t || t.instanceId === source.instanceId) return;
        source.card = { ...t.card };
        source.currentAttack = t.currentAttack;
        source.currentHealth = t.currentHealth;
        source.maxHealth = t.maxHealth;
        source.hasDivineShield = t.hasDivineShield;
      };
      if (targetInstanceId) { resolveMet(targetInstanceId); return; }
      const tidMe = deferOrRandomTarget(kw, source, owner, opponent, inst);
      if (tidMe) resolveMet(tidMe);
      return;
    }
    default:
      // No-op for keywords not yet supported in non-play modes. The
      // Card Forge UI gates which keywords admins can put in death/tap
      // mode, so unsupported entries shouldn't appear in practice.
      break;
  }
}

/** Pool de cibles éligibles d'un mot-clé curé DIFFÉRÉ (picker interactif ou
 *  tirage aléatoire). Partagé par resolveCuratedKeywordEffect (décision différer
 *  vs hasard), autoResolvePendingTriggers (repli chrono), applyOnePendingTrigger
 *  et l'overlay du store (cibles cliquables). */
export function deferredKwTargetIds(
  kw: Keyword | undefined,
  controller: PlayerState,
  other: PlayerState,
  sourceInstanceId: string | null,
): string[] {
  const targetable = (c: CardInstance) => !hasKw(c, "invisible") && !(hasKw(c, "ombre") && !c.ombreRevealed);
  switch (kw) {
    case "remontee":
      return remonteeTargetIds(controller, other, sourceInstanceId);
    case "impact":
      return impactTargetIds(controller, other);
    case "affaiblissement":
    case "permutation":
    case "malediction":
      return other.board.filter(targetable).map(c => c.instanceId);
    case "benediction":
      return controller.board.map(c => c.instanceId);
    case "tactique":
    case "sacrifice":
      return controller.board.filter(c => c.instanceId !== sourceInstanceId).map(c => c.instanceId);
    case "mimique":
    case "metamorphose":
      return [
        ...controller.board.filter(c => c.instanceId !== sourceInstanceId),
        ...other.board.filter(c => targetable(c) && c.instanceId !== sourceInstanceId),
      ].map(c => c.instanceId);
    default:
      return [];
  }
}

/** Décision « différer ou tirer au hasard » d'un mot-clé curé ciblé déclenché
 *  sans cible explicite. Tour du contrôleur (hors mode attaque) → pousse un
 *  déclencheur interactif et renvoie null. Sinon → renvoie une cible au hasard
 *  (rng semée). Aucune cible possible → undefined (fizzle). */
function deferOrRandomTarget(
  kw: Keyword,
  source: CardInstance,
  owner: PlayerState,
  opponent: PlayerState,
  inst: KeywordInstance | undefined,
  x?: number,
  y?: number,
): string | null | undefined {
  const pool = deferredKwTargetIds(kw, owner, opponent, source.instanceId);
  if (pool.length === 0) return undefined;
  if (inst?.mode !== "attack" && owner.id === currentPlayerId) {
    pendingTriggerSink.push({
      id: `${source.instanceId}#${kw}`,
      kw,
      controllerId: owner.id,
      sourceInstanceId: source.instanceId,
      x,
      y,
    });
    return null;
  }
  return pool[Math.floor(rng() * pool.length)];
}

// ============================================================
// TAP ACTIVATION
// ============================================================

export function tapActivate(state: GameState, action: TapActivateAction): GameState {
  const pool = state.factionCardPool;
  const allPool = state.allSpellsPool;
  const newState = cloneStateForAction(state);
  newState.factionCardPool = pool;
  newState.allSpellsPool = allPool;

  const player = newState.players[newState.currentPlayerIndex];
  const opponent = newState.players[newState.currentPlayerIndex === 0 ? 1 : 0];
  const source = player.board.find(c => c.instanceId === action.sourceInstanceId);
  if (!source) return state;
  if (source.tapped) return state;
  // Paralysie : la créature est inerte pour tout le tour — elle ne peut ni
  // attaquer ni activer son pouvoir. (Le gate hasSummoningSickness plus bas
  // ne suffit pas : Charge le contourne, et la paralysie peut être appliquée
  // après l'untap, pendant le tour même de la créature.)
  if (source.isParalyzed) return state;
  // Traque (charge) autorise le pouvoir activable dès l'invocation, même si
  // Traque est gagnée en cours de tour (où hasSummoningSickness peut rester vrai).
  if (source.hasSummoningSickness && !hasKw(source, "charge")) return state;

  // Ombre : activer son pouvoir révèle la créature, au même titre qu'attaquer.
  // Le libellé du mot-clé dit « tant qu'elle n'a pas effectué une action
  // (attaque OU capacité) » ; seule l'attaque révélait, si bien qu'une Ombre
  // pouvait taper son pouvoir tour après tour en restant intouchable.
  // Posé APRÈS les gardes (tapped / paralysie / mal d'invocation) et AVANT les
  // deux branches d'activation : une activation refusée ne doit rien révéler,
  // et les chemins composé comme curé doivent révéler pareillement.
  if (hasKw(source, "ombre")) {
    source.ombreRevealed = true;
  }

  // Effet composé activable (on_activation) — référencé par uid.
  if (action.composedUid) {
    const cap = getCapabilities(source.card).find(
      c => c.composed && c.trigger === "on_activation" && c.uid === action.composedUid,
    );
    if (!cap?.composed) return state;
    source.tapped = true;
    let chosen: string[] | undefined;
    if (action.targetMap) {
      const multi: string[] = [];
      for (let i = 0; action.targetMap[`${cap.uid}#${i}`] != null; i++) multi.push(action.targetMap[`${cap.uid}#${i}`]);
      if (multi.length) chosen = multi;
    }
    if (!chosen && action.targetInstanceId) chosen = [action.targetInstanceId];
    resolveComposedEffect(cap.composed, source, player, opponent, chosen, false,
      { trigger: cap.trigger, capUid: cap.uid });
    settleDeathsBothSides(player, opponent);
    recalculateAuras(player, opponent);
    newState.lastAction = action;
    checkWinCondition(newState);
    return newState;
  }

  const instances = source.card.keyword_instances ?? [];
  const instance = instances[action.instanceIdx];
  if (!instance || instance.mode !== "tap") return state;

  source.tapped = true;
  if (instance.id === "divination") {
    // Divination AU TAP : même règle qu'à l'invocation — le joueur garde la
    // carte de son choix sur le dessus, les autres passent dessous. Le
    // résolveur curé, lui, tire au hasard (« pas de modale hors invocation ») ;
    // c'était indiscernable d'un pouvoir qui ne fait rien, et contraire au
    // texte du mot-clé, qui promet « dans l'ordre choisi ».
    // Index absent (client sans modale, deck trop court) → 0 : on garde la
    // première carte. Déterministe, donc rejouable à l'identique par le pair.
    const countDiv = Math.min(3, player.deck.length);
    if (countDiv > 0) {
      const topDiv = player.deck.splice(0, countDiv);
      const idxDiv = Math.min(Math.max(0, action.divinationChoiceIndex ?? 0), topDiv.length - 1);
      player.deck.unshift(topDiv[idxDiv]);
      for (let i = 0; i < topDiv.length; i++) {
        if (i !== idxDiv) player.deck.push(topDiv[i]);
      }
    }
  } else if (instance.id === "selection" || instance.id === "selection_magique" || instance.id === "renfort_royal") {
    // Sélection au tap : la carte choisie (modale « 1 parmi 3 ») est ajoutée en
    // main. Lookup dans les deux pools comme pour l'invocation.
    if (action.selectionCardId != null && player.hand.length < MAX_HAND_SIZE) {
      const chosenCard = newState.factionCardPool?.find(c => c.id === action.selectionCardId)
        ?? newState.allSpellsPool?.find(c => c.id === action.selectionCardId);
      if (chosenCard) player.hand.push(createCardInstance(chosenCard));
    }
  } else {
    resolveCuratedKeywordEffect(instance.id, instance.x ?? 1, source, player, opponent, action.targetInstanceId, instance);
  }

  // Le pouvoir curé peut TUER (Impact, Souffle de feu, Douleur…). La branche
  // composée ci-dessus réglait ses morts, pas celle-ci : une unité abattue par
  // une Baliste à Répétition restait affichée à 0 PV.
  settleDeathsBothSides(player, opponent);
  recalculateAuras(player, opponent);
  newState.lastAction = action;
  checkWinCondition(newState);
  return newState;
}

// ============================================================
// PENDING TRIGGER RESOLUTION
// ============================================================

// Résout un déclencheur interactif en attente (le contrôleur a choisi une cible).
// Retire le déclencheur de la file, exécute l'effet (Remontée pour l'instant) ;
// d'éventuels enchaînements s'empilent dans pendingTriggerSink (rattaché par
// applyAction).
/** Dépense du compteur d'Épargne : accorde la carte choisie et remet le
 *  compteur à zéro.
 *
 *  TOUT est re-validé ici, sans exception : cette fonction s'exécute aussi chez
 *  l'ADVERSAIRE au rejeu de l'action, et il n'existe aucune validation serveur
 *  dans ce jeu (le moteur tourne en double, Supabase ne fait que transporter).
 *  Un client modifié pourrait donc réclamer n'importe quelle carte ; les gardes
 *  ci-dessous sont la seule barrière.
 *
 *  Chaque refus renvoie `state` inchangé — en particulier le compteur n'est
 *  JAMAIS remis à zéro sur un refus : une épargne perdue sans contrepartie
 *  serait le pire des échecs silencieux. */
export function spendEpargne(state: GameState, action: SpendEpargneAction): GameState {
  const player = state.players[state.currentPlayerIndex];
  const level = player.epargne ?? 0;
  // Compteur vide (ou capacité jamais déclenchée) : rien à dépenser.
  if (level < 1) return state;
  // Main pleine : on refuse AVANT de consommer, sinon l'épargne partirait en
  // fumée pour une carte que le joueur ne recevrait pas.
  if (player.hand.length >= MAX_HAND_SIZE) return state;

  const pool = state.factionCardPool;
  if (!pool || pool.length === 0) return state;
  const card = pool.find(c => c.id === action.selectionCardId);
  if (!card) return state;

  // Mêmes règles de pool que l'offre construite côté client (getSelectionCards
  // avec exactCost) : rareté, alignement, et coût EXACTEMENT égal au compteur.
  if (card.rarity !== "Commune") return state;
  if (card.mana_cost !== level) return state;
  const heroSource = { faction: player.hero.heroDefinition?.faction ?? null };
  if (!card.faction || !factionsForSelectionAlignment(heroSource, player).has(card.faction)) return state;

  const newState = cloneStateForAction(state);
  newState.factionCardPool = pool;
  newState.allSpellsPool = state.allSpellsPool;

  const me = newState.players[newState.currentPlayerIndex];
  me.hand.push(createCardInstance(card));
  me.epargne = 0; // reste à 0 (visible), ne redevient jamais null.
  newState.lastAction = action;
  return newState;
}

export function resolvePendingTrigger(state: GameState, action: ResolvePendingTriggerAction): GameState {
  const pool = state.factionCardPool;
  const allPool = state.allSpellsPool;
  const newState = cloneStateForAction(state);
  newState.factionCardPool = pool;
  newState.allSpellsPool = allPool;

  const queue = newState.pendingTriggers ?? [];
  const idx = queue.findIndex(t => t.id === action.triggerId);
  if (idx === -1) return state; // déclencheur introuvable → no-op
  const trigger = queue[idx];
  queue.splice(idx, 1);
  newState.pendingTriggers = queue;

  applyOnePendingTrigger(newState, trigger, {
    targetInstanceId: action.targetInstanceId,
    targetInstanceIds: action.targetInstanceIds,
    selectionCardId: action.selectionCardId,
  });

  recalculateAuras(newState.players[0], newState.players[1]);
  newState.lastAction = action;
  checkWinCondition(newState);
  // Le choix qui vient d'être tranché a pu vider le pool du choix SUIVANT.
  pruneUnresolvableTriggers(newState);

  // Reprise de la séquence de fin de tour dans l'ordre strict du plateau : s'il
  // reste des effets fin-de-tour en file, on les traite (automatiques compris)
  // jusqu'au prochain interactif ou la finalisation. `endOfTurnQueue` défini ⇒
  // on est encore dans la phase d'effets ; undefined ⇒ file épuisée (on est dans
  // la queue de finalisation / Remontée mort), on garde l'ancien comportement.
  if (newState.endTurnPending && newState.endOfTurnQueue !== undefined) {
    return advanceEndOfTurn(newState);
  }
  if (newState.endTurnPending && (newState.pendingTriggers?.length ?? 0) === 0) {
    return finishEndTurn(newState);
  }
  return newState;
}

/** Cibles désignées d'un déclencheur en attente : la LISTE si l'effet en
 *  demandait plusieurs, sinon la cible unique. `undefined` quand rien n'a été
 *  choisi — et surtout jamais un tableau vide, que `selectComposedTargets`
 *  interpréterait comme « choix fourni », court-circuitant son repli. */
function pendingChoiceIds(
  choice: { targetInstanceId?: string; targetInstanceIds?: string[] },
): string[] | undefined {
  if (choice.targetInstanceIds?.length) return choice.targetInstanceIds;
  return choice.targetInstanceId ? [choice.targetInstanceId] : undefined;
}

/** Résout UN déclencheur interactif sur un choix donné (cible / carte). Partagé
 *  par la résolution manuelle (resolvePendingTrigger) et le repli automatique
 *  (autoResolvePendingTriggers). `newState` est déjà cloné, pools rattachés. */
function applyOnePendingTrigger(
  newState: GameState,
  trigger: import("./types").PendingTrigger,
  choice: { targetInstanceId?: string; targetInstanceIds?: string[]; selectionCardId?: number },
): void {
  const controller = newState.players.find(p => p.id === trigger.controllerId);
  const other = newState.players.find(p => p.id !== trigger.controllerId);

  if (trigger.capUid) {
    // Variante « fin de tour » : résout l'effet composé sur la cible choisie.
    if (controller && other) {
      const source = controller.board.find(c => c.instanceId === trigger.sourceInstanceId);
      const cap = source ? getCapabilities(source.card).find(c => c.uid === trigger.capUid && c.composed) : undefined;
      if (cap?.composed) {
        withComposedMode(triggerToKeywordMode(cap.trigger), () =>
          // noSuspend : on résout DÉJÀ un choix en attente — un contenu qui
          // voudrait suspendre à son tour (Sélection) doit retomber sur le
          // tirage aléatoire plutôt que d'empiler un second déclencheur.
          resolveComposedEffect(cap.composed!, source ?? null, controller, other,
            // Liste d'abord (effet à plusieurs cibles), repli sur la cible
            // unique historique. Vide ⇒ undefined, pour que selectComposedTargets
            // retombe sur son chemin « choix sans désignation » au lieu de
            // croire qu'on lui a passé une liste de zéro cible.
            pendingChoiceIds(choice), false,
            { trigger: cap.trigger, capUid: trigger.capUid, noSuspend: true }));
        const deadC = cleanDeadCreatures(controller);
        const deadO = cleanDeadCreatures(other);
        processDeathTriggers(deadC, controller, other);
        processDeathTriggers(deadO, other, controller);
      }
    }
  } else if (trigger.selectionType) {
    // Variante « Sélection en fin de tour » : la carte choisie va en main.
    if (controller && choice.selectionCardId != null && controller.hand.length < MAX_HAND_SIZE) {
      const chosenCard = newState.factionCardPool?.find(c => c.id === choice.selectionCardId)
        ?? newState.allSpellsPool?.find(c => c.id === choice.selectionCardId);
      if (chosenCard) controller.hand.push(createCardInstance(chosenCard));
    }
  } else if (trigger.kw === "remontee") {
    if (controller && other) {
      resolveRemontee(choice.targetInstanceId, trigger.sourceInstanceId, controller, other);
    }
  } else if (trigger.kw === "impact") {
    // X porté par le trigger (la source est au cimetière en mode mort). Source
    // null : pas de vol de vie sur Impact.
    if (controller && other) {
      applyImpactTo(choice.targetInstanceId, trigger.x ?? 0, null, controller, other);
    }
  } else if (trigger.kw) {
    // Mots-clés curés ciblés génériques (Affaiblissement, Bénédiction,
    // Tactique, Sacrifice, Permutation, Malédiction, Mimique, Métamorphose…).
    // La source est relocalisée plateau → cimetière → main (elle a pu mourir
    // entre le déclenchement et le choix) ; introuvable ⇒ fizzle silencieux.
    // La cible explicite court-circuite le defer dans resolveCuratedKeywordEffect.
    if (controller && other && choice.targetInstanceId) {
      const src = controller.board.find(c => c.instanceId === trigger.sourceInstanceId)
        ?? controller.graveyard.find(c => c.instanceId === trigger.sourceInstanceId)
        ?? controller.hand.find(c => c.instanceId === trigger.sourceInstanceId);
      if (src) {
        resolveCuratedKeywordEffect(
          trigger.kw, trigger.x ?? 1, src, controller, other, choice.targetInstanceId,
          { id: trigger.kw, x: trigger.x, y: trigger.y } as KeywordInstance,
        );
        const deadC = cleanDeadCreatures(controller);
        const deadO = cleanDeadCreatures(other);
        processDeathTriggers(deadC, controller, other);
        processDeathTriggers(deadO, other, controller);
      }
    }
  }
}

/** Repli à l'expiration du chrono : draine TOUTE la file `pendingTriggers` en
 *  choisissant au hasard (rng semée → déterministe entre les deux clients) un
 *  choix valide pour chacun, puis termine le tour. */
export function autoResolvePendingTriggers(state: GameState): GameState {
  const pool = state.factionCardPool;
  const allPool = state.allSpellsPool;
  const newState = cloneStateForAction(state);
  newState.factionCardPool = pool;
  newState.allSpellsPool = allPool;

  // Draine TOUTE la séquence de fin de tour de façon déterministe (rng semée →
  // identique entre clients). En ordre strict il n'y a qu'UN déclencheur
  // interactif à la fois : on le résout au hasard, puis on reprend la file
  // (automatiques + interactif suivant) jusqu'à la bascule. finishEndTurn, s'il
  // s'exécute via advanceEndOfTurn, écrase ce lastAction par "end_turn" (comme
  // avant). Le garde borne la boucle (chaque itération retire ≥1 effet).
  newState.lastAction = { type: "auto_resolve_pending_triggers" };
  let guard = 0;
  pruneUnresolvableTriggers(newState);
  // ⚠️ `st` est RÉASSIGNÉ : `advanceEndOfTurn` peut aboutir à `finishEndTurn`,
  // qui termine par `return startTurn(...)` — et `startTurn` CLONE l'état.
  // Ignorer ce retour (ce que faisait cette boucle) revenait à jeter tout le
  // début de tour du joueur entrant : bascule d'index appliquée, mais NI
  // incrément de tour, NI mana rechargé, NI pioche, NI purge des statuts, NI
  // remise à zéro de `turnStartedAt`. Le joueur entrant héritait donc d'un
  // chrono DÉJÀ expiré, rendait la main aussitôt, et le tour repartait au
  // joueur précédent — le « il rejoue un tour, et encore, et encore »
  // rapporté en partie (Esprit des Cauris Dispersés, renvoi en main au choix).
  let st = newState;
  while ((st.pendingTriggers?.length ?? 0) > 0 && guard++ < 500) {
    const queue = st.pendingTriggers ?? [];
    st.pendingTriggers = [];
    for (const trigger of queue) {
      let choice: { targetInstanceId?: string; selectionCardId?: number } = {};
      if (trigger.selectionType) {
        const opts = trigger.selectionOptionIds ?? [];
        if (opts.length > 0) choice = { selectionCardId: opts[Math.floor(rng() * opts.length)] };
      } else if (trigger.capUid) {
        const targets = endOfTurnTriggerTargets(st, trigger);
        if (targets.length > 0) choice = { targetInstanceId: targets[Math.floor(rng() * targets.length)] };
      } else if (trigger.kw) {
        // Pool générique par mot-clé (Remontée, Impact, et tous les curés
        // ciblés du chantier multi-déclencheurs) — cf. deferredKwTargetIds.
        const controller = st.players.find(p => p.id === trigger.controllerId);
        const other = st.players.find(p => p.id !== trigger.controllerId);
        if (controller && other) {
          const targets = deferredKwTargetIds(trigger.kw, controller, other, trigger.sourceInstanceId);
          if (targets.length > 0) choice = { targetInstanceId: targets[Math.floor(rng() * targets.length)] };
        }
      }
      applyOnePendingTrigger(st, trigger, choice);
    }
    recalculateAuras(st.players[0], st.players[1]);
    checkWinCondition(st);
    pruneUnresolvableTriggers(st);
    // Reprise de la file fin-de-tour : résout les automatiques suivants et met
    // éventuellement le prochain interactif en file (nouvelle itération) ou
    // finalise + bascule le tour (finishEndTurn).
    st = st.endTurnPending && st.endOfTurnQueue !== undefined
      ? advanceEndOfTurn(st)
      : st;
  }

  // Sécurité : plus aucun choix en attente mais la bascule n'est pas faite. Deux
  // situations, et l'ancienne version n'en couvrait qu'une : `endOfTurnQueue`
  // encore DÉFINIE (fût-elle vide) signifie qu'on est au milieu de la séquence
  // d'effets — il faut la reprendre, pas la court-circuiter. Le test
  // `=== undefined` ratait ce cas et laissait le tour en pause pour toujours dès
  // que la file se vidait par PURGE plutôt que par résolution.
  if (st.endTurnPending && (st.pendingTriggers?.length ?? 0) === 0) {
    return st.endOfTurnQueue !== undefined
      ? advanceEndOfTurn(st)
      : finishEndTurn(st);
  }
  return st;
}

/** Whether the tap-mode activation of `kw` requires a target. Mirrors
 *  the switch in `getTapActivateTargets` but operates without a state
 *  reference — used by UI shortcuts (double-click activates a tap kw
 *  only when no picker is needed). */
export function tapKeywordNeedsTarget(kw: Keyword): boolean {
  switch (kw) {
    case "vampirisme":
    case "remontee":
    case "impact":
    case "affaiblissement":
    case "benediction":
    case "tactique":
    case "sacrifice":
    case "permutation":
    case "malediction":
    case "mimique":
    case "metamorphose":
      return true;
    default:
      return false;
  }
}

/** Targets eligible for a tap-mode activation of `kw`. Returns null when
 *  the keyword doesn't need a picker (auto-resolves on activation). */
export function getTapActivateTargets(state: GameState, kw: Keyword, sourceInstanceId?: string): string[] | null {
  const player = state.players[state.currentPlayerIndex];
  const opponent = state.players[state.currentPlayerIndex === 0 ? 1 : 0];
  // Activation d'une capacité de créature (tap) : Transcendance (immunité aux
  // sorts) ne protège pas la cible ici — seuls Invisible / Ombre non révélée.
  const filterTargetable = (creatures: CardInstance[]) =>
    creatures.filter(c =>
      !hasKw(c, "invisible")
      && !(hasKw(c, "ombre") && !c.ombreRevealed)
    );
  switch (kw) {
    case "vampirisme":
      return filterTargetable(opponent.board).map(c => c.instanceId);
    case "remontee":
      // N'importe quelle unité des deux plateaux (hors source / Ancré / non-ciblable).
      return [...player.board, ...opponent.board]
        .filter(c => canBeRemonteed(c, sourceInstanceId ?? null))
        .map(c => c.instanceId);
    case "impact":
      // Créature OU héros, tout bord.
      return impactTargetIds(player, opponent);
    case "affaiblissement":
    case "benediction":
    case "tactique":
    case "sacrifice":
    case "permutation":
    case "malediction":
    case "mimique":
    case "metamorphose":
      // Mots-clés curés ciblés du chantier multi-déclencheurs : même pool que
      // le picker différé (mort/fin de tour) pour une UX cohérente.
      return deferredKwTargetIds(kw, player, opponent, sourceInstanceId ?? null);
    default:
      return null;
  }
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
/** Carte « sort » synthétique portant l'effet composé d'un pouvoir de héros en
 *  une unique capacité spell_resolution. Utilisée par le calcul des slots de
 *  ciblage ET par la résolution — source unique pour qu'ils ne divergent pas.
 *  uid stable "hp_0" → les clés targetMap concordent entre store et moteur.
 *  Null si le pouvoir n'est pas en mode "composed". */
export function heroPowerSyntheticCard(heroDef: HeroDefinition): Card | null {
  const effect = heroDef.powerEffect;
  if (!effect || effect.mode !== "composed" || !effect.composed) return null;
  return {
    id: -1, name: heroDef.powerName ?? "Pouvoir", mana_cost: heroDef.powerCost,
    card_type: "spell", attack: 0, health: 0,
    effect_text: heroDef.powerDescription ?? "",
    keywords: [], spell_keywords: null, spell_effects: null, image_url: null,
    capabilities: [{
      uid: "hp_0", trigger: "spell_resolution", effectKind: "immediate",
      abilityId: "_composed", composed: effect.composed,
    }],
  } as Card;
}

/** Descripteur des slots à CHOISIR par le joueur pour un pouvoir composé
 *  (homogène : une seule capacité, N cibles de même type). Null quand aucun
 *  picker n'est requis (self / hero-only / random / automatic / all / scatter /
 *  effet sur le contrôleur) — résolu alors avec un targetMap vide. */
export function heroPowerComposedChoice(
  heroDef: HeroDefinition,
): { uid: string; count: number; type: SpellTargetType } | null {
  const synth = heroPowerSyntheticCard(heroDef);
  if (!synth) return null;
  const SELECTABLE: SpellTargetType[] = ["any", "any_creature", "friendly_creature", "enemy_creature", "friendly_graveyard_to_board"];
  const slots = getSpellTargetSlots(synth).filter(s => SELECTABLE.includes(s.type));
  if (!slots.length) return null;
  return { uid: slots[0].slot.split("#")[0], count: slots.length, type: slots[0].type };
}

export function useHeroPower(state: GameState, action: HeroPowerAction): GameState {
  const pool = state.factionCardPool;
  const allPool = state.allSpellsPool;
  const newState = cloneStateForAction(state);
  newState.factionCardPool = pool;
  newState.allSpellsPool = allPool;
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
      applyGrantedKeyword(target, effect.keywordId, effect.params, true);
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
              effect_text: "",
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
          // Capacités portant une race/clan (Appel Suprême, Renforcement
          // multiple…) : sans ce passage, le résolveur ne reçoit pas la race
          // et l'effet est un no-op.
          race: effect.race,
          clan: effect.clan,
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
        // Selection / Renfort Royal / Sélection magique : the picker stores
        // the chosen card id in `selectionCardId` ; mirror it into every slot
        // the resolver might read so any of the three keywords resolves.
        if (action.selectionCardId != null) {
          const sid = String(action.selectionCardId);
          targetMap.selection_0 = sid;
          targetMap.renfort_royal_0 = sid;
          targetMap.selection_magique_0 = sid;
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

    case "composed": {
      // Mode 4 : effet composé résolu comme un sort lancé par le héros. On
      // réutilise EXACTEMENT le chemin sort (carte synthétique → interpréteur
      // composé via targetMap), suivi du même nettoyage post-sort (morts +
      // râles d'agonie ; recalculateAuras ci-dessous complète la parité).
      const synth = heroPowerSyntheticCard(heroDef);
      if (synth) {
        runComposedCapsForCard(synth, "spell_resolution", null, player, opponent, action.targetMap);
        const pDead = cleanDeadCreatures(player);
        const oDead = cleanDeadCreatures(opponent);
        processDeathTriggers(pDead, player, opponent);
        processDeathTriggers(oDead, opponent, player);
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
  if (effect.mode === "composed") return heroPowerComposedChoice(heroDef) != null;
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
  if (effect.mode === "composed") {
    const choice = heroPowerComposedChoice(heroDef);
    const synth = heroPowerSyntheticCard(heroDef);
    if (!choice || !synth) return [];
    // Exhumation composée : cibles cimetière filtrées par coût (getSpellTargets
    // ne filtrerait pas). Sinon chemin plateau/héros standard.
    if (choice.type === "friendly_graveyard_to_board") return getComposedGraveyardTargets(state, synth, choice.uid);
    return getSpellTargets(state, synth, choice.type);
  }
  return []; // aura → no target
}

// ============================================================
// MULLIGAN
// ============================================================

export function applyMulligan(state: GameState, action: MulliganAction): GameState {
  const pool = state.factionCardPool;
  const allPool = state.allSpellsPool;
  const newState = cloneStateForAction(state);
  newState.factionCardPool = pool;
  newState.allSpellsPool = allPool;
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
    // Étincelle de Mana depuis le pool (porte l'illustration et le nom FR de la
    // base) ; sinon repli dégradé. Voir mana-spark.ts pour la tolérance aux
    // variantes d'écriture — une égalité stricte sur "Mana Spark" échouait.
    const poolManaSpark = newState.factionCardPool?.find(isManaSpark);
    const manaSpark: Card = poolManaSpark ?? MANA_SPARK_FALLBACK;
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
  currentPlayerId = state.players[state.currentPlayerIndex].id;
  currentPlayerIds = state.players.map(p => p.id);
  // Vidé ici, repositionné par cloneStateForAction dans chaque handler : jamais
  // de référence héritée de l'action précédente (cf. la déclaration).
  currentBoardPlayers = [];
  // Filet : le try/finally de triggerOnDraw le ramène déjà à 0, mais une action
  // qui jetterait en plein enchaînement laisserait sinon le compteur en l'air
  // et brûlerait la marge de la SUIVANTE.
  drawTriggerDepth = 0;
  currentCardPools = { factionCardPool: state.factionCardPool, allSpellsPool: state.allSpellsPool };
  currentFormatCode = state.formatCode ?? null;
  pendingTriggerSink = [];
  sequentialHitsSink = [];
  damageLedgerSink = [];
  drawTriggerSink = [];
  abilitySfxSink = [];
  exileCostSink = [];
  lethalSpellActive = false;
  powerStrikeSink = [];
  composedStrikeMode = undefined;
  // Indice cosmétique (hors hash) : on efface la provenance de buff sur toutes
  // les instances pour que le popup « +X/+Y » de CETTE action ne soit teinté
  // que par un effet déclenché MAINTENANT — sinon un mode périmé d'une action
  // précédente pourrait mal colorer un buff non-composé (aura, mot-clé) ultérieur.
  for (const p of state.players) {
    for (const c of p.board) c.lastBuffMode = undefined;
    for (const c of p.hand) c.lastBuffMode = undefined;
  }
  // Load the RNG position carried in the state so this action's random draws
  // continue the exact stream both clients share (rather than a module
  // singleton that can drift). Written back into `result` below.
  if (state.rngState !== undefined) rngState = state.rngState;

  let result: GameState;
  switch (action.type) {
    case "mulligan": result = applyMulligan(state, action); break;
    case "play_card": result = playCard(state, action); break;
    case "attack": result = attack(state, action); break;
    case "end_turn": result = endTurn(state); break;
    case "hero_power": result = useHeroPower(state, action); break;
    case "tap_activate": result = tapActivate(state, action); break;
    case "concede": result = concede(state, action); break;
    case "resolve_pending_trigger": result = resolvePendingTrigger(state, action); break;
    case "spend_epargne": result = spendEpargne(state, action); break;
    case "auto_resolve_pending_triggers": result = autoResolvePendingTriggers(state); break;
    default: result = state;
  }

  // « Sous 15 PV » : balayage post-action (couvre dégâts au héros, coût en
  // vie, fatigue… quel que soit le handler). Les frames poussées sont résolues
  // par le drainStack juste en dessous.
  if (result !== state) checkLowHpTriggers(result);

  // Vide la pile d'effets LIFO produite pendant l'action (interruption +
  // résolution des morts via settleDeaths). No-op tant qu'aucun producteur n'a
  // poussé de frame (migration incrémentale). Suspend si un choix joueur reste
  // requis (la pile persiste alors dans l'état).
  if (result !== state) drainStack(result);

  // Un effet « Sous 15 PV » résolu dans ce drain peut avoir tué un héros — les
  // handlers ont déjà tranché AVANT ce drain, il faut re-vérifier après.
  if (result !== state && result.phase === "playing") checkWinCondition(result);

  // Rattache les déclencheurs interactifs créés pendant cette action (mort /
  // retour de Remontée au tour du contrôleur) à l'état retourné.
  if (pendingTriggerSink.length > 0 && result !== state) {
    result.pendingTriggers = [...(result.pendingTriggers ?? []), ...pendingTriggerSink];
  }
  // Rattache les points séquentiels (scatter/Tempête) émis pendant l'action,
  // dans l'ordre, pour que le store anime un popup + un burst par point.
  if (sequentialHitsSink.length > 0 && result !== state) {
    result.sequentialHits = [...(result.sequentialHits ?? []), ...sequentialHitsSink];
  }
  // Rattache le registre des dégâts appliqués : le store s'en sert UNIQUEMENT
  // pour les créatures mortes pendant l'action (les survivantes restent
  // couvertes par le diff de PV, qui gère aussi les baisses non-dégât).
  if (damageLedgerSink.length > 0 && result !== state) {
    result.damageLedger = [...(result.damageLedger ?? []), ...damageLedgerSink];
  }
  // Rattache les cartes dont l'effet « à la pioche » a résolu, dans l'ordre de
  // pioche, pour que le store les révèle comme des sorts lancés.
  if (drawTriggerSink.length > 0 && result !== state) {
    result.drawTriggerEvents = [...(result.drawTriggerEvents ?? []), ...drawTriggerSink];
  }
  // Rattache les capacités qui ont sonné (bruitage par capacité).
  if (abilitySfxSink.length > 0 && result !== state) {
    result.abilitySfxEvents = [...(result.abilitySfxEvents ?? []), ...abilitySfxSink];
  }
  // Rattache l'exil payé pendant l'action (animation de déchirure au deck).
  if (exileCostSink.length > 0 && result !== state) {
    result.exileCostEvents = [...(result.exileCostEvents ?? []), ...exileCostSink];
  }
  // Rattache les frappes de pouvoir déclenchées (flèches source→cible colorées
  // par mode) émises pendant l'action.
  if (powerStrikeSink.length > 0 && result !== state) {
    result.powerStrikes = [...(result.powerStrikes ?? []), ...powerStrikeSink];
  }
  // Horloge du CHOIX en cours. Posée ici, au seul endroit qui voit TOUS les
  // producteurs de déclencheurs (fin de tour, râle d'agonie, sort…), plutôt
  // qu'à chaque site d'empilage. Remise à zéro dès que la tête de file change :
  // chaque choix repart avec sa fenêtre pleine, y compris le 3ᵉ d'affilée.
  // Heure murale locale, comme turnStartedAt — exclue du hash de synchro.
  if (result !== state) {
    const head = result.pendingTriggers?.[0]?.id;
    const prevHead = state.pendingTriggers?.[0]?.id;
    if (head && head !== prevHead) result.choiceStartedAt = Date.now();
    else if (!head) result.choiceStartedAt = undefined;
  }
  // Persist the advanced RNG position into the returned state so the next
  // action (here or on the other client) resumes the same stream.
  if (result !== state) result.rngState = rngState;
  return result;
}

function concede(state: GameState, action: { playerId: string }): GameState {
  const next = deepClone(state);
  const conceder = next.players.findIndex((p) => p.id === action.playerId);
  if (conceder !== -1) {
    next.winner = next.players[conceder === 0 ? 1 : 0].id;
  }
  next.phase = "finished";
  return next;
}

// ============================================================
// QUERY HELPERS (for UI)
// ============================================================

/** Coût en mana RÉELLEMENT payé pour jouer cette carte depuis la main, toutes
 *  réductions appliquées : Concentration (gravée sur l'instance), Canalisation
 *  (sorts, plancher à 1) puis Entraide (créatures). Source unique — le moteur
 *  la déduit, la main l'affiche et la jauge la réserve pendant un ciblage :
 *  trois surfaces qui divergeaient dès qu'une règle changeait. */
export function effectiveManaCost(cardInstance: CardInstance, player: PlayerState): number {
  const card = cardInstance.card;
  // Tokens (token_id != null) : la base en main est floor((atk+pv)/2), pas le 0
  // du plateau — un token rebondi en main ne doit pas être gratuit à rejouer.
  let manaCost = Math.max(0, getTokenManaCost(card) - (cardInstance.manaCostReduction ?? 0));
  if (card.card_type === "spell") {
    const canalisationCount = player.board.filter(c => hasKw(c, "canalisation")).length;
    // Canalisation ne peut jamais faire descendre un sort sous 1 mana. Le
    // plancher est min(1, coût) pour ne pas *augmenter* un sort déjà à 0
    // (ex. réduit par Concentration) tout en bloquant la réduction à 1 sinon.
    manaCost = Math.max(Math.min(1, manaCost), manaCost - canalisationCount);
  }
  if (card.card_type === "creature") {
    manaCost = Math.max(0, manaCost - getEntraideReduction(card, player.board));
  }
  return manaCost;
}

export function canPlayCard(state: GameState, cardInstanceId: string): boolean {
  const player = state.players[state.currentPlayerIndex];
  const card = player.hand.find(c => c.instanceId === cardInstanceId);
  if (!card) return false;
  // Concentration baseline reduction (see playCard for full rationale).
  // Token baseline override (see getTokenManaCost): in-hand tokens cost
  // floor((attack+health)/2) instead of the on-board 0.
  const manaCost = effectiveManaCost(card, player);
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
  // Même règle que dans playCard : sans assez de cartes à exiler, injouable.
  if (getExileCost(card.card) > player.deck.length) return false;
  // Sacrifices free up board slots, so the test compares the final board size.
  if (card.card.card_type === "creature" &&
      player.board.length - sacrificeCost + 1 > MAX_BOARD_SIZE) return false;
  // Un SORT qui réclame une cible et n'en trouve AUCUNE ne partirait que dans le
  // vide : il se consumerait sans effet, et le joueur perdrait carte et mana
  // sans rien obtenir. Vu en partie avec « Marque de Faiblesse » (Affaiblissement
  // sur une créature ennemie) alors que la seule unité adverse était tapie dans
  // l'Ombre, donc intargetable.
  //
  // On exige que TOUS les slots soient vides : un sort à plusieurs cibles dont
  // une seule est servie reste jouable, son effet partiel valant mieux que rien.
  //
  // Restreint aux SORTS : une créature garde son corps même si son effet
  // d'invocation ne trouve personne — la poser reste un jeu légitime.
  //
  // Garde d'INTERFACE seulement. `playCard` ne la reprend pas volontairement :
  // il rejoue aussi les actions journalisées chez l'adversaire, et une Ombre
  // révélée à un instant différent des deux côtés y ferait diverger le verdict.
  if (card.card.card_type === "spell") {
    const slots = getSpellTargetSlots(card.card);
    if (slots.length > 0
      && slots.every(sl => getSpellTargets(state, card.card, sl.type).length === 0)) {
      return false;
    }
  }
  return true;
}

export function canAttack(state: GameState, attackerInstanceId: string): boolean {
  const player = state.players[state.currentPlayerIndex];
  const attacker = player.board.find(c => c.instanceId === attackerInstanceId);
  if (!attacker) return false;
  if (attacker.attacksRemaining <= 0) return false;
  // MTG-strict: a tapped creature (tap-mode keyword fired this turn)
  // can't also attack.
  if (attacker.tapped) return false;
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
  // Provocation tapie dans l'ombre : ignorée tant qu'elle n'est pas révélée
  // (cf. attackCreature — sinon plus aucune cible n'était proposée).
  const relevantTaunts2 = attackerFlies2
    ? []
    : opponent.board.filter(c => hasKw(c, "taunt") && !isHiddenShadow(c));

  // Filter out Ombre (stealth) units that haven't acted yet
  const targetableEnemies = opponent.board.filter(c => !isHiddenShadow(c));

  if (relevantTaunts2.length > 0) {
    return relevantTaunts2.map(c => c.instanceId);
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
  "sacrifice", "corruption", "malediction", "affaiblissement", "impact",
  "permutation", "vampirisme", "mimique", "metamorphose",
  "benediction", "tactique", "remontee", "conferer",
  // Dévoration : `getCreatureTargets` savait DÉJÀ bâtir sa liste de cibles,
  // mais son absence ici rendait `creatureNeedsTarget` faux — le picker ne
  // s'ouvrait jamais et le moteur retombait sur le tirage au sort. Deux listes
  // à tenir d'accord, une seule mise à jour.
  "devoration",
  // Même panne, deux mots-clés de plus, constatés en partie : Incinération
  // recyclait TOUJOURS le cimetière adverse (repli `incinerationVictim`), et
  // Retour différé renvoyait une unité AU HASARD des deux plateaux (repli de
  // `resolveRetourDiffere`). Les deux savaient pourtant se faire cibler.
  // `creature-targeting-coverage.test.ts` interdit désormais la récidive.
  "incineration", "retour_differe",
];

/** Première capacité composée à l'entrée demandant un ciblage interactif :
 *  désignation "au choix", N cibles (1 ou plus), unité, sur le plateau. */
function firstOnPlayComposedChoiceCap(card: Card): import("./types").Capability | undefined {
  return getCapabilities(card).find((c) => {
    const t = c.composed?.target;
    return !!c.composed && c.trigger === "on_play" && !!t
      && t.designation === "choice" && typeof t.count === "number" && t.count >= 1
      && (t.entity === "unit" || t.entity === "both") && t.location === "board";
  });
}

/** Première capacité composée à l'entrée demandant un ciblage CIMETIÈRE
 *  interactif (exhumation composée) : au choix, 1 unité, cimetière allié.
 *  Volontairement DISJOINTE de firstOnPlayComposedChoiceCap (plateau-only) pour
 *  ne pas ré-router les picks cimetière dans le picker plateau. */
function firstOnPlayComposedGraveyardChoiceCap(card: Card): import("./types").Capability | undefined {
  return getCapabilities(card).find((c) => {
    const t = c.composed?.target;
    return !!c.composed && c.trigger === "on_play" && !!t
      && t.designation === "choice" && typeof t.count === "number" && t.count >= 1
      && t.entity === "unit" && t.location === "graveyard" && t.side === "ally";
  });
}

/** True si la créature ouvre un picker cimetière composé à l'entrée. */
export function creatureNeedsComposedGraveyardTarget(card: Card): boolean {
  return card.card_type === "creature" && !!firstOnPlayComposedGraveyardChoiceCap(card);
}

/** uid + nombre de cibles de la capacité composée cimetière à l'entrée, ou null. */
export function getCreatureComposedGraveyardChoice(card: Card): { uid: string; count: number } | null {
  const cap = firstOnPlayComposedGraveyardChoiceCap(card);
  const count = cap?.composed?.target?.count;
  return cap && typeof count === "number" ? { uid: cap.uid, count } : null;
}

/** Descripteur de ciblage composé d'une créature à l'entrée (pour le store :
 *  uid de la capacité, nombre de cibles, type de cible). null si aucun. */
/** uid du premier effet composé activable (on_activation) d'une créature, ou null. */
export function getCreatureTapComposedUid(card: Card): string | null {
  if (card.card_type !== "creature") return null;
  const cap = getCapabilities(card).find(c => c.composed && c.trigger === "on_activation");
  return cap?.uid ?? null;
}

/** Cibles valides pour l'activation d'un effet composé (uid) en désignation
 *  "au choix", 1 cible unité plateau. null = pas de ciblage interactif requis
 *  (hasard / toutes / héros / multi → résolus côté moteur). */
export function getComposedTapTargets(state: GameState, card: Card, uid: string): string[] | null {
  const player = state.players[state.currentPlayerIndex];
  const opponent = state.players[state.currentPlayerIndex === 0 ? 1 : 0];
  const cap = getCapabilities(card).find(c => c.uid === uid && c.composed && c.trigger === "on_activation");
  const t = cap?.composed?.target;
  if (!t || t.designation !== "choice" || (t.entity !== "unit" && t.entity !== "both") || t.location !== "board" || t.count !== 1) return null;
  return composedChoiceTargetIds(t, player, opponent, false); // effet composé de créature (tap)
}

export function getCreatureComposedChoice(
  card: Card,
): { uid: string; count: number; type: SpellTargetType } | null {
  if (card.card_type !== "creature") return null;
  const cap = firstOnPlayComposedChoiceCap(card);
  const t = cap?.composed?.target;
  if (!cap || !t || typeof t.count !== "number") return null;
  const type = composedSlotType(t);
  if (!type) return null;
  return { uid: cap.uid, count: t.count, type };
}

export function creatureNeedsTarget(card: Card): boolean {
  if (card.card_type !== "creature") return false;
  // Only request an on-play target if the targeting keyword actually
  // fires on play. A vampirisme entry that lives only in tap/death mode
  // shouldn't trigger the on-summon picker.
  if (card.keywords.some(kw => CREATURE_TARGETING_KEYWORDS.includes(kw) && cardHasKwOnPlay(card, kw))) return true;
  // Effet composé à l'entrée en désignation "au choix" (1 cible unité, plateau).
  return !!firstOnPlayComposedChoiceCap(card);
}

// ─── "À l'attaque" composed power (trigger on_attack) ──────────────────────

/** True if the card carries any on_attack composed cap — the engine fires it
 *  before combat and the store animates it as a first wave. */
export function hasOnAttackComposed(card: Card): boolean {
  return getCapabilities(card).some((c) => !!c.composed && c.trigger === "on_attack");
}

/** First on_attack composed cap whose target is player-chosen (designation
 *  "choice", count number). null when the power is auto/random/all (no picker). */
function firstOnAttackComposedChoiceCap(card: Card): import("./types").Capability | undefined {
  return getCapabilities(card).find((c) => {
    const t = c.composed?.target;
    return !!c.composed && c.trigger === "on_attack" && !!t
      && t.designation === "choice" && typeof t.count === "number" && t.count >= 1;
  });
}

/** Targeting descriptor for an on_attack choice power (store picker): cap uid,
 *  number of targets, SpellTargetType. null if none / not player-chosen. */
export function getOnAttackComposedChoice(
  card: Card,
): { uid: string; count: number; type: SpellTargetType } | null {
  if (card.card_type !== "creature") return null;
  const cap = firstOnAttackComposedChoiceCap(card);
  const t = cap?.composed?.target;
  if (!cap || !t || typeof t.count !== "number") return null;
  const type = composedSlotType(t);
  if (!type) return null;
  return { uid: cap.uid, count: t.count, type };
}

/** Valid target ids for an on_attack choice power (store picker). */
export function getOnAttackTargets(state: GameState, card: Card): string[] {
  const player = state.players[state.currentPlayerIndex];
  const opponent = state.players[state.currentPlayerIndex === 0 ? 1 : 0];
  const cap = firstOnAttackComposedChoiceCap(card);
  if (!cap?.composed?.target) return [];
  return composedChoiceTargetIds(cap.composed.target, player, opponent, false); // effet composé de créature (à l'attaque)
}

/** Cibles d'Impact (créature OU héros, TOUT bord) : instanceIds des créatures
 *  des deux plateaux (hors invisible / ombre non révélée) + sentinelles héros.
 *  Les sentinelles "enemy_hero"/"friendly_hero" sont relatives au `controller`. */
export function impactTargetIds(controller: PlayerState, other: PlayerState): string[] {
  const targetable = (c: CardInstance) => !hasKw(c, "invisible") && !(hasKw(c, "ombre") && !c.ombreRevealed);
  return [
    ...controller.board.filter(targetable).map(c => c.instanceId),
    ...other.board.filter(targetable).map(c => c.instanceId),
    "enemy_hero", "friendly_hero",
  ];
}

/** Applique X dégâts d'Impact à une cible (créature OU héros). Les sentinelles
 *  héros sont testées AVANT toute recherche sur les plateaux (sinon un hit héros
 *  serait silencieusement perdu). Capacité de créature : isSpellDamage=true,
 *  fromSpell=false → non bloquée par Transcendance (comme Cataclysme/Tempête). */
function applyImpactTo(targetId: string | undefined, x: number, source: CardInstance | null, controller: PlayerState, other: PlayerState): void {
  if (!targetId || x <= 0) return;
  if (targetId === "enemy_hero") { dealDamageToHero(other.hero, x, source); return; }
  if (targetId === "friendly_hero") { dealDamageToHero(controller.hero, x, source); return; }
  const target = findCreatureOnBoard(controller, targetId) ?? findCreatureOnBoard(other, targetId);
  if (target) dealDamageToCreature(target, x, false, true, source, false);
}

export function getCreatureTargets(state: GameState, card: Card): string[] {
  const player = state.players[state.currentPlayerIndex];
  const opponent = state.players[state.currentPlayerIndex === 0 ? 1 : 0];

  // Capacités de créature (Corruption, Malédiction, Permutation, Vampirisme,
  // Mimique, Métamorphose…) : Transcendance n'immunise que les sorts, donc elle
  // n'exclut PAS la cible ici (à la différence d'Invisible / Ombre non révélée).
  const filterEnemyTargetable2 = (creatures: CardInstance[]) =>
    creatures.filter(c =>
      !hasKw(c, "invisible")
      && !(hasKw(c, "ombre") && !c.ombreRevealed)
    );

  // Determine target pool based on the first targeting keyword that's
  // actually firing on play (skip ones that live only in tap/death mode).
  for (const kw of card.keywords) {
    if (!cardHasKwOnPlay(card, kw)) continue;
    switch (kw) {
      case "sacrifice":
      case "benediction":
      case "tactique":
        return player.board.map(c => c.instanceId);
      case "corruption":
      case "malediction":
      case "affaiblissement":
      case "permutation":
      case "vampirisme":
        return filterEnemyTargetable2(opponent.board).map(c => c.instanceId);
      case "impact":
        // Créature OU héros, tout bord (la source n'est pas encore en jeu).
        return impactTargetIds(player, opponent);
      case "mimique":
      case "metamorphose":
        return [
          ...player.board.map(c => c.instanceId),
          ...filterEnemyTargetable2(opponent.board).map(c => c.instanceId),
        ];
      case "remontee":
        // Toute unité des deux plateaux (la source n'est pas encore en jeu),
        // hors Ancré / non-ciblable.
        return [...player.board, ...opponent.board]
          .filter(c => canBeRemonteed(c, null))
          .map(c => c.instanceId);
      case "retour_differe":
        // Mêmes règles de ciblage que Remontée : seule la destination diffère
        // (dessous du deck plutôt que la main).
        return [...player.board, ...opponent.board]
          .filter(c => canBeRemonteed(c, null))
          .map(c => c.instanceId);
      case "devoration":
        // Toute unité des deux plateaux. La source n'est pas encore en jeu, elle
        // ne peut donc pas figurer dans la liste : rien à exclure.
        return [...player.board, ...filterEnemyTargetable2(opponent.board)]
          .map(c => c.instanceId);
      case "incineration":
        // La cible désigne un CAMP, pas une carte : les deux héros suffisent et
        // rendent le geste lisible (« je vise ce cimetière-là »).
        return ["friendly_hero", "enemy_hero"];
    }
  }
  // Repli : cible d'un effet composé à l'entrée "au choix" (unité et/ou héros).
  const cap = firstOnPlayComposedChoiceCap(card);
  if (cap?.composed?.target) {
    return composedChoiceTargetIds(cap.composed.target, player, opponent, false); // effet composé de créature (à l'entrée)
  }
  return [];
}

const GRAVEYARD_TARGETING_KEYWORDS: Keyword[] = ["rappel", "heritage_du_cimetiere", "exhumation"];

export function creatureNeedsGraveyardTarget(card: Card): boolean {
  if (card.card_type !== "creature") return false;
  // Mode-aware : un Rappel/Exhumation/Héritage en mode non-invocation ne doit
  // pas ouvrir le sélecteur de cimetière à l'entrée en jeu.
  return card.keywords.some(kw => GRAVEYARD_TARGETING_KEYWORDS.includes(kw) && cardHasKwOnPlay(card, kw));
}

export function getGraveyardTargets(state: GameState, card: Card): string[] {
  const player = state.players[state.currentPlayerIndex];
  for (const kw of card.keywords) {
    if (!cardHasKwOnPlay(card, kw)) continue;
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
  // Gaté sur le mode on-play : une Divination en tap/mort/etc. ne doit pas
  // ouvrir la modale à l'invocation (elle se résout au hasard au déclenchement).
  return card.card_type === "creature" && cardHasKwOnPlay(card, "divination" as Keyword);
}

/** SECONDE VIE X — coût alternatif pour rejouer cette instance depuis le
 *  cimetière. Source unique, partagée par l'interface (qui grise ce qui n'est
 *  pas payable) et par le moteur (qui débite) : un écart entre les deux
 *  laisserait proposer des créatures injouables. */
export function secondeVieCost(inst: CardInstance): number {
  return getKwX(inst, "seconde_vie", undefined, 1);
}

/** CREUSER X — la carte doit-elle ouvrir le picker « 1 parmi X » à son entrée ?
 *  Vaut pour les CRÉATURES (mot-clé en mode invocation) comme pour les SORTS.
 *  Gaté sur le mode on-play : un Creuser réglé en mort/tap se résout tout seul. */
export function cardNeedsCreuser(card: Card): boolean {
  if (card.card_type === "spell") {
    return (card.spell_keywords ?? []).some(kw => kw.id === "creuser");
  }
  return cardHasKwOnPlay(card, "creuser" as Keyword);
}

/** Les X cartes du DESSOUS du deck, dans l'ordre où le picker doit les montrer
 *  (le fond du deck en premier) — même ordre que la tranche lue par
 *  resolveCreuser, sans quoi l'index choisi désignerait une autre carte. */
export function getCreuserCards(player: PlayerState, x: number): CardInstance[] {
  if (x <= 0 || player.deck.length === 0) return [];
  const count = Math.min(x, player.deck.length);
  return player.deck.slice(player.deck.length - count);
}

export function creatureNeedsTraqueDuDestin(card: Card): boolean {
  return card.card_type === "creature" && cardHasKwOnPlay(card, "traque_du_destin" as Keyword);
}

/** Compute X for Traque du destin from the card's effect_text bracket
 *  notation, falling back to `floor(mana_cost / 2)` (minimum 1). Mirrors
 *  the calculation used by the engine when resolving the on-summon trigger
 *  so the UI shows exactly as many revealed cards as the player will
 *  receive a choice over. */
export function getTraqueDuDestinX(card: Card): number {
  const xVals = parseXValuesFromEffectText(card.effect_text);
  return xVals["traque_du_destin"] || Math.max(1, Math.floor(card.mana_cost / 2));
}

// Ces helpers gouvernent l'ouverture de la modale « 1 parmi 3 » À L'INVOCATION.
// Ils doivent donc être gatés sur le mode on_play : une Sélection réglée en
// tap/fin de tour ne doit PAS proposer de carte à l'entrée.
export function creatureNeedsSelection(card: Card): boolean {
  return card.card_type === "creature" && cardHasKwOnPlay(card, "selection" as Keyword);
}

export function creatureNeedsRenfortRoyal(card: Card): boolean {
  return card.card_type === "creature" && cardHasKwOnPlay(card, "renfort_royal" as Keyword);
}

export function creatureNeedsMagicalSelection(card: Card): boolean {
  return card.card_type === "creature" && cardHasKwOnPlay(card, "selection_magique" as Keyword);
}

const RENFORT_ROYAL_OWNERSHIP_THRESHOLD = 30;
/** Contribution de la SOURCE au germe d'un tirage de Sélection.
 *
 *  Sans elle, deux exemplaires de la même carte résolus au même instant tirent
 *  le même germe — donc la même offre. Vu en partie : deux « Esprit aux Mille
 *  Perles » proposant les trois mêmes cartes. Le germe ne repose que sur l'état
 *  du joueur (tour, main, plateau, deck, cimetière, mana), identique pour les
 *  deux, et la file de fin de tour ne met PAS le tour en pause sur une Sélection
 *  (son effet composé n'a pas de `target`) : les deux offres sont calculées coup
 *  sur coup, sur un état rigoureusement inchangé.
 *
 *  `instanceId` est produit par la RNG semée à la création de l'instance : il
 *  est donc identique chez les deux clients, et le tirage reste reproductible. */
function saltDeSource(seedSalt: string | undefined): number {
  if (!seedSalt) return 0;
  let h = 0;
  for (let i = 0; i < seedSalt.length; i++) h = (h * 31 + seedSalt.charCodeAt(i)) & 0x7fffffff;
  return h;
}

// Sélection X / Renfort Royal X always offer up to this many cards. X is
// now a mana-cost ceiling on the offered pool — see getSelectionCards.
const SELECTION_OFFER_COUNT = 3;

/** Factions éligibles à un tirage d'alignement, réparties en DEUX paniers.
 *
 *  `propre` = les factions du même alignement que la source ; `neutre` = les
 *  factions neutres, ouvertes en RENFORT aux alignements tranchés.
 *
 *  Pourquoi ce renfort : bon et maléfique ne comptent que 2 factions chacun
 *  quand le neutre en compte 5 — les camps tranchés étaient de loin les plus
 *  pauvres, au point qu'une Invocation X pouvait ne rien trouver au coût
 *  demandé. Le neutre, lui, ne gagne rien : c'est le terrain commun, pas un
 *  camp. L'asymétrie est assumée.
 *
 *  Les deux paniers restent SÉPARÉS parce que le tirage est pondéré : une carte
 *  de l'alignement propre pèse deux fois une neutre. Fondus en un seul pool, la
 *  Découverte d'une carte maléfique afficherait ~73 % de neutre et cesserait de
 *  « sentir » la faction.
 *
 *  Mercenaires (alignement « spéciale ») n'entre dans AUCUN panier : il reste
 *  atteignable par le seul repli hors-alignement. Choix assumé, pas un oubli.
 *
 *  Repli (source sans alignement déterminable) : factions du deck +
 *  Mercenaires, comportement historique — tout va dans `propre`, la pondération
 *  n'a alors aucun effet. */
function selectionFactionBuckets(
  source: { faction?: string | null; card_alignment?: string | null } | null,
  player: PlayerState,
): { propre: Set<string>; neutre: Set<string> } {
  const alignment = source ? getEffectiveAlignment(source) : null;
  if (alignment) {
    const propre = new Set<string>();
    const neutre = new Set<string>();
    for (const [factionId, def] of Object.entries(FACTIONS)) {
      if (def.alignment === alignment) propre.add(factionId);
      // Le neutre n'est un renfort que pour les alignements TRANCHÉS : pour une
      // source neutre, ses factions sont déjà dans `propre`.
      else if (def.alignment === "neutre") neutre.add(factionId);
    }
    return { propre, neutre };
  }
  // Fallback : deck factions + Mercenaires
  const propre = new Set<string>();
  propre.add("Mercenaires");
  for (const c of [...player.hand, ...player.board, ...player.deck, ...player.graveyard]) {
    if (c.card.faction && c.card.faction !== "Mercenaires") propre.add(c.card.faction);
  }
  return { propre, neutre: new Set<string>() };
}

/** Union des deux paniers — pour les simples tests d'APPARTENANCE (« cette
 *  carte est-elle atteignable ? »), qui n'ont pas à connaître la pondération.
 *  Seul consommateur aujourd'hui : la validation de `spendEpargne`. */
function factionsForSelectionAlignment(
  source: { faction?: string | null; card_alignment?: string | null } | null,
  player: PlayerState,
): Set<string> {
  const { propre, neutre } = selectionFactionBuckets(source, player);
  return new Set([...propre, ...neutre]);
}

/** Répartit des candidats déjà filtrés selon les deux paniers d'alignement. */
function partitionParAlignement<T extends { faction?: string | null }>(
  candidats: T[],
  buckets: { propre: Set<string>; neutre: Set<string> },
): { propre: T[]; neutre: T[] } {
  const propre: T[] = [];
  const neutre: T[] = [];
  for (const c of candidats) {
    if (c.faction && buckets.neutre.has(c.faction)) neutre.push(c);
    else propre.push(c);
  }
  return { propre, neutre };
}

/** Nombre de cartes NEUTRES tolérées dans une offre de `n` cartes : une sur
 *  trois, soit le ratio 2:1 de la règle. Toujours ≥ 1 dès qu'on propose au
 *  moins une carte, sinon le renfort neutre n'apparaîtrait jamais. */
function quotaNeutre(n: number): number {
  return Math.max(1, Math.floor(n / SELECTION_OFFER_COUNT));
}

/** OFFRE pondérée (familles « révèle N, garde 1 »). Au plus `quotaNeutre(n)`
 *  cartes neutres ; le reste vient de l'alignement propre, et le neutre COMBLE
 *  si le propre n'a pas assez de candidats — on ne rend jamais moins de cartes
 *  qu'avant l'ouverture du pool.
 *
 *  `melanger` est injecté : les appelants tirent avec le pseudo-RNG semé sur
 *  l'état, PAS avec `rng()`. C'est ce qui permet aux deux clients de voir la
 *  même offre sans consommer la RNG partagée. */
function offrePonderee<T extends { faction?: string | null }>(
  candidats: T[],
  buckets: { propre: Set<string>; neutre: Set<string> },
  n: number,
  melanger: (arr: T[]) => T[],
): T[] {
  const { propre, neutre } = partitionParAlignement(candidats, buckets);
  if (neutre.length === 0) return melanger(propre).slice(0, n);

  const maxNeutre = Math.min(quotaNeutre(n), neutre.length);
  const propreMelange = melanger(propre);
  const neutreMelange = melanger(neutre);
  const retenus = propreMelange.slice(0, n - maxNeutre);
  retenus.push(...neutreMelange.slice(0, n - retenus.length));
  // Alignement propre trop pauvre : le neutre comble le reliquat.
  if (retenus.length < n) {
    const dejaPris = new Set(retenus);
    for (const c of [...propreMelange, ...neutreMelange]) {
      if (retenus.length >= n) break;
      if (!dejaPris.has(c)) { retenus.push(c); dejaPris.add(c); }
    }
  }
  return retenus;
}

/** TIRAGE DIRECT pondéré (Invocation X, Déchainement) : une carte de
 *  l'alignement propre a deux fois plus de chances qu'une neutre.
 *
 *  Consomme EXACTEMENT un `rng()`, quel que soit le contenu des paniers : le
 *  nombre d'appels doit être identique chez les deux clients, sinon leurs flux
 *  aléatoires se décalent pour tout le reste de la partie. */
function tirageUniquePondere<T extends { faction?: string | null }>(
  candidats: T[],
  buckets: { propre: Set<string>; neutre: Set<string> },
): T | undefined {
  if (candidats.length === 0) return undefined;
  const { propre, neutre } = partitionParAlignement(candidats, buckets);
  if (propre.length === 0 || neutre.length === 0) {
    return candidats[Math.floor(rng() * candidats.length)];
  }
  const poids = propre.length * 2 + neutre.length;
  const tir = rng() * poids;
  return tir < propre.length * 2
    ? propre[Math.floor(tir / 2)]
    : neutre[Math.min(neutre.length - 1, Math.floor(tir - propre.length * 2))];
}

/** Invocation X : invoque une créature aléatoire de coût EXACTEMENT X issue de
 *  la « collection » du joueur — toutes les communes + les éditions limitées
 *  qu'il possède réellement (ownedLimitedCardIds, même définition que Renfort
 *  Royal : carte datée hors set) — restreinte aux factions du même alignement
 *  que la carte source (repli : factions du deck + Mercenaires, comme
 *  Sélection) et aux cartes légales dans le format du match. Tirage via le RNG
 *  seedé partagé : la résolution a lieu dans applyAction, donc les deux clients
 *  tirent la même carte. La créature arrive avec le mal d'invocation et SANS
 *  déclencher ses effets d'arrivée (précédent Appel du Clan). No-op si le
 *  plateau est plein ou si aucun candidat au coût exact — pas de repli ≤ X. */
/** Invocations multiples : liste des coûts portée par la carte (keyword_instances
 *  côté créature, spell_keywords côté sort) — lue via le modèle unifié pour ne
 *  pas dupliquer les deux chemins. Vide si la capacité n'est pas sur la carte. */
function invocationSetupOf(card: Card, costBonus = 0): { costs: number[]; race?: string; faction?: string } {
  const cap = getCapabilities(card).find((c) => c.abilityId === "invocations_multiples");
  return {
    // `costs` est le SEUL X de sort qui ne transite pas par
    // `spellResolutionInstances` (il est lu directement sur la capacité, en
    // tableau) : Chant devait donc être appliqué ici en plus. Le filtre
    // « > 0 » porte sur la valeur d'ORIGINE — un coût laissé à 0 dans la forge
    // reste une entrée vide, ce n'est pas au bonus de le réveiller.
    costs: (cap?.costs ?? [])
      .filter((n) => typeof n === "number" && n > 0)
      .map((n) => n + costBonus),
    race: cap?.race || undefined,
    faction: cap?.faction || undefined,
  };
}

/** Enchaîne une Invocation par coût listé, dans l'ordre. Chaque entrée suit les
 *  règles d'Invocation X (créature aléatoire de la collection au coût EXACT,
 *  alignement de la source, format du match) ; un coût sans candidat est sauté
 *  sans bloquer les suivants. */
function resolveMultipleInvocations(
  owner: PlayerState,
  sourceCard: Card,
  pool: Card[] | undefined,
  formatCode: FormatCode | null,
  // Bonus de Chant, passé EXPLICITEMENT par le chemin sort. On ne lit pas
  // `chantBonus` ici : ce résolveur sert aussi les créatures (entrée en jeu,
  // râle d'agonie…), qui peuvent se résoudre PENDANT un sort — elles
  // hériteraient alors d'un bonus qui ne les concerne pas.
  costBonus = 0,
): void {
  const { costs, race, faction } = invocationSetupOf(sourceCard, costBonus);
  if (costs.length === 0) {
    console.warn(
      `[engine] Invocations multiples : aucun coût configuré pour « ${sourceCard.name} » — vérifiez l'onglet Capacités.`,
    );
    return;
  }
  for (const cost of costs) {
    if (owner.board.length >= MAX_BOARD_SIZE) break;
    resolveInvocationSummon(owner, sourceCard, cost, pool, formatCode, { race, faction });
  }
}

function resolveInvocationSummon(
  owner: PlayerState,
  sourceCard: Card,
  x: number,
  pool: Card[] | undefined,
  formatCode: FormatCode | null,
  // Restriction explicite du pool (Invocations multiples, Invocation composée).
  // Renseignée, elle REMPLACE le filtre d'alignement : « race Loups » doit
  // pouvoir piocher hors de l'alignement de la carte source. Vide ⇒ comportement
  // historique d'Invocation X (factions du même alignement).
  restrict?: ComposedPoolFilter,
): void {
  if (owner.board.length >= MAX_BOARD_SIZE) return;
  if (!pool || pool.length === 0 || x <= 0) return;
  const restricted = !!(restrict?.race || restrict?.faction || restrict?.clan || restrict?.keywordId);
  const buckets = selectionFactionBuckets(sourceCard, owner);
  const allowedFactions = new Set([...buckets.propre, ...buckets.neutre]);
  const legal = formatCode ? getFormatFilterByCode(formatCode) : null;
  const ownedLimited = new Set(owner.ownedLimitedCardIds ?? []);
  const candidates = pool.filter(c =>
    c.card_type === "creature"
    && c.mana_cost === x
    && (restricted
      // matchesPoolFilter : même prédicat que les Sélections composées, donc
      // clan et « mot-clé porté » deviennent utilisables ici aussi.
      ? matchesPoolFilter(c, restrict)
      : (!!c.faction && allowedFactions.has(c.faction)))
    && ((c.rarity ?? "Commune") === "Commune"
      || (c.card_year != null && c.set_id == null && ownedLimited.has(c.id)))
    && (!legal || legal(c)),
  );
  if (candidates.length === 0) return;
  // Pondération 2:1 en faveur de l'alignement propre — sauf quand `restrict`
  // a REMPLACÉ le filtre d'alignement : « invoque un Loup » ne doit pas se voir
  // réintroduire une préférence d'alignement par la bande.
  const chosen = restricted
    ? candidates[Math.floor(rng() * candidates.length)]
    : tirageUniquePondere(candidates, buckets)!;
  const summoned = createCardInstance(chosen);
  // Mal d'invocation par défaut (précédent Appel du Clan), MAIS la créature
  // invoquée garde ses propres mots-clés : une Traque (id moteur `charge`) doit
  // pouvoir attaquer le tour de son arrivée, comme quand elle est jouée depuis
  // la main ou ressuscitée par Exhumation. `hasKw` plutôt que
  // `keywords.includes` : il lit le modèle unifié, donc aussi une Traque portée
  // par `keyword_instances` / `capabilities` seuls.
  summoned.hasSummoningSickness = !hasKw(summoned, "charge");
  owner.board.push(summoned);
}

/** Déchainement X/Y : lance X sorts aléatoires de coût EXACTEMENT Y issus de
 *  la « collection » du joueur — mêmes règles de pool qu'Invocation X (toutes
 *  les communes + les éditions limitées possédées, factions du même alignement
 *  que la carte source, cartes légales dans le format du match) mais sur
 *  `allSpellsPool` (sorts, toutes factions — le pool de Concentration /
 *  Sélection magique). Chaque sort est lancé avec des cibles aléatoires via la
 *  machinerie de Relancer X (castSpellWithRandomTargets) ; tirages AVEC remise
 *  via le RNG semé partagé → déterministe sur les deux clients. Les sorts
 *  porteurs de Déchainement (récursion infinie) ou de Relancer (rejouerait
 *  l'historique — même garde que recastSpells) sont exclus du pool. No-op si
 *  aucun candidat au coût exact — pas de repli ≤ Y. */
function resolveDechainement(
  state: GameState,
  player: PlayerState,
  opponent: PlayerState,
  sourceCard: Card,
  x: number,
  y: number,
): void {
  const pool = state.allSpellsPool;
  if (!pool || pool.length === 0 || x <= 0 || y <= 0) return;
  const buckets = selectionFactionBuckets(sourceCard, player);
  const allowedFactions = new Set([...buckets.propre, ...buckets.neutre]);
  const legal = state.formatCode ? getFormatFilterByCode(state.formatCode) : null;
  const ownedLimited = new Set(player.ownedLimitedCardIds ?? []);
  const candidates = pool.filter(c =>
    c.card_type === "spell"
    && c.mana_cost === y
    && !!c.faction && allowedFactions.has(c.faction)
    && ((c.rarity ?? "Commune") === "Commune"
      || (c.card_year != null && c.set_id == null && ownedLimited.has(c.id)))
    && (!legal || legal(c))
    // Modèle unifié, et non `spell_keywords` : la RÉSOLUTION passe par
    // `getCapabilities`, donc un Déchainement backfillé qui ne vivrait que dans
    // `capabilities` franchissait ce filtre puis se relançait quand même. Le
    // trou n'était que théorique tant que les sorts imbriqués étaient amputés
    // de leurs capacités ; il devient réel dès qu'ils les résolvent.
    && !getCapabilities(c).some(k => k.abilityId === "dechainement" || k.abilityId === "relancer"),
  );
  if (candidates.length === 0) return;
  for (let i = 0; i < x; i++) {
    // Un `rng()` par sort, pondéré — le COMPTE d'appels reste identique chez
    // les deux clients, ce qui préserve la synchro du flux aléatoire.
    const chosen = tirageUniquePondere(candidates, buckets)!;
    castSpellWithRandomTargets(state, player, opponent, chosen);
  }
}

/** Filtre de pool d'une Sélection COMPOSÉE (race / faction / clan / mot-clé
 *  porté). Cumulatif avec les règles de base (rareté, coût, alignement) : un
 *  champ absent ne filtre rien, un champ présent restreint. Le mot-clé est lu
 *  via le modèle unifié, donc une ability portée par `keyword_instances` ou
 *  `capabilities` seuls compte aussi. */
function matchesPoolFilter(card: Card, filter?: ComposedPoolFilter): boolean {
  if (!filter) return true;
  if (filter.race && card.race !== filter.race) return false;
  if (filter.faction && card.faction !== filter.faction) return false;
  if (filter.clan && card.clan !== filter.clan) return false;
  if (filter.keywordId && !getCapabilities(card).some(c => c.abilityId === filter.keywordId)) return false;
  return true;
}

/** Renfort Royal : propose jusqu'à 3 cartes parmi les éditions limitées
 *  que le joueur possède réellement (au moins 30 requises). X agit comme
 *  un plafond sur le coût en mana (mana_cost ≤ X) ; si X ≤ 0, aucun
 *  filtre n'est appliqué. Si le seuil de 30 n'est pas atteint, on retombe
 *  sur la liste des communes (mêmes règles que Sélection X). Les deux
 *  clients doivent générer la même proposition, d'où le seed déterministe
 *  basé sur l'état de jeu visible. */
export function getRenfortRoyalCards(
  state: GameState,
  maxManaCost: number,
  source?: { faction?: string | null; card_alignment?: string | null } | null,
  filter?: ComposedPoolFilter,
  // Identifiant de la source : distingue deux exemplaires de la MÊME carte
  // résolus au même instant (cf. saltDeSource).
  seedSalt?: string,
): Card[] {
  const pool = state.factionCardPool;
  if (!pool || pool.length === 0) return [];
  const player = state.players[state.currentPlayerIndex];
  const ownedSet = new Set(player.ownedLimitedCardIds ?? []);
  const ownedLimited = pool.filter(c =>
    c.card_year != null
    && c.set_id == null
    && ownedSet.has(c.id),
  );
  // Seuil évalué AVANT le filtre de pool : c'est une condition de collection
  // (« possède au moins N limitées »), pas une condition sur les candidats.
  if (ownedLimited.length < RENFORT_ROYAL_OWNERSHIP_THRESHOLD) {
    return getSelectionCards(state, maxManaCost, source, filter);
  }
  const filtered = (maxManaCost > 0
    ? ownedLimited.filter(c => c.mana_cost <= maxManaCost)
    : ownedLimited
  ).filter(c => matchesPoolFilter(c, filter));
  if (filtered.length === 0) return [];
  // Same deterministic shuffle pattern as getSelectionCards so both
  // clients agree without burning the seeded RNG.
  const entropy = player.hand.length * 7 + player.board.length * 13 + player.deck.length * 3 + player.graveyard.length * 17 + player.mana * 11;
  const seed = state.turnNumber * 1000 + state.currentPlayerIndex * 100 + entropy + 999 + saltDeSource(seedSalt);
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
  return shuffled.slice(0, Math.min(SELECTION_OFFER_COUNT, shuffled.length));
}

/** Sélection : propose jusqu'à 3 cartes communes partageant l'alignement de
 *  la carte source (bon/neutre/maléfique) — pool élargi à toutes les
 *  factions du même alignement pour augmenter la variété. Si `source` n'est
 *  pas fourni ou son alignement est indéterminable, on retombe sur les
 *  factions présentes dans le deck du joueur (comportement historique).
 *  X agit comme un plafond sur le coût en mana (mana_cost ≤ X) ; si X ≤ 0,
 *  aucun filtre mana. Le tirage est déterministe (seed basé sur l'état
 *  visible) pour que les deux clients voient la même proposition.
 */
export function getSelectionCards(
  state: GameState,
  maxManaCost: number,
  source?: { faction?: string | null; card_alignment?: string | null } | null,
  filter?: ComposedPoolFilter,
  // Épargne : le compteur désigne un coût EXACT, pas un plafond — on n'y gagne
  // que des cartes valant précisément ce qu'on a mis de côté. Les Sélections
  // gardent le comportement « plafond » par défaut.
  exactCost = false,
  // Identifiant de la source : distingue deux exemplaires de la MÊME carte
  // résolus au même instant (cf. saltDeSource).
  seedSalt?: string,
): Card[] {
  const pool = state.factionCardPool;
  if (!pool || pool.length === 0) return [];

  const player = state.players[state.currentPlayerIndex];
  const buckets = selectionFactionBuckets(source ?? null, player);
  const allowedFactions = new Set([...buckets.propre, ...buckets.neutre]);
  const filtered = pool.filter(c =>
    c.faction
    && allowedFactions.has(c.faction)
    && c.rarity === "Commune"
    && (exactCost ? c.mana_cost === maxManaCost : (maxManaCost <= 0 || c.mana_cost <= maxManaCost))
    && matchesPoolFilter(c, filter),
  );
  if (filtered.length === 0) return [];

  // Deterministic seed based on game state — varies each time within a turn
  const entropy = player.hand.length * 7 + player.board.length * 13 + player.deck.length * 3 + player.graveyard.length * 17 + player.mana * 11;
  const seed = state.turnNumber * 1000 + state.currentPlayerIndex * 100 + entropy + saltDeSource(seedSalt);
  let hash = seed;
  const pseudoRng = () => {
    hash = (hash * 16807 + 12345) & 0x7fffffff;
    return (hash & 0xfffffff) / 0x10000000;
  };
  // Mélange déterministe semé sur l'état : les deux clients voient la MÊME
  // offre sans consommer la RNG partagée. L'offre est PONDÉRÉE — au plus une
  // carte neutre sur trois, le reste de l'alignement propre.
  const melanger = (arr: Card[]): Card[] => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(pseudoRng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return offrePonderee(filtered, buckets, Math.min(SELECTION_OFFER_COUNT, filtered.length), melanger);
}

/** Sélection magique : propose jusqu'à 3 sorts communs partageant
 *  l'alignement de la carte source (bon/neutre/maléfique). Le pool est lu
 *  dans state.allSpellsPool (chargé une fois au démarrage du match). Si la
 *  source ou son alignement est indéterminable, on retombe sur les
 *  factions du deck + Mercenaires. X agit comme un plafond sur le coût en
 *  mana (mana_cost ≤ X) ; si X ≤ 0, aucun filtre mana. Le shuffle est
 *  déterministe (entropy +1999 pour différencier des autres tirages). */
export function getMagicalSelectionCards(
  state: GameState,
  maxManaCost: number,
  source?: { faction?: string | null; card_alignment?: string | null } | null,
  filter?: ComposedPoolFilter,
  // Identifiant de la source : distingue deux exemplaires de la MÊME carte
  // résolus au même instant (cf. saltDeSource).
  seedSalt?: string,
): Card[] {
  const pool = state.allSpellsPool;
  if (!pool || pool.length === 0) return [];

  const player = state.players[state.currentPlayerIndex];
  const buckets = selectionFactionBuckets(source ?? null, player);
  const allowedFactions = new Set([...buckets.propre, ...buckets.neutre]);
  const filtered = pool.filter(c =>
    c.card_type === "spell"
    && c.faction
    && allowedFactions.has(c.faction)
    && c.rarity === "Commune"
    && (maxManaCost <= 0 || c.mana_cost <= maxManaCost)
    && matchesPoolFilter(c, filter),
  );
  if (filtered.length === 0) return [];

  const entropy = player.hand.length * 7 + player.board.length * 13 + player.deck.length * 3 + player.graveyard.length * 17 + player.mana * 11;
  const seed = state.turnNumber * 1000 + state.currentPlayerIndex * 100 + entropy + 1999 + saltDeSource(seedSalt);
  let hash = seed;
  const pseudoRng = () => {
    hash = (hash * 16807 + 12345) & 0x7fffffff;
    return (hash & 0xfffffff) / 0x10000000;
  };
  // Mélange déterministe semé sur l'état : les deux clients voient la MÊME
  // offre sans consommer la RNG partagée. L'offre est PONDÉRÉE — au plus une
  // carte neutre sur trois, le reste de l'alignement propre.
  const melanger = (arr: Card[]): Card[] => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(pseudoRng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return offrePonderee(filtered, buckets, Math.min(SELECTION_OFFER_COUNT, filtered.length), melanger);
}

/** Aiguille vers le bon builder de cartes selon la famille de Sélection. */
function selectionCardsForKeyword(
  id: "selection" | "selection_magique" | "renfort_royal",
  state: GameState,
  maxManaCost: number,
  source?: { faction?: string | null; card_alignment?: string | null } | null,
  filter?: ComposedPoolFilter,
  seedSalt?: string,
): Card[] {
  if (id === "selection_magique") return getMagicalSelectionCards(state, maxManaCost, source, filter, seedSalt);
  if (id === "renfort_royal") return getRenfortRoyalCards(state, maxManaCost, source, filter, seedSalt);
  return getSelectionCards(state, maxManaCost, source, filter, false, seedSalt);
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
    case "enemy_any":
      return [
        ...filterEnemyTargetable(opponent.board).map(c => c.instanceId),
        "enemy_hero",
      ];
    case "friendly_any":
      return [
        ...player.board.map(c => c.instanceId),
        "friendly_hero",
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
    // Plafond de coût = X du mot-clé + bonus de Chant. Le moteur applique déjà
    // le bonus (via spellResolutionInstances) : sans le même calcul ici, le
    // picker proposait strictement moins que ce que la résolution acceptait.
    const maxCost = (kw.amount ?? 1) + chantBonusForSpell(state, card);
    return player.graveyard
      .filter(c => c.card.card_type === "creature" && c.card.mana_cost <= maxCost)
      .map(c => c.instanceId);
  }
  return [];
}

/** Cibles cimetière (instanceIds) d'un effet composé « exhumation » au choix :
 *  créatures du cimetière du joueur courant de coût ≤ magnitude.x. Provider
 *  filtré-par-coût partagé par tous les sites d'ouverture du picker — les pools
 *  composés génériques (composedTargetPool / getSpellTargets) n'appliquent AUCUN
 *  filtre de coût, d'où ce helper dédié. */
export function getComposedGraveyardTargets(state: GameState, card: Card, capUid: string): string[] {
  const player = state.players[state.currentPlayerIndex];
  const cap = getCapabilities(card).find(c => c.uid === capUid && c.composed);
  // Même plafond que la résolution, bonus de Chant compris (cf.
  // chantBonusForSpell) — sinon le picker et le moteur ne s'accordent pas.
  const x = (cap?.composed?.magnitude?.x ?? 0)
    + (card.card_type === "spell" ? chantBonusForSpell(state, card) : 0);
  return player.graveyard
    .filter(c => c.card.card_type === "creature" && c.card.mana_cost <= x)
    .map(c => c.instanceId);
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
