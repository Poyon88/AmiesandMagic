import { create } from "zustand";
import type { GameState, GameAction, Card, CardInstance, DamageEvent, HeroDefinition, SpellTargetSlot, SpellTargetType, TokenTemplate } from "@/lib/game/types";
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
} from "@/lib/game/engine";

export interface SpellCastEvent {
  spellName: string;
  effectText: string;
  timestamp: number;
}

interface GameStore {
  // State
  gameState: GameState | null;
  localPlayerId: string | null;
  selectedCardInstanceId: string | null;
  selectedAttackerInstanceId: string | null;
  validTargets: string[];
  targetingMode: "none" | "attack" | "spell" | "spell_multi" | "creature" | "graveyard" | "divination" | "tactique_keywords" | "hero_power";
  pendingBoardPosition: number | null;
  divinationCards: CardInstance[];
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

  // Actions
  initGame: (
    player1Id: string,
    player2Id: string,
    player1Cards: { card: Card; quantity: number }[],
    player2Cards: { card: Card; quantity: number }[],
    firstPlayerIndex?: 0 | 1,
    seed?: number,
    player1Hero?: HeroDefinition | null,
    player2Hero?: HeroDefinition | null
  ) => void;
  setGameState: (state: GameState) => void;
  setLocalPlayerId: (id: string) => void;
  setTokenTemplates: (templates: TokenTemplate[]) => void;

  // Game actions
  dispatchAction: (action: GameAction) => GameAction | null;
  playCardDirect: (instanceId: string, boardPosition?: number) => GameAction | null;
  selectCardInHand: (instanceId: string) => GameAction | null;
  selectAttacker: (instanceId: string) => void;
  selectTarget: (targetId: string) => void;
  clearSelection: () => void;
  clearDamageEvents: () => void;
  clearSpellCastEvent: () => void;
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

