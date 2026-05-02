import { create } from "zustand";
import type { GameState, GameAction, Card, CardInstance, DamageEvent, HeroDefinition, PlayerState, SpellTargetSlot, SpellTargetType, TokenTemplate } from "@/lib/game/types";
import { useAudioStore } from "./audioStore";
import SfxEngine from "@/lib/audio/SfxEngine";
import { playAttackLunge } from "@/lib/game/animations";
import { parseXValuesFromEffectText } from "@/lib/game/keyword-labels";
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
  creatureNeedsTarget,
  getCreatureTargets,
  creatureNeedsGraveyardTarget,
  getGraveyardTargets,
  creatureNeedsDivination,
  creatureNeedsSelection,
  getSelectionCards,
  creatureNeedsRenfortRoyal,
  getRenfortRoyalCards,
  getSpellGraveyardTargets,
} from "@/lib/game/engine";

export interface SpellCastEvent {
  spellName: string;
  effectText: string;
  timestamp: number;
  countered?: boolean;
  card?: Card | null;
  targetIds?: string[];
}

export interface FireBreathEvent {
  attackerInstanceId: string;
  timestamp: number;
}

// Tempête X — lightning rain animation. Driven by the per-target damage
// events the engine emits during the resolved action; we collect those
// here so the overlay can stagger one bolt per drop.
export interface TempeteEvent {
  targetIds: string[];
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
  targetingMode: "none" | "attack" | "spell" | "spell_multi" | "creature" | "graveyard" | "divination" | "selection" | "tactique_keywords" | "hero_power";
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
  tokenTemplates: TokenTemplate[];
  effectLog: { id: string; text: string; timestamp: number }[];
  damageEvents: DamageEvent[];
  spellCastEvent: SpellCastEvent | null;
  fireBreathEvent: FireBreathEvent | null;
  tempeteEvent: TempeteEvent | null;
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
  clearSpellCastEvent: () => void;
  clearFireBreathEvent: () => void;
  clearTempeteEvent: () => void;
  clearHeroPowerCastEvent: () => void;
  clearGraveyardAffectEvent: () => void;
  clearDiscardFromHandEvent: () => void;
  activateHeroPower: () => GameAction | null;
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
    el = document.querySelector(`[data-instance-id="${targetId}"]`);
  }
  if (el) {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  return { x: -9999, y: -9999 };
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

    // Hero damage
    if (newPlayer.hero.hp < oldPlayer.hero.hp) {
      const pos = getElementCenter(heroId);
      events.push({
        targetId: heroId,
        amount: oldPlayer.hero.hp - newPlayer.hero.hp,
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

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  localPlayerId: null,
  selectedCardInstanceId: null,
  selectedAttackerInstanceId: null,
  validTargets: [],
  targetingMode: "none",
  pendingBoardPosition: null,
  divinationCards: [],
  selectionCards: [],
  tactiqueAvailableKeywords: [],
  tactiqueMaxSelections: 0,
  pendingTargetInstanceId: null,
  spellTargetSlots: [],
  currentTargetSlotIndex: 0,
  collectedTargetMap: {},
  tokenTemplates: [],
  effectLog: [],
  damageEvents: [],
  spellCastEvent: null,
  fireBreathEvent: null,
  tempeteEvent: null,
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

  initGame: (player1Id, player2Id, player1Cards, player2Cards, firstPlayerIndex, seed, player1Hero, player2Hero, factionCardPool) => {
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
    );
    // Inject token templates into GameState for engine access
    state.tokenTemplates = get().tokenTemplates;
    set({ gameState: state });
  },

  setGameState: (state) => set({ gameState: state }),
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

    // If the animation pipeline is still playing a previous action, drop this
    // one silently — the UI lock (myTurn && !isAnimating) normally prevents
    // local clicks from getting here, and the page.tsx broadcast handler
    // enqueues remote actions via pendingIncomingActions directly.
    if (isAnimating) {
      return null;
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

    // Capture spell history length before action to detect recasts
    const playerIdx = gameState.currentPlayerIndex;
    const oldHistoryLen = gameState.players[playerIdx].spellHistory?.length ?? 0;

    // Detect if this card has "relancer" (spell keyword or creature keyword)
    let isRelancerCard = false;
    if (action.type === "play_card") {
      const player = gameState.players[playerIdx];
      const cardInst = player.hand.find((c) => c.instanceId === action.cardInstanceId);
      if (cardInst) {
        isRelancerCard = !!(
          cardInst.card.spell_keywords?.some(kw => kw.id === "relancer") ||
          cardInst.card.keywords.includes("relancer" as import("@/lib/game/types").Keyword)
        );
      }
    }

    const newState = applyAction(gameState, action);
    const dmgEvents = detectDamageEvents(gameState, newState, localPlayerId);
    const logEntries = generateEffectLog(gameState, newState, action);

    // Detect recast spells by comparing spell history
    const newHistoryLen = newState.players[playerIdx].spellHistory?.length ?? 0;
    const recastSpells: SpellCastEvent[] = [];
    if (isRelancerCard && newHistoryLen > oldHistoryLen) {
      // New spells were added to history during recast — but actually recasts don't add to history
      // Instead, use the old history to find which spells were replayed
    }
    // For recast: the spells replayed are the last X from the OLD history
    if (isRelancerCard) {
      const oldHistory = gameState.players[playerIdx].spellHistory ?? [];
      if (action.type === "play_card") {
        const player = gameState.players[playerIdx];
        const cardInst = player.hand.find((c) => c.instanceId === action.cardInstanceId);
        if (cardInst) {
          // Get X value
          const spellKw = cardInst.card.spell_keywords?.find(kw => kw.id === "relancer");
          let x = spellKw?.amount ?? 1;
          if (!spellKw && cardInst.card.keywords.includes("relancer" as import("@/lib/game/types").Keyword)) {
            // Creature keyword — extract X from effect text
            const match = cardInst.card.effect_text.match(/Relancer\s+(\d+)/i);
            x = match ? parseInt(match[1]) : 1;
          }
          const replayed = oldHistory.slice(-x).reverse();
          for (const entry of replayed) {
            recastSpells.push({
              spellName: `♻️ ${entry.card.name}`,
              effectText: entry.card.effect_text,
              timestamp: Date.now(),
              card: entry.card,
            });
          }
        }
      }
    }

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

    // Find creatures that died (were on old board but not on new board)
    const deadCreatures: CardInstance[] = [];
    for (let i = 0; i < 2; i++) {
      const oldBoard = gameState.players[i].board;
      const newBoard = newState.players[i].board;
      for (const oldC of oldBoard) {
        if (!newBoard.find((c) => c.instanceId === oldC.instanceId)) {
          deadCreatures.push(oldC);
        }
      }
    }

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
    if (action.type === "play_card") {
      const player = gameState.players[gameState.currentPlayerIndex];
      const playedCard = player.hand.find((c) => c.instanceId === action.cardInstanceId);
      const carriesTempete = playedCard
        ? playedCard.card.keywords.includes("tempete" as import("@/lib/game/types").Keyword) ||
          (playedCard.card.spell_keywords ?? []).some((k) => k.id === "tempete")
        : false;
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
    // this action — Combustion ("défaussez une carte de votre main"), and
    // any future "forced discard" effect. We exclude the card the player
    // just played (spells move the same way but should not trigger this
    // popup). This drives the DiscardFromHand overlay so the discarded
    // card is visible BEFORE the new draws fill the hand.
    const playedActionInstanceId = action.type === "play_card" ? action.cardInstanceId : null;
    const discardedFromHand: { card: Card; ownerPlayerId: string }[] = [];
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
          discardedFromHand.push({
            card: oldCardInstance.card,
            ownerPlayerId: gameState.players[i].id,
          });
        }
      }
    }
    const discardFromHandEvent: DiscardFromHandEvent | null =
      discardedFromHand.length > 0
        ? {
            cards: discardedFromHand.map((d) => d.card),
            ownerPlayerId: discardedFromHand[0].ownerPlayerId,
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

    // How many cards each player drew this action — we hold them out of the
    // hand until the final "draw" phase so the animation is clearly separated.
    const drawnCounts: [number, number] = [
      Math.max(0, newState.players[0].hand.length - gameState.players[0].hand.length),
      Math.max(0, newState.players[1].hand.length - gameState.players[1].hand.length),
    ];
    const hasDraws = drawnCounts[0] + drawnCounts[1] > 0;

    const hasAnything = hasOverlay || hasImpacts || hasDeaths || hasSummons || hasDraws || isAttack || !!graveyardAffectEvent || !!discardFromHandEvent || !!tempeteEvent;

    // Deep clone helper — factionCardPool carries non-serialisable refs, keep it aside.
    const cloneState = (state: GameState): GameState => {
      const { factionCardPool, ...rest } = state;
      const cloned = JSON.parse(JSON.stringify(rest)) as GameState;
      cloned.factionCardPool = factionCardPool;
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
      const oldBoard = gameState.players[i].board;
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
      set({
        gameState: newState,
        selectedCardInstanceId: null,
        selectedAttackerInstanceId: null,
        validTargets: [],
        targetingMode: "none",
        damageEvents: [],
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
    });

    // --- Phase timings ---
    const OVERLAY_PRE_IMPACT_MS = 1800; // spell / hero-power → impact start
    const ATTACK_LUNGE_PRE_IMPACT_MS = 700; // lunge (~650ms) + short buffer
    const IMPACT_MS = 1200;
    const DRAW_MS = 1000;
    const DEATH_MS = 1000;
    const SUMMON_MS = 1400;
    const DISCARD_MS = 1800; // forced-discard popup display time
    const RECAST_GAP_MS = 1800;

    // --- Phase handlers ---
    const phaseOverlay = () => {
      set((s) => ({
        effectLog: [...s.effectLog, ...logEntries].slice(-20),
        ...(spellEvent ? { spellCastEvent: spellEvent } : {}),
        ...(fireEvent ? { fireBreathEvent: fireEvent } : {}),
        ...(heroPowerEvent ? { heroPowerCastEvent: heroPowerEvent } : {}),
      }));
      playSfxBatch(overlaySfx);
      // Attack lunge plays on BOTH the active and passive client, since this
      // runs inside dispatchAction which remote broadcasts go through too.
      if (isAttack && action.type === "attack") {
        playAttackLunge(action.attackerInstanceId, action.targetInstanceId);
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
    const staggerByTarget = (events: typeof dmgEvents) => {
      const order = new Map<string, number>();
      for (const ev of events) {
        if (!order.has(ev.targetId)) order.set(ev.targetId, order.size);
      }
      return events.map((ev) => ({
        ...ev,
        delayMs: (order.get(ev.targetId) ?? 0) * STAGGER_MS,
      }));
    };
    const staggeredDmgEvents = staggerByTarget(impactOnlyEvents);
    const staggeredTriggerEvents = staggerByTarget(deferredBuffEvents);

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
      set({ gameState: postDeathState });
      playSfxBatch(deathSfx);
    };

    const phaseSummons = () => {
      set({
        gameState: preDrawState,
        ...(staggeredTriggerEvents.length > 0 ? { damageEvents: staggeredTriggerEvents } : {}),
      });
      playSfxBatch(summonSfx);
    };

    const phaseDiscard = () => {
      // Surface the forced-discard popup just before the draw phase so the
      // player sees what was discarded by Combustion (or future similar
      // effects) before the new cards arrive.
      if (discardFromHandEvent) set({ discardFromHandEvent });
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
      });
    };

    const phaseUnlock = () => {
      set({ isAnimating: false });
      const queued = get().pendingIncomingActions;
      if (queued.length > 0) {
        set({ pendingIncomingActions: queued.slice(1) });
        get().dispatchAction(queued[0]);
      }
    };

    // --- Schedule the sequence ---
    let cursor = 0;
    // Phase A (Overlay) — synchronous, already fires at t=0.
    phaseOverlay();
    if (hasOverlay) cursor += OVERLAY_PRE_IMPACT_MS;
    else if (isAttack) cursor += ATTACK_LUNGE_PRE_IMPACT_MS;

    // Phase B (Impacts) — always run if there's anything beyond the overlay.
    setTimeout(phaseImpacts, cursor);
    cursor += IMPACT_MS;

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

    // Recast spells ride the tail of the sequence.
    if (recastSpells.length > 0) {
      for (let i = 0; i < recastSpells.length; i++) {
        const recast = recastSpells[i];
        setTimeout(() => set({ spellCastEvent: recast }), cursor);
        cursor += RECAST_GAP_MS;
      }
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

    if (card && creatureNeedsSelection(card.card)) {
      const selXVals = parseXValuesFromEffectText(card.card.effect_text);
      const x = selXVals["selection"] || Math.max(2, Math.floor(card.card.mana_cost / 2));
      const choices = getSelectionCards(gameState, x);
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
      const x = xVals["renfort_royal"] || Math.max(2, Math.floor(card.card.mana_cost / 2));
      const choices = getRenfortRoyalCards(gameState, x);
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

    // Check if creature needs selection
    if (card.card.card_type === "creature" && creatureNeedsSelection(card.card)) {
      const selXVals = parseXValuesFromEffectText(card.card.effect_text);
      const x = selXVals["selection"] || Math.max(2, Math.floor(card.card.mana_cost / 2));
      const choices = getSelectionCards(gameState, x);
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
      const x = xVals["renfort_royal"] || Math.max(2, Math.floor(card.card.mana_cost / 2));
      const choices = getRenfortRoyalCards(gameState, x);
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

    // Check if spell has selection keyword
    if (card.card.card_type === "spell" && card.card.spell_keywords?.some(kw => kw.id === "selection")) {
      const selKw = card.card.spell_keywords!.find(kw => kw.id === "selection")!;
      const x = selKw.amount ?? 2;
      const choices = getSelectionCards(gameState, x);
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

    // Check if spell has renfort_royal keyword
    if (card.card.card_type === "spell" && card.card.spell_keywords?.some(kw => kw.id === "renfort_royal")) {
      const rrKw = card.card.spell_keywords!.find(kw => kw.id === "renfort_royal")!;
      const x = rrKw.amount ?? 2;
      const choices = getRenfortRoyalCards(gameState, x);
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

    // Check if spell needs a target (new multi-target system)
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
      return get().dispatchAction({
        type: "attack",
        attackerInstanceId: selectedAttackerInstanceId,
        targetInstanceId: targetId,
      });
    } else if (targetingMode === "spell" && selectedCardInstanceId) {
      const { spellTargetSlots } = get();
      const slot = spellTargetSlots[0]?.slot ?? "target_0";
      return get().dispatchAction({
        type: "play_card",
        cardInstanceId: selectedCardInstanceId,
        targetMap: { [slot]: targetId },
      });
    } else if (targetingMode === "spell_multi" && selectedCardInstanceId) {
      const { spellTargetSlots, currentTargetSlotIndex, collectedTargetMap, gameState: gs } = get();
      const currentSlot = spellTargetSlots[currentTargetSlotIndex];
      const newMap = { ...collectedTargetMap, [currentSlot.slot]: targetId };
      const nextIndex = currentTargetSlotIndex + 1;

      if (nextIndex >= spellTargetSlots.length) {
        return get().dispatchAction({
          type: "play_card",
          cardInstanceId: selectedCardInstanceId,
          targetMap: newMap,
        });
      } else {
        const nextSlot = spellTargetSlots[nextIndex];
        const card = gs?.players[gs.currentPlayerIndex].hand.find(c => c.instanceId === selectedCardInstanceId);
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
      const { pendingBoardPosition, spellTargetSlots, gameState: gs } = get();
      // Check if this is a spell graveyard targeting
      const cardInHand = gs?.players[gs.currentPlayerIndex].hand.find(c => c.instanceId === selectedCardInstanceId);
      if (cardInHand?.card.card_type === "spell" && spellTargetSlots.length > 0) {
        const slot = spellTargetSlots[0]?.slot ?? "kw_0";
        return get().dispatchAction({
          type: "play_card",
          cardInstanceId: selectedCardInstanceId,
          targetMap: { [slot]: targetId },
        });
      }
      // Creature graveyard targeting (existing behavior)
      return get().dispatchAction({
        type: "play_card",
        cardInstanceId: selectedCardInstanceId,
        graveyardTargetInstanceId: targetId,
        boardPosition: pendingBoardPosition ?? undefined,
      });
    } else if (targetingMode === "divination" && selectedCardInstanceId) {
      const { pendingBoardPosition } = get();
      return get().dispatchAction({
        type: "play_card",
        cardInstanceId: selectedCardInstanceId,
        divinationChoiceIndex: parseInt(targetId) || 0,
        boardPosition: pendingBoardPosition ?? undefined,
      });
    } else if (targetingMode === "selection" && selectedCardInstanceId) {
      const { pendingBoardPosition, gameState: gs } = get();
      const cardInHand = gs?.players[gs.currentPlayerIndex].hand.find(c => c.instanceId === selectedCardInstanceId);
      const cardId = parseInt(targetId) || 0;
      if (cardInHand?.card.card_type === "spell") {
        // Spell selection: pass card ID via targetMap
        return get().dispatchAction({
          type: "play_card",
          cardInstanceId: selectedCardInstanceId,
          targetMap: { selection_0: String(cardId) },
        });
      }
      return get().dispatchAction({
        type: "play_card",
        cardInstanceId: selectedCardInstanceId,
        selectionCardId: cardId,
        boardPosition: pendingBoardPosition ?? undefined,
      });
    } else if (targetingMode === "hero_power") {
      return get().dispatchAction({
        type: "hero_power",
        targetInstanceId: targetId,
      });
    }
    return null;
  },

  clearSelection: () => {
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
      spellTargetSlots: [],
      currentTargetSlotIndex: 0,
      collectedTargetMap: {},
    });
  },

  clearDamageEvents: () => {
    set({ damageEvents: [] });
  },

  clearSpellCastEvent: () => {
    set({ spellCastEvent: null });
  },

  clearFireBreathEvent: () => {
    set({ fireBreathEvent: null });
  },

  clearTempeteEvent: () => {
    set({ tempeteEvent: null });
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

  activateHeroPower: () => {
    const { gameState } = get();
    if (!gameState) return null;
    if (!canUseHeroPower(gameState)) return null;

    const player = gameState.players[gameState.currentPlayerIndex];
    const heroDef = player.hero.heroDefinition;
    if (!heroDef) return null;

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
}));
