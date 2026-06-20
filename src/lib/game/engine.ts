import type {
  Card,
  CardInstance,
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
} from "./types";
import { SPELL_KEYWORDS } from "./spell-keywords";
import { getEntraideReduction, getTokenManaCost, isCreatureKwShadowedBySpell } from "./abilities";
import { getCapabilities } from "./capability-adapter";
import { parseXValuesFromEffectText } from "./keyword-labels";
import {
  HERO_MAX_HP,
  STARTING_HAND_SIZE,
  MAX_HAND_SIZE,
  MAX_BOARD_SIZE,
  MAX_MANA,
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
function hasKwInMode(ci: CardInstance, kw: Keyword, mode: import("./types").KeywordMode | undefined): boolean {
  const trigger = capTriggerForMode(mode);
  return getCapabilities(ci.card).some(c => c.abilityId === kw && c.trigger === trigger);
}

function hasKwOnPlay(ci: CardInstance, kw: Keyword): boolean { return hasKwInMode(ci, kw, undefined); }
function hasKwOnDeath(ci: CardInstance, kw: Keyword): boolean { return hasKwInMode(ci, kw, "death"); }
function hasKwOnTap(ci: CardInstance, kw: Keyword): boolean { return hasKwInMode(ci, kw, "tap"); }

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
  const params = cap.params?.x != null ? { amount: cap.params.x } : undefined;
  if (scope === "all_allies") {
    for (const ally of owner.board) applyGrantedKeyword(ally, cap.abilityId, params);
    return;
  }
  const id = targetMap["grant_target"] ?? targetMap["kw_0"] ?? targetMap["target_0"];
  const target =
    id && id !== "enemy_hero" && id !== "friendly_hero" ? findCreatureOnBoard(owner, id) : null;
  if (target) applyGrantedKeyword(target, cap.abilityId, params);
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
        || (!hasKw(c, "invisible") && !hasKw(c, "transcendance") && !(hasKw(c, "ombre") && !c.ombreRevealed));
      if (targetable) ids.push(c.instanceId);
    }
  }
  return ids;
}

function applyComposedToHero(content: import("./types").ComposedEffectContent, hero: import("./types").HeroState, x: number): void {
  if (content === "deal_damage") dealDamageToHero(hero, x);
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
): void {
  switch (composed.content) {
    case "deal_damage": dealDamageToCreature(u, x, false, true); break;
    case "heal": u.currentHealth = Math.min(u.maxHealth, u.currentHealth + x); break;
    case "buff":
      u.card = { ...u.card, attack: (u.card.attack ?? 0) + x, health: (u.card.health ?? 0) + y };
      u.currentAttack += x; u.currentHealth += y; u.maxHealth += y;
      break;
    case "debuff":
      u.currentAttack = Math.max(0, u.currentAttack - x);
      if (y > 0) { u.currentHealth -= y; u.maxHealth = Math.max(1, u.maxHealth - y); }
      break;
    case "destroy": u.currentHealth = 0; break;
    case "paralyze": u.isParalyzed = true; break;
    case "bounce": resolveRemontee(u.instanceId, source?.instanceId ?? null, owner, opponent); break;
    case "grant_keyword":
      if (composed.grantAbilityId) applyGrantedKeyword(u, composed.grantAbilityId, x > 0 ? { amount: x } : undefined);
      break;
    default: break;
  }
}

/** Cible composée résolue : une unité, ou un héros. */
type ComposedTargetRef =
  | { kind: "unit"; unit: CardInstance }
  | { kind: "hero"; hero: import("./types").HeroState };

/** Construit la liste des cibles sélectionnables d'un TargetSpec (unités et/ou
 *  héros selon `entity`), puis applique nombre/désignation. */
function selectComposedTargets(
  spec: import("./types").TargetSpec,
  owner: PlayerState,
  opponent: PlayerState,
  chosenTargetIds?: string[],
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
  return pool.slice(0, n); // choix sans cible fournie → repli déterministe
}