      // Damage
      if (newCreature.currentHealth < oldCreature.currentHealth) {
        const pos = getElementCenter(oldCreature.instanceId);
        events.push({
          targetId: oldCreature.instanceId,
          amount: oldCreature.currentHealth - newCreature.currentHealth,
          type: "damage",
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

  initGame: (player1Id, player2Id, player1Cards, player2Cards, firstPlayerIndex, seed, player1Hero, player2Hero) => {
    const state = initializeGame(
      player1Id,
      player2Id,
      player1Cards,
      player2Cards,
      firstPlayerIndex,
      seed,
      player1Hero,
      player2Hero
    );
    // Inject token templates into GameState for engine access
    state.tokenTemplates = get().tokenTemplates;
    set({ gameState: state });
  },

  setGameState: (state) => set({ gameState: state }),
  setLocalPlayerId: (id) => set({ localPlayerId: id }),
  setTokenTemplates: (templates) => set({ tokenTemplates: templates }),

  dispatchAction: (action) => {
    const { gameState, localPlayerId } = get();
    if (!gameState || gameState.phase === "finished") return null;

    // Detect spell cast before applying action
    let spellEvent: SpellCastEvent | null = null;
    if (action.type === "play_card") {
      const player = gameState.players[gameState.currentPlayerIndex];
      const cardInst = player.hand.find((c) => c.instanceId === action.cardInstanceId);
      if (cardInst && cardInst.card.card_type === "spell") {
        spellEvent = {
          spellName: cardInst.card.name,
          effectText: cardInst.card.effect_text,
          timestamp: Date.now(),
        };
      }
    }

    const newState = applyAction(gameState, action);
    const dmgEvents = detectDamageEvents(gameState, newState, localPlayerId);
    const logEntries = generateEffectLog(gameState, newState, action);

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

    if (deadCreatures.length > 0) {
      // Create intermediate state with dead creatures still on board (at 0 HP)
      const interState = JSON.parse(JSON.stringify(newState)) as GameState;
      for (let i = 0; i < 2; i++) {
        const oldBoard = gameState.players[i].board;
        const newBoard = newState.players[i].board;
        const died = oldBoard.filter(
          (c) => !newBoard.find((nc) => nc.instanceId === c.instanceId)
        );
        if (died.length > 0) {
          // Re-insert dead creatures with 0 HP so AnimatePresence can see them
          const deadWithZeroHp = died.map((c) => ({
            ...c,
            currentHealth: 0,
          }));
          interState.players[i].board = [
            ...interState.players[i].board,
            ...deadWithZeroHp,
          ];
        }
      }

      // First render: show dead creatures still on board (triggers damage overlay)
      set({
        gameState: interState,
        selectedCardInstanceId: null,
        selectedAttackerInstanceId: null,
        validTargets: [],
        targetingMode: "none",
        damageEvents: dmgEvents,
        effectLog: [...get().effectLog, ...logEntries].slice(-20),
        ...(spellEvent ? { spellCastEvent: spellEvent } : {}),
      });

      // After a short delay, remove dead creatures (triggers exit animation)
      setTimeout(() => {
        set({ gameState: newState });
      }, 1200);
    } else {
      set({
        gameState: newState,
        selectedCardInstanceId: null,
        selectedAttackerInstanceId: null,
        validTargets: [],
        targetingMode: "none",
        damageEvents: dmgEvents,
        effectLog: [...get().effectLog, ...logEntries].slice(-20),
        ...(spellEvent ? { spellCastEvent: spellEvent } : {}),
      });
    }

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

    // Check if spell needs a target (new multi-target system)
    if (card.card.card_type === "spell" && needsTarget(card.card)) {
      const slots = getSpellTargetSlots(card.card);
      const selectableSlots = slots.filter(s =>
        s.type === "any" || s.type === "any_creature"
        || s.type === "friendly_creature" || s.type === "enemy_creature"
      );

      if (selectableSlots.length === 0) {
        // No player selection needed — play directly
        return get().dispatchAction({ type: "play_card", cardInstanceId: instanceId });
      }

      const firstSlot = selectableSlots[0];
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
      get().dispatchAction({
        type: "attack",
        attackerInstanceId: selectedAttackerInstanceId,
        targetInstanceId: targetId,
      });
    } else if (targetingMode === "spell" && selectedCardInstanceId) {
      const { spellTargetSlots } = get();
      const slot = spellTargetSlots[0]?.slot ?? "target_0";
      get().dispatchAction({
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
        // All targets collected — dispatch
        get().dispatchAction({
          type: "play_card",
          cardInstanceId: selectedCardInstanceId,
          targetMap: newMap,
        });
      } else {
        // Advance to next slot
        const nextSlot = spellTargetSlots[nextIndex];
        const card = gs?.players[gs.currentPlayerIndex].hand.find(c => c.instanceId === selectedCardInstanceId);
        const nextTargets = card ? getSpellTargets(gs!, card.card, nextSlot.type) : [];
        set({
          validTargets: nextTargets,
          currentTargetSlotIndex: nextIndex,
          collectedTargetMap: newMap,
        });
      }
    } else if (targetingMode === "creature" && selectedCardInstanceId) {
      const { pendingBoardPosition, gameState: gs } = get();

      // Check if this is a Tactique creature — need second step (keyword selection)
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
          return;
        }
      }

      get().dispatchAction({
        type: "play_card",
        cardInstanceId: selectedCardInstanceId,
        targetInstanceId: targetId,
        boardPosition: pendingBoardPosition ?? undefined,
      });
    } else if (targetingMode === "tactique_keywords" && selectedCardInstanceId) {
      // targetId is JSON-encoded keyword array from overlay
      const { pendingBoardPosition, pendingTargetInstanceId } = get();
      const keywords = JSON.parse(targetId) as import("@/lib/game/types").Keyword[];
      get().dispatchAction({
        type: "play_card",
        cardInstanceId: selectedCardInstanceId,
        targetInstanceId: pendingTargetInstanceId ?? undefined,
        tactiqueKeywords: keywords,
        boardPosition: pendingBoardPosition ?? undefined,
      });
    } else if (targetingMode === "graveyard" && selectedCardInstanceId) {
      const { pendingBoardPosition } = get();
      get().dispatchAction({
        type: "play_card",
        cardInstanceId: selectedCardInstanceId,
        graveyardTargetInstanceId: targetId,
        boardPosition: pendingBoardPosition ?? undefined,
      });
    } else if (targetingMode === "divination" && selectedCardInstanceId) {
      // targetId is the index as string for divination
      const { pendingBoardPosition } = get();
      get().dispatchAction({
        type: "play_card",
        cardInstanceId: selectedCardInstanceId,
        divinationChoiceIndex: parseInt(targetId) || 0,
        boardPosition: pendingBoardPosition ?? undefined,
      });
    } else if (targetingMode === "hero_power") {
      get().dispatchAction({
        type: "hero_power",
        targetInstanceId: targetId,
      });
    }
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
