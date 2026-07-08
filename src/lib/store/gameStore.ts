import { create } from "zustand";
import type { GameState, GameAction, Card, CardInstance, DamageEvent, DeathFxEvent, HeroDefinition, PlayerState, SpellTargetSlot, TokenTemplate } from "@/lib/game/types";
import { useAudioStore } from "./audioStore";
import SfxEngine from "@/lib/audio/SfxEngine";
import { playAttackLunge } from "@/lib/game/animations";
import { findInstanceEl, overlayRect } from "@/lib/fx/overlayMotion";
import { parseXValuesFromEffectText, KEYWORD_LABELS, KEYWORD_SYMBOLS, keywordModeColor } from "@/lib/game/keyword-labels";
import { composedCapsOf, composedTriggerMode } from "@/lib/game/composed-display";
import {
  initializeGame,
  applyAction,
  canPlayCard,
  canAttack,
  getValidTargets,
  needsTarget,
  getSpellTargets,
  getSpellTargetSlots,
  canUseHeroPower,
  heroPowerNeedsTarget,
  getHeroPowerTargets,
  heroPowerComposedChoice,
  creatureNeedsTarget,
  getCreatureTargets,
  getCreatureComposedChoice,
  getOnAttackComposedChoice,
  getOnAttackTargets,
  getComposedTapTargets,
  creatureNeedsGraveyardTarget,
  getGraveyardTargets,
  creatureNeedsDivination,
  creatureNeedsTraqueDuDestin,
  getTraqueDuDestinX,
  creatureNeedsSelection,
  getSelectionCards,
  creatureNeedsRenfortRoyal,
  getRenfortRoyalCards,
  creatureNeedsMagicalSelection,
  getMagicalSelectionCards,
  getSpellGraveyardTargets,
  getDiscardCost,
  getSacrificeCost,
  getTapActivateTargets,
  remonteeTargetIds,
  endOfTurnTriggerTargets,
} from "@/lib/game/engine";

// Overlay de ciblage pour un déclencheur interactif en attente (Remontée mort/
// retour au tour du contrôleur). Si le 1er pending appartient au joueur local
// et a des cibles valides, on entre le mode "pending_trigger" ; sinon "none".
function pendingTriggerOverlay(
  gs: GameState | null,
  localPlayerId: string | null,
): { targetingMode: "pending_trigger" | "selection" | "none"; validTargets: string[]; pendingTriggerId: string | null; selectionCards?: Card[] } {
  const none = { targetingMode: "none" as const, validTargets: [], pendingTriggerId: null };
  const t = gs?.pendingTriggers?.[0];
  if (!t || !localPlayerId || t.controllerId !== localPlayerId) return none;
  // Variante « Sélection en fin de tour » : ouvre la modale « 1 parmi 3 » (les
  // cartes offertes sont portées par le trigger sous forme d'ids).
  if (t.selectionType) {
    const byId = new Map([...(gs!.factionCardPool ?? []), ...(gs!.allSpellsPool ?? [])].map(c => [c.id, c] as const));
    const ordered = (t.selectionOptionIds ?? []).map(id => byId.get(id)).filter((c): c is Card => !!c);
    if (ordered.length === 0) return none;
    return { targetingMode: "selection" as const, validTargets: [], pendingTriggerId: t.id, selectionCards: ordered };
  }
  // Variante « fin de tour » (effet composé) vs remontée (mot-clé).
  const isEndOfTurn = !!t.capUid;
  if (!isEndOfTurn && t.kw !== "remontee") return none;
  const controller = gs!.players.find(p => p.id === t.controllerId);
  const other = gs!.players.find(p => p.id !== t.controllerId);
  if (!controller || !other) return none;
  const targets = isEndOfTurn
    ? endOfTurnTriggerTargets(gs!, t)
    : remonteeTargetIds(controller, other, t.sourceInstanceId);
  if (targets.length === 0) return none;
  return { targetingMode: "pending_trigger", validTargets: targets, pendingTriggerId: t.id };
}

export interface SpellCastEvent {
  spellName: string;
  effectText: string;
  timestamp: number;
  countered?: boolean;
  card?: Card | null;
  targetIds?: string[];
}

// Flèche source→cible tracée depuis la CRÉATURE qui active un pouvoir (tap)
// vers chaque cible touchée, pour que les deux joueurs voient d'où viennent
// les dégâts (ex. Veilleur des Lisières). Transient (hors hash de désync) ;
// coords DOM déterministes, rejoué chez l'adversaire via dispatchAction.
export interface PowerArrowGroup {
  // instanceId d'une créature OU sentinelle héros ("friendly_hero"/"enemy_hero",
  // relative au joueur local) — findInstanceEl résout les deux.
  sourceId: string;
  targetIds: string[];
  color: string;
}
export interface PowerArrowEvent {
  // Un groupe de flèches par (source, couleur). Un pouvoir activé = jaune ; les
  // dégâts déclenchés (mort/retour/attaque/fin de tour) portent leur couleur de mode.
  arrows: PowerArrowGroup[];
  timestamp: number;
}

export interface FireBreathEvent {
  attackerInstanceId: string;
  timestamp: number;
}

// Cycle éternel — one entry per dead creature carrying the keyword. The
// overlay shows a ghostly copy of each card flying back into its owner's
// deck (data-cycle-deck="my" or "opponent").
export interface CycleEternelEntry {
  card: Card;
  ownerIsLocal: boolean;
}
export interface CycleEternelEvent {
  entries: CycleEternelEntry[];
  timestamp: number;
}

// Tempête X — lightning rain animation. Driven by the per-target damage
// events the engine emits during the resolved action; we collect those
// here so the overlay can stagger one bolt per drop.
export interface TempeteEvent {
  targetIds: string[];
  timestamp: number;
}

// Une ou plusieurs cartes de la main du joueur local viennent de voir leur
// coût en mana réduit (Sacrifice démoniaque…). Sert à faire flotter un « -N »
// vert sur chaque carte concernée. `byInstance` mappe instanceId → réduction
// appliquée par CETTE action.
export interface ManaReductionEvent {
  byInstance: Record<string, number>;
  timestamp: number;
}

export interface HeroPowerCastEvent {
  heroName: string;
  race: string;
  powerName: string;
  powerDescription: string;
  // Per-hero illustration for the cast overlay. Falls back to the
  // race-generic image (HERO_IMAGES[race]) in HeroPowerOverlay when null.
  powerImageUrl?: string | null;
  timestamp: number;
}

export interface GraveyardAffectEvent {
  cards: Card[];
  timestamp: number;
}

// A card was forcibly discarded from a player's hand to their graveyard
// (Combustion, future "forced discard" effects). Shown in its own phase
// between summons and draws so the player sees what was discarded *before*
// the new cards are drawn.
export interface DiscardFromHandEvent {
  cards: Card[];
  ownerPlayerId: string;
  timestamp: number;
}

interface GameStore {
  // State
  gameState: GameState | null;
  localPlayerId: string | null;
  selectedCardInstanceId: string | null;
  selectedAttackerInstanceId: string | null;
  validTargets: string[];
  targetingMode: "none" | "attack" | "attack_power" | "spell" | "spell_multi" | "creature" | "graveyard" | "divination" | "selection" | "tactique_keywords" | "hero_power" | "cost_payment" | "tap" | "pending_trigger";
  // Id du déclencheur interactif en attente que le contrôleur résout (Remontée
  // mort/retour à son tour). null hors de ce mode.
  pendingTriggerId: string | null;
  // Tap-activation targeting context — set when the player clicks Activer
  // on a creature whose tap-mode keyword needs a target (e.g. Vampirisme).
  // Both fields stay null outside of tap targeting.
  pendingTapSourceId: string | null;
  pendingTapInstanceIdx: number | null;
  // uid de l'effet composé activable en attente de cible (null sinon).
  pendingTapComposedUid: string | null;
  // Alternative-cost payment state — set when the player tries to play a card
  // with a discard_cost or sacrifice_cost > 0. The player picks N cards from
  // hand and/or N creatures from board, then confirms via CostPaymentOverlay.
  pendingCostCard: { instanceId: string; discardNeeded: number; sacrificeNeeded: number; boardPosition: number | null } | null;
  selectedDiscardIds: string[];
  selectedSacrificeIds: string[];
  // True while the active selection overlay was opened by a hero power
  // (selection / renfort_royal / selection_magique). The next selectTarget
  // call dispatches a hero_power action instead of a play_card.
  pendingHeroPowerSelection: boolean;
  pendingBoardPosition: number | null;
  divinationCards: CardInstance[];
  selectionCards: Card[];
  tactiqueAvailableKeywords: string[];
  tactiqueMaxSelections: number;
  pendingTargetInstanceId: string | null;
  // Multi-target spell state
  spellTargetSlots: SpellTargetSlot[];
  currentTargetSlotIndex: number;
  collectedTargetMap: Record<string, string>;
  // Cibles collectées pour un effet composé multi-cibles "au choix" d'une créature.
  creatureComposedCollected: string[];
  // Pouvoir de héros composé en cours de ciblage : uid de la capacité + nombre
  // de cibles à collecter (réutilise creatureComposedCollected pour l'accu).
  pendingHeroPowerComposed: { uid: string; count: number } | null;
  // Attaque avec pouvoir composé "à l'attaque" en désignation "au choix" : la
  // cible d'attaque est mémorisée pendant qu'on collecte les cibles du pouvoir.
  pendingAttackDefenderId: string | null;
  attackPowerCollected: string[];
  // Carries the partial play_card payload from a creature's first picker
  // (target / graveyard / divination) into a subsequent selection picker on
  // the same creature, so a creature combining e.g. mimique + selection can
  // resolve both halves in one dispatch. Null outside of that chain.
  pendingCreatureChain: {
    targetInstanceId?: string;
    graveyardTargetInstanceId?: string;
    divinationChoiceIndex?: number;
    boardPosition?: number | null;
  } | null;
  tokenTemplates: TokenTemplate[];
  effectLog: { id: string; text: string; timestamp: number }[];
  damageEvents: DamageEvent[];
  deathEvents: DeathFxEvent[];
  summonEvents: string[]; // instanceIds of creatures summoned this action (FX)
  entryEvents: string[]; // instanceIds de créatures JOUÉES depuis la main cette action → entrée douce (≠ FX portail des invocations)
  spellCastEvent: SpellCastEvent | null;
  fireBreathEvent: FireBreathEvent | null;
  cycleEternelEvent: CycleEternelEvent | null;
  tempeteEvent: TempeteEvent | null;
  powerArrowEvent: PowerArrowEvent | null;
  manaReductionEvent: ManaReductionEvent | null;
  heroPowerCastEvent: HeroPowerCastEvent | null;
  graveyardAffectEvent: GraveyardAffectEvent | null;
  discardFromHandEvent: DiscardFromHandEvent | null;
  boardImageUrl: string | null;
  // Layout variant carried by the active game_board. "classic" = legacy
  // positions; "mtgo" = MTGO-inspired with a clickable graveyard tile on
  // the left and the hero/deck/mana stack on the right (mirrored at top
  // for the opponent).
  boardLayout: string;
  // Optional admin-uploaded image used as the clickable graveyard tile in
  // layouts that surface one (mtgo). Falls back to a generic 💀 icon when
  // null.
  boardGraveyardImageUrl: string | null;
  myCardBackUrl: string | null;
  opponentCardBackUrl: string | null;
  boardMusicUrls: string[];
  boardTenseMusicUrl: string | null;
  boardVictoryMusicUrl: string | null;
  boardDefeatMusicUrl: string | null;
  lastSfxEvents: { type: string; cardSfxUrl?: string }[];
  // Animation orchestration
  isAnimating: boolean;
  pendingIncomingActions: GameAction[];

  // Actions
  initGame: (
    player1Id: string,
    player2Id: string,
    player1Cards: { card: Card; quantity: number }[],
    player2Cards: { card: Card; quantity: number }[],
    firstPlayerIndex?: 0 | 1,
    seed?: number,
    player1Hero?: HeroDefinition | null,
    player2Hero?: HeroDefinition | null,
    factionCardPool?: Card[],
    allSpellsPool?: Card[],
  ) => void;
  setGameState: (state: GameState) => void;
  setLocalPlayerId: (id: string) => void;
  setTokenTemplates: (templates: TokenTemplate[]) => void;
  setBoardImageUrl: (url: string | null) => void;
  setBoardLayout: (layout: string) => void;
  setBoardGraveyardImageUrl: (url: string | null) => void;
  setMyCardBackUrl: (url: string | null) => void;
  setOpponentCardBackUrl: (url: string | null) => void;
  setBoardMusicUrls: (urls: string[]) => void;
  setBoardTenseMusicUrl: (url: string | null) => void;
  setBoardVictoryMusicUrl: (url: string | null) => void;
  setBoardDefeatMusicUrl: (url: string | null) => void;
  /** Push the per-player owned-limited-card lists onto each PlayerState
   *  after `initGame`. Used by Renfort Royal to know which limited
   *  prints the player can pull from. */
  setOwnedLimitedCardIds: (player1Ids: number[], player2Ids: number[]) => void;

  // Game actions
  dispatchAction: (action: GameAction) => GameAction | null;
  playCardDirect: (instanceId: string, boardPosition?: number) => GameAction | null;
  selectCardInHand: (instanceId: string) => GameAction | null;
  selectAttacker: (instanceId: string) => void;
  selectTarget: (targetId: string) => GameAction | null;
  clearSelection: () => void;
  clearDamageEvents: () => void;
  clearDeathEvents: () => void;
  clearSummonEvents: () => void;
  clearSpellCastEvent: () => void;
  clearFireBreathEvent: () => void;
  clearCycleEternelEvent: () => void;
  clearTempeteEvent: () => void;
  clearPowerArrowEvent: () => void;
  clearManaReductionEvent: () => void;
  clearHeroPowerCastEvent: () => void;
  clearGraveyardAffectEvent: () => void;
  clearDiscardFromHandEvent: () => void;
  toggleDiscardSelection: (instanceId: string) => void;
  toggleSacrificeSelection: (instanceId: string) => void;
  confirmCostPayment: () => GameAction | null;
  cancelCostPayment: () => void;
  activateHeroPower: () => GameAction | null;
  activateTap: (sourceInstanceId: string, instanceIdx: number) => GameAction | null;
  activateTapComposed: (sourceInstanceId: string, capUid: string) => GameAction | null;
  confirmMulligan: (selectedInstanceIds: string[]) => GameAction | null;

  // Queries
  isMyTurn: () => boolean;
  getMyPlayerState: () => ReturnType<typeof getPlayerState>;
  getOpponentPlayerState: () => ReturnType<typeof getPlayerState>;
}

function getPlayerState(state: GameState, playerId: string) {
  const idx = state.players.findIndex((p) => p.id === playerId);
  return idx !== -1 ? state.players[idx] : null;
}