function resolveComposedEffect(
  composed: import("./types").ComposedEffect,
  source: CardInstance | null,
  owner: PlayerState,
  opponent: PlayerState,
  chosenTargetIds?: string[],
): void {
  const x = composed.magnitude?.x ?? 0;
  const y = composed.magnitude?.y ?? 0;

  // Effets sur le contrôleur (sans ciblage d'entité)
  switch (composed.content) {
    case "draw_cards": for (let i = 0; i < x; i++) drawCard(owner); return;
    case "gain_mana": owner.mana += x; return;
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
    default: break;
  }

  const target = composed.target;
  if (!target) return;

  // "self" : la créature source elle-même — déterministe, ni pool ni choix.
  // No-op si la source n'est pas une unité (ex. sort).
  if (target.entity === "self") {
    if (source) applyComposedToUnit(composed, source, x, y, source, owner, opponent);
    return;
  }

  for (const t of selectComposedTargets(target, owner, opponent, chosenTargetIds)) {
    if (t.kind === "hero") applyComposedToHero(composed.content, t.hero, x);
    else applyComposedToUnit(composed, t.unit, x, y, source, owner, opponent);
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
    let chosen: string[] | undefined;
    if (targetMap) {
      // Multi-cibles : slots `${uid}#0`, `${uid}#1`, … ; sinon slot unique `${uid}`.
      const multi: string[] = [];
      for (let i = 0; targetMap[`${cap.uid}#${i}`] != null; i++) multi.push(targetMap[`${cap.uid}#${i}`]);
      if (multi.length) chosen = multi;
      else if (targetMap[cap.uid] != null) chosen = [targetMap[cap.uid]];
    }
    if (!chosen && fallbackTargetId) chosen = [fallbackTargetId];
    resolveComposedEffect(cap.composed, source, owner, opponent, chosen);
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
    tapped: false,
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
    richesseATKBonus: 0,
    richessePVBonus: 0,
    martyrATKBonus: 0,
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

function recalculateAuras(player: PlayerState, opponent: PlayerState) {
  // Reset ATK to base + permanent bonuses (not auras)
  for (const c of player.board) {
    let atk = c.card.attack ?? 0;
    atk += c.loyauteATKBonus;
    atk += c.summonBonusATK;
    if (c.berserkActive) atk += c.berserkATKBonus;
    atk += c.necrophagieATKBonus;
    atk += c.richesseATKBonus;
    atk += c.martyrATKBonus;
    atk += c.instinctDeMeuteATKBonus;
    c.currentAttack = atk;
  }
  for (const c of opponent.board) {
    let atk = c.card.attack ?? 0;
    atk += c.loyauteATKBonus;
    atk += c.summonBonusATK;
    if (c.berserkActive) atk += c.berserkATKBonus;
    atk += c.necrophagieATKBonus;
    atk += c.richesseATKBonus;
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
  const allPool = state.allSpellsPool;
  const newState = deepClone({ ...state, factionCardPool: undefined, allSpellsPool: undefined } as GameState);
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
  const pool = state.factionCardPool;
  const allPool = state.allSpellsPool;
  const newState = deepClone({ ...state, factionCardPool: undefined, allSpellsPool: undefined } as GameState);
  newState.factionCardPool = pool;
  newState.allSpellsPool = allPool;

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
  const newState = deepClone({ ...state, factionCardPool: undefined, allSpellsPool: undefined } as GameState);
  newState.factionCardPool = pool;
  newState.allSpellsPool = allPool;
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
  // Concentration X: persistent reduction stamped on the instance when this
  // card was generated by a Concentration trigger. Stacks below Canalisation
  // / Entraide (those reduce on top of the already-discounted baseline).
  // Tokens (token_id != null) override the baseline 0 mana_cost with
  // floor((attack+health)/2) so a token bounced/recalled into the hand isn't
  // free to re-cast.
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
      dealDamageToHero(player.hero, x);
    }

    // Inspiration X: pioche X cartes à l'invocation.
    if (hasKwOnPlay(cardInstance, "inspiration")) {
      const inspXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      const x = inspXVals["inspiration"] ?? 1;
      for (let i = 0; i < x; i++) drawCard(player);
    }

    // Concentration X: remplace chaque sort en main par un sort aléatoire
    // (toutes factions) de coût supérieur de X ; le nouveau sort est marqué
    // d'une réduction permanente de coût égale à X.
    if (hasKw(cardInstance, "concentration")) {
      const concXVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      const x = concXVals["concentration"] ?? Math.max(1, Math.floor(cardInstance.card.mana_cost / 3));
      applyConcentration(player, x, newState.allSpellsPool);
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
        stealTarget.trueOwnerId = opponent.id;
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
    if (hasKw(cardInstance, "contresort")) {
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
    if (hasKw(cardInstance, "mimique") && action.targetInstanceId) {
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

    // Combustion: défaussez une carte de votre main, piochez deux.
    // Gated on the play-mode instance so a Combustion entry living
    // only in tap/death mode doesn't auto-fire on summon.
    if (hasKwOnPlay(cardInstance, "combustion") && player.hand.length > 0) {
      discardFromHand(player, Math.floor(rng() * player.hand.length), [player, opponent]);
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
        const newInstances = mergeKeywordInstances(cardInstance.card.keyword_instances, graveTarget.card.keyword_instances);
        const newCapabilities = mergeComposedCapabilities(cardInstance.card.capabilities, graveTarget.card.capabilities);
        cardInstance.card = { ...cardInstance.card, keywords: newKeywords, keyword_instances: newInstances, capabilities: newCapabilities };
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
        triggerReturnToHand(refreshed, player, opponent);
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

    // Sélection X / Renfort Royal X / Sélection magique X : same picker
    // flow, all resolve by looking up `selectionCardId`. Lookup tries the
    // factionCardPool first (Sélection / Renfort Royal) and falls back to
    // allSpellsPool (Sélection magique sources its choices there).
    if (
      (hasKw(cardInstance, "selection") || hasKw(cardInstance, "renfort_royal") || hasKw(cardInstance, "selection_magique"))
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
    if (hasKw(cardInstance, "benediction") && action.targetInstanceId) {
      const healTarget = player.board.find(c => c.instanceId === action.targetInstanceId);
      if (healTarget) {
        healTarget.currentHealth = healTarget.maxHealth;
        healTarget.isPoisoned = false;
      }
    }

    // Traque du destin X: révèle X premières cartes du deck, le joueur en
    // choisit une (action.divinationChoiceIndex — reuse of the divination
    // picker UI), reste en dessous dans un ordre aléatoire.
    if (hasKw(cardInstance, "traque_du_destin") && player.deck.length > 0) {
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
    // taking hits). Does not target the enemy hero. Gated on hasKwOnPlay so
    // a Tempête instance set to "death"/"tap" mode doesn't ALSO fire here at
    // summon — it resolves from resolveCuratedKeywordEffect instead.
    if (hasKwOnPlay(cardInstance, "tempete")) {
      const total = getKwX(cardInstance, "tempete", undefined, Math.max(1, Math.floor(cardInstance.card.mana_cost / 3)));
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

    // Set Sacrifice démoniaque X (effet à la mort) — caché à l'invocation,
    // comme Carnage X.
    if (hasKw(cardInstance, "sacrifice_demoniaque")) {
      const sdVals = parseXValuesFromEffectText(cardInstance.card.effect_text);
      cardInstance.sacrificeDemoniaqueX = sdVals["sacrifice_demoniaque"] || Math.max(1, Math.floor(cardInstance.card.mana_cost / 3));
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

    // Conférer : confère la capacité choisie à une/aux unité(s) alliée(s).
    if (hasKwOnPlay(cardInstance, "conferer")) {
      const inst = cardInstance.card.keyword_instances?.find(k => k.id === "conferer" && !k.mode);
      const abilityId = inst?.grantAbilityId;
      if (abilityId) {
        const scope = inst?.grantScope ?? "target";
        if (scope === "all_allies") {
          for (const ally of player.board) applyGrantedKeyword(ally, abilityId);
        } else if (action.targetInstanceId) {
          const t = findCreatureOnBoard(player, action.targetInstanceId);
          if (t) applyGrantedKeyword(t, abilityId);
        }
      }
    }

    // Effets composés à l'entrée en jeu (modèle hybride).
    runComposedCapsForCard(cardInstance.card, "on_play", cardInstance, player, opponent, action.targetMap, action.targetInstanceId);

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

    // Phase 1: Resolve spell keywords (lus depuis le modèle unifié)
    const spellInstances1 = spellResolutionInstances(card);
    if (spellInstances1.length) {
      resolveSpellKeywords(ctx, spellInstances1);
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

    // Phase 3 : Don des capacités conférées par le sort (effectKind "grant"),
    // lu depuis le modèle unifié. L'adaptateur a déjà appliqué l'exclusion
    // polymorphe (isCreatureKwShadowedBySpell) et le grantScope ; le don passe
    // par la fonction générique applyGrantCapability (réutilisée à terme par les
    // dons d'unités). applyGrantedKeyword gère bouclier/traque et grantedKeywordX.
    for (const cap of getCapabilities(card)) {
      if (cap.trigger === "spell_resolution" && cap.effectKind === "grant") {
        applyGrantCapability(cap, player, targetMap);
      }
    }

    // Effets composés à la résolution du sort (modèle hybride).
    runComposedCapsForCard(card, "spell_resolution", null, player, opponent, targetMap);

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

    // Resolve spell keywords (lus depuis le modèle unifié)
    const spellInstances2 = spellResolutionInstances(card);
    if (spellInstances2.length) {
      resolveSpellKeywords(ctx, spellInstances2);
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

/** Reconstruit la liste d'effets de sort (SpellKeywordInstance[]) depuis le
 *  modèle unifié, dans l'ordre — l'index i est conservé, donc les slots de
 *  cible `kw_${i}` restent valides. Permet à resolveSpellKeywords de consommer
 *  les capacités sans changer son corps ni le flux de ciblage. */
function spellResolutionInstances(card: Card): SpellKeywordInstance[] {
  return getCapabilities(card)
    .filter((c) => c.trigger === "spell_resolution" && c.effectKind === "immediate")
    .map((c) => ({
      id: c.abilityId as SpellKeywordInstance["id"],
      amount: c.params?.x,
      attack: c.params?.attack,
      health: c.params?.health,
      race: c.race,
      clan: c.clan,
      token_id: c.tokenId ?? null,
    }));
}

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
      case "remontee": {
        // Renvoie l'unité ciblée dans la main de son propriétaire d'origine.
        resolveRemontee(targetId, null, ctx.caster, ctx.opponent);
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
          if (target) dealDamageToCreature(target, amount, false, true);
        }
        break;
      }
      case "deferlement": {
        const amount = kw.amount ?? 0;
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
      case "execution": {
        if (targetId) {
          const target = findCreatureOnBoard(ctx.caster, targetId) ?? findCreatureOnBoard(ctx.opponent, targetId);
          if (target) target.currentHealth = 0;
        }
        break;
      }
      case "damnation": {
        // -X/-X permanent à une créature ennemie ciblée (pendant négatif de Renforcement).
        if (targetId) {
          const target = findCreatureOnBoard(ctx.opponent, targetId) ?? findCreatureOnBoard(ctx.caster, targetId);
          if (target) {
            const amount = kw.amount ?? 0;
            target.card = {
              ...target.card,
              attack: Math.max(0, (target.card.attack ?? 0) - amount),
              health: Math.max(1, (target.card.health ?? 0) - amount),
            };
            target.currentAttack = Math.max(0, target.currentAttack - amount);
            target.currentHealth -= amount;
            target.maxHealth = Math.max(1, target.maxHealth - amount);
          }
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
      case "renforcement_multiple": {
        // +X/+Y à toutes les créatures du lanceur de la race/clan ciblé.
        applyRenforcementMultiple(ctx.caster, kw.attack ?? 0, kw.health ?? 0, kw.race, kw.clan);
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
          // Prefer id-based lookup (multi-tokens per race safe). Legacy
          // cards saved with only `race` fall through to the race lookup
          // which picks the first match — deterministic for single-token
          // races, arbitrary otherwise.
          const tmpl = findTokenTemplate(kw.token_id) ?? findTokenTemplateByRace(kw.race);
          const resolvedRace = tmpl?.race ?? kw.race;
          let tokenCard: Card = {
            id: -1, name: resolvedRace ? `Token ${resolvedRace}` : "Token",
            mana_cost: 0, card_type: "creature",
            attack: kw.attack ?? 1, health: kw.health ?? 1,
            effect_text: "",
            keywords: [], spell_keywords: null, spell_effects: null, image_url: null,
            race: resolvedRace,
            faction: getFactionForRace(resolvedRace) ?? ctx.card.faction,
          };
          tokenCard = applyTokenTemplate(tokenCard, tmpl);
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
              triggerReturnToHand(refreshed, ctx.caster, ctx.opponent);
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
          calledInstance.hasSummoningSickness = true;
          ctx.caster.board.push(calledInstance);
        }
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
        discardFromHand(ctx.opponent, Math.floor(rng() * ctx.opponent.hand.length), [ctx.caster, ctx.opponent]);
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
            target.trueOwnerId = ctx.opponent.id;
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
  // "both" : héros OU unité → "any" (le picker accepte héros et créatures).
  if (t.entity === "both") return "any";
  if (t.location !== "board") return undefined;
  return t.side === "ally" ? "friendly_creature" : t.side === "enemy" ? "enemy_creature" : "any_creature";
}

// ============================================================
// ATTACK
// ============================================================

export function attack(state: GameState, action: AttackAction): GameState {
  const pool = state.factionCardPool;
  const allPool = state.allSpellsPool;
  const newState = deepClone({ ...state, factionCardPool: undefined, allSpellsPool: undefined } as GameState);
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

  // Validate a creature target exists BEFORE firing any on-attack power, so an
  // invalid attack stays a no-op — returning `state` AFTER the power would
  // discard the power's effects.
  if (effectiveTarget !== "enemy_hero" && !opponent.board.find(c => c.instanceId === effectiveTarget)) {
    return state;
  }

  // "À l'attaque" composed power: resolves BEFORE combat damage. The chosen
  // targets ride in action.targetMap (same `${uid}#${i}` keying as play_card).
  // Realize its deaths immediately so the board the combat reads is post-power,
  // and snapshot the intermediate (post-power / pre-combat) state for the
  // store's first animation wave.
  if (hasOnAttackComposed(attacker.card)) {
    // Double Attaque frappe deux fois "dans" la même attaque : l'effet
    // composé "à l'attaque" doit donc se déclencher une fois par frappe
    // (ex. Commandant des Griffes : +1/+1 quand il attaque → +2/+2 avec
    // Double Attaque). On boucle les déclenchements et on snapshot une
    // seule fois après, l'animation wave 1 montrant l'effet cumulé.
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
      [...opponent.board].forEach(c => dealDamageToCreature(c, fireX));
    }

    dealDamageToHero(opponent.hero, attackPower);
    // Double Attaque: second hit (mirrors the creature combat path).
    if (hasKw(attacker, "double_attaque")) {
      dealDamageToHero(opponent.hero, attackPower);
    }

    // Drain de vie: heal own hero. Doubled when paired with Double
    // Attaque since two hits land.
    if (hasKw(attacker, "drain_de_vie")) {
      const drained = hasKw(attacker, "double_attaque") ? attackPower * 2 : attackPower;
      player.hero.hp += drained;
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
      dealDamageToCreature(target, attackPower, attackerHasPrecision);

      if (attackerHasTrample && target.currentHealth < 0 && targetHpBefore > 0) {
        dealDamageToHero(opponent.hero, -target.currentHealth);
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
      // Simultaneous damage. Double Attaque doubles the attacker's
      // damage; the retaliation is unchanged.
      const finalAttackPower = hasDoubleAttack ? attackPower * 2 : attackPower;
      const targetHpBefore = target.currentHealth;
      dealDamageToCreature(target, finalAttackPower, attackerHasPrecision);

      if (attackerHasTrample && target.currentHealth < 0 && targetHpBefore > 0) {
        dealDamageToHero(opponent.hero, -target.currentHealth);
      }

      dealDamageToCreature(attacker, target.currentAttack, hasKw(target, "precision"));

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
      [...opponent.board].forEach(c => dealDamageToCreature(c, fireX));
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

    // Fureur: après avoir subi des dégâts en combat, la créature lance une
    // attaque supplémentaire sur une unité adverse aléatoire (héros si plus
    // aucune unité). C'est un vrai échange — la victime riposte aussi —
    // pour que Fureur reste un effet risqué et pas un coup gratuit. Le
    // flag fureurActive borne le trigger à une fois par tour (reset en
    // endTurn). Pas de bonus d'ATK persistant : c'est Berserk qui double
    // l'ATK quand les PV sont entamés.
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
      dealDamageToHero(opponent.hero, attacker.persecutionX);
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
      dealDamageToHero(enemyHero, creature.currentAttack);
      (state.fureurStrikes ??= []).push({
        attackerInstanceId: creature.instanceId,
        victimInstanceId: enemyHeroSentinel,
      });
      break;
    }
    const victim = enemies[Math.floor(rng() * enemies.length)];
    dealDamageToCreature(victim, creature.currentAttack);
    if (creature.currentHealth > 0 && victim.currentAttack > 0) {
      dealDamageToCreature(creature, victim.currentAttack);
    }
    (state.fureurStrikes ??= []).push({
      attackerInstanceId: creature.instanceId,
      victimInstanceId: victim.instanceId,
    });
    iteration++;
  }
}

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
}

// ── Remontée ──
// Une unité est « remontable » si elle n'est pas la source, pas Ancré, et
// ciblable (ni Invisible, ni Transcendance, ni Ombre non révélée).
function canBeRemonteed(c: CardInstance, sourceInstanceId: string | null): boolean {
  return c.instanceId !== sourceInstanceId
    && !hasKw(c, "ancre")
    && !hasKw(c, "invisible")
    && !hasKw(c, "transcendance")
    && !(hasKw(c, "ombre") && !c.ombreRevealed);
}

// Cibles valides de Remontée (les 2 plateaux, hors source / Ancré / non-ciblable).
// Exporté pour l'UI (sélecteur du déclencheur interactif en attente).
export function remonteeTargetIds(controller: PlayerState, other: PlayerState, sourceInstanceId: string | null): string[] {
  return [...controller.board, ...other.board]
    .filter(c => canBeRemonteed(c, sourceInstanceId))
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
): void {
  const sourceId = sourceInstanceId;
  let target: CardInstance | undefined;
  if (targetInstanceId) {
    const cand = findCreatureOnBoard(controller, targetInstanceId)
      ?? findCreatureOnBoard(other, targetInstanceId);
    if (cand && canBeRemonteed(cand, sourceId)) target = cand;
  } else {
    const pool = [...controller.board, ...other.board].filter(c => canBeRemonteed(c, sourceId));
    if (pool.length > 0) target = pool[Math.floor(rng() * pool.length)];
  }
  if (!target) return;

  const holder = controller.board.includes(target) ? controller : other;
  holder.board = holder.board.filter(c => c !== target);

  // Reset comme un bounce.
  target.currentAttack = target.card.attack ?? 0;
  target.currentHealth = target.card.health ?? 1;
  target.maxHealth = target.card.health ?? 1;
  target.hasSummoningSickness = true;
  target.tapped = false;
  target.hasAttacked = false;

  // Propriétaire d'origine (trueOwnerId), sinon le détenteur actuel.
  const owner = target.trueOwnerId
    ? ([controller, other].find(p => p.id === target!.trueOwnerId) ?? holder)
    : holder;
  const ownerOpponent = owner === controller ? other : controller;
  target.originalOwnerId = null;
  target.trueOwnerId = null;

  if (owner.hand.length < MAX_HAND_SIZE) {
    owner.hand.push(target);
    triggerReturnToHand(target, owner, ownerOpponent);
  } else {
    owner.graveyard.push(target);
  }
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

    // Sacrifice démoniaque X: répartit X réductions de coût parmi les Démons
    // de la main du contrôleur (owner).
    if (hasKw(c, "sacrifice_demoniaque") && c.sacrificeDemoniaqueX > 0) {
      distributeDemonCostReductions(owner, c.sacrificeDemoniaqueX);
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
    if (hasKw(c, "cycle_eternel")) {
      const copyInstance = createCardInstance({ ...c.card });
      copyInstance.cycleEternelAutoPlay = true;
      // Insert at random position in deck
      const insertIdx = Math.floor(rng() * (owner.deck.length + 1));
      owner.deck.splice(insertIdx, 0, copyInstance);
      owner.graveyard = owner.graveyard.filter(g => g !== c);
    }

    // Custom on-death triggers from keywordInstances metadata. Curated
    // keywords (see plan) can opt into mode "death" so their on-play
    // effect fires from the death rattle slot instead. The on-play block
    // is skipped for these instances via the hasKwOnPlay gate elsewhere,
    // so each instance fires exactly once at the right time.
    const customDeathInstances = c.card.keyword_instances ?? [];
    for (const inst of customDeathInstances) {
      if (inst.mode === "death") {
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

// ============================================================
// CURATED TRIGGER MODES (death / tap) — shared effect resolvers
// ============================================================

/** Resolve the effect of a curated keyword from a non-default trigger
 *  context (on-death or on-tap). Mirrors the on-play implementation in
 *  `playCard` for the supported subset — keep the two paths in sync
 *  when extending the list. Source is the creature carrying the keyword
 *  (already dead for on-death; still alive for on-tap). */
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
    const match = clan ? ally.card.clan === clan : (race ? ally.card.race === race : false);
    if (!match) continue;
    ally.card = { ...ally.card, attack: (ally.card.attack ?? 0) + x, health: (ally.card.health ?? 0) + y };
    ally.currentAttack += x;
    ally.currentHealth += y;
    ally.maxHealth += y;
  }
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
  switch (kw) {
    case "renforcement_multiple": {
      // Tap / mort / retour : lit +X/+Y et race/clan depuis l'instance du mot-clé.
      applyRenforcementMultiple(owner, inst?.x ?? 0, inst?.y ?? 0, inst?.race, inst?.clan, source.instanceId);
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
      // Sinon (tour adverse, ou aucune cible) → cible aléatoire / fizzle.
      if (owner.id === currentPlayerId && remonteeTargetIds(owner, opponent, source.instanceId).length > 0) {
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
      dealDamageToHero(opponent.hero, x);
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
      const before = opponent.hero.hp;
      dealDamageToHero(opponent.hero, x);
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
        dealDamageToCreature(target, 1, false, true);
      }
      break;
    }
    default:
      // No-op for keywords not yet supported in non-play modes. The
      // Card Forge UI gates which keywords admins can put in death/tap
      // mode, so unsupported entries shouldn't appear in practice.
      break;
  }
}

// ============================================================
// TAP ACTIVATION
// ============================================================

export function tapActivate(state: GameState, action: TapActivateAction): GameState {
  const pool = state.factionCardPool;
  const allPool = state.allSpellsPool;
  const newState = deepClone({ ...state, factionCardPool: undefined, allSpellsPool: undefined } as GameState);
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
    resolveComposedEffect(cap.composed, source, player, opponent, chosen);
    const pDead = cleanDeadCreatures(player);
    const oDead = cleanDeadCreatures(opponent);
    processDeathTriggers(pDead, player, opponent);
    processDeathTriggers(oDead, opponent, player);
    recalculateAuras(player, opponent);
    newState.lastAction = action;
    checkWinCondition(newState);
    return newState;
  }

  const instances = source.card.keyword_instances ?? [];
  const instance = instances[action.instanceIdx];
  if (!instance || instance.mode !== "tap") return state;

  source.tapped = true;
  resolveCuratedKeywordEffect(instance.id, instance.x ?? 1, source, player, opponent, action.targetInstanceId, instance);

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
export function resolvePendingTrigger(state: GameState, action: ResolvePendingTriggerAction): GameState {
  const pool = state.factionCardPool;
  const allPool = state.allSpellsPool;
  const newState = deepClone({ ...state, factionCardPool: undefined, allSpellsPool: undefined } as GameState);
  newState.factionCardPool = pool;
  newState.allSpellsPool = allPool;

  const queue = newState.pendingTriggers ?? [];
  const idx = queue.findIndex(t => t.id === action.triggerId);
  if (idx === -1) return state; // déclencheur introuvable → no-op
  const trigger = queue[idx];
  queue.splice(idx, 1);
  newState.pendingTriggers = queue;

  if (trigger.kw === "remontee") {
    const controller = newState.players.find(p => p.id === trigger.controllerId);
    const other = newState.players.find(p => p.id !== trigger.controllerId);
    if (controller && other) {
      resolveRemontee(action.targetInstanceId, trigger.sourceInstanceId, controller, other);
    }
  }

  recalculateAuras(newState.players[0], newState.players[1]);
  newState.lastAction = action;
  checkWinCondition(newState);
  return newState;
}

/** Whether the tap-mode activation of `kw` requires a target. Mirrors
 *  the switch in `getTapActivateTargets` but operates without a state
 *  reference — used by UI shortcuts (double-click activates a tap kw
 *  only when no picker is needed). */
export function tapKeywordNeedsTarget(kw: Keyword): boolean {
  switch (kw) {
    case "vampirisme":
    case "remontee":
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
  const filterTargetable = (creatures: CardInstance[]) =>
    creatures.filter(c =>
      !hasKw(c, "invisible")
      && !hasKw(c, "transcendance")
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
    default:
      return null;
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
  const allPool = state.allSpellsPool;
  const newState = deepClone({ ...state, factionCardPool: undefined, allSpellsPool: undefined } as GameState);
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
  const allPool = state.allSpellsPool;
  const newState = deepClone({ ...state, factionCardPool: undefined, allSpellsPool: undefined } as GameState);
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
  currentPlayerId = state.players[state.currentPlayerIndex].id;
  pendingTriggerSink = [];
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
    default: result = state;
  }

  // Rattache les déclencheurs interactifs créés pendant cette action (mort /
  // retour de Remontée au tour du contrôleur) à l'état retourné.
  if (pendingTriggerSink.length > 0 && result !== state) {
    result.pendingTriggers = [...(result.pendingTriggers ?? []), ...pendingTriggerSink];
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

export function canPlayCard(state: GameState, cardInstanceId: string): boolean {
  const player = state.players[state.currentPlayerIndex];
  const card = player.hand.find(c => c.instanceId === cardInstanceId);
  if (!card) return false;
  // Concentration baseline reduction (see playCard for full rationale).
  // Token baseline override (see getTokenManaCost): in-hand tokens cost
  // floor((attack+health)/2) instead of the on-board 0.
  let manaCost = Math.max(0, getTokenManaCost(card.card) - (card.manaCostReduction ?? 0));
  if (card.card.card_type === "spell") {
    const canalisationCount = player.board.filter(c => hasKw(c, "canalisation")).length;
    // Canalisation ne peut jamais faire descendre un sort sous 1 mana. Le
    // plancher est min(1, coût) pour ne pas *augmenter* un sort déjà à 0
    // (ex. réduit par Concentration) tout en bloquant la réduction à 1 sinon.
    manaCost = Math.max(Math.min(1, manaCost), manaCost - canalisationCount);
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
  "benediction", "tactique", "remontee", "conferer",
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
  return composedChoiceTargetIds(t, player, opponent);
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
  return composedChoiceTargetIds(cap.composed.target, player, opponent);
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
      case "permutation":
      case "vampirisme":
        return filterEnemyTargetable2(opponent.board).map(c => c.instanceId);
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
    }
  }
  // Repli : cible d'un effet composé à l'entrée "au choix" (unité et/ou héros).
  const cap = firstOnPlayComposedChoiceCap(card);
  if (cap?.composed?.target) {
    return composedChoiceTargetIds(cap.composed.target, player, opponent);
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

export function creatureNeedsTraqueDuDestin(card: Card): boolean {
  return card.card_type === "creature" && card.keywords.includes("traque_du_destin" as Keyword);
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

export function creatureNeedsSelection(card: Card): boolean {
  return card.card_type === "creature" && card.keywords.includes("selection" as Keyword);
}

export function creatureNeedsRenfortRoyal(card: Card): boolean {
  return card.card_type === "creature" && card.keywords.includes("renfort_royal" as Keyword);
}

export function creatureNeedsMagicalSelection(card: Card): boolean {
  return card.card_type === "creature" && card.keywords.includes("selection_magique" as Keyword);
}

const RENFORT_ROYAL_OWNERSHIP_THRESHOLD = 30;
// Sélection X / Renfort Royal X always offer up to this many cards. X is
// now a mana-cost ceiling on the offered pool — see getSelectionCards.
const SELECTION_OFFER_COUNT = 3;

// Détermine l'ensemble des factions autorisées pour Sélection X /
// Sélection magique X : factions dont l'alignement correspond à celui de la
// source. Fallback : factions présentes dans le deck du joueur +
// Mercenaires (comportement historique) si la source ou son alignement est
// indéterminable.
function factionsForSelectionAlignment(
  source: { faction?: string | null; card_alignment?: string | null } | null,
  player: PlayerState,
): Set<string> {
  const alignment = source ? getEffectiveAlignment(source) : null;
  if (alignment) {
    const allowed = new Set<string>();
    for (const [factionId, def] of Object.entries(FACTIONS)) {
      if (def.alignment === alignment) allowed.add(factionId);
    }
    return allowed;
  }
  // Fallback : deck factions + Mercenaires
  const allowed = new Set<string>();
  allowed.add("Mercenaires");
  for (const c of [...player.hand, ...player.board, ...player.deck, ...player.graveyard]) {
    if (c.card.faction && c.card.faction !== "Mercenaires") allowed.add(c.card.faction);
  }
  return allowed;
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
  if (ownedLimited.length < RENFORT_ROYAL_OWNERSHIP_THRESHOLD) {
    return getSelectionCards(state, maxManaCost, source);
  }
  const filtered = maxManaCost > 0
    ? ownedLimited.filter(c => c.mana_cost <= maxManaCost)
    : ownedLimited;
  if (filtered.length === 0) return [];
  // Same deterministic shuffle pattern as getSelectionCards so both
  // clients agree without burning the seeded RNG.
  const entropy = player.hand.length * 7 + player.board.length * 13 + player.deck.length * 3 + player.graveyard.length * 17 + player.mana * 11;
  const seed = state.turnNumber * 1000 + state.currentPlayerIndex * 100 + entropy + 999;
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
): Card[] {
  const pool = state.factionCardPool;
  if (!pool || pool.length === 0) return [];

  const player = state.players[state.currentPlayerIndex];
  const allowedFactions = factionsForSelectionAlignment(source ?? null, player);
  const filtered = pool.filter(c =>
    c.faction
    && allowedFactions.has(c.faction)
    && c.rarity === "Commune"
    && (maxManaCost <= 0 || c.mana_cost <= maxManaCost),
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
  return shuffled.slice(0, Math.min(SELECTION_OFFER_COUNT, shuffled.length));
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
): Card[] {
  const pool = state.allSpellsPool;
  if (!pool || pool.length === 0) return [];

  const player = state.players[state.currentPlayerIndex];
  const allowedFactions = factionsForSelectionAlignment(source ?? null, player);
  const filtered = pool.filter(c =>
    c.card_type === "spell"
    && c.faction
    && allowedFactions.has(c.faction)
    && c.rarity === "Commune"
    && (maxManaCost <= 0 || c.mana_cost <= maxManaCost),
  );
  if (filtered.length === 0) return [];

  const entropy = player.hand.length * 7 + player.board.length * 13 + player.deck.length * 3 + player.graveyard.length * 17 + player.mana * 11;
  const seed = state.turnNumber * 1000 + state.currentPlayerIndex * 100 + entropy + 1999;
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
