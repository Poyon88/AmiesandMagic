"use client";

import { useState, useCallback, useEffect, useRef, Fragment, type DragEvent } from "react";
import { AnimatePresence } from "framer-motion";
import { useGameStore } from "@/lib/store/gameStore";
import { canPlayCard, canAttack, canUseHeroPower } from "@/lib/game/engine";
import HeroPortrait from "./HeroPortrait";
import HeroPowerButton from "./HeroPowerButton";
import ManaBar from "./ManaBar";
import BoardCreature from "./BoardCreature";
import HandCard from "./HandCard";
import GraveyardOverlay from "./GraveyardOverlay";
import TurnTimer from "./TurnTimer";
import TargetingArrow from "./TargetingArrow";
import DamageOverlay from "./DamageOverlay";
import SpellCastOverlay from "./SpellCastOverlay";
import MulliganOverlay from "./MulliganOverlay";
import type { GameAction, DamageEvent } from "@/lib/game/types";

interface GameBoardProps {
  onAction?: (action: GameAction) => void;
}

function animateAttackLunge(
  attackerInstanceId: string,
  targetId: string,
  onImpact: () => void
): void {
  const attackerEl = document.querySelector(
    `[data-instance-id="${attackerInstanceId}"]`
  ) as HTMLElement | null;

  let targetEl: Element | null = null;
  if (targetId === "enemy_hero" || targetId === "friendly_hero") {
    targetEl = document.querySelector(`[data-target-id="${targetId}"]`);
  } else {
    targetEl = document.querySelector(`[data-instance-id="${targetId}"]`);
  }

  if (!attackerEl || !targetEl) {
    onImpact();
    return;
  }

  const attackerRect = attackerEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  const dx = (targetRect.left + targetRect.width / 2) - (attackerRect.left + attackerRect.width / 2);
  const dy = (targetRect.top + targetRect.height / 2) - (attackerRect.top + attackerRect.height / 2);

  const lungeX = dx * 0.6;
  const lungeY = dy * 0.6;

  const origZ = attackerEl.style.zIndex;
  attackerEl.style.zIndex = "50";

  const lunge = attackerEl.animate(
    [
      { transform: "translate(0, 0) scale(1)" },
      { transform: `translate(${lungeX}px, ${lungeY}px) scale(1.1)` },
    ],
    { duration: 150, easing: "cubic-bezier(0.2, 0, 0.6, 1)", fill: "forwards" }
  );

  lunge.onfinish = () => {
    onImpact();

    const ret = attackerEl.animate(
      [
        { transform: `translate(${lungeX}px, ${lungeY}px) scale(1.1)` },
        { transform: "translate(0, 0) scale(1)" },
      ],
      { duration: 200, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" }
    );

    ret.onfinish = () => {
      lunge.cancel();
      ret.cancel();
      attackerEl.style.zIndex = origZ;
    };
  };
}

export default function GameBoard({ onAction }: GameBoardProps) {
  const {
    gameState,
    localPlayerId,
    selectedAttackerInstanceId,
    selectedCardInstanceId,
    validTargets,
    targetingMode,
    dispatchAction,
    playCardDirect,
    selectCardInHand,
    selectAttacker,
    selectTarget,
    clearSelection,
    damageEvents,
    clearDamageEvents,
    spellCastEvent,
    clearSpellCastEvent,
    confirmMulligan,
    activateHeroPower,
    isMyTurn,
    getMyPlayerState,
    getOpponentPlayerState,
  } = useGameStore();

  const [graveyardView, setGraveyardView] = useState<
    "my" | "opponent" | null
  >(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);
  const myBoardRef = useRef<HTMLDivElement>(null);
  const isAnimatingAttackRef = useRef(false);

  // Clear hover when targeting ends
  useEffect(() => {
    if (targetingMode === "none") setHoveredTargetId(null);
  }, [targetingMode]);

  // Auto-clear damage events after animation
  useEffect(() => {
    if (damageEvents.length === 0) return;
    const timer = setTimeout(clearDamageEvents, 2900);
    return () => clearTimeout(timer);
  }, [damageEvents, clearDamageEvents]);

  function getDamage(targetId: string): number | null {
    const evt = damageEvents.find((e: DamageEvent) => e.targetId === targetId);
    return evt ? evt.amount : null;
  }

  const myPlayer = getMyPlayerState();
  const opponent = getOpponentPlayerState();
  const myTurn = isMyTurn();

  // Broadcast helper
  const broadcast = useCallback(
    (action: GameAction | null) => {
      if (action && onAction) onAction(action);
    },
    [onAction]
  );

  const handleEndTurn = useCallback(() => {
    broadcast(dispatchAction({ type: "end_turn" }));
  }, [dispatchAction, broadcast]);

  const handleActivateHeroPower = useCallback(() => {
    const action = activateHeroPower();
    broadcast(action);
  }, [activateHeroPower, broadcast]);

  const handleMulliganConfirm = useCallback(
    (selectedIds: string[]) => {
      const action = confirmMulligan(selectedIds);
      broadcast(action);
    },
    [confirmMulligan, broadcast]
  );

  // Compute insertion index from cursor X relative to existing board creatures
  const computeDropIndex = useCallback(
    (clientX: number): number => {
      if (!myBoardRef.current) return 0;
      const creatures = myBoardRef.current.querySelectorAll("[data-instance-id]");
      if (creatures.length === 0) return 0;

      for (let i = 0; i < creatures.length; i++) {
        const rect = creatures[i].getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        if (clientX < center) return i;
      }
      return creatures.length;
    },
    []
  );

  // Drag & drop: card dropped onto the board
  const handleDropOnBoard = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const idx = dropIndex;
      setIsDragOver(false);
      setDropIndex(null);
      if (!myTurn || !gameState) return;

      const cardInstanceId = e.dataTransfer.getData("cardInstanceId");
      if (!cardInstanceId) return;

      const cardType = e.dataTransfer.getData("cardType");
      if (cardType === "spell") {
        // Spells go through selectCardInHand (handles targeting vs direct play)
        const action = selectCardInHand(cardInstanceId);
        broadcast(action);
      } else {
        // Creatures are placed at the drop position
        const action = playCardDirect(cardInstanceId, idx ?? undefined);
        broadcast(action);
      }
    },
    [myTurn, gameState, playCardDirect, selectCardInHand, broadcast, dropIndex]
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!myTurn) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setIsDragOver(true);
      setDropIndex(computeDropIndex(e.clientX));
    },
    [myTurn, computeDropIndex]
  );

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
    setDropIndex(null);
  }, []);

  const handleSelectAttacker = useCallback(
    (instanceId: string) => {
      if (!myTurn || !gameState) return;
      selectAttacker(instanceId);
    },
    [myTurn, gameState, selectAttacker]
  );

  const handleSelectTarget = useCallback(
    (targetId: string) => {
      const action =
        targetingMode === "attack" && selectedAttackerInstanceId
          ? {
              type: "attack" as const,
              attackerInstanceId: selectedAttackerInstanceId,
              targetInstanceId: targetId,
            }
          : targetingMode === "spell" && selectedCardInstanceId
          ? {
              type: "play_card" as const,
              cardInstanceId: selectedCardInstanceId,
              targetInstanceId: targetId,
            }
          : targetingMode === "hero_power"
          ? {
              type: "hero_power" as const,
              targetInstanceId: targetId,
            }
          : null;

      // Animate lunge before dispatching attack
      if (targetingMode === "attack" && selectedAttackerInstanceId) {
        if (isAnimatingAttackRef.current) return;
        isAnimatingAttackRef.current = true;

        animateAttackLunge(selectedAttackerInstanceId, targetId, () => {
          selectTarget(targetId);
          broadcast(action);
          setTimeout(() => { isAnimatingAttackRef.current = false; }, 250);
        });
      } else {
        selectTarget(targetId);
        broadcast(action);
      }
    },
    [
      targetingMode,
      selectedAttackerInstanceId,
      selectedCardInstanceId,
      selectTarget,
      broadcast,
    ]
  );

  if (!gameState || !myPlayer || !opponent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-foreground/50">Loading game...</p>
      </div>
    );
  }

  const isFinished = gameState.phase === "finished";
  const isWinner = gameState.winner === localPlayerId;
  const isMulligan = gameState.phase === "mulligan";
  const myPlayerIndex = gameState.players.findIndex((p) => p.id === localPlayerId);
  const myMulliganDone = myPlayerIndex !== -1 && gameState.mulliganReady[myPlayerIndex];

  return (
    <div
      className="fixed inset-0 bg-background flex flex-col select-none overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) clearSelection();
      }}
      onContextMenu={(e) => {
        if (targetingMode !== "none") {
          e.preventDefault();
          clearSelection();
        }
      }}
    >
      {/* Fixed overlays — position:fixed, don't affect flex layout */}
      {isMulligan && (
        <MulliganOverlay
          hand={myPlayer.hand}
          onConfirm={handleMulliganConfirm}
          waitingForOpponent={myMulliganDone}
        />
      )}
      {graveyardView && (
        <GraveyardOverlay
          cards={
            graveyardView === "my"
              ? myPlayer.graveyard
              : opponent.graveyard
          }
          title={
            graveyardView === "my"
              ? "Your Graveyard"
              : "Opponent's Graveyard"
          }
          onClose={() => setGraveyardView(null)}
        />
      )}
      {isFinished && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
          <div className="text-center">
            <h1
              className={`text-6xl font-bold mb-4 ${
                isWinner ? "text-success" : "text-accent"
              }`}
            >
              {isWinner ? "VICTORY" : "DEFEAT"}
            </h1>
            <button
              onClick={() => (window.location.href = "/")}
              className="px-8 py-3 bg-primary hover:bg-primary-dark text-background font-bold rounded-xl text-lg transition-colors"
            >
              Return to Menu
            </button>
          </div>
        </div>
      )}

      {/* ============= OPPONENT INFO BAR ============= */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-card-border/30">
        {/* Opponent hand (card backs) */}
        <div className="flex gap-1">
          {opponent.hand.map((_, i) => (
            <div
              key={i}
              className="w-8 h-12 rounded-sm border border-primary/30 bg-gradient-to-br from-secondary via-card-bg to-secondary overflow-hidden flex items-center justify-center"
            >
              <div className="w-5 h-7 rounded-sm border border-primary/20 bg-primary/10 flex items-center justify-center">
                <span className="text-primary/40 text-[8px] font-bold">A&amp;M</span>
              </div>
            </div>
          ))}
          <span className="text-xs text-foreground/30 self-center ml-1">
            {opponent.hand.length}
          </span>
        </div>

        {/* Opponent hero + mana + hero power */}
        <div className="flex items-center gap-4">
          <ManaBar current={opponent.mana} max={opponent.maxMana} />
          <HeroPowerButton
            heroDef={opponent.hero.heroDefinition}
            isOpponent={true}
            canUse={false}
            isUsed={opponent.hero.heroPowerUsedThisTurn}
            mana={opponent.mana}
          />
          <HeroPortrait
            hero={opponent.hero}
            isOpponent={true}
            isValidTarget={validTargets.includes("enemy_hero")}
            damageAmount={getDamage("enemy_hero")}
            onClick={
              validTargets.includes("enemy_hero")
                ? () => handleSelectTarget("enemy_hero")
                : undefined
            }
            onMouseEnter={
              validTargets.includes("enemy_hero")
                ? () => setHoveredTargetId("enemy_hero")
                : undefined
            }
            onMouseLeave={
              validTargets.includes("enemy_hero")
                ? () => setHoveredTargetId(null)
                : undefined
            }
          />
        </div>

        {/* Opponent graveyard + deck */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setGraveyardView("opponent")}
            className="flex flex-col items-center text-foreground/40 hover:text-foreground/60 transition-colors"
          >
            <span className="text-lg">💀</span>
            <span className="text-[10px]">{opponent.graveyard.length}</span>
          </button>
          <div className="flex flex-col items-center text-foreground/30">
            <span className="text-lg">📚</span>
            <span className="text-[10px]">{opponent.deck.length}</span>
          </div>
        </div>
      </div>

      {/* ============= BATTLEFIELD WRAPPER ============= */}
      <div
        className="flex-1 flex flex-col overflow-hidden relative"
        style={{
          minHeight: 0,
          backgroundImage: "url('/images/battlefield.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundColor: "#0d0d1a",
        }}
      >
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-background/40 pointer-events-none" />

      {/* ============= OPPONENT BOARD ============= */}
      <div
        className="flex justify-center items-center gap-2 px-8 overflow-hidden relative z-10"
        style={{ flex: '1 1 0%' }}
      >
        {opponent.board.length === 0 ? (
          <div className="text-foreground/10 text-sm">
            No creatures
          </div>
        ) : (
          <AnimatePresence>
            {opponent.board.map((creature) => (
              <BoardCreature
                key={creature.instanceId}
                creature={creature}
                isOwn={false}
                isValidTarget={validTargets.includes(creature.instanceId)}
                damageAmount={getDamage(creature.instanceId)}
                onClick={
                  validTargets.includes(creature.instanceId)
                    ? () => handleSelectTarget(creature.instanceId)
                    : undefined
                }
                onMouseEnter={
                  validTargets.includes(creature.instanceId)
                    ? () => setHoveredTargetId(creature.instanceId)
                    : undefined
                }
                onMouseLeave={
                  validTargets.includes(creature.instanceId)
                    ? () => setHoveredTargetId(null)
                    : undefined
                }
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* ============= DIVIDER (handled by battlefield image) ============= */}
      <div className="relative z-10" />

      {/* ============= PLAYER BOARD ============= */}
      <div
        onDrop={handleDropOnBoard}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          flex items-center justify-center px-8 transition-all overflow-hidden relative z-10
          ${
            isDragOver
              ? "bg-success/10 border-2 border-dashed border-success/50"
              : ""
          }
        `}
        style={{ flex: '1 1 0%' }}
      >
        <div ref={myBoardRef} className="flex justify-center gap-2 min-h-[88px] items-center">
        {myPlayer.board.length === 0 && !isDragOver ? (
          <div className="text-foreground/10 text-sm">
            Drag cards to play them here
          </div>
        ) : myPlayer.board.length === 0 && isDragOver ? (
          <div className="text-success/50 text-sm font-medium">
            Drop to play creature
          </div>
        ) : (
          <>
            <AnimatePresence>
              {myPlayer.board.flatMap((creature, i) => {
                const canAtt =
                  myTurn && canAttack(gameState, creature.instanceId);
                const items = [];
                if (isDragOver && dropIndex === i) {
                  items.push(
                    <div key={`drop-${i}`} className="w-1 h-20 rounded-full bg-success shadow-[0_0_8px_rgba(34,197,94,0.6)] shrink-0" />
                  );
                }
                items.push(
                  <BoardCreature
                    key={creature.instanceId}
                    creature={creature}
                    isOwn={true}
                    canAttack={canAtt}
                    isSelected={
                      selectedAttackerInstanceId === creature.instanceId
                    }
                    isValidTarget={validTargets.includes(creature.instanceId)}
                    damageAmount={getDamage(creature.instanceId)}
                    onClick={
                      validTargets.includes(creature.instanceId)
                        ? () => handleSelectTarget(creature.instanceId)
                        : canAtt
                        ? () => handleSelectAttacker(creature.instanceId)
                        : undefined
                    }
                    onMouseEnter={
                      validTargets.includes(creature.instanceId)
                        ? () => setHoveredTargetId(creature.instanceId)
                        : undefined
                    }
                    onMouseLeave={
                      validTargets.includes(creature.instanceId)
                        ? () => setHoveredTargetId(null)
                        : undefined
                    }
                  />
                );
                return items;
              })}
            </AnimatePresence>
            {isDragOver && dropIndex === myPlayer.board.length && (
              <div className="w-1 h-20 rounded-full bg-success shadow-[0_0_8px_rgba(34,197,94,0.6)] shrink-0" />
            )}
          </>
        )}
        </div>
      </div>

      </div>{/* end BATTLEFIELD WRAPPER */}

      {/* ============= MY AREA ============= */}
      <div className="border-t border-card-border/30">
        {/* My hero + mana + graveyard */}
        <div className="flex items-center justify-between px-6 py-2">
          {/* My graveyard + deck */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setGraveyardView("my")}
              className="flex flex-col items-center text-foreground/40 hover:text-foreground/60 transition-colors"
            >
              <span className="text-lg">💀</span>
              <span className="text-[10px]">{myPlayer.graveyard.length}</span>
            </button>
            <div className="flex flex-col items-center text-foreground/30">
              <span className="text-lg">📚</span>
              <span className="text-[10px]">{myPlayer.deck.length}</span>
            </div>
          </div>

          {/* My hero + mana + hero power */}
          <div className="flex items-center gap-4">
            <ManaBar current={myPlayer.mana} max={myPlayer.maxMana} />
            <HeroPortrait
              hero={myPlayer.hero}
              isOpponent={false}
              isValidTarget={validTargets.includes("friendly_hero")}
              damageAmount={getDamage("friendly_hero")}
              onClick={
                validTargets.includes("friendly_hero")
                  ? () => handleSelectTarget("friendly_hero")
                  : undefined
              }
              onMouseEnter={
                validTargets.includes("friendly_hero")
                  ? () => setHoveredTargetId("friendly_hero")
                  : undefined
              }
              onMouseLeave={
                validTargets.includes("friendly_hero")
                  ? () => setHoveredTargetId(null)
                  : undefined
              }
            />
            <HeroPowerButton
              heroDef={myPlayer.hero.heroDefinition}
              isOpponent={false}
              canUse={myTurn && !!gameState && canUseHeroPower(gameState)}
              isUsed={myPlayer.hero.heroPowerUsedThisTurn}
              mana={myPlayer.mana}
              onClick={handleActivateHeroPower}
            />
          </div>

          {/* Targeting mode indicator */}
          <div className="w-32 text-right">
            {targetingMode !== "none" && (
              <button
                onClick={clearSelection}
                className="text-xs text-accent hover:text-accent/80 transition-colors"
              >
                Cancel targeting
              </button>
            )}
          </div>
        </div>

        {/* My hand */}
        <div className="flex justify-center gap-1 px-6 pb-4 pt-1 overflow-hidden">
          {myPlayer.hand.map((cardInstance) => {
            const playable =
              myTurn && canPlayCard(gameState, cardInstance.instanceId);
            return (
              <HandCard
                key={cardInstance.instanceId}
                cardInstance={cardInstance}
                canPlay={playable}
                isSelected={
                  selectedCardInstanceId === cardInstance.instanceId
                }
                onClick={() => {
                  // Only allow click for spells (targeting mode)
                  // Creatures must be played via drag-and-drop
                  if (cardInstance.card.card_type === "creature") return;
                  const action = selectCardInHand(cardInstance.instanceId);
                  broadcast(action);
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Timer + End Turn — bottom right */}
      <div className="fixed bottom-4 right-4 z-40 flex items-center gap-3">
        <TurnTimer
          isMyTurn={myTurn}
          onTimeUp={handleEndTurn}
          turnNumber={gameState.turnNumber}
        />
        <button
          onClick={handleEndTurn}
          disabled={!myTurn}
          className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${
            myTurn
              ? "bg-primary hover:bg-primary-dark text-background"
              : "bg-card-border/30 text-foreground/30 cursor-not-allowed"
          }`}
        >
          END TURN
        </button>
      </div>

      {/* Damage animation overlay */}
      <DamageOverlay events={damageEvents} />
      <SpellCastOverlay event={spellCastEvent} onComplete={clearSpellCastEvent} />

      {/* Targeting arrow overlay */}
      <TargetingArrow
        targetingMode={targetingMode}
        sourceInstanceId={selectedAttackerInstanceId ?? selectedCardInstanceId}
        hoveredTargetId={hoveredTargetId}
      />
    </div>
  );
}
