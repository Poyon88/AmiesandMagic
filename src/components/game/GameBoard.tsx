"use client";

import { useState, useCallback, useEffect, useRef, Fragment, type DragEvent } from "react";
import { useGameStore } from "@/lib/store/gameStore";
import { canPlayCard, canAttack } from "@/lib/game/engine";
import HeroPortrait from "./HeroPortrait";
import ManaBar from "./ManaBar";
import BoardCreature from "./BoardCreature";
import HandCard from "./HandCard";
import GraveyardOverlay from "./GraveyardOverlay";
import TurnTimer from "./TurnTimer";
import TargetingArrow from "./TargetingArrow";
import DamageOverlay from "./DamageOverlay";
import MulliganOverlay from "./MulliganOverlay";
import type { GameAction, DamageEvent } from "@/lib/game/types";

interface GameBoardProps {
  onAction?: (action: GameAction) => void;
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
    confirmMulligan,
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
          : null;

      selectTarget(targetId);
      broadcast(action);
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
      className="min-h-screen bg-background flex flex-col select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) clearSelection();
      }}
    >
      {/* Mulligan overlay */}
      {isMulligan && (
        <MulliganOverlay
          hand={myPlayer.hand}
          onConfirm={handleMulliganConfirm}
          waitingForOpponent={myMulliganDone}
        />
      )}

      {/* Graveyard overlay */}
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

      {/* Match result overlay */}
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

      {/* ============= OPPONENT AREA ============= */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-card-border/30">
        {/* Opponent hand (card backs) */}
        <div className="flex gap-1">
          {opponent.hand.map((_, i) => (
            <div
              key={i}
              className="w-8 h-12 rounded bg-accent/30 border border-accent/20"
            />
          ))}
          <span className="text-xs text-foreground/30 self-center ml-1">
            {opponent.hand.length}
          </span>
        </div>

        {/* Opponent hero + mana */}
        <div className="flex items-center gap-4">
          <ManaBar current={opponent.mana} max={opponent.maxMana} />
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

      {/* ============= BATTLEFIELD ============= */}
      <div className="flex-1 flex flex-col justify-center px-8 py-4 min-h-[400px]">
        {/* Opponent board */}
        <div className="flex justify-center gap-2 mb-6 min-h-[88px]">
          {opponent.board.length === 0 ? (
            <div className="text-foreground/10 text-sm self-center">
              No creatures
            </div>
          ) : (
            opponent.board.map((creature) => (
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
            ))
          )}
        </div>

        {/* Divider with turn indicator */}
        <div className="flex items-center gap-4 my-2">
          <div className="flex-1 border-t border-card-border/30" />
          <div
            className={`px-4 py-1.5 rounded-full text-xs font-bold ${
              myTurn
                ? "bg-success/20 text-success border border-success/40"
                : "bg-accent/20 text-accent border border-accent/40"
            }`}
          >
            {myTurn ? "YOUR TURN" : "OPPONENT'S TURN"}
          </div>

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
          <div className="flex-1 border-t border-card-border/30" />
        </div>

        {/* My board — DROP ZONE (entire lower half) */}
        <div
          onDrop={handleDropOnBoard}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`
            flex-1 flex items-center justify-center rounded-xl transition-all
            ${
              isDragOver
                ? "bg-success/10 border-2 border-dashed border-success/50"
                : "border-2 border-dashed border-transparent"
            }
          `}
        >
          <div ref={myBoardRef} className="flex justify-center gap-2 min-h-[100px] items-center">
          {myPlayer.board.length === 0 && !isDragOver ? (
            <div className="text-foreground/10 text-sm self-center">
              Drag cards to play them here
            </div>
          ) : myPlayer.board.length === 0 && isDragOver ? (
            <div className="text-success/50 text-sm self-center font-medium">
              Drop to play creature
            </div>
          ) : (
            <>
              {myPlayer.board.map((creature, i) => {
                const canAtt =
                  myTurn && canAttack(gameState, creature.instanceId);
                return (
                  <Fragment key={creature.instanceId}>
                    {isDragOver && dropIndex === i && (
                      <div className="w-1 h-20 rounded-full bg-success shadow-[0_0_8px_rgba(34,197,94,0.6)] shrink-0" />
                    )}
                    <BoardCreature
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
                  </Fragment>
                );
              })}
              {isDragOver && dropIndex === myPlayer.board.length && (
                <div className="w-1 h-20 rounded-full bg-success shadow-[0_0_8px_rgba(34,197,94,0.6)] shrink-0" />
              )}
            </>
          )}
          </div>
        </div>
      </div>

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

          {/* My hero + mana */}
          <div className="flex items-center gap-4">
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
            <ManaBar current={myPlayer.mana} max={myPlayer.maxMana} />
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
        <div className="flex justify-center gap-1 px-6 pb-4 pt-1">
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
                  const action = selectCardInHand(cardInstance.instanceId);
                  broadcast(action);
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Damage animation overlay */}
      <DamageOverlay events={damageEvents} />

      {/* Targeting arrow overlay */}
      <TargetingArrow
        targetingMode={targetingMode}
        sourceInstanceId={selectedAttackerInstanceId ?? selectedCardInstanceId}
        hoveredTargetId={hoveredTargetId}
      />
    </div>
  );
}