function getElementCenter(targetId: string): { x: number; y: number } {
  let el: Element | null = null;
  if (targetId === "enemy_hero" || targetId === "friendly_hero") {
    el = document.querySelector(`[data-target-id="${targetId}"]`);
  } else {
    // Prefer the on-board creature over any hand copy sharing this instanceId,
    // so the damage popup/FX anchors on the board fighter, not a card in hand.
    el = findInstanceEl(targetId);
  }
  if (el) {
    const rect = overlayRect(el);
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  return { x: -9999, y: -9999 };
}

// Keywords that already have their own dedicated popup — skip them in the
// generic "empower" (capability acquired) detection so we don't double up.
const EMPOWER_SKIP = new Set(["divine_shield", "poison", "paralysie"]);

// Build a readable "🐺 Berserk" label for a freshly-granted keyword. Image-path
// symbols (e.g. /icons/augure.png) fall back to a generic rune glyph; numeric
// keywords drop their trailing " X" placeholder.
function keywordGrantLabel(kw: string): string | null {
  const label = (KEYWORD_LABELS as Record<string, string>)[kw];
  if (!label) return null; // internal/undisplayable flag — ignore
  const sym = (KEYWORD_SYMBOLS as Record<string, string>)[kw];
  const glyph = sym && !sym.startsWith("/") ? sym : "✦";
  return `${glyph} ${label.replace(/ X$/, "")}`;
}

function detectDamageEvents(
  oldState: GameState,
  newState: GameState,
  localPlayerId: string | null
): DamageEvent[] {
  const events: DamageEvent[] = [];

  for (let i = 0; i < 2; i++) {
    const oldPlayer = oldState.players[i];
    const newPlayer = newState.players[i];
    const isLocal = oldPlayer.id === localPlayerId;
    const heroId = isLocal ? "friendly_hero" : "enemy_hero";

    // Hero damage — inclut les dégâts absorbés par l'armure. dealDamageToHero
    // retire d'abord l'armure puis les PV : un coup encaissé par l'armure fait
    // baisser hero.armor SANS toucher hero.hp. Sans ce cumul, un surplus de
    // Piétinement (ou toute attaque) mangé par l'armure n'affichait aucun FX de
    // dégât. Total ressenti = PV perdus + armure perdue.
    const heroHpLoss = oldPlayer.hero.hp - newPlayer.hero.hp;
    const heroArmorLoss = oldPlayer.hero.armor - newPlayer.hero.armor;
    const heroDamageTaken = Math.max(0, heroHpLoss) + Math.max(0, heroArmorLoss);
    if (heroDamageTaken > 0) {
      const pos = getElementCenter(heroId);
      events.push({
        targetId: heroId,
        amount: heroDamageTaken,
        type: "damage",
        ...pos,
      });
    }

    // Hero heal
    if (newPlayer.hero.hp > oldPlayer.hero.hp) {
      const pos = getElementCenter(heroId);
      events.push({
        targetId: heroId,
        amount: newPlayer.hero.hp - oldPlayer.hero.hp,
        type: "heal",
        ...pos,
      });
    }

    // Armor gain
    if (newPlayer.hero.armor > oldPlayer.hero.armor) {
      const pos = getElementCenter(heroId);
      events.push({
        targetId: heroId,
        amount: newPlayer.hero.armor - oldPlayer.hero.armor,
        type: "buff",
        label: `+${newPlayer.hero.armor - oldPlayer.hero.armor} Armor`,
        ...pos,
      });
    }

    // Creature changes — check old board creatures
    for (const oldCreature of oldPlayer.board) {
      const newCreature = newPlayer.board.find(
        (c) => c.instanceId === oldCreature.instanceId
      );
      if (!newCreature) continue;

      // Damage (poison tick or regular)
      if (newCreature.currentHealth < oldCreature.currentHealth) {
        const pos = getElementCenter(oldCreature.instanceId);
        const isPoisonTick = oldCreature.isPoisoned && (oldCreature.currentHealth - newCreature.currentHealth) === 1;
        events.push({
          targetId: oldCreature.instanceId,
          amount: oldCreature.currentHealth - newCreature.currentHealth,
          type: isPoisonTick ? "poison" : "damage",
          ...pos,
        });
      }

      // Heal
      if (
        newCreature.currentHealth > oldCreature.currentHealth &&
        newCreature.currentAttack === oldCreature.currentAttack
      ) {
        const pos = getElementCenter(oldCreature.instanceId);
        events.push({
          targetId: oldCreature.instanceId,
          amount: newCreature.currentHealth - oldCreature.currentHealth,
          type: "heal",
          ...pos,
        });
      }

      // Buff (attack or health increase from buff spells)
      const atkDiff = newCreature.currentAttack - oldCreature.currentAttack;
      const hpDiff = newCreature.maxHealth - oldCreature.maxHealth;
      if (atkDiff > 0 || hpDiff > 0) {
        const pos = getElementCenter(oldCreature.instanceId);
        const parts: string[] = [];
        if (atkDiff > 0) parts.push(`+${atkDiff}`);
        if (hpDiff > 0) parts.push(`+${hpDiff}`);
        events.push({
          targetId: oldCreature.instanceId,
          amount: atkDiff + hpDiff,
          type: "buff",
          label: parts.join("/"),
          ...pos,
        });
      }

      // Poisoned
      if (!oldCreature.isPoisoned && newCreature.isPoisoned) {
        const pos = getElementCenter(oldCreature.instanceId);
        events.push({
          targetId: oldCreature.instanceId,
          amount: 0,
          type: "poison",
          label: "☠️ Poison",
          ...pos,
        });
      }

      // Divine Shield gained
      if (!oldCreature.hasDivineShield && newCreature.hasDivineShield) {
        const pos = getElementCenter(oldCreature.instanceId);
        events.push({
          targetId: oldCreature.instanceId,
          amount: 0,
          type: "shield",
          label: "Divine Shield",
          ...pos,
        });
      }

      // Divine Shield broken (absorbed damage)
      if (oldCreature.hasDivineShield && !newCreature.hasDivineShield) {
        const pos = getElementCenter(oldCreature.instanceId);
        events.push({
          targetId: oldCreature.instanceId,
          amount: 0,
          type: "shield",
          label: "Bouclier brisé",
          ...pos,
        });
      }

      // Paralyzed
      if (!oldCreature.isParalyzed && newCreature.isParalyzed) {
        const pos = getElementCenter(oldCreature.instanceId);
        events.push({
          targetId: oldCreature.instanceId,
          amount: 0,
          type: "paralyze",
          label: "⛓️ Paralysie",
          ...pos,
        });
      }

      // Capability acquired — a keyword/ability was granted at runtime (hero
      // power aura, composed grant, spell grant…). Previously silent. We diff
      // the keyword set + grantedKeywordX and surface one "empower" flourish
      // per creature (batched) so the player sees the unit gain power.
      const oldKws = new Set((oldCreature.card.keywords as unknown as string[]).map(String));
      const gained: string[] = [];
      for (const kw of newCreature.card.keywords as unknown as string[]) {
        const k = String(kw);
        if (!oldKws.has(k) && !EMPOWER_SKIP.has(k)) gained.push(k);
      }
      // grantedKeywordX entries that are new (numeric keyword X assigned) and
      // not already covered by the set diff above.
      const oldGx = oldCreature.grantedKeywordX ?? {};
      const newGx = newCreature.grantedKeywordX ?? {};
      for (const k of Object.keys(newGx)) {
        if (!(k in oldGx) && !oldKws.has(k) && !EMPOWER_SKIP.has(k) && !gained.includes(k)) {
          gained.push(k);
        }
      }
      if (gained.length > 0) {
        const labels = gained.map(keywordGrantLabel).filter(Boolean) as string[];
        if (labels.length > 0) {
          const pos = getElementCenter(oldCreature.instanceId);
          events.push({
            targetId: oldCreature.instanceId,
            amount: 0,
            type: "empower",
            label: labels.join("  ·  "),
            ...pos,
          });
        }
      }
    }

    // Buffs sur les créatures EN MAIN (ex. Entrainement). La boucle ci-dessus
    // ne diffe que le plateau, donc un boost de la main serait silencieux. On
    // ne diffe que les cartes présentes dans les DEUX états de main : une carte
    // piochée ou renvoyée en main (rebond) n'était pas dans l'ancienne main →
    // ignorée, donc pas de faux popup. Popup flottant "+X/+Y" identique au
    // plateau, ancré sur la carte en main via son data-instance-id.
    for (const oldCard of oldPlayer.hand) {
      if (oldCard.card.card_type !== "creature") continue;
      const newCard = newPlayer.hand.find((c) => c.instanceId === oldCard.instanceId);
      if (!newCard) continue;
      const atkDiff = newCard.currentAttack - oldCard.currentAttack;
      const hpDiff = newCard.maxHealth - oldCard.maxHealth;
      if (atkDiff > 0 || hpDiff > 0) {
        const pos = getElementCenter(oldCard.instanceId);
        const parts: string[] = [];
        if (atkDiff > 0) parts.push(`+${atkDiff}`);
        if (hpDiff > 0) parts.push(`+${hpDiff}`);
        events.push({
          targetId: oldCard.instanceId,
          amount: atkDiff + hpDiff,
          type: "buff",
          label: parts.join("/"),
          ...pos,
        });
      }
    }

    // Detect new creatures on board (resurrection, exhumation, convocation)
    for (const newCreature of newPlayer.board) {
      const existed = oldPlayer.board.find(c => c.instanceId === newCreature.instanceId);
      if (!existed && newCreature.hasUsedResurrection) {
        const pos = getElementCenter(newCreature.instanceId);
        events.push({
          targetId: newCreature.instanceId,
          amount: 0,
          type: "resurrect",
          label: "✨ Résurrection",
          ...pos,
        });
      }
    }
  }

  // Detect esquive (dodge): attacker's attacksRemaining decreased but no damage dealt to target
  if (newState.lastAction?.type === "attack") {
    const action = newState.lastAction;
    const targetId = action.targetInstanceId;
    if (targetId && targetId !== "enemy_hero") {
      const attackerPlayerIdx = oldState.currentPlayerIndex;
      const defenderPlayerIdx = attackerPlayerIdx === 0 ? 1 : 0;
      const oldTarget = oldState.players[defenderPlayerIdx].board.find(c => c.instanceId === targetId);
      const newTarget = newState.players[defenderPlayerIdx].board.find(c => c.instanceId === targetId);
      if (oldTarget && newTarget && oldTarget.currentHealth === newTarget.currentHealth) {
        // Target took no damage — check if attacker used an attack
        const oldAttacker = oldState.players[attackerPlayerIdx].board.find(c => c.instanceId === action.attackerInstanceId);
        const newAttacker = newState.players[attackerPlayerIdx].board.find(c => c.instanceId === action.attackerInstanceId);
        if (oldAttacker && newAttacker && oldAttacker.attacksRemaining > newAttacker.attacksRemaining) {
          // Attack happened but target took no damage = esquive
          if (oldTarget.esquiveUsedThisTurn === false && newTarget.esquiveUsedThisTurn === true) {
            const pos = getElementCenter(targetId);
            events.push({
              targetId,
              amount: 0,
              type: "dodge",
              label: "💨 Esquive !",
              ...pos,
            });
          }
        }
      }
    }
  }

  return events;
}

function generateEffectLog(
  oldState: GameState,
  newState: GameState,
  action: GameAction
): { id: string; text: string; timestamp: number }[] {
  const entries: { id: string; text: string; timestamp: number }[] = [];
  const now = Date.now();
  let idx = 0;
  const add = (text: string) => entries.push({ id: `${now}-${idx++}`, text, timestamp: now });

  if (action.type === "play_card") {
    const player = oldState.players[oldState.currentPlayerIndex];
    const cardInst = player.hand.find(c => c.instanceId === action.cardInstanceId);
    if (cardInst) add(`📥 ${cardInst.card.name} joué`);
  }

  // Detect deaths
  for (let i = 0; i < 2; i++) {
    const oldBoard = oldState.players[i].board;
    const newBoard = newState.players[i].board;
    for (const c of oldBoard) {
      if (!newBoard.find(nc => nc.instanceId === c.instanceId)) {
        add(`💀 ${c.card.name} détruit`);
      }
    }
  }

  // Detect poison ticks
  for (let i = 0; i < 2; i++) {
    for (const nc of newState.players[i].board) {
      const oc = oldState.players[i].board.find(c => c.instanceId === nc.instanceId);
      if (oc && nc.isPoisoned && nc.currentHealth < oc.currentHealth) {
        add(`☠️ Poison : ${nc.card.name} -${oc.currentHealth - nc.currentHealth} PV`);
      }
    }
  }

  // Detect regen
  for (let i = 0; i < 2; i++) {
    for (const nc of newState.players[i].board) {
      const oc = oldState.players[i].board.find(c => c.instanceId === nc.instanceId);
      if (oc && nc.currentHealth > oc.currentHealth && nc.card.keywords.includes("regeneration" as import("@/lib/game/types").Keyword)) {
        add(`💚 Régénération : ${nc.card.name} +${nc.currentHealth - oc.currentHealth} PV`);
      }
    }
  }

  return entries;
}

/** Couleur de surbrillance des cibles valides pendant le ciblage d'un POUVOIR
 *  ACTIVABLE (mode "tap"). Reprend la couleur d'icône du pouvoir activé
 *  (keywordModeColor du mode / trigger composé) pour que le bord des cibles
 *  matche l'icône : activable → jaune, retour en main → bleu, etc. Renvoie
 *  null hors ciblage de pouvoir — l'attaque et les sorts gardent alors leur
 *  bord rouge / violet habituel (repli côté composant). */
export function selectPowerTargetingColor(s: GameStore): string | null {
  if (s.targetingMode !== "tap" || !s.gameState || !s.pendingTapSourceId) return null;
  const gs = s.gameState;
  const src = gs.players[gs.currentPlayerIndex].board.find(c => c.instanceId === s.pendingTapSourceId);
  if (!src) return null;
  if (s.pendingTapInstanceIdx != null) {
    return keywordModeColor(src.card.keyword_instances?.[s.pendingTapInstanceIdx]?.mode) ?? null;
  }
  if (s.pendingTapComposedUid) {
    const cap = composedCapsOf(src.card.capabilities).find(c => c.uid === s.pendingTapComposedUid);
    return cap ? (keywordModeColor(composedTriggerMode(cap)) ?? null) : null;
  }
  return null;
}

export const useGameStore = create<GameStore>((set, get) => {
  // After on-board target collection finishes for a spell (e.g. Renforcement),
  // check if the same spell also carries a selection-style picker
  // (selection / selection_magique / renfort_royal). If yes, switch the UI
  // to the selection mode and carry the collected targetMap forward so the
  // eventual dispatch contains both halves. Returns true when a picker was
  // opened — caller should bail instead of dispatching.
  const openSelectionPickerIfNeeded = (
    gs: GameState,
    instanceId: string,
    carriedMap: Record<string, string>,
  ): boolean => {
    const player = gs.players[gs.currentPlayerIndex];
    const cardInst = player.hand.find(c => c.instanceId === instanceId);
    if (!cardInst || cardInst.card.card_type !== "spell" || !cardInst.card.spell_keywords) return false;
    const tryOpen = (kwId: string, getter: (x: number) => Card[]): boolean => {
      const found = cardInst.card.spell_keywords!.find(k => k.id === kwId);
      if (!found) return false;
      const x = found.amount ?? 0;
      const choices = getter(x);
      if (choices.length === 0) return false;
      set({
        targetingMode: "selection",
        selectionCards: choices,
        validTargets: [],
        // selectedCardInstanceId stays as-is. collectedTargetMap holds the
        // carry forward so the selection-mode dispatch can merge it in.
        collectedTargetMap: carriedMap,
      });
      return true;
    };
    return (
      tryOpen("selection", (x) => getSelectionCards(gs, x, cardInst.card)) ||
      tryOpen("selection_magique", (x) => getMagicalSelectionCards(gs, x, cardInst.card)) ||
      tryOpen("renfort_royal", (x) => getRenfortRoyalCards(gs, x, cardInst.card))
    );
  };

  // Creature counterpart of openSelectionPickerIfNeeded. After the user
  // resolves a creature's target / graveyard / divination picker, this
  // checks whether the same creature ALSO carries a selection-style
  // picker keyword and, if so, opens the second picker carrying the
  // already-collected fields (target, graveyard target, divination index,
  // board position) via pendingCreatureChain. The chain payload is read
  // back in the selection-mode creature dispatch branch so the final
  // play_card action contains every half. Returns true when a picker was
  // opened — caller should bail instead of dispatching.
  const openCreaturePickerIfNeeded = (
    gs: GameState,
    instanceId: string,
    carried: {
      targetInstanceId?: string;
      graveyardTargetInstanceId?: string;
      divinationChoiceIndex?: number;
      boardPosition?: number | null;
    },
  ): boolean => {
    const player = gs.players[gs.currentPlayerIndex];
    const cardInst = player.hand.find(c => c.instanceId === instanceId);
    if (!cardInst || cardInst.card.card_type !== "creature") return false;
    const card = cardInst.card;
    let choices: Card[] | null = null;
    if (creatureNeedsSelection(card)) {
      const x = parseXValuesFromEffectText(card.effect_text)["selection"] ?? 0;
      choices = getSelectionCards(gs, x, card);
    } else if (creatureNeedsRenfortRoyal(card)) {
      const x = parseXValuesFromEffectText(card.effect_text)["renfort_royal"] ?? 0;
      choices = getRenfortRoyalCards(gs, x, card);
    } else if (creatureNeedsMagicalSelection(card)) {
      const x = parseXValuesFromEffectText(card.effect_text)["selection_magique"] ?? 0;
      choices = getMagicalSelectionCards(gs, x, card);
    }
    if (!choices || choices.length === 0) return false;
    set({
      targetingMode: "selection",
      selectionCards: choices,
      validTargets: [],
      pendingCreatureChain: carried,
    });
    return true;
  };

  return ({
  gameState: null,
  localPlayerId: null,
  selectedCardInstanceId: null,
  selectedAttackerInstanceId: null,
  validTargets: [],
  targetingMode: "none",
  pendingTriggerId: null,
  pendingCostCard: null,
  selectedDiscardIds: [],
  selectedSacrificeIds: [],
  pendingHeroPowerSelection: false,
  pendingBoardPosition: null,
  divinationCards: [],
  selectionCards: [],
  tactiqueAvailableKeywords: [],
  tactiqueMaxSelections: 0,
  pendingTargetInstanceId: null,
  pendingTapSourceId: null,
  pendingTapInstanceIdx: null,
  pendingTapComposedUid: null,
  spellTargetSlots: [],
  currentTargetSlotIndex: 0,
  collectedTargetMap: {},
  creatureComposedCollected: [],
  pendingHeroPowerComposed: null,
  pendingAttackDefenderId: null,
  attackPowerCollected: [],
  pendingCreatureChain: null,
  tokenTemplates: [],
  effectLog: [],
  damageEvents: [],
  deathEvents: [],
  summonEvents: [],
  entryEvents: [],
  spellCastEvent: null,
  fireBreathEvent: null,
  cycleEternelEvent: null,
  tempeteEvent: null,
  powerArrowEvent: null,
  manaReductionEvent: null,
  heroPowerCastEvent: null,
  graveyardAffectEvent: null,
  discardFromHandEvent: null,
  isAnimating: false,
  pendingIncomingActions: [],
  boardImageUrl: null,
  boardLayout: "classic",
  boardGraveyardImageUrl: null,
  myCardBackUrl: null,
  opponentCardBackUrl: null,
  boardMusicUrls: [],
  boardTenseMusicUrl: null,
  boardVictoryMusicUrl: null,
  boardDefeatMusicUrl: null,
  lastSfxEvents: [],

  initGame: (player1Id, player2Id, player1Cards, player2Cards, firstPlayerIndex, seed, player1Hero, player2Hero, factionCardPool, allSpellsPool) => {
    const state = initializeGame(
      player1Id,
      player2Id,
      player1Cards,
      player2Cards,
      firstPlayerIndex,
      seed,
      player1Hero,
      player2Hero,
      factionCardPool,
      allSpellsPool,
    );
    // Inject token templates into GameState for engine access
    state.tokenTemplates = get().tokenTemplates;
    set({ gameState: state });
  },

  setGameState: (state) => set({ gameState: state, ...pendingTriggerOverlay(state, get().localPlayerId) }),
  setLocalPlayerId: (id) => set({ localPlayerId: id }),
  setTokenTemplates: (templates) => set({ tokenTemplates: templates }),
  setBoardImageUrl: (url) => set({ boardImageUrl: url }),
  setBoardLayout: (layout) => set({ boardLayout: layout }),
  setBoardGraveyardImageUrl: (url) => set({ boardGraveyardImageUrl: url }),
  setMyCardBackUrl: (url) => set({ myCardBackUrl: url }),
  setOpponentCardBackUrl: (url) => set({ opponentCardBackUrl: url }),
  setBoardMusicUrls: (urls: string[]) => set({ boardMusicUrls: urls }),
  setBoardTenseMusicUrl: (url: string | null) => set({ boardTenseMusicUrl: url }),
  setBoardVictoryMusicUrl: (url: string | null) => set({ boardVictoryMusicUrl: url }),
  setBoardDefeatMusicUrl: (url: string | null) => set({ boardDefeatMusicUrl: url }),
  setOwnedLimitedCardIds: (player1Ids, player2Ids) => {
    const { gameState } = get();
    if (!gameState) return;
    gameState.players[0].ownedLimitedCardIds = player1Ids;
    gameState.players[1].ownedLimitedCardIds = player2Ids;
    set({ gameState: { ...gameState, players: [...gameState.players] as [PlayerState, PlayerState] } });
  },

  dispatchAction: (action) => {
    const { gameState, localPlayerId, isAnimating } = get();
    if (!gameState || gameState.phase === "finished") return null;

    // Concede bypasses every guard — a forfeit must always work, even mid-
    // animation, even on the opponent's turn. We interrupt any running
    // animation pipeline and drop the queued remote actions so the
    // VICTORY/DEFEAT overlay surfaces immediately on both clients.
    if (action.type === "concede") {
      const next = applyAction(gameState, action);
      set({
        gameState: next,
        isAnimating: false,
        pendingIncomingActions: [],
        damageEvents: [],
        deathEvents: [],
        summonEvents: [],
        entryEvents: [],
        spellCastEvent: null,
        fireBreathEvent: null,
        cycleEternelEvent: null,
        heroPowerCastEvent: null,
        graveyardAffectEvent: null,
        discardFromHandEvent: null,
        tempeteEvent: null,
        powerArrowEvent: null,
        manaReductionEvent: null,
      });
      return action;
    }

    // If the animation pipeline is still playing a previous action, drop this
    // one silently — the UI lock (myTurn && !isAnimating) normally prevents
    // local clicks from getting here, and the page.tsx broadcast handler
    // enqueues remote actions via pendingIncomingActions directly.
    if (isAnimating) {
      return null;
    }

    // Tant qu'un déclencheur interactif est en attente, seule sa résolution est
    // permise (le contrôleur doit choisir une cible avant toute autre action).
    if ((gameState.pendingTriggers?.length ?? 0) > 0
      && action.type !== "resolve_pending_trigger"
      && action.type !== "auto_resolve_pending_triggers") {
      return null;
    }

    // Merge any pending alternative-cost selections (discards / sacrifices)
    // into the play_card action — single chokepoint so callers don't each
    // have to remember to forward the IDs.
    if (action.type === "play_card") {
      const { selectedDiscardIds, selectedSacrificeIds } = get();
      if (selectedDiscardIds.length > 0 || selectedSacrificeIds.length > 0) {
        action = {
          ...action,
          discardInstanceIds: action.discardInstanceIds ?? selectedDiscardIds,
          sacrificeInstanceIds: action.sacrificeInstanceIds ?? selectedSacrificeIds,
        };
      }
    }

    // Detect spell cast before applying action
    let spellEvent: SpellCastEvent | null = null;
    if (action.type === "play_card") {
      const player = gameState.players[gameState.currentPlayerIndex];
      const cardInst = player.hand.find((c) => c.instanceId === action.cardInstanceId);
      if (cardInst && cardInst.card.card_type === "spell") {
        // Collect every target this cast references so the overlay can draw
        // arrows from the spell card to each target on the board.
        const tgts: string[] = [];
        if (action.targetInstanceId) tgts.push(action.targetInstanceId);
        if (action.graveyardTargetInstanceId) tgts.push(action.graveyardTargetInstanceId);
        if (action.targetMap) {
          for (const v of Object.values(action.targetMap)) {
            if (v && !tgts.includes(v)) tgts.push(v);
          }
        }
        spellEvent = {
          spellName: cardInst.card.name,
          effectText: cardInst.card.effect_text,
          timestamp: Date.now(),
          card: cardInst.card,
          targetIds: tgts,
        };
      }
    }

    // Detect hero power cast before applying action
    let heroPowerEvent: HeroPowerCastEvent | null = null;
    if (action.type === "hero_power") {
      const player = gameState.players[gameState.currentPlayerIndex];
      const heroDef = player.hero.heroDefinition;
      if (heroDef) {
        heroPowerEvent = {
          heroName: heroDef.name,
          race: heroDef.race,
          powerName: heroDef.powerName,
          powerDescription: heroDef.powerDescription,
          powerImageUrl: heroDef.powerImageUrl ?? null,
          timestamp: Date.now(),
        };
      }
    }

    // Detect fire breath before applying action
    let fireEvent: FireBreathEvent | null = null;
    if (action.type === "attack" && action.attackerInstanceId) {
      const player = gameState.players[gameState.currentPlayerIndex];
      const attacker = player.board.find((c) => c.instanceId === action.attackerInstanceId);
      if (attacker && attacker.card.keywords.includes("souffle_de_feu" as import("@/lib/game/types").Keyword)) {
        fireEvent = {
          attackerInstanceId: action.attackerInstanceId,
          timestamp: Date.now(),
        };
      }
    }

    // playerIdx = joueur actif (caster) ; réutilisé plus bas (POV, oppIdx…).
    const playerIdx = gameState.currentPlayerIndex;

    const newState = applyAction(gameState, action);
    // Two-wave attack: pop the post-power / pre-combat snapshot the engine
    // attached when an "à l'attaque" composed power fired. Wave 1 = power
    // (gameState→intermediate), wave 2 = combat (intermediate→newState). The
    // combat builders below diff from `combatOld` so the power's damage isn't
    // re-shown in the combat wave.
    const onAttackWave = newState.onAttackWave ?? null;
    if (newState.onAttackWave) newState.onAttackWave = undefined;
    const combatOld = onAttackWave ? onAttackWave.intermediate : gameState;
    const dmgEvents = detectDamageEvents(combatOld, newState, localPlayerId);
    // Cosmetic: stamp the attacker centre onto combat-damage events so the FX
    // layer can shoot debris / kick the shake along the strike vector. Same
    // DOM-derived coords on both clients → no effect on game state or sync.
    // `getElementCenter` returns a -9999 sentinel if the node is gone; the FX
    // layer treats that as "no direction" and falls back to a radial burst.
    if (action.type === "attack" && action.attackerInstanceId) {
      const src = getElementCenter(action.attackerInstanceId);
      for (const ev of dmgEvents) {
        if (ev.type === "damage") {
          ev.srcX = src.x;
          ev.srcY = src.y;
        }
      }
    }
    const logEntries = generateEffectLog(gameState, newState, action);

    // Pop Fureur strikes off the state so they only animate once. Each
    // entry becomes a delayed attack-lunge plus a delayed damage popup on
    // the random victim, sequenced after the main combat. The chain can
    // be multi-step (one entry per strike) when the Fureur creature
    // survives its first retaliation — the lunges fire one after another
    // and each victim's damage popup is offset accordingly.
    const rawFureurStrikes = newState.fureurStrikes ?? [];
    if (newState.fureurStrikes) newState.fureurStrikes = undefined;
    // Translate hero sentinels (`__hero_<idx>__`) into local-POV labels so
    // playAttackLunge + damage events resolve to the right DOM nodes.
    const fureurStrikes = rawFureurStrikes.map((s) => {
      const m = /^__hero_(\d)__$/.exec(s.victimInstanceId);
      if (!m) return s;
      const idx = parseInt(m[1]);
      const isLocal = newState.players[idx]?.id === localPlayerId;
      return { ...s, victimInstanceId: isLocal ? "friendly_hero" : "enemy_hero" };
    });
    const FUREUR_LUNGE_GAP_MS = 1000;       // gap between successive Fureur lunges (ralenti pour lisibilité de la chaîne)
    const FUREUR_FIRST_DELAY_MS = 900;      // gap between main lunge and first Fureur lunge
    const FUREUR_DAMAGE_DELAY_MS = 1300;    // base delay added to victim damage popups
    const FUREUR_PHASE_EXTRA_MS = fureurStrikes.length > 0
      ? FUREUR_DAMAGE_DELAY_MS + (fureurStrikes.length - 1) * FUREUR_LUNGE_GAP_MS + 500
      : 0;

    // Points séquentiels (scatter / Tempête) : un popup + un burst VFX par point,
    // dans l'ordre réel, au lieu d'un total agrégé par cible (même patron que
    // fureurStrikes). On vide la liste transitoire après extraction. Désactivé
    // sur le chemin "à l'attaque" (onAttackWave) où ces dégâts vivent dans la
    // vague 1 — on retombe alors sur l'agrégat existant.
    const rawSeqHits = (!onAttackWave && newState.sequentialHits) ? newState.sequentialHits : [];
    if (newState.sequentialHits) newState.sequentialHits = undefined;
    // Retraduit le sentinel héros `__hero_<idx>__` en repère local (cf. fureur).
    const seqHits = rawSeqHits.map((h) => {
      const m = /^__hero_(\d)__$/.exec(h.targetInstanceId);
      if (!m) return h;
      const isLocal = newState.players[+m[1]]?.id === localPlayerId;
      return { ...h, targetInstanceId: isLocal ? "friendly_hero" : "enemy_hero" };
    });
    const SEQ_STEP_MS = 140; // décalage par point (~130–160ms = points distincts à l'œil)
    const seqTargets = new Set(seqHits.map((h) => h.targetInstanceId));
    const seqEvents: DamageEvent[] = seqHits.map((h, i) => ({
      targetId: h.targetInstanceId,
      amount: 1,
      type: h.type,
      ...getElementCenter(h.targetInstanceId),
      delayMs: i * SEQ_STEP_MS,
    }));
    const SEQ_PHASE_EXTRA_MS = seqEvents.length > 0 ? (seqEvents.length - 1) * SEQ_STEP_MS + 500 : 0;

    // Sorts relancés (capacité Relancer) : le moteur a enregistré chaque relance
    // dans newState.recastEvents {card, targetIds}, dans l'ordre de relance. On
    // les anime comme un sort joué depuis la main (overlay + flèches vers les
    // cibles choisies aléatoirement + VFX de ciblage). Sentinelles héros
    // absolues `__hero_<idx>__` → POV local (cf. fureurStrikes / sequentialHits).
    // On vide la liste transitoire après extraction (exclue du hash).
    const rawRecasts = newState.recastEvents ?? [];
    if (newState.recastEvents) newState.recastEvents = undefined;
    const recastSpells: SpellCastEvent[] = rawRecasts.map((rc) => ({
      spellName: `♻️ ${rc.card.name}`,
      effectText: rc.card.effect_text,
      timestamp: Date.now(),
      card: rc.card,
      targetIds: rc.targetIds.map((id) => {
        const m = /^__hero_(\d)__$/.exec(id);
        if (!m) return id;
        const isLocal = newState.players[+m[1]]?.id === localPlayerId;
        return isLocal ? "friendly_hero" : "enemy_hero";
      }),
    }));

    // Detect if a spell was countered (contresort)
    if (spellEvent && action.type === "play_card") {
      const opponentIdx = gameState.currentPlayerIndex === 0 ? 1 : 0;
      const oldOpponent = gameState.players[opponentIdx];
      const hadCounter = oldOpponent.board.some(c => c.contresortActive);
      const newOpponent = newState.players[opponentIdx];
      const stillHasCounter = newOpponent.board.some(c => c.contresortActive);
      if (hadCounter && !stillHasCounter) {
        spellEvent = { ...spellEvent, countered: true, effectText: "Contré !" };
      }
    }

    // Find creatures that died (were on old board but not on new board).
    // Track owner index so cycle_eternel can fly the copy back to the right
    // deck (data-cycle-deck="my" vs "opponent").
    const deadCreatures: CardInstance[] = [];
    const deathOwnerIdx = new Map<string, number>();
    for (let i = 0; i < 2; i++) {
      // combatOld = post-power board on a two-wave attack, so combat deaths
      // exclude power-killed creatures (those animate in wave 1).
      const oldBoard = combatOld.players[i].board;
      const newBoard = newState.players[i].board;
      for (const oldC of oldBoard) {
        if (!newBoard.find((c) => c.instanceId === oldC.instanceId)) {
          deadCreatures.push(oldC);
          deathOwnerIdx.set(oldC.instanceId, i);
        }
      }
    }

    // Death FX positions — captured NOW, while the dying creatures are still
    // mounted in the DOM (this runs synchronously at dispatch, before the death
    // phase removes them). Viewport coords → identical on both clients. Power-
    // wave deaths animate separately and aren't included here.
    const deathFxEvents: DeathFxEvent[] = deadCreatures.map((dead) => {
      const pos = getElementCenter(dead.instanceId);
      return { instanceId: dead.instanceId, x: pos.x, y: pos.y, poisoned: !!dead.isPoisoned };
    });

    // Cycle éternel — one entry per dead creature carrying the keyword. The
    // engine has already inserted a copy at a random position in the owner's
    // deck; the overlay just visualises the return trip.
    const localIdx = newState.players.findIndex((p) => p.id === localPlayerId);
    const cycleEntries: CycleEternelEntry[] = [];
    for (const dead of deadCreatures) {
      if (dead.card.keywords.includes("cycle_eternel" as import("@/lib/game/types").Keyword)) {
        const ownerIdx = deathOwnerIdx.get(dead.instanceId) ?? 0;
        cycleEntries.push({ card: dead.card, ownerIsLocal: ownerIdx === localIdx });
      }
    }
    const cycleEvent: CycleEternelEvent | null = cycleEntries.length > 0
      ? { entries: cycleEntries, timestamp: Date.now() }
      : null;

    // Build SFX events
    const sfxEvents: { type: string; cardSfxUrl?: string }[] = [];

    if (action.type === "play_card") {
      const player = gameState.players[gameState.currentPlayerIndex];
      const cardInst = player.hand.find((c) => c.instanceId === action.cardInstanceId);
      if (cardInst) {
        if (cardInst.card.card_type === "spell") {
          sfxEvents.push({ type: "spell_cast" });
        } else {
          sfxEvents.push({ type: "play_card", cardSfxUrl: cardInst.card.sfx_play_url ?? undefined });
        }
      }
    } else if (action.type === "attack") {
      sfxEvents.push({ type: "attack" });
    } else if (action.type === "end_turn") {
      sfxEvents.push({ type: "end_turn" });
    } else if (action.type === "hero_power") {
      sfxEvents.push({ type: "hero_power" });
    }

    // SFX from damage events (deduplicate by type)
    const dmgSfxSeen = new Set<string>();
    for (const de of dmgEvents) {
      const sfxType = de.type === "shield" ? "divine_shield" : de.type;
      if (["damage", "heal", "buff", "debuff", "divine_shield", "poison", "dodge", "paralyze", "resurrect"].includes(sfxType) && !dmgSfxSeen.has(sfxType)) {
        dmgSfxSeen.add(sfxType);
        sfxEvents.push({ type: sfxType });
      }
    }

    // SFX from dead creatures
    for (const dead of deadCreatures) {
      sfxEvents.push({ type: "creature_death", cardSfxUrl: dead.card.sfx_death_url ?? undefined });
    }

    // SFX from summoned creatures — any creature that appeared on a board and
    // wasn't the card directly played. Covers Convocation X, Convocations
    // multiples, Résurrection, spell-summons, etc. Deduped: one SFX per action.
    const playedInstanceId =
      action.type === "play_card" ? action.cardInstanceId : null;
    let summonedTotal = 0;
    for (let i = 0; i < 2; i++) {
      const oldBoard = gameState.players[i].board;
      const newBoard = newState.players[i].board;
      for (const nc of newBoard) {
        if (nc.instanceId === playedInstanceId) continue;
        if (!oldBoard.find((c) => c.instanceId === nc.instanceId)) {
          summonedTotal++;
        }
      }
    }
    if (summonedTotal > 0) {
      sfxEvents.push({ type: "summon" });
    }

    // SFX from spell countered
    if (spellEvent?.countered) {
      sfxEvents.push({ type: "counter_spell" });
    }

    // SFX from fire breath
    if (fireEvent) {
      sfxEvents.push({ type: "fire_breath" });
    }

    // Tempête X — detect when the played card carries the keyword either
    // creature-side (card.keywords includes "tempete") or spell-side
    // (spell_keywords contains an entry with id "tempete"). Targets are
    // the enemy creatures that took at least one drop, recovered from
    // dmgEvents (the engine deals the damage one HP at a time, so an
    // enemy hit twice still yields a single targetId entry).
    let tempeteEvent: TempeteEvent | null = null;
    {
      // Did THIS action resolve a Tempête effect? Three sources:
      //  - play_card: creature-side keyword OR spell_keywords entry (on-play)
      //  - tap_activate: the activated keyword instance is a "tap"-mode Tempête
      // (Death-mode Tempête resolves during play/combat and shares the
      // standard damage feedback, like the other curated death keywords.)
      let carriesTempete = false;
      if (action.type === "play_card") {
        const player = gameState.players[gameState.currentPlayerIndex];
        const playedCard = player.hand.find((c) => c.instanceId === action.cardInstanceId);
        carriesTempete = playedCard
          ? playedCard.card.keywords.includes("tempete" as import("@/lib/game/types").Keyword) ||
            (playedCard.card.spell_keywords ?? []).some((k) => k.id === "tempete")
          : false;
      } else if (action.type === "tap_activate") {
        const player = gameState.players[gameState.currentPlayerIndex];
        const source = player.board.find((c) => c.instanceId === action.sourceInstanceId);
        const inst = source?.card.keyword_instances?.[action.instanceIdx];
        carriesTempete = inst?.id === "tempete" && inst?.mode === "tap";
      }
      if (carriesTempete) {
        const opponentBoardIds = new Set(
          gameState.players[gameState.currentPlayerIndex === 0 ? 1 : 0].board.map((c) => c.instanceId),
        );
        // Expand each damage event into N per-HP entries so the overlay
        // shows ONE bolt per drop (rather than one bolt per unique
        // target). A creature that took 3 damage gets 3 separate bolts
        // hitting it. The actual random order chosen by the engine is
        // not recorded, so the bolts on the same target appear in a row
        // — sufficient for the "successively" feel without threading
        // additional state through the engine.
        const targetIds: string[] = [];
        for (const ev of dmgEvents) {
          if (ev.type !== "damage") continue;
          if (!opponentBoardIds.has(ev.targetId)) continue;
          const drops = Math.max(1, ev.amount ?? 1);
          for (let i = 0; i < drops; i++) targetIds.push(ev.targetId);
        }
        if (targetIds.length > 0) {
          tempeteEvent = { targetIds, timestamp: Date.now() };
        }
      }
    }

    // Flèche source→cible pour un pouvoir qui inflige des dégâts : trace un
    // trait depuis la SOURCE (la créature qui active un pouvoir tap, ou le
    // héros du lanceur pour un pouvoir de héros) vers chaque cible ENNEMIE
    // touchée — créatures adverses ET héros adverse — pour que les DEUX
    // joueurs voient d'où viennent les dégâts (ex. Veilleur des Lisières).
    // Les sentinelles héros sont relatives au joueur local (comme dmgEvents /
    // data-target-id), donc l'ancrage reste correct sur les deux écrans.
    let powerArrowEvent: PowerArrowEvent | null = null;
    const powerArrows: PowerArrowGroup[] = [];
    // Sentinelle héros moteur `__hero_<idx>__` → repère LOCAL ("friendly_hero"/
    // "enemy_hero") ; un instanceId de créature passe tel quel.
    const heroSentinelToLocal = (id: string): string => {
      const m = /^__hero_(\d+)__$/.exec(id);
      if (!m) return id;
      return gameState.players[Number(m[1])]?.id === localPlayerId ? "friendly_hero" : "enemy_hero";
    };

    // (1) Pouvoir ACTIVÉ (tap) ou pouvoir de HÉROS → flèche JAUNE. Cibles
    // déduites en comparant l'état AVANT (gameState) / APRÈS (newState) sur le
    // plateau adverse (PAS detectDamageEvents : il rate les créatures mortes et
    // confond perte de boost et dégâts).
    if (action.type === "tap_activate" || action.type === "hero_power") {
      const oppIdx = playerIdx === 0 ? 1 : 0;
      const casterIsLocal = localPlayerId === gameState.players[playerIdx].id;
      const casterHeroSentinel = casterIsLocal ? "friendly_hero" : "enemy_hero";
      const enemyHeroSentinel = casterIsLocal ? "enemy_hero" : "friendly_hero";
      const sourceId = action.type === "tap_activate" ? action.sourceInstanceId : casterHeroSentinel;

      const hit = new Set<string>();
      const newOppById = new Map(newState.players[oppIdx].board.map((c) => [c.instanceId, c]));
      for (const oldC of gameState.players[oppIdx].board) {
        const newC = newOppById.get(oldC.instanceId);
        if (!newC) hit.add(oldC.instanceId); // tuée
        else if (newC.currentHealth < oldC.currentHealth && newC.maxHealth >= oldC.maxHealth) hit.add(oldC.instanceId); // vrais dégâts (exclut perte de boost)
        else if (oldC.hasDivineShield && !newC.hasDivineShield) hit.add(oldC.instanceId); // bouclier absorbé
      }
      const oldHero = gameState.players[oppIdx].hero;
      const newHero = newState.players[oppIdx].hero;
      if (newHero.hp < oldHero.hp || newHero.armor < oldHero.armor) hit.add(enemyHeroSentinel);

      // Pouvoir de HÉROS ciblé : le diff de plateau adverse ci-dessus rate les
      // cibles ALLIÉES (un buff/boost n'inflige pas de dégâts). On lit donc les
      // cibles explicitement déclarées dans l'action (targetInstanceId + valeurs
      // de targetMap pour les pouvoirs composés/sort) et on trace une flèche vers
      // toute créature en jeu ainsi ciblée — alliée (boost) comme ennemie.
      if (action.type === "hero_power") {
        const onBoard = new Set<string>([
          ...newState.players[0].board.map((c) => c.instanceId),
          ...newState.players[1].board.map((c) => c.instanceId),
        ]);
        const declared: string[] = [];
        if (action.targetInstanceId) declared.push(action.targetInstanceId);
        if (action.targetMap) declared.push(...Object.values(action.targetMap));
        for (const id of declared) if (onBoard.has(id)) hit.add(id);
      }

      hit.delete(sourceId);
      const targetIds = Array.from(hit);
      if (targetIds.length > 0) powerArrows.push({ sourceId, targetIds, color: "#d4a800" });
    }

    // (2) Dégâts de pouvoir DÉCLENCHÉS (mort/retour/attaque/fin de tour),
    // enregistrés par le moteur avec leur mode → flèche colorée par mode
    // (rouge/bleu/violet/vert, via keywordModeColor). Regroupées par (source, couleur).
    if (newState.powerStrikes && newState.powerStrikes.length > 0) {
      const groups = new Map<string, { sourceId: string; color: string; targets: Set<string> }>();
      for (const st of newState.powerStrikes) {
        const color = keywordModeColor(st.mode) ?? "#d4a800";
        const src = heroSentinelToLocal(st.sourceId);
        const tgt = heroSentinelToLocal(st.targetId);
        const key = `${src}|${color}`;
        let g = groups.get(key);
        if (!g) { g = { sourceId: src, color, targets: new Set() }; groups.set(key, g); }
        if (tgt !== src) g.targets.add(tgt);
      }
      for (const g of groups.values()) {
        if (g.targets.size > 0) powerArrows.push({ sourceId: g.sourceId, targetIds: Array.from(g.targets), color: g.color });
      }
      newState.powerStrikes = undefined; // consommé (indice d'animation, hors état)
    }

    if (powerArrows.length > 0) powerArrowEvent = { arrows: powerArrows, timestamp: Date.now() };

    // Réduction de coût (Sacrifice démoniaque…) : on diffe le manaCostReduction
    // des cartes de la main du joueur LOCAL avant/après l'action et on émet un
    // « -N » vert flottant sur chaque carte concernée. Pur diff côté store,
    // aucun changement moteur.
    let manaReductionEvent: ManaReductionEvent | null = null;
    {
      const byInstance: Record<string, number> = {};
      for (let i = 0; i < 2; i++) {
        if (newState.players[i].id !== localPlayerId) continue;
        const oldHand = new Map(gameState.players[i].hand.map(c => [c.instanceId, c.manaCostReduction ?? 0]));
        for (const c of newState.players[i].hand) {
          const delta = (c.manaCostReduction ?? 0) - (oldHand.get(c.instanceId) ?? 0);
          if (delta > 0) byInstance[c.instanceId] = delta;
        }
      }
      if (Object.keys(byInstance).length > 0) {
        manaReductionEvent = { byInstance, timestamp: Date.now() };
      }
    }

    // SFX from card draw (new cards in hand). The mulligan action is the one
    // exception: its pipeline fires ~1250ms after confirm, while the mulligan
    // overlay is still flipping cards and masking its own audio. The Mana
    // Spark / turn-start draw become visible only once the overlay unmounts,
    // so GameBoard replays the draw SFX from onRevealComplete instead.
    const oldHandSize = gameState.players.reduce((s, p) => s + p.hand.length, 0);
    const newHandSize = newState.players.reduce((s, p) => s + p.hand.length, 0);
    if (newHandSize > oldHandSize && action.type !== "mulligan") {
      sfxEvents.push({ type: "draw_card" });
    }

    // ============================================================
    // Sequenced animation pipeline
    // Order: overlay → impacts → deaths → triggered summons → final
    // Local + remote actions queue behind each other via isAnimating.
    // ============================================================

    // Bucket SFX by phase so each sound fires at the right moment.
    type SfxEvt = { type: string; cardSfxUrl?: string };
    const overlaySfx: SfxEvt[] = [];
    const impactSfx: SfxEvt[] = [];
    const deathSfx: SfxEvt[] = [];
    const summonSfx: SfxEvt[] = [];
    const drawSfx: SfxEvt[] = [];
    for (const evt of sfxEvents) {
      if (evt.type === "draw_card") {
        drawSfx.push(evt);
      } else if (["spell_cast", "hero_power", "attack", "end_turn", "play_card", "counter_spell", "fire_breath"].includes(evt.type)) {
        overlaySfx.push(evt);
      } else if (["damage", "heal", "buff", "debuff", "divine_shield", "poison", "dodge", "paralyze"].includes(evt.type)) {
        impactSfx.push(evt);
      } else if (evt.type === "creature_death") {
        deathSfx.push(evt);
      } else if (evt.type === "summon" || evt.type === "resurrect") {
        summonSfx.push(evt);
      } else {
        overlaySfx.push(evt);
      }
    }

    const playSfxBatch = (events: SfxEvt[]) => {
      if (events.length === 0 || typeof window === "undefined") return;
      const audioState = useAudioStore.getState();
      if (!audioState.userHasInteracted || audioState.settings.sfxMuted) return;
      const engine = SfxEngine.getInstance();
      for (const evt of events) {
        const url = evt.cardSfxUrl || audioState.standardSfxUrls[evt.type];
        if (url) engine.play(url);
      }
    };

    // Identify what kind of visible events this action produces.
    const hasOverlay = !!spellEvent || !!heroPowerEvent || !!fireEvent;
    const isAttack = action.type === "attack";

    // Detect cards that left the graveyard (exiled, reanimated, sacrificed…).
    // Shown to both players so they see which cards from the graveyard were
    // affected (Profanation, Exhumation, Résurrection, Nécrophagie…).
    const graveyardRemoved: Card[] = [];
    for (let i = 0; i < 2; i++) {
      const oldGY = gameState.players[i].graveyard;
      const newGY = newState.players[i].graveyard;
      for (const oldC of oldGY) {
        if (!newGY.find((c) => c.instanceId === oldC.instanceId)) {
          graveyardRemoved.push(oldC.card);
        }
      }
    }
    const graveyardAffectEvent: GraveyardAffectEvent | null =
      graveyardRemoved.length > 0
        ? { cards: graveyardRemoved, timestamp: Date.now() }
        : null;

    // Detect cards forced from a player's hand into their graveyard during
    // this action. Two distinct cases:
    //   • COST discard — the player paid `discard_cost` to play the card.
    //     Logically the cost is paid BEFORE the card resolves, so the popup
    //     must appear before the spell overlay (otherwise the discard looks
    //     like a consequence of the spell instead of a prerequisite).
    //   • EFFECT discard — Combustion ("défaussez une carte de votre main")
    //     and similar spell-driven forced discards. These belong AFTER the
    //     spell overlay since they're caused by the spell.
    // Splitting the popup keeps each one in the right narrative beat.
    const playedActionInstanceId = action.type === "play_card" ? action.cardInstanceId : null;
    const costDiscardIds = new Set<string>(
      action.type === "play_card" ? action.discardInstanceIds ?? [] : [],
    );
    const costDiscardedFromHand: { card: Card; ownerPlayerId: string }[] = [];
    const effectDiscardedFromHand: { card: Card; ownerPlayerId: string }[] = [];
    for (let i = 0; i < 2; i++) {
      const oldHand = gameState.players[i].hand;
      const newHand = newState.players[i].hand;
      const newGY = newState.players[i].graveyard;
      for (const oldCardInstance of oldHand) {
        if (oldCardInstance.instanceId === playedActionInstanceId) continue;
        const stillInHand = newHand.find((c) => c.instanceId === oldCardInstance.instanceId);
        if (stillInHand) continue;
        const inGraveyard = newGY.find((c) => c.instanceId === oldCardInstance.instanceId);
        if (inGraveyard) {
          const target = costDiscardIds.has(oldCardInstance.instanceId)
            ? costDiscardedFromHand
            : effectDiscardedFromHand;
          target.push({
            card: oldCardInstance.card,
            ownerPlayerId: gameState.players[i].id,
          });
        }
      }
    }
    const costDiscardEvent: DiscardFromHandEvent | null =
      costDiscardedFromHand.length > 0
        ? {
            cards: costDiscardedFromHand.map((d) => d.card),
            ownerPlayerId: costDiscardedFromHand[0].ownerPlayerId,
            timestamp: Date.now(),
          }
        : null;
    const discardFromHandEvent: DiscardFromHandEvent | null =
      effectDiscardedFromHand.length > 0
        ? {
            cards: effectDiscardedFromHand.map((d) => d.card),
            ownerPlayerId: effectDiscardedFromHand[0].ownerPlayerId,
            timestamp: Date.now(),
          }
        : null;
    const hasImpacts = dmgEvents.length > 0;
    const hasDeaths = deadCreatures.length > 0;

    const playedId = action.type === "play_card" ? action.cardInstanceId : null;
    const newCreatureIds = new Set<string>();
    for (let i = 0; i < 2; i++) {
      for (const nc of newState.players[i].board) {
        if (nc.instanceId === playedId) continue;
        if (!gameState.players[i].board.find((c) => c.instanceId === nc.instanceId)) {
          newCreatureIds.add(nc.instanceId);
        }
      }
    }
    const hasSummons = newCreatureIds.size > 0;

    // Créature JOUÉE depuis la main qui vient d'arriver sur le plateau (≠ sort,
    // ≠ invocation par effet) → entrée « douce » (fondu + légère montée). Vaut
    // null si le playedId est un sort ou n'est pas une créature nouvellement en jeu.
    let playedCreatureId: string | null = null;
    if (playedId) {
      const onNew = newState.players.some((p) => p.board.some((c) => c.instanceId === playedId));
      const onOld = gameState.players.some((p) => p.board.some((c) => c.instanceId === playedId));
      if (onNew && !onOld) playedCreatureId = playedId;
    }

    // How many cards each player drew this action — we hold them out of the
    // hand until the final "draw" phase so the animation is clearly separated.
    const drawnCounts: [number, number] = [
      Math.max(0, newState.players[0].hand.length - gameState.players[0].hand.length),
      Math.max(0, newState.players[1].hand.length - gameState.players[1].hand.length),
    ];
    const hasDraws = drawnCounts[0] + drawnCounts[1] > 0;

    const hasAnything = hasOverlay || hasImpacts || hasDeaths || hasSummons || hasDraws || isAttack || !!graveyardAffectEvent || !!discardFromHandEvent || !!costDiscardEvent || !!tempeteEvent || !!powerArrowEvent || !!manaReductionEvent;

    // Deep clone helper — factionCardPool / allSpellsPool carry non-serialisable refs, keep them aside.
    const cloneState = (state: GameState): GameState => {
      const { factionCardPool, allSpellsPool, ...rest } = state;
      const cloned = JSON.parse(JSON.stringify(rest)) as GameState;
      cloned.factionCardPool = factionCardPool;
      cloned.allSpellsPool = allSpellsPool;
      return cloned;
    };

    // Death-triggered buffs we need to defer visually (Nécrophagie, …).
    // For each surviving creature, compute the delta in nécrophagie bonus gained
    // during this action. We subtract it from the impact/post-death snapshots
    // so the +1/+1 buff only appears AFTER the dead creatures are removed.
    const necroDeltas = new Map<string, number>();
    for (let i = 0; i < 2; i++) {
      for (const oldC of gameState.players[i].board) {
        const newC = newState.players[i].board.find((c) => c.instanceId === oldC.instanceId);
        if (!newC) continue;
        const delta = (newC.necrophagieATKBonus ?? 0) - (oldC.necrophagieATKBonus ?? 0);
        if (delta > 0) necroDeltas.set(oldC.instanceId, delta);
      }
    }
    const rewindNecro = <T extends { instanceId: string; currentAttack: number; currentHealth: number; maxHealth: number; necrophagieATKBonus?: number; necrophagiePVBonus?: number }>(c: T): T => {
      const delta = necroDeltas.get(c.instanceId);
      if (!delta || delta <= 0) return c;
      return {
        ...c,
        necrophagieATKBonus: Math.max(0, (c.necrophagieATKBonus ?? 0) - delta),
        necrophagiePVBonus: Math.max(0, (c.necrophagiePVBonus ?? 0) - delta),
        currentAttack: Math.max(0, c.currentAttack - delta),
        currentHealth: Math.max(0, c.currentHealth - delta),
        maxHealth: Math.max(0, c.maxHealth - delta),
      };
    };

    // Impact state: HP reduced (same values as newState), dead creatures still
    // shown at 0 HP on their original slot, freshly summoned creatures NOT yet
    // on the board so they enter later with their own animation. Nécrophagie
    // buffs are rewound so they only appear after the death animation.
    const impactState = cloneState(newState);
    for (let i = 0; i < 2; i++) {
      // combatOld baseline so the combat wave doesn't resurrect power-killed
      // creatures (already removed in wave 1) nor re-show their HP loss.
      const oldBoard = combatOld.players[i].board;
      const newBoard = newState.players[i].board;
      const deadIds = new Set(
        oldBoard
          .filter((c) => !newBoard.find((nc) => nc.instanceId === c.instanceId))
          .map((c) => c.instanceId),
      );
      impactState.players[i].board = oldBoard.map((c) => {
        if (deadIds.has(c.instanceId)) {
          return { ...c, currentHealth: 0 };
        }
        const updated = newBoard.find((nc) => nc.instanceId === c.instanceId);
        return rewindNecro(updated ?? c);
      });
      // Also append any freshly-played creature (the one the user just cast) so
      // the hand→board animation still works. We exclude newCreatureIds
      // (resurrections / convocations) which belong to a later phase.
      for (const nc of newBoard) {
        if (nc.instanceId === playedId && !impactState.players[i].board.find((c) => c.instanceId === nc.instanceId)) {
          impactState.players[i].board.push(rewindNecro(nc));
        }
      }
    }

    // Post-death state: dead creatures gone, new summons still absent, buffs
    // still rewound — the Nécrophagie +1/+1 lands in the final phase.
    const postDeathState = cloneState(newState);
    for (let i = 0; i < 2; i++) {
      postDeathState.players[i].board = newState.players[i].board
        .filter((c) => !newCreatureIds.has(c.instanceId))
        .map((c) => rewindNecro(c));
    }

    // Trim drawn cards from every intermediate state so they only appear in
    // the dedicated draw phase. Engine pushes drawn cards to the end of the
    // hand, so we slice the tail.
    const trimDrawsFromHand = (state: GameState) => {
      for (let i = 0; i < 2; i++) {
        if (drawnCounts[i] > 0) {
          const h = state.players[i].hand;
          state.players[i].hand = h.slice(0, Math.max(0, h.length - drawnCounts[i]));
        }
      }
    };
    trimDrawsFromHand(impactState);
    trimDrawsFromHand(postDeathState);

    // Pre-draw state: dead + summons already resolved, buffs applied, but the
    // newly-drawn cards are still held back.
    const preDrawState = cloneState(newState);
    trimDrawsFromHand(preDrawState);

    // Fast path: trivial action (no visible effects) — commit immediately.
    if (!hasAnything) {
      const overlay = pendingTriggerOverlay(newState, get().localPlayerId);
      set({
        gameState: newState,
        selectedCardInstanceId: null,
        selectedAttackerInstanceId: null,
        ...overlay,
        pendingCostCard: null,
        selectedDiscardIds: [],
        selectedSacrificeIds: [],
        pendingHeroPowerSelection: false,
        pendingTapSourceId: null,
        pendingTapInstanceIdx: null,
        pendingTapComposedUid: null,
        pendingCreatureChain: null,
        damageEvents: [],
        entryEvents: playedCreatureId ? [playedCreatureId] : [],
        lastSfxEvents: sfxEvents,
        effectLog: [...get().effectLog, ...logEntries].slice(-20),
      });
      playSfxBatch(sfxEvents);
      return action;
    }

    // Lock the UI while the sequence plays.
    set({
      isAnimating: true,
      selectedCardInstanceId: null,
      selectedAttackerInstanceId: null,
      validTargets: [],
      targetingMode: "none",
      pendingCostCard: null,
      selectedDiscardIds: [],
      selectedSacrificeIds: [],
      pendingHeroPowerSelection: false,
      pendingTapSourceId: null,
      pendingTapInstanceIdx: null,
      pendingTapComposedUid: null,
      // Posé avant les phases : la créature jouée monte en phase d'impact avec
      // `entering` vrai → entrée douce. Réécrit à chaque action donc auto-reset.
      entryEvents: playedCreatureId ? [playedCreatureId] : [],
    });

    // --- Phase timings ---
    const OVERLAY_PRE_IMPACT_MS = 1150; // spell / hero-power → impact start (tightened: the card's motion is done by ~600ms, so 1800 left a long dead hold before impact)
    const POWER_ARROW_PRE_IMPACT_MS = 550; // pouvoir tap sans overlay : laisse la flèche partir avant que les dégâts/bouclier ne s'affichent
    const ATTACK_LUNGE_PRE_IMPACT_MS = 700; // lunge (~650ms) + short buffer
    const IMPACT_MS = 1200;
    const DRAW_MS = 1000;
    const DEATH_MS = 1000;
    const SUMMON_MS = 1400;
    const DISCARD_MS = 1800; // forced-discard popup display time
    // Cost discard runs BEFORE the spell overlay to communicate that the
    // discard is a prerequisite, not a consequence. Shorter than DISCARD_MS
    // so it doesn't drag the cast — the popup visually starts here and
    // continues fading while the spell overlay flies in.
    const COST_DISCARD_MS = 1000;
    const RECAST_GAP_MS = 1200; // gap between recasts (tightened from 1800 — a 3-recast cascade was 5.4s of pure gap)

    // Une attaque sur héros porte une sentinelle en POINT DE VUE DE L'ATTAQUANT
    // ("enemy_hero" = héros défenseur). Le lunge la résout via `data-target-id`,
    // qui est en repère LOCAL — donc sur l'écran du joueur qui SUBIT l'attaque,
    // "enemy_hero" désigne le héros de l'attaquant et le lunge vise le mauvais
    // héros (bug : « la créature adverse semble attaquer son propre héros »). On
    // la retraduit en repère local d'après le propriétaire de l'attaquant. Les
    // cibles créature (instanceId global) passent inchangées.
    const attackHeroTargetToLocal = (targetId: string, attackerInstanceId: string): string => {
      if (targetId !== "enemy_hero" && targetId !== "friendly_hero") return targetId;
      const atkIdx = gameState.players.findIndex((p) => p.board.some((c) => c.instanceId === attackerInstanceId));
      if (atkIdx < 0) return targetId;
      // "enemy_hero" (POV attaquant) = héros du joueur OPPOSÉ à l'attaquant.
      const defenderIdx = targetId === "enemy_hero" ? (atkIdx === 0 ? 1 : 0) : atkIdx;
      return gameState.players[defenderIdx]?.id === localPlayerId ? "friendly_hero" : "enemy_hero";
    };

    // --- Phase handlers ---
    const phaseOverlay = () => {
      set((s) => ({
        effectLog: [...s.effectLog, ...logEntries].slice(-20),
        ...(spellEvent ? { spellCastEvent: spellEvent } : {}),
        ...(fireEvent ? { fireBreathEvent: fireEvent } : {}),
        ...(heroPowerEvent ? { heroPowerCastEvent: heroPowerEvent } : {}),
        // La flèche de pouvoir part AVANT l'impact (simultanée à l'anim
        // héroïque pour un pouvoir de héros ; les dégâts/bouclier suivent).
        ...(powerArrowEvent ? { powerArrowEvent } : {}),
      }));
      playSfxBatch(overlaySfx);
      // Attack lunge plays on BOTH the active and passive client, since this
      // runs inside dispatchAction which remote broadcasts go through too.
      if (isAttack && action.type === "attack") {
        playAttackLunge(action.attackerInstanceId, attackHeroTargetToLocal(action.targetInstanceId, action.attackerInstanceId));
        // Fureur chain: each strike replays a lunge from the Fureur
        // creature to its current victim, staggered so the player sees
        // them as successive events. Multi-step chains animate
        // sequentially (one lunge per surviving strike).
        for (let i = 0; i < fureurStrikes.length; i++) {
          const s = fureurStrikes[i];
          setTimeout(
            () => playAttackLunge(s.attackerInstanceId, s.victimInstanceId),
            FUREUR_FIRST_DELAY_MS + i * FUREUR_LUNGE_GAP_MS,
          );
        }
      }
    };

    // Cascade: if multiple targets are hit by the same action, stagger their
    // floating popups by 200ms each so the player can read each one.
    const STAGGER_MS = 200;
    // Split damage events into impact (direct dégâts/heal/shield/…) and
    // deferred buffs triggered by deaths (Nécrophagie) — the latter must wait
    // until the creatures have actually left for the graveyard.
    const deferredBuffEvents = dmgEvents.filter(
      (ev) => ev.type === "buff" && necroDeltas.has(ev.targetId),
    );
    const impactOnlyEvents = dmgEvents.filter(
      (ev) => !(ev.type === "buff" && necroDeltas.has(ev.targetId)),
    );
    // Per-victim delay derived from the Fureur strike order: victim of the
    // 1st strike shows at +DAMAGE_DELAY, victim of the 2nd at +DAMAGE_DELAY
    // +LUNGE_GAP, etc. — matches the lunge sequencing above. If a chain
    // happens to hit the same victim twice the combined damage popup
    // appears at the first occurrence's time (later strikes are folded in).
    const fureurVictimDelay = new Map<string, number>();
    fureurStrikes.forEach((s, i) => {
      if (!fureurVictimDelay.has(s.victimInstanceId)) {
        fureurVictimDelay.set(s.victimInstanceId, FUREUR_DAMAGE_DELAY_MS + i * FUREUR_LUNGE_GAP_MS);
      }
    });

    const staggerByTarget = (events: typeof dmgEvents) => {
      const order = new Map<string, number>();
      for (const ev of events) {
        if (!order.has(ev.targetId)) order.set(ev.targetId, order.size);
      }
      return events.map((ev) => {
        const base = (order.get(ev.targetId) ?? 0) * STAGGER_MS;
        const fureurBonus = fureurVictimDelay.get(ev.targetId) ?? 0;
        return { ...ev, delayMs: base + fureurBonus };
      });
    };
    // Pour les cibles touchées par des points séquentiels, on retire l'agrégat
    // diffé (damage/heal) — remplacé par les seqEvents par point déjà décalés
    // (qui NE repassent PAS par staggerByTarget, sinon leur delayMs serait
    // écrasé). Les autres types (shield/poison/empower) restent intacts.
    const nonSeqImpactEvents = impactOnlyEvents.filter(
      (ev) => !(seqTargets.has(ev.targetId) && (ev.type === "damage" || ev.type === "heal")),
    );
    const staggeredDmgEvents = [...staggerByTarget(nonSeqImpactEvents), ...seqEvents];
    const staggeredTriggerEvents = staggerByTarget(deferredBuffEvents);

    // --- Wave 1 (on-attack power) artifacts: diff gameState → intermediate ---
    let powerImpactState: GameState | null = null;
    let powerDeathState: GameState | null = null;
    let powerDmgStaggered: ReturnType<typeof staggerByTarget> = [];
    let powerHasDeaths = false;
    if (onAttackWave) {
      const inter = onAttackWave.intermediate;
      powerImpactState = cloneState(inter);
      for (let i = 0; i < 2; i++) {
        const oldBoard = gameState.players[i].board;
        const interBoard = inter.players[i].board;
        const deadIds = new Set(
          oldBoard.filter((c) => !interBoard.find((nc) => nc.instanceId === c.instanceId)).map((c) => c.instanceId),
        );
        if (deadIds.size > 0) powerHasDeaths = true;
        // Originally-living creatures: power-dead shown at 0 HP on their slot,
        // survivors at their post-power values.
        powerImpactState.players[i].board = oldBoard.map((c) =>
          deadIds.has(c.instanceId) ? { ...c, currentHealth: 0 } : (interBoard.find((nc) => nc.instanceId === c.instanceId) ?? c),
        );
        // Append creatures the power summoned (on_attack summon_token) so they
        // appear in the power wave rather than popping in later.
        for (const nc of interBoard) {
          if (!powerImpactState.players[i].board.find((c) => c.instanceId === nc.instanceId)) {
            powerImpactState.players[i].board.push(nc);
          }
        }
      }
      // The intermediate already has power-dead creatures removed → it IS the
      // post-power-death state.
      powerDeathState = cloneState(inter);
      powerDmgStaggered = staggerByTarget(detectDamageEvents(gameState, inter, localPlayerId));
    }

    const phasePowerImpacts = () => {
      if (!powerImpactState) return;
      set({ gameState: powerImpactState, damageEvents: powerDmgStaggered });
    };
    const phasePowerDeaths = () => {
      if (powerDeathState) set({ gameState: powerDeathState });
    };

    const phaseImpacts = () => {
      set({
        gameState: impactState,
        damageEvents: staggeredDmgEvents,
        lastSfxEvents: impactSfx,
        ...(graveyardAffectEvent ? { graveyardAffectEvent } : {}),
        ...(tempeteEvent ? { tempeteEvent } : {}),
      });
      playSfxBatch(impactSfx);
    };

    const phaseDeaths = () => {
      set({
        gameState: postDeathState,
        ...(deathFxEvents.length > 0 ? { deathEvents: deathFxEvents } : {}),
        // Le « -N » mana flotte au moment de la mort (Sacrifice démoniaque).
        ...(manaReductionEvent ? { manaReductionEvent } : {}),
      });
      playSfxBatch(deathSfx);
    };

    const phaseSummons = () => {
      set({
        gameState: preDrawState,
        ...(staggeredTriggerEvents.length > 0 ? { damageEvents: staggeredTriggerEvents } : {}),
        ...(cycleEvent ? { cycleEternelEvent: cycleEvent } : {}),
        // FX: the new creatures mount in this same render — the Canvas layer
        // resolves each one's position from the DOM and bursts a portal there.
        ...(newCreatureIds.size > 0 ? { summonEvents: Array.from(newCreatureIds) } : {}),
      });
      playSfxBatch(summonSfx);
    };

    const phaseDiscard = () => {
      // Surface the forced-discard popup just before the draw phase so the
      // player sees what was discarded by Combustion (or future similar
      // effects) before the new cards arrive.
      if (discardFromHandEvent) set({ discardFromHandEvent });
    };

    const phaseCostDiscard = () => {
      // Cost discards reuse the same popup as effect discards but fire at
      // the very start, before the spell overlay, so the discarded card
      // reads as a prerequisite of the cast (which it is, in the engine).
      if (costDiscardEvent) set({ discardFromHandEvent: costDiscardEvent });
    };

    const phaseDraws = () => {
      set({ gameState: newState });
      playSfxBatch(drawSfx);
    };

    const phaseFinalize = () => {
      // Landing state when we skipped summons+draws.
      set({
        gameState: preDrawState,
        ...(staggeredTriggerEvents.length > 0 ? { damageEvents: staggeredTriggerEvents } : {}),
        ...(cycleEvent ? { cycleEternelEvent: cycleEvent } : {}),
      });
    };

    const phaseUnlock = () => {
      set({ isAnimating: false });
      // Draine la file des actions reçues pendant l'animation. Chaque dispatch
      // peut emprunter le « slow path » (qui repasse isAnimating à true et
      // re-drainera via SON propre phaseUnlock — on s'arrête alors ici) ou le
      // « fast path » (commit synchrone sans animation : isAnimating reste
      // false). Avant, on ne dépilait qu'UNE action puis on faisait return ;
      // si c'était une action rapide, la suite de la file restait bloquée
      // jusqu'à la prochaine action animée — et comme lastSeqRef a déjà avancé
      // côté page à la mise en file, ces actions n'étaient jamais re-récupérées
      // par le gap-recovery → désync permanente. On boucle donc tant que la
      // file n'est pas vide et qu'aucune animation n'a redémarré.
      while (get().pendingIncomingActions.length > 0 && !get().isAnimating) {
        const [next, ...rest] = get().pendingIncomingActions;
        set({ pendingIncomingActions: rest });
        get().dispatchAction(next);
      }
      // Une action a relancé une animation : son phaseUnlock poursuivra le drain.
      if (get().isAnimating) return;
      // Plus d'action en file : si la dernière action a créé un déclencheur
      // interactif en attente pour le joueur local, on entre le mode de ciblage.
      set(pendingTriggerOverlay(get().gameState, get().localPlayerId));
    };

    // --- Schedule the sequence ---
    let cursor = 0;
    // Wave 1 (on-attack power) — plays BEFORE the attack lunge/combat: the
    // power's damage popups, then its deaths, so the player sees the power
    // resolve fully before combat.
    if (onAttackWave) {
      phasePowerImpacts(); // t=0
      cursor += IMPACT_MS;
      if (powerHasDeaths) {
        setTimeout(phasePowerDeaths, cursor);
        cursor += DEATH_MS;
      }
    }
    // Phase 0 (Cost discard) — runs before the overlay so the discarded
    // card reads as a paid prerequisite, not a consequence of the spell.
    if (costDiscardEvent) {
      if (cursor === 0) phaseCostDiscard();
      else setTimeout(phaseCostDiscard, cursor);
      cursor += COST_DISCARD_MS;
    }
    // Phase A (Overlay) — fires at t=cursor (0 if no power wave / cost discard).
    if (cursor === 0) phaseOverlay();
    else setTimeout(phaseOverlay, cursor);
    if (hasOverlay) cursor += OVERLAY_PRE_IMPACT_MS;
    else if (isAttack) cursor += ATTACK_LUNGE_PRE_IMPACT_MS;
    else if (powerArrowEvent) cursor += POWER_ARROW_PRE_IMPACT_MS;

    // Recast spell overlays must appear BEFORE phaseImpacts so each
    // recasted spell is shown casting *before* its (already-applied)
    // damage paints. Without this re-order, recast HP changes landed at
    // OVERLAY_PRE_IMPACT_MS while the recast spell visuals only played
    // out at the tail of the sequence — visually disconnected.
    if (recastSpells.length > 0) {
      for (let i = 0; i < recastSpells.length; i++) {
        const recast = recastSpells[i];
        setTimeout(() => set({ spellCastEvent: recast }), cursor);
        cursor += RECAST_GAP_MS;
      }
    }

    // Phase B (Impacts) — always run if there's anything beyond the overlay.
    setTimeout(phaseImpacts, cursor);
    cursor += IMPACT_MS + FUREUR_PHASE_EXTRA_MS + SEQ_PHASE_EXTRA_MS;

    if (hasDeaths) {
      setTimeout(phaseDeaths, cursor);
      cursor += DEATH_MS;
    }

    if (hasSummons) {
      setTimeout(phaseSummons, cursor);
      cursor += SUMMON_MS;
    } else if (!hasDraws) {
      // No summons and no draws — commit the pre-draw state (= final state)
      // so faction pool and buff deltas land.
      setTimeout(phaseFinalize, cursor);
      cursor += 50;
    } else {
      // Draws but no summons: still need to land on preDrawState first so the
      // draw phase has a correct pre-state.
      setTimeout(phaseFinalize, cursor);
      cursor += 50;
    }

    if (discardFromHandEvent) {
      setTimeout(phaseDiscard, cursor);
      cursor += DISCARD_MS;
    }

    if (hasDraws) {
      setTimeout(phaseDraws, cursor);
      cursor += DRAW_MS;
    }

    setTimeout(phaseUnlock, cursor);

    return action;
  },

  playCardDirect: (instanceId, boardPosition) => {
    const { gameState } = get();
    if (!gameState) return null;
    if (!canPlayCard(gameState, instanceId)) return null;

    const player = gameState.players[gameState.currentPlayerIndex];
    const card = player.hand.find(c => c.instanceId === instanceId);
    // Alternative-cost gating: if the card requires discards or sacrifices,
    // open the cost-payment flow first. Targeting (creature/graveyard/etc.)
    // resumes after confirmCostPayment.
    if (card) {
      const discardNeeded = getDiscardCost(card.card);
      const sacrificeNeeded = getSacrificeCost(card.card);
      if (discardNeeded > 0 || sacrificeNeeded > 0) {
        set({
          targetingMode: "cost_payment",
          pendingCostCard: { instanceId, discardNeeded, sacrificeNeeded, boardPosition: boardPosition ?? null },
          selectedDiscardIds: [],
          selectedSacrificeIds: [],
          selectedCardInstanceId: instanceId,
        });
        return null;
      }
    }
    if (card && creatureNeedsTarget(card.card)) {
      const targets = getCreatureTargets(gameState, card.card);
      if (targets.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: targets,
          targetingMode: "creature",
          pendingBoardPosition: boardPosition ?? null,
        });
        return null;
      }
    }

    if (card && creatureNeedsGraveyardTarget(card.card)) {
      const gravTargets = getGraveyardTargets(gameState, card.card);
      if (gravTargets.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: gravTargets,
          targetingMode: "graveyard",
          pendingBoardPosition: boardPosition ?? null,
        });
        return null;
      }
    }

    if (card && creatureNeedsDivination(card.card)) {
      const deckCards = player.deck.slice(0, Math.min(3, player.deck.length));
      if (deckCards.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "divination",
          divinationCards: deckCards,
          pendingBoardPosition: boardPosition ?? null,
        });
        return null;
      }
    }

    if (card && creatureNeedsTraqueDuDestin(card.card)) {
      const x = getTraqueDuDestinX(card.card);
      const deckCards = player.deck.slice(0, Math.min(x, player.deck.length));
      if (deckCards.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "divination",
          divinationCards: deckCards,
          pendingBoardPosition: boardPosition ?? null,
        });
        return null;
      }
    }

    if (card && creatureNeedsSelection(card.card)) {
      const selXVals = parseXValuesFromEffectText(card.card.effect_text);
      const x = selXVals["selection"] ?? 0;
      const choices = getSelectionCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: boardPosition ?? null,
        });
        return null;
      }
    }

    if (card && creatureNeedsRenfortRoyal(card.card)) {
      const xVals = parseXValuesFromEffectText(card.card.effect_text);
      const x = xVals["renfort_royal"] ?? 0;
      const choices = getRenfortRoyalCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: boardPosition ?? null,
        });
        return null;
      }
    }

    if (card && creatureNeedsMagicalSelection(card.card)) {
      const xVals = parseXValuesFromEffectText(card.card.effect_text);
      const x = xVals["selection_magique"] ?? 0;
      const choices = getMagicalSelectionCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: boardPosition ?? null,
        });
        return null;
      }
    }

    return get().dispatchAction({
      type: "play_card",
      cardInstanceId: instanceId,
      boardPosition,
    });
  },

  selectCardInHand: (instanceId) => {
    const { gameState } = get();
    if (!gameState) return null;

    const player = gameState.players[gameState.currentPlayerIndex];
    const card = player.hand.find((c) => c.instanceId === instanceId);
    if (!card) return null;

    if (!canPlayCard(gameState, instanceId)) return null;

    // Alternative-cost gating — see playCardDirect for the same pattern.
    {
      const discardNeeded = getDiscardCost(card.card);
      const sacrificeNeeded = getSacrificeCost(card.card);
      if (discardNeeded > 0 || sacrificeNeeded > 0) {
        set({
          targetingMode: "cost_payment",
          pendingCostCard: { instanceId, discardNeeded, sacrificeNeeded, boardPosition: null },
          selectedDiscardIds: [],
          selectedSacrificeIds: [],
          selectedCardInstanceId: instanceId,
        });
        return null;
      }
    }

    // Check if creature needs a target
    if (card.card.card_type === "creature" && creatureNeedsTarget(card.card)) {
      const targets = getCreatureTargets(gameState, card.card);
      if (targets.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: targets,
          targetingMode: "creature",
          pendingBoardPosition: null,
        });
        return null;
      }
    }

    // Check if creature needs graveyard target
    if (card.card.card_type === "creature" && creatureNeedsGraveyardTarget(card.card)) {
      const gravTargets = getGraveyardTargets(gameState, card.card);
      if (gravTargets.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: gravTargets,
          targetingMode: "graveyard",
          pendingBoardPosition: null,
        });
        return null;
      }
    }

    // Check if creature needs divination
    if (card.card.card_type === "creature" && creatureNeedsDivination(card.card)) {
      const deckCards = player.deck.slice(0, Math.min(3, player.deck.length));
      if (deckCards.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "divination",
          divinationCards: deckCards,
          pendingBoardPosition: null,
        });
        return null;
      }
    }

    // Check if creature needs Traque du destin pick (reuses the divination
    // picker UI; the engine branches on the keyword).
    if (card.card.card_type === "creature" && creatureNeedsTraqueDuDestin(card.card)) {
      const x = getTraqueDuDestinX(card.card);
      const deckCards = player.deck.slice(0, Math.min(x, player.deck.length));
      if (deckCards.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "divination",
          divinationCards: deckCards,
          pendingBoardPosition: null,
        });
        return null;
      }
    }

    // Check if creature needs selection
    if (card.card.card_type === "creature" && creatureNeedsSelection(card.card)) {
      const selXVals = parseXValuesFromEffectText(card.card.effect_text);
      const x = selXVals["selection"] ?? 0;
      const choices = getSelectionCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: null,
        });
        return null;
      }
    }

    // Check if creature needs renfort_royal
    if (card.card.card_type === "creature" && creatureNeedsRenfortRoyal(card.card)) {
      const xVals = parseXValuesFromEffectText(card.card.effect_text);
      const x = xVals["renfort_royal"] ?? 0;
      const choices = getRenfortRoyalCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: null,
        });
        return null;
      }
    }

    // Check if creature needs selection_magique
    if (card.card.card_type === "creature" && creatureNeedsMagicalSelection(card.card)) {
      const xVals = parseXValuesFromEffectText(card.card.effect_text);
      const x = xVals["selection_magique"] ?? 0;
      const choices = getMagicalSelectionCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: null,
        });
        return null;
      }
    }

    // Check if spell needs a target (new multi-target system) — runs BEFORE
    // the selection-style pickers below so that on a spell carrying both a
    // needs-target keyword (e.g. Renforcement) and a card picker (e.g.
    // Sélection magique), the target is collected first. The picker is
    // then opened from selectTarget once all targets are in, carrying the
    // collected targetMap into the final dispatch.
    if (card.card.card_type === "spell" && needsTarget(card.card)) {
      const slots = getSpellTargetSlots(card.card);
      const selectableSlots = slots.filter(s =>
        s.type === "any" || s.type === "any_creature"
        || s.type === "friendly_creature" || s.type === "enemy_creature"
        || s.type === "friendly_graveyard" || s.type === "friendly_graveyard_to_board"
      );

      if (selectableSlots.length === 0) {
        // No player selection needed — play directly
        return get().dispatchAction({ type: "play_card", cardInstanceId: instanceId });
      }

      const firstSlot = selectableSlots[0];

      // Graveyard-targeting spell keywords
      if (firstSlot.type === "friendly_graveyard" || firstSlot.type === "friendly_graveyard_to_board") {
        const kwIndex = parseInt(firstSlot.slot.replace("kw_", ""));
        const gravTargets = getSpellGraveyardTargets(gameState, card.card, kwIndex);
        if (gravTargets.length > 0) {
          set({
            selectedCardInstanceId: instanceId,
            selectedAttackerInstanceId: null,
            validTargets: gravTargets,
            targetingMode: "graveyard",
            spellTargetSlots: selectableSlots,
            currentTargetSlotIndex: 0,
            collectedTargetMap: {},
          });
          return null;
        }
        // No valid graveyard targets — play without effect
        return get().dispatchAction({ type: "play_card", cardInstanceId: instanceId });
      }

      const targets = getSpellTargets(gameState, card.card, firstSlot.type);

      if (selectableSlots.length === 1) {
        // Single target — simple flow
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: targets,
          targetingMode: "spell",
          spellTargetSlots: selectableSlots,
          currentTargetSlotIndex: 0,
          collectedTargetMap: {},
        });
        return null;
      }

      // Multi-target — sequential selection
      set({
        selectedCardInstanceId: instanceId,
        selectedAttackerInstanceId: null,
        validTargets: targets,
        targetingMode: "spell_multi",
        spellTargetSlots: selectableSlots,
        currentTargetSlotIndex: 0,
        collectedTargetMap: {},
      });
      return null;
    }

    // Selection-style pickers — only reachable when the spell has no
    // needs-target keyword (the block above returned null in that case).
    // Spells with BOTH a needs-target keyword AND a picker route here via
    // selectTarget once targeting is done, carrying the collected map.

    if (card.card.card_type === "spell" && card.card.spell_keywords?.some(kw => kw.id === "selection")) {
      const selKw = card.card.spell_keywords!.find(kw => kw.id === "selection")!;
      const x = selKw.amount ?? 0;
      const choices = getSelectionCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: null,
        });
        return null;
      }
    }

    if (card.card.card_type === "spell" && card.card.spell_keywords?.some(kw => kw.id === "selection_magique")) {
      const smKw = card.card.spell_keywords!.find(kw => kw.id === "selection_magique")!;
      const x = smKw.amount ?? 0;
      const choices = getMagicalSelectionCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: null,
        });
        return null;
      }
    }

    if (card.card.card_type === "spell" && card.card.spell_keywords?.some(kw => kw.id === "renfort_royal")) {
      const rrKw = card.card.spell_keywords!.find(kw => kw.id === "renfort_royal")!;
      const x = rrKw.amount ?? 0;
      const choices = getRenfortRoyalCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: null,
        });
        return null;
      }
    }

    // Play immediately (no targeting needed)
    return get().dispatchAction({
      type: "play_card",
      cardInstanceId: instanceId,
    });
  },

  selectAttacker: (instanceId) => {
    const { gameState } = get();
    if (!gameState) return;

    if (!canAttack(gameState, instanceId)) return;

    const targets = getValidTargets(gameState, instanceId);
    set({
      selectedAttackerInstanceId: instanceId,
      selectedCardInstanceId: null,
      validTargets: targets,
      targetingMode: "attack",
    });
  },

  selectTarget: (targetId) => {
    const {
      targetingMode,
      selectedAttackerInstanceId,
      selectedCardInstanceId,
    } = get();

    if (targetingMode === "attack" && selectedAttackerInstanceId) {
      // Defender chosen. If the attacker carries an "à l'attaque" composed
      // power with player-chosen targets, collect those next (carried in the
      // same attack action) before dispatching. Otherwise dispatch now.
      const gs = get().gameState;
      const attacker = gs?.players[gs.currentPlayerIndex].board.find(c => c.instanceId === selectedAttackerInstanceId);
      const powerChoice = attacker ? getOnAttackComposedChoice(attacker.card) : null;
      if (gs && attacker && powerChoice) {
        set({
          pendingAttackDefenderId: targetId,
          targetingMode: "attack_power",
          attackPowerCollected: [],
          validTargets: getOnAttackTargets(gs, attacker.card),
        });
        return null;
      }
      return get().dispatchAction({
        type: "attack",
        attackerInstanceId: selectedAttackerInstanceId,
        targetInstanceId: targetId,
      });
    } else if (targetingMode === "attack_power" && selectedAttackerInstanceId) {
      // Collecting the on-attack power's target(s). When complete, dispatch the
      // attack carrying both the defender and the power's targetMap.
      const { pendingAttackDefenderId, gameState: gs } = get();
      const attacker = gs?.players[gs.currentPlayerIndex].board.find(c => c.instanceId === selectedAttackerInstanceId);
      const powerChoice = attacker ? getOnAttackComposedChoice(attacker.card) : null;
      if (!gs || !attacker || !powerChoice || pendingAttackDefenderId == null) {
        set({ targetingMode: "none", validTargets: [], pendingAttackDefenderId: null, attackPowerCollected: [] });
        return null;
      }
      const collected = [...get().attackPowerCollected, targetId];
      if (collected.length < powerChoice.count) {
        set({
          attackPowerCollected: collected,
          validTargets: get().validTargets.filter(t => t !== targetId),
        });
        return null; // continue collecting
      }
      const targetMap: Record<string, string> = {};
      collected.forEach((id, i) => { targetMap[`${powerChoice.uid}#${i}`] = id; });
      set({ pendingAttackDefenderId: null, attackPowerCollected: [] });
      return get().dispatchAction({
        type: "attack",
        attackerInstanceId: selectedAttackerInstanceId,
        targetInstanceId: pendingAttackDefenderId,
        targetMap,
      });
    } else if (targetingMode === "spell" && selectedCardInstanceId) {
      const { spellTargetSlots, currentTargetSlotIndex, collectedTargetMap, gameState: gs } = get();
      // Use the CURRENT slot (not always the first) and carry forward targets
      // already collected for earlier slots. A multi-target spell whose last
      // slot resolves in "spell" mode (e.g. Rappel des Tempêtes : Exhumation
      // kw_0 puis Remontée kw_1) otherwise lost its kw_0 graveyard target and
      // mis-keyed the final one onto kw_0 — silently dropping the resurrection.
      const currentSlot = spellTargetSlots[currentTargetSlotIndex] ?? spellTargetSlots[0];
      const slot = currentSlot?.slot ?? "target_0";
      const collectedMap = { ...collectedTargetMap, [slot]: targetId };
      // Chain into a selection-style picker if the spell carries one (e.g.
      // Souffle des Origines: Renforcement targets first, then the
      // Sélection magique picker, with the kw_0 target carried forward).
      if (gs && openSelectionPickerIfNeeded(gs, selectedCardInstanceId, collectedMap)) {
        return null;
      }
      return get().dispatchAction({
        type: "play_card",
        cardInstanceId: selectedCardInstanceId,
        targetMap: collectedMap,
      });
    } else if (targetingMode === "spell_multi" && selectedCardInstanceId) {
      const { spellTargetSlots, currentTargetSlotIndex, collectedTargetMap, gameState: gs } = get();
      const currentSlot = spellTargetSlots[currentTargetSlotIndex];
      const newMap = { ...collectedTargetMap, [currentSlot.slot]: targetId };
      const nextIndex = currentTargetSlotIndex + 1;

      if (nextIndex >= spellTargetSlots.length) {
        if (gs && openSelectionPickerIfNeeded(gs, selectedCardInstanceId, newMap)) {
          return null;
        }
        return get().dispatchAction({
          type: "play_card",
          cardInstanceId: selectedCardInstanceId,
          targetMap: newMap,
        });
      } else {
        const nextSlot = spellTargetSlots[nextIndex];
        const card = gs?.players[gs.currentPlayerIndex].hand.find(c => c.instanceId === selectedCardInstanceId);
        // If the next slot targets a graveyard, switch to graveyard mode
        // so the UI surfaces the cimetière picker instead of board targets.
        if (nextSlot.type === "friendly_graveyard" || nextSlot.type === "friendly_graveyard_to_board") {
          const kwIndex = parseInt(nextSlot.slot.replace("kw_", ""));
          const nextTargets = (card && gs) ? getSpellGraveyardTargets(gs, card.card, kwIndex) : [];
          set({
            validTargets: nextTargets,
            currentTargetSlotIndex: nextIndex,
            collectedTargetMap: newMap,
            targetingMode: "graveyard",
          });
          return null;
        }
        const nextTargets = card ? getSpellTargets(gs!, card.card, nextSlot.type) : [];
        set({
          validTargets: nextTargets,
          currentTargetSlotIndex: nextIndex,
          collectedTargetMap: newMap,
        });
        return null; // not dispatched yet, still collecting targets
      }
    } else if (targetingMode === "creature" && selectedCardInstanceId) {
      const { pendingBoardPosition, gameState: gs } = get();

      // Effet composé multi-cibles "au choix" : on collecte N cibles avant de jouer.
      if (gs) {
        const player0 = gs.players[gs.currentPlayerIndex];
        const cardInst0 = player0.hand.find(c => c.instanceId === selectedCardInstanceId);
        const choice = cardInst0 ? getCreatureComposedChoice(cardInst0.card) : null;
        if (choice && choice.count >= 2) {
          const collected = [...get().creatureComposedCollected, targetId];
          if (collected.length < choice.count) {
            set({
              creatureComposedCollected: collected,
              validTargets: get().validTargets.filter(t => t !== targetId),
            });
            return null; // on continue à collecter
          }
          const targetMap: Record<string, string> = {};
          collected.forEach((id, i) => { targetMap[`${choice.uid}#${i}`] = id; });
          set({ creatureComposedCollected: [] });
          return get().dispatchAction({
            type: "play_card",
            cardInstanceId: selectedCardInstanceId,
            targetMap,
            boardPosition: pendingBoardPosition ?? undefined,
          });
        }
      }

      if (gs) {
        const player = gs.players[gs.currentPlayerIndex];
        const cardInst = player.hand.find(c => c.instanceId === selectedCardInstanceId);
        if (cardInst && cardInst.card.keywords.includes("tactique" as import("@/lib/game/types").Keyword)) {
          const grantable = cardInst.card.keywords.filter(kw => kw !== "tactique");
          const x = Math.max(1, Math.floor(cardInst.card.mana_cost / 3));
          set({
            targetingMode: "tactique_keywords",
            pendingTargetInstanceId: targetId,
            tactiqueAvailableKeywords: grantable,
            tactiqueMaxSelections: Math.min(x, grantable.length),
            validTargets: [],
          });
          return null; // waiting for keyword selection
        }
      }

      // Chain into a creature-side selection picker if the same creature
      // also carries selection / selection_magique / renfort_royal.
      if (gs && openCreaturePickerIfNeeded(gs, selectedCardInstanceId, {
        targetInstanceId: targetId,
        boardPosition: pendingBoardPosition,
      })) {
        return null;
      }

      return get().dispatchAction({
        type: "play_card",
        cardInstanceId: selectedCardInstanceId,
        targetInstanceId: targetId,
        boardPosition: pendingBoardPosition ?? undefined,
      });
    } else if (targetingMode === "tactique_keywords" && selectedCardInstanceId) {
      const { pendingBoardPosition, pendingTargetInstanceId } = get();
      const keywords = JSON.parse(targetId) as import("@/lib/game/types").Keyword[];
      return get().dispatchAction({
        type: "play_card",
        cardInstanceId: selectedCardInstanceId,
        targetInstanceId: pendingTargetInstanceId ?? undefined,
        tactiqueKeywords: keywords,
        boardPosition: pendingBoardPosition ?? undefined,
      });
    } else if (targetingMode === "graveyard" && selectedCardInstanceId) {
      const { pendingBoardPosition, spellTargetSlots, currentTargetSlotIndex, collectedTargetMap, gameState: gs } = get();
      // Check if this is a spell graveyard targeting
      const cardInHand = gs?.players[gs.currentPlayerIndex].hand.find(c => c.instanceId === selectedCardInstanceId);
      if (cardInHand?.card.card_type === "spell" && spellTargetSlots.length > 0) {
        const currentSlot = spellTargetSlots[currentTargetSlotIndex] ?? spellTargetSlots[0];
        const slot = currentSlot.slot ?? "kw_0";
        const newMap = { ...collectedTargetMap, [slot]: targetId };
        const nextIndex = currentTargetSlotIndex + 1;

        // More target slots left? Transition to the next one (supports a
        // hypothetical spell combining e.g. exhumation + rappel, or
        // exhumation + impact). The next slot's type drives the mode.
        if (nextIndex < spellTargetSlots.length) {
          const nextSlot = spellTargetSlots[nextIndex];
          if (nextSlot.type === "friendly_graveyard" || nextSlot.type === "friendly_graveyard_to_board") {
            const kwIndex = parseInt(nextSlot.slot.replace("kw_", ""));
            const nextTargets = gs ? getSpellGraveyardTargets(gs, cardInHand.card, kwIndex) : [];
            set({
              validTargets: nextTargets,
              currentTargetSlotIndex: nextIndex,
              collectedTargetMap: newMap,
              // targetingMode stays "graveyard"
            });
          } else {
            const nextTargets = gs ? getSpellTargets(gs, cardInHand.card, nextSlot.type) : [];
            set({
              validTargets: nextTargets,
              currentTargetSlotIndex: nextIndex,
              collectedTargetMap: newMap,
              targetingMode: spellTargetSlots.length - nextIndex > 1 ? "spell_multi" : "spell",
            });
          }
          return null;
        }

        // All target slots done — chain into a selection-style picker if
        // the spell also carries one (e.g. Aya Marcay Quilla: Exhumation
        // graveyard target first, then the Sélection picker, with kw_0
        // carried forward).
        if (gs && openSelectionPickerIfNeeded(gs, selectedCardInstanceId, newMap)) {
          return null;
        }
        return get().dispatchAction({
          type: "play_card",
          cardInstanceId: selectedCardInstanceId,
          targetMap: newMap,
        });
      }
      // Creature graveyard targeting (existing behavior)
      // Chain into a creature-side selection picker if applicable.
      if (gs && openCreaturePickerIfNeeded(gs, selectedCardInstanceId, {
        graveyardTargetInstanceId: targetId,
        boardPosition: pendingBoardPosition,
      })) {
        return null;
      }
      return get().dispatchAction({
        type: "play_card",
        cardInstanceId: selectedCardInstanceId,
        graveyardTargetInstanceId: targetId,
        boardPosition: pendingBoardPosition ?? undefined,
      });
    } else if (targetingMode === "divination" && selectedCardInstanceId) {
      const { pendingBoardPosition, gameState: gs } = get();
      const choiceIndex = parseInt(targetId) || 0;
      // Chain into a creature-side selection picker if applicable.
      if (gs && openCreaturePickerIfNeeded(gs, selectedCardInstanceId, {
        divinationChoiceIndex: choiceIndex,
        boardPosition: pendingBoardPosition,
      })) {
        return null;
      }
      return get().dispatchAction({
        type: "play_card",
        cardInstanceId: selectedCardInstanceId,
        divinationChoiceIndex: choiceIndex,
        boardPosition: pendingBoardPosition ?? undefined,
      });
    } else if (targetingMode === "selection" && get().pendingTapSourceId !== null && get().pendingTapInstanceIdx !== null) {
      // Sélection déclenchée par un TAP : la carte choisie est ajoutée en main.
      const cardId = parseInt(targetId) || 0;
      return get().dispatchAction({
        type: "tap_activate",
        sourceInstanceId: get().pendingTapSourceId!,
        instanceIdx: get().pendingTapInstanceIdx!,
        selectionCardId: cardId,
      });
    } else if (targetingMode === "selection" && get().pendingTriggerId) {
      // Sélection en FIN DE TOUR (déclencheur interactif en attente).
      const cardId = parseInt(targetId) || 0;
      return get().dispatchAction({
        type: "resolve_pending_trigger",
        triggerId: get().pendingTriggerId!,
        selectionCardId: cardId,
      });
    } else if (targetingMode === "selection" && get().pendingHeroPowerSelection) {
      // Hero power picker — dispatch a hero_power action with the chosen
      // card id ; engine.ts mirrors it into targetMap for the selection /
      // renfort_royal / selection_magique resolver.
      const cardId = parseInt(targetId) || 0;
      return get().dispatchAction({
        type: "hero_power",
        selectionCardId: cardId,
      });
    } else if (targetingMode === "selection" && selectedCardInstanceId) {
      const { pendingBoardPosition, gameState: gs, collectedTargetMap, pendingCreatureChain } = get();
      const cardInHand = gs?.players[gs.currentPlayerIndex].hand.find(c => c.instanceId === selectedCardInstanceId);
      const cardId = parseInt(targetId) || 0;
      if (cardInHand?.card.card_type === "spell") {
        // Spell selection: pass card ID via targetMap. collectedTargetMap
        // carries any on-board targets gathered before this picker (e.g.
        // Renforcement → Sélection magique), so they reach the engine on
        // the same dispatch.
        return get().dispatchAction({
          type: "play_card",
          cardInstanceId: selectedCardInstanceId,
          targetMap: { ...collectedTargetMap, selection_0: String(cardId) },
        });
      }
      // Creature selection: merge in pendingCreatureChain (carries the
      // target / graveyard / divination choice from an earlier picker on
      // the same creature, e.g. mimique + selection).
      return get().dispatchAction({
        type: "play_card",
        cardInstanceId: selectedCardInstanceId,
        selectionCardId: cardId,
        boardPosition: pendingCreatureChain?.boardPosition ?? pendingBoardPosition ?? undefined,
        targetInstanceId: pendingCreatureChain?.targetInstanceId,
        graveyardTargetInstanceId: pendingCreatureChain?.graveyardTargetInstanceId,
        divinationChoiceIndex: pendingCreatureChain?.divinationChoiceIndex,
      });
    } else if (targetingMode === "hero_power") {
      // Pouvoir composé multi-cibles "au choix" : collecte N cibles puis dispatch
      // un targetMap par slot (même patron que l'effet composé de créature).
      const { pendingHeroPowerComposed } = get();
      if (pendingHeroPowerComposed) {
        const collected = [...get().creatureComposedCollected, targetId];
        if (collected.length < pendingHeroPowerComposed.count) {
          set({
            creatureComposedCollected: collected,
            validTargets: get().validTargets.filter(t => t !== targetId), // pas de double-pick
          });
          return null; // on continue à collecter
        }
        const targetMap: Record<string, string> = {};
        collected.forEach((id, i) => { targetMap[`${pendingHeroPowerComposed.uid}#${i}`] = id; });
        set({ creatureComposedCollected: [], pendingHeroPowerComposed: null });
        return get().dispatchAction({ type: "hero_power", targetMap });
      }
      return get().dispatchAction({
        type: "hero_power",
        targetInstanceId: targetId,
      });
    } else if (targetingMode === "tap") {
      const { pendingTapSourceId, pendingTapInstanceIdx, pendingTapComposedUid } = get();
      if (pendingTapSourceId === null) return null;
      if (pendingTapComposedUid) {
        return get().dispatchAction({
          type: "tap_activate",
          sourceInstanceId: pendingTapSourceId,
          instanceIdx: -1,
          composedUid: pendingTapComposedUid,
          targetInstanceId: targetId,
        });
      }
      if (pendingTapInstanceIdx === null) return null;
      return get().dispatchAction({
        type: "tap_activate",
        sourceInstanceId: pendingTapSourceId,
        instanceIdx: pendingTapInstanceIdx,
        targetInstanceId: targetId,
      });
    } else if (targetingMode === "pending_trigger") {
      const { pendingTriggerId } = get();
      if (!pendingTriggerId) return null;
      return get().dispatchAction({
        type: "resolve_pending_trigger",
        triggerId: pendingTriggerId,
        targetInstanceId: targetId,
      });
    }
    return null;
  },

  clearSelection: () => {
    // Un sélecteur « Sélection » (révélation de N cartes : pouvoir de héros,
    // sort, ou invocation de créature) est un choix OBLIGATOIRE une fois les
    // cartes révélées : on refuse d'annuler (clic fond / Échap / clic droit),
    // sinon le joueur « scoute » gratuitement puis relance pour de nouvelles
    // cartes. La confirmation passe par dispatchAction (pas clearSelection) et
    // reste donc possible. La Divination (mode dédié) garde son annulation.
    if (get().targetingMode === "selection") return;

    // Un déclencheur interactif en attente (Remontée mort/retour) est un choix
    // OBLIGATOIRE : on ne le laisse pas annuler (clic fond / clic droit) — on
    // ré-affiche le sélecteur.
    const overlay = pendingTriggerOverlay(get().gameState, get().localPlayerId);
    if (overlay.targetingMode === "pending_trigger") {
      set(overlay);
      return;
    }
    set({
      selectedCardInstanceId: null,
      selectedAttackerInstanceId: null,
      validTargets: [],
      targetingMode: "none",
      pendingBoardPosition: null,
      divinationCards: [],
      tactiqueAvailableKeywords: [],
      tactiqueMaxSelections: 0,
      pendingTargetInstanceId: null,
      pendingTapSourceId: null,
      pendingTapInstanceIdx: null,
      pendingTapComposedUid: null,
      spellTargetSlots: [],
      currentTargetSlotIndex: 0,
      collectedTargetMap: {},
      creatureComposedCollected: [],
      pendingHeroPowerComposed: null,
      pendingAttackDefenderId: null,
      attackPowerCollected: [],
      pendingCreatureChain: null,
      pendingCostCard: null,
      selectedDiscardIds: [],
      selectedSacrificeIds: [],
      pendingHeroPowerSelection: false,
    });
  },

  clearDamageEvents: () => {
    set({ damageEvents: [] });
  },

  clearSpellCastEvent: () => {
    set({ spellCastEvent: null });
  },

  clearPowerArrowEvent: () => {
    set({ powerArrowEvent: null });
  },

  clearFireBreathEvent: () => {
    set({ fireBreathEvent: null });
  },

  clearCycleEternelEvent: () => {
    set({ cycleEternelEvent: null });
  },

  clearTempeteEvent: () => {
    set({ tempeteEvent: null });
  },

  clearManaReductionEvent: () => {
    set({ manaReductionEvent: null });
  },

  clearDeathEvents: () => {
    set({ deathEvents: [] });
  },

  clearSummonEvents: () => {
    set({ summonEvents: [] });
  },

  clearHeroPowerCastEvent: () => {
    set({ heroPowerCastEvent: null });
  },

  clearGraveyardAffectEvent: () => {
    set({ graveyardAffectEvent: null });
  },

  clearDiscardFromHandEvent: () => {
    set({ discardFromHandEvent: null });
  },

  toggleDiscardSelection: (instanceId) => {
    const { pendingCostCard, selectedDiscardIds } = get();
    if (!pendingCostCard) return;
    if (instanceId === pendingCostCard.instanceId) return; // can't discard the card being played
    const idx = selectedDiscardIds.indexOf(instanceId);
    if (idx !== -1) {
      const next = [...selectedDiscardIds];
      next.splice(idx, 1);
      set({ selectedDiscardIds: next });
    } else if (selectedDiscardIds.length < pendingCostCard.discardNeeded) {
      set({ selectedDiscardIds: [...selectedDiscardIds, instanceId] });
    }
  },

  toggleSacrificeSelection: (instanceId) => {
    const { pendingCostCard, selectedSacrificeIds } = get();
    if (!pendingCostCard) return;
    const idx = selectedSacrificeIds.indexOf(instanceId);
    if (idx !== -1) {
      const next = [...selectedSacrificeIds];
      next.splice(idx, 1);
      set({ selectedSacrificeIds: next });
    } else if (selectedSacrificeIds.length < pendingCostCard.sacrificeNeeded) {
      set({ selectedSacrificeIds: [...selectedSacrificeIds, instanceId] });
    }
  },

  confirmCostPayment: () => {
    const { gameState, pendingCostCard, selectedDiscardIds, selectedSacrificeIds } = get();
    if (!gameState || !pendingCostCard) return null;
    if (selectedDiscardIds.length !== pendingCostCard.discardNeeded) return null;
    if (selectedSacrificeIds.length !== pendingCostCard.sacrificeNeeded) return null;

    const player = gameState.players[gameState.currentPlayerIndex];
    const card = player.hand.find(c => c.instanceId === pendingCostCard.instanceId);
    if (!card) {
      get().cancelCostPayment();
      return null;
    }
    const instanceId = pendingCostCard.instanceId;
    const boardPosition = pendingCostCard.boardPosition;

    // Exit cost_payment mode but KEEP the selected IDs — dispatchAction merges
    // them automatically into any subsequent play_card action.
    set({ targetingMode: "none", pendingCostCard: null });

    // Now route through the standard targeting checks (creature/graveyard/
    // divination/selection/spell), exactly like playCardDirect / selectCardInHand
    // do after their canPlayCard check. Mirroring keeps the flow consistent.

    if (creatureNeedsTarget(card.card)) {
      const targets = getCreatureTargets(gameState, card.card);
      if (targets.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: targets,
          targetingMode: "creature",
          pendingBoardPosition: boardPosition,
        });
        return null;
      }
    }
    if (creatureNeedsGraveyardTarget(card.card)) {
      const gravTargets = getGraveyardTargets(gameState, card.card);
      if (gravTargets.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: gravTargets,
          targetingMode: "graveyard",
          pendingBoardPosition: boardPosition,
        });
        return null;
      }
    }
    if (creatureNeedsDivination(card.card)) {
      const deckCards = player.deck.slice(0, Math.min(3, player.deck.length));
      if (deckCards.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "divination",
          divinationCards: deckCards,
          pendingBoardPosition: boardPosition,
        });
        return null;
      }
    }
    if (creatureNeedsTraqueDuDestin(card.card)) {
      const x = getTraqueDuDestinX(card.card);
      const deckCards = player.deck.slice(0, Math.min(x, player.deck.length));
      if (deckCards.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "divination",
          divinationCards: deckCards,
          pendingBoardPosition: boardPosition,
        });
        return null;
      }
    }
    if (creatureNeedsSelection(card.card)) {
      const selXVals = parseXValuesFromEffectText(card.card.effect_text);
      const x = selXVals["selection"] ?? 0;
      const choices = getSelectionCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: boardPosition,
        });
        return null;
      }
    }
    if (creatureNeedsRenfortRoyal(card.card)) {
      const xVals = parseXValuesFromEffectText(card.card.effect_text);
      const x = xVals["renfort_royal"] ?? 0;
      const choices = getRenfortRoyalCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: boardPosition,
        });
        return null;
      }
    }
    if (creatureNeedsMagicalSelection(card.card)) {
      const xVals = parseXValuesFromEffectText(card.card.effect_text);
      const x = xVals["selection_magique"] ?? 0;
      const choices = getMagicalSelectionCards(gameState, x, card.card);
      if (choices.length > 0) {
        set({
          selectedCardInstanceId: instanceId,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingBoardPosition: boardPosition,
        });
        return null;
      }
    }

    if (card.card.card_type === "spell" && needsTarget(card.card)) {
      const slots = getSpellTargetSlots(card.card);
      const selectableSlots = slots.filter(s =>
        s.type === "any" || s.type === "any_creature"
        || s.type === "friendly_creature" || s.type === "enemy_creature"
        || s.type === "friendly_graveyard" || s.type === "friendly_graveyard_to_board"
      );
      if (selectableSlots.length > 0) {
        const firstSlot = selectableSlots[0];
        if (firstSlot.type === "friendly_graveyard" || firstSlot.type === "friendly_graveyard_to_board") {
          const kwIndex = parseInt(firstSlot.slot.replace("kw_", ""));
          const gravTargets = getSpellGraveyardTargets(gameState, card.card, kwIndex);
          if (gravTargets.length > 0) {
            set({
              selectedCardInstanceId: instanceId,
              selectedAttackerInstanceId: null,
              validTargets: gravTargets,
              targetingMode: "graveyard",
              spellTargetSlots: selectableSlots,
              currentTargetSlotIndex: 0,
              collectedTargetMap: {},
            });
            return null;
          }
        } else {
          const targets = getSpellTargets(gameState, card.card, firstSlot.type);
          set({
            selectedCardInstanceId: instanceId,
            selectedAttackerInstanceId: null,
            validTargets: targets,
            targetingMode: selectableSlots.length === 1 ? "spell" : "spell_multi",
            spellTargetSlots: selectableSlots,
            currentTargetSlotIndex: 0,
            collectedTargetMap: {},
          });
          return null;
        }
      }
    }

    // No additional targeting needed — dispatch directly. dispatchAction
    // merges selectedDiscardIds/selectedSacrificeIds into the action.
    return get().dispatchAction({
      type: "play_card",
      cardInstanceId: instanceId,
      boardPosition: boardPosition ?? undefined,
    });
  },

  cancelCostPayment: () => {
    set({
      targetingMode: "none",
      pendingCostCard: null,
      selectedDiscardIds: [],
      selectedSacrificeIds: [],
      selectedCardInstanceId: null,
    });
  },

  activateHeroPower: () => {
    const { gameState } = get();
    if (!gameState) return null;
    // Un sélecteur de sélection déjà ouvert est un choix obligatoire : on ne
    // ré-active pas le pouvoir (anti-réentrance, ex. raccourci clavier) tant
    // que le joueur n'a pas choisi — sinon il régénère de nouvelles cartes.
    if (get().targetingMode === "selection") return null;
    if (!canUseHeroPower(gameState)) return null;

    const player = gameState.players[gameState.currentPlayerIndex];
    const heroDef = player.hero.heroDefinition;
    if (!heroDef) return null;

    // Hero powers using selection / renfort_royal / selection_magique need
    // a card-picker overlay before they can resolve — without it the engine
    // receives no chosen card and the keyword no-ops. We open the same
    // selection overlay used by spells/creatures and remember (via
    // pendingHeroPowerSelection) that the upcoming dispatch is a hero
    // power, not a play_card.
    const effect = heroDef.powerEffect;
    if (effect && effect.mode === "spell_trigger") {
      const x = effect.params?.amount ?? 0;
      // Pour Sélection / Sélection magique, l'alignement est dérivé de la
      // faction du héros (les heroes définitions portent un faction id).
      const heroSource = { faction: heroDef.faction ?? null };
      let choices: Card[] | null = null;
      if (effect.keywordId === "selection") {
        choices = getSelectionCards(gameState, x, heroSource);
      } else if (effect.keywordId === "renfort_royal") {
        choices = getRenfortRoyalCards(gameState, x, heroSource);
      } else if (effect.keywordId === "selection_magique") {
        choices = getMagicalSelectionCards(gameState, x, heroSource);
      }
      if (choices !== null) {
        if (choices.length === 0) return null; // no candidates → power fizzles
        set({
          selectedCardInstanceId: null,
          selectedAttackerInstanceId: null,
          validTargets: [],
          targetingMode: "selection",
          selectionCards: choices,
          pendingHeroPowerSelection: true,
        });
        return null;
      }
    }

    // Pouvoir composé : si des cibles doivent être choisies, on entre en mode
    // hero_power en mémorisant le slot (uid + nombre) pour collecter N cibles.
    // Sinon (self / hero-only / random / automatic / draw / mana / …) → direct.
    if (effect && effect.mode === "composed") {
      const choice = heroPowerComposedChoice(heroDef);
      if (!choice) {
        return get().dispatchAction({ type: "hero_power" });
      }
      set({
        selectedCardInstanceId: null,
        selectedAttackerInstanceId: null,
        validTargets: getHeroPowerTargets(gameState, heroDef),
        targetingMode: "hero_power",
        pendingHeroPowerComposed: { uid: choice.uid, count: choice.count },
        creatureComposedCollected: [],
      });
      return null;
    }

    if (heroPowerNeedsTarget(heroDef)) {
      const targets = getHeroPowerTargets(gameState, heroDef);
      set({
        selectedCardInstanceId: null,
        selectedAttackerInstanceId: null,
        validTargets: targets,
        targetingMode: "hero_power",
      });
      return null;
    } else {
      return get().dispatchAction({ type: "hero_power" });
    }
  },

  activateTap: (sourceInstanceId, instanceIdx) => {
    // Resolve a creature's tap-mode keyword instance. If the keyword
    // needs a target (e.g. Vampirisme → enemy creature), open the
    // targeting picker; otherwise dispatch immediately. The engine
    // re-checks eligibility (own turn, untapped, no summoning sickness,
    // keyword present in tap mode) so race conditions can't slip a bad
    // action through.
    const { gameState } = get();
    if (!gameState) return null;
    const player = gameState.players[gameState.currentPlayerIndex];
    const source = player.board.find(c => c.instanceId === sourceInstanceId);
    if (!source) return null;
    const instance = source.card.keyword_instances?.[instanceIdx];
    if (!instance || instance.mode !== "tap") return null;

    // Sélection / Sélection magique / Renfort Royal au tap : ouvre la modale
    // « 1 parmi 3 » (même flux qu'à l'invocation). Le choix est renvoyé via
    // selectTarget → tap_activate { selectionCardId }.
    if (instance.id === "selection" || instance.id === "selection_magique" || instance.id === "renfort_royal") {
      const x = instance.x ?? 0;
      const choices = instance.id === "selection_magique" ? getMagicalSelectionCards(gameState, x, source.card)
        : instance.id === "renfort_royal" ? getRenfortRoyalCards(gameState, x, source.card)
          : getSelectionCards(gameState, x, source.card);
      if (choices.length === 0) {
        // Aucune carte éligible → on engage quand même la créature (fizzle).
        return get().dispatchAction({ type: "tap_activate", sourceInstanceId, instanceIdx });
      }
      set({
        selectedCardInstanceId: null,
        selectedAttackerInstanceId: null,
        validTargets: [],
        targetingMode: "selection",
        selectionCards: choices,
        pendingTapSourceId: sourceInstanceId,
        pendingTapInstanceIdx: instanceIdx,
        pendingHeroPowerSelection: false,
        pendingTriggerId: null,
      });
      return null;
    }

    const targets = getTapActivateTargets(gameState, instance.id, sourceInstanceId);
    if (targets && targets.length > 0) {
      set({
        selectedCardInstanceId: null,
        selectedAttackerInstanceId: null,
        validTargets: targets,
        targetingMode: "tap",
        pendingTapSourceId: sourceInstanceId,
        pendingTapInstanceIdx: instanceIdx,
      });
      return null;
    }

    return get().dispatchAction({
      type: "tap_activate",
      sourceInstanceId,
      instanceIdx,
    });
  },

  activateTapComposed: (sourceInstanceId, capUid) => {
    // Active un effet composé on_activation. Si la cible est "au choix" (1 unité
    // plateau), ouvre le sélecteur ; sinon dispatch immédiat (hasard/toutes/héros).
    const { gameState } = get();
    if (!gameState) return null;
    const player = gameState.players[gameState.currentPlayerIndex];
    const source = player.board.find(c => c.instanceId === sourceInstanceId);
    if (!source) return null;
    const targets = getComposedTapTargets(gameState, source.card, capUid);
    if (targets && targets.length > 0) {
      set({
        selectedCardInstanceId: null,
        selectedAttackerInstanceId: null,
        validTargets: targets,
        targetingMode: "tap",
        pendingTapSourceId: sourceInstanceId,
        pendingTapInstanceIdx: null,
        pendingTapComposedUid: capUid,
      });
      return null;
    }
    return get().dispatchAction({
      type: "tap_activate",
      sourceInstanceId,
      instanceIdx: -1,
      composedUid: capUid,
    });
  },

  confirmMulligan: (selectedInstanceIds) => {
    const { gameState, localPlayerId } = get();
    if (!gameState || !localPlayerId || gameState.phase !== "mulligan") return null;

    const playerIndex = gameState.players.findIndex((p) => p.id === localPlayerId);
    if (playerIndex === -1) return null;

    // Dispatch the mulligan action with replaced card IDs
    // The engine handles the swap deterministically so both clients stay in sync
    return get().dispatchAction({
      type: "mulligan",
      playerId: localPlayerId,
      replacedInstanceIds: selectedInstanceIds,
    });
  },

  isMyTurn: () => {
    const { gameState, localPlayerId } = get();
    if (!gameState || !localPlayerId) return false;
    return gameState.players[gameState.currentPlayerIndex].id === localPlayerId;
  },

  getMyPlayerState: () => {
    const { gameState, localPlayerId } = get();
    if (!gameState || !localPlayerId) return null;
    return getPlayerState(gameState, localPlayerId);
  },

  getOpponentPlayerState: () => {
    const { gameState, localPlayerId } = get();
    if (!gameState || !localPlayerId) return null;
    const opponentId = gameState.players.find(
      (p) => p.id !== localPlayerId
    )?.id;
    if (!opponentId) return null;
    return getPlayerState(gameState, opponentId);
  },
  });
});
