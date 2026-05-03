"use client";

import { useState, useCallback, useEffect, useRef, type DragEvent } from "react";
import Image from "next/image";
import { AnimatePresence } from "framer-motion";
import { useGameStore } from "@/lib/store/gameStore";
import { canPlayCard, canAttack, canUseHeroPower, getSpellTargets, heroPowerNeedsTarget } from "@/lib/game/engine";
import HeroPortrait from "./HeroPortrait";
import Hero3DViewer from "./Hero3DViewer";
import HeroPowerButton from "./HeroPowerButton";
import HeroPowerDescriptionOverlay from "./HeroPowerDescriptionOverlay";
import ManaBar from "./ManaBar";
import BoardCreature from "./BoardCreature";
import HandCard from "./HandCard";
import GraveyardOverlay from "./GraveyardOverlay";
import DivinationOverlay from "./DivinationOverlay";
import SelectionOverlay from "./SelectionOverlay";
import TactiqueKeywordOverlay from "./TactiqueKeywordOverlay";
import CostPaymentOverlay from "./CostPaymentOverlay";
import EffectLog from "./EffectLog";
import TurnTimer from "./TurnTimer";
import TargetingArrow from "./TargetingArrow";
import DamageOverlay from "./DamageOverlay";
import SpellCastOverlay from "./SpellCastOverlay";
import FireBreathOverlay from "./FireBreathOverlay";
import HeroPowerOverlay from "./HeroPowerOverlay";
import GraveyardAffectOverlay from "./GraveyardAffectOverlay";
import DiscardFromHandOverlay from "./DiscardFromHandOverlay";
import TempeteOverlay from "./TempeteOverlay";
import ArenaDeckGraveyardCluster from "./ArenaDeckGraveyardCluster";
import MulliganOverlay from "./MulliganOverlay";
import SettingsModal from "@/components/shared/SettingsModal";
import type { GameAction, DamageEvent, HeroDefinition } from "@/lib/game/types";
import useGameMusic from "@/hooks/useGameMusic";
import { useAudioStore } from "@/lib/store/audioStore";
import SfxEngine from "@/lib/audio/SfxEngine";

interface GameBoardProps {
  onAction?: (action: GameAction) => void;
}


export default function GameBoard({ onAction }: GameBoardProps) {
  useGameMusic();

  const {
    gameState,
    localPlayerId,
    selectedAttackerInstanceId,
    selectedCardInstanceId,
    validTargets,
    targetingMode,
    divinationCards,
    selectionCards,
    tactiqueAvailableKeywords,
    tactiqueMaxSelections,
    effectLog,
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
    fireBreathEvent,
    clearFireBreathEvent,
    heroPowerCastEvent,
    clearHeroPowerCastEvent,
    graveyardAffectEvent,
    clearGraveyardAffectEvent,
    discardFromHandEvent,
    clearDiscardFromHandEvent,
    tempeteEvent,
    clearTempeteEvent,
    isAnimating,
    spellTargetSlots,
    currentTargetSlotIndex,
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [heroDescriptionDef, setHeroDescriptionDef] = useState<HeroDefinition | null>(null);
  // Guards against the second click of a double-click on a targeted hero
  // power instantly cancelling the targeting that the first click opened.
  const justOpenedHeroTargetingRef = useRef<number>(0);
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

  const boardImageUrl = useGameStore((s) => s.boardImageUrl);
  const boardLayout = useGameStore((s) => s.boardLayout);
  const boardGraveyardImageUrl = useGameStore((s) => s.boardGraveyardImageUrl);
  const isMtgo = boardLayout === "mtgo";
  const opponentCardBackUrl = useGameStore((s) => s.opponentCardBackUrl);
  const myCardBackUrl = useGameStore((s) => s.myCardBackUrl);
  const myPlayer = getMyPlayerState();
  const opponent = getOpponentPlayerState();
  const myTurn = isMyTurn() && !isAnimating;

  // Broadcast helper
  const broadcast = useCallback(
    (action: GameAction | null) => {
      if (action && onAction) onAction(action);
    },
    [onAction]
  );

  const handleEndTurn = useCallback(() => {
    // Guard: read the live state (not React's closure) so we never double-fire
    // end_turn (timer expiring + user clicking, or drain dispatch races).
    const s = useGameStore.getState();
    if (!s.gameState || s.isAnimating) return;
    if (s.gameState.players[s.gameState.currentPlayerIndex].id !== s.localPlayerId) return;
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
      // The lunge animation is now triggered inside dispatchAction's overlay
      // phase, so it plays for both the attacker and the passive opponent.
      const action = selectTarget(targetId);
      if (action) broadcast(action);
    },
    [selectTarget, broadcast]
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

  // Keep the mulligan overlay mounted past the mulligan phase transition so
  // the local reveal animation (including replacements) can finish even if
  // the opponent confirms quickly.
  const [mulliganOverlayRequired, setMulliganOverlayRequired] = useState(false);
  useEffect(() => {
    if (isMulligan) setMulliganOverlayRequired(true);
  }, [isMulligan]);

  // ─── Hero 3D interaction handlers ──────────────────────────────────────
  // Player's hero: click = targeted power (opens arrow), dblclick = non-targeted
  // cast, right-click = open description modal. The power button under the
  // figurine stays wired to the same activateHeroPower action for fallback.
  const myHeroDef = myPlayer.hero.heroDefinition;
  const oppHeroDef = opponent.hero.heroDefinition;
  const heroPowerAvailable = myTurn && canUseHeroPower(gameState) && !!myHeroDef;
  const heroPowerIsTargeted = !!myHeroDef && heroPowerNeedsTarget(myHeroDef);
  const powerHalo: "blue" | "gold" | null =
    heroPowerAvailable
      ? heroPowerIsTargeted ? "blue" : "gold"
      : null;

  const handleMyHeroClick = () => {
    // 1. Hero is being picked AS a target for another effect.
    if (validTargets.includes("friendly_hero")) {
      handleSelectTarget("friendly_hero");
      return;
    }
    // 2. Second click of a double-click just after opening targeting — swallow.
    const now = performance.now();
    if (targetingMode === "hero_power" && now - justOpenedHeroTargetingRef.current < 320) {
      return;
    }
    // 3. Hero power targeting already active → cancel.
    if (targetingMode === "hero_power") {
      clearSelection();
      return;
    }
    // 4. Open targeting for a targeted power. Non-targeted powers wait for
    //    double-click to avoid misclick casts.
    if (heroPowerAvailable && heroPowerIsTargeted) {
      handleActivateHeroPower();
      justOpenedHeroTargetingRef.current = now;
    }
  };

  const handleMyHeroDoubleClick = () => {
    if (heroPowerAvailable && !heroPowerIsTargeted) {
      handleActivateHeroPower();
    }
  };

  const handleMyHeroContextMenu = () => {
    if (myHeroDef) setHeroDescriptionDef(myHeroDef);
  };

  const handleOppHeroClick = () => {
    if (validTargets.includes("enemy_hero")) {
      handleSelectTarget("enemy_hero");
    }
  };

  const handleOppHeroContextMenu = () => {
    if (oppHeroDef) setHeroDescriptionDef(oppHeroDef);
  };

  return (
    <div
      className="fixed inset-0 select-none"
      style={{ backgroundColor: "#0d0d1a" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) clearSelection();
      }}
      onContextMenu={(e) => {
        if (targetingMode === "spell_multi" && currentTargetSlotIndex > 0) {
          e.preventDefault();
          const prevSlot = spellTargetSlots[currentTargetSlotIndex - 1];
          const prevMap = { ...useGameStore.getState().collectedTargetMap };
          delete prevMap[prevSlot.slot];
          const card = gameState?.players[gameState.currentPlayerIndex].hand.find(c => c.instanceId === selectedCardInstanceId);
          const prevTargets = card && gameState ? getSpellTargets(gameState, card.card, prevSlot.type) : [];
          useGameStore.setState({
            currentTargetSlotIndex: currentTargetSlotIndex - 1,
            collectedTargetMap: prevMap,
            validTargets: prevTargets,
          });
        } else if (targetingMode !== "none") {
          e.preventDefault();
          clearSelection();
        }
      }}
    >
      {/* 16:9 board container */}
      <div
        className="absolute inset-0 m-auto overflow-visible"
        style={{
          aspectRatio: "16/9",
          maxWidth: "100vw",
          maxHeight: "100vh",
          width: "100%",
          height: "100%",
          position: "relative",
        }}
      >
        {/* Board artwork — next/image pipeline respects DPR and serves the
            sharpest variant the source allows. Gemini outputs ~1024px native
            so we request a generous sizes hint and max quality. */}
        <Image
          src={boardImageUrl || "/images/battlefield.jpg"}
          alt=""
          fill
          priority
          className="object-cover select-none pointer-events-none"
          sizes="(min-resolution: 2dppx) 100vw, 100vw"
          quality={100}
          unoptimized
          draggable={false}
          style={{ zIndex: -1, imageRendering: "auto" }}
        />

        {/* Subtle overlay for readability */}
        <div className="absolute inset-0 bg-background/10 pointer-events-none z-0" />

        {/* ============= SETTINGS BUTTON =============
            Snaps to a slot below the opponent deck/graveyard cluster in
            MTGO layout so the corner cluster reads cleanly; otherwise
            stays in the top-right corner. */}
        <button
          onClick={() => setSettingsOpen(true)}
          className={`absolute z-30 w-9 h-9 flex items-center justify-center text-base bg-secondary/80 border border-card-border rounded-lg text-foreground/70 hover:text-foreground hover:border-primary/40 transition-colors backdrop-blur-sm ${
            isMtgo ? "top-[26%] right-[2%]" : "top-[1%] right-[2%]"
          }`}
          title="Réglages"
        >
          ⚙
        </button>

        {/* ============= OPPONENT HAND (single card back + count) =============
            In MTGO layout the deck+graveyard cluster occupies the top-right,
            so the hand-back stack hugs the opponent's hero portrait at the
            top-left — MTG Arena style. In classic layout it stays where
            it always was. */}
        {opponent.hand.length > 0 && (
          <div
            className={`absolute z-20 flex items-center gap-3 ${
              isMtgo
                ? "top-[1%] left-[14%]"
                : "top-[1%] right-[2%]"
            }`}
          >
            <div className="relative w-32 aspect-[5/7] rounded-lg overflow-hidden">
              {opponentCardBackUrl ? (
                <Image
                  src={opponentCardBackUrl}
                  alt=""
                  fill
                  sizes="(min-resolution: 3dppx) 768px, (min-resolution: 2dppx) 512px, 256px"
                  className="object-cover"
                  quality={100}
                  unoptimized
                  draggable={false}
                  style={{ imageRendering: "auto" }}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-secondary via-card-bg to-secondary flex items-center justify-center">
                  <div className="w-20 h-28 rounded border border-primary/20 bg-primary/10 flex items-center justify-center">
                    <span className="text-primary/40 text-xl font-bold">A&amp;M</span>
                  </div>
                </div>
              )}
              <div className="absolute -bottom-2 -right-2 min-w-[32px] h-8 px-2 rounded-full bg-background/90 border-2 border-primary/60 flex items-center justify-center text-foreground font-bold text-sm shadow-lg">
                {opponent.hand.length}
              </div>
            </div>
          </div>
        )}

        {/* ============= OPPONENT LEGACY PORTRAIT (top-left) =============
            Mirrors the opponent 3D-hero wrapper position so the badge
            lives in the same corner whether the opponent uses a 3D
            figurine or the legacy portrait. Skipped when a 3D skin is
            set (handled in the Hero3DViewer wrapper instead). */}
        {!opponent.hero.heroDefinition?.glbUrl && (
        <div className="absolute left-[1%] top-[10%] lg:top-[3%] z-20 flex flex-col items-center gap-1">
          {/* The visible HeroPowerButton has been removed to mirror the
              3D-hero UX: left-click on the portrait selects the hero
              (or activates power on own hero), right-click opens the
              hero / power description overlay. The portrait now uses
              the same handlers the 3D viewer wires up. */}
          <HeroPortrait
            hero={opponent.hero}
            isOpponent={true}
            isValidTarget={validTargets.includes("enemy_hero")}
            damageAmount={getDamage("enemy_hero")}
            onClick={handleOppHeroClick}
            onContextMenu={handleOppHeroContextMenu}
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
          <ManaBar current={opponent.mana} max={opponent.maxMana} />
        </div>
        )}

        {/* ============= OPPONENT 3D HERO (top-left, mirror of player) =============
            On smaller screens the figurine sits lower (just above the opponent
            creature row) so it doesn't crush the hand-count / mana UI. At lg+
            it snaps back to the top-left corner. */}
        {opponent.hero.heroDefinition?.glbUrl && (
          <div className="absolute left-[1%] top-[10%] lg:top-[3%] z-20 flex flex-col items-center gap-1">
            <Hero3DViewer
              hero={opponent.hero}
              isOpponent={true}
              isValidTarget={validTargets.includes("enemy_hero")}
              damageAmount={getDamage("enemy_hero")}
              onClick={handleOppHeroClick}
              onContextMenu={handleOppHeroContextMenu}
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
            {/* Mana orbs sit directly under the 3D hero so they read as
                "next to the HP number" rendered inside the canvas. */}
            <ManaBar current={opponent.mana} max={opponent.maxMana} />
          </div>
        )}

        {/* ============= OPPONENT GRAVEYARD + DECK (legacy compact icon) =============
            Hidden in MTGO layout — the large clickable graveyard tile on
            the top-left and the deck stack on the top-right replace it. */}
        {!isMtgo && (
        <div className="absolute top-[2%] left-[2%] z-30 flex items-center gap-3">
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
        )}

        {/* ============= MTGO OPPONENT DECK + GRAVEYARD CLUSTER (top-right) =============
            MTG Arena-style cluster: opponent's pioche tile + cimetière tile
            (showing the last-killed card face-up) sit together at top-right,
            mirroring the player's bottom-left arrangement. The opponent's
            hand-back stack moved to top-center to make room. */}
        {isMtgo && (
          <div className="absolute top-[3%] right-[1.5%] z-30">
            <ArenaDeckGraveyardCluster
              deckCount={opponent.deck.length}
              cardBackUrl={opponentCardBackUrl}
              graveyard={opponent.graveyard}
              emptyGraveyardImageUrl={boardGraveyardImageUrl}
              isOpponent={true}
              onGraveyardClick={() => setGraveyardView("opponent")}
            />
          </div>
        )}

        {/* ============= OPPONENT BOARD (creatures) ============= */}
        <div
          className="absolute top-[14%] left-0 right-0 h-[24%] flex justify-center items-center gap-2 px-8 overflow-visible"
        >
          {opponent.board.length === 0 ? (
            <div className="text-foreground/10 text-sm">
              No creatures
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
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

        {/* ============= PLAYER BOARD (creatures + drop zone) ============= */}
        <div
          onDrop={handleDropOnBoard}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className="absolute top-[46%] left-0 right-0 h-[24%] flex items-center justify-center px-8 transition-all overflow-visible"
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
              <AnimatePresence mode="popLayout">
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

        {/* ============= PLAYER GRAVEYARD + DECK (legacy compact icon) =============
            Hidden in MTGO layout for the same reason as the opponent's. */}
        {!isMtgo && (
        <div className="absolute bottom-[18%] left-[2%] z-40 flex items-center gap-3">
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
        )}

        {/* ============= MTGO PLAYER DECK + GRAVEYARD CLUSTER (bottom-left) ============= */}
        {isMtgo && (
          <div className="absolute bottom-[3%] left-[1.5%] z-40">
            <ArenaDeckGraveyardCluster
              deckCount={myPlayer.deck.length}
              cardBackUrl={myCardBackUrl}
              graveyard={myPlayer.graveyard}
              emptyGraveyardImageUrl={boardGraveyardImageUrl}
              isOpponent={false}
              onGraveyardClick={() => setGraveyardView("my")}
            />
          </div>
        )}

        {/* ============= PLAYER LEGACY PORTRAIT (bottom-right) =============
            Mirrors the 3D-hero wrapper position so the badge lives in the
            same corner whether the player uses a 3D figurine or the
            legacy portrait. Skipped entirely when a 3D skin is set
            (handled in the Hero3DViewer wrapper instead). */}
        {!myPlayer.hero.heroDefinition?.glbUrl && (
        <div className="absolute right-[1%] bottom-[28%] lg:bottom-[1%] z-40 flex flex-col items-center gap-1">
          {/* HeroPowerButton hidden so the 2D hero matches the 3D-hero
              UX: left-click on the portrait activates the power (when
              available), right-click opens the description overlay. */}
          <HeroPortrait
            hero={myPlayer.hero}
            isOpponent={false}
            isValidTarget={validTargets.includes("friendly_hero")}
            damageAmount={getDamage("friendly_hero")}
            onClick={handleMyHeroClick}
            onDoubleClick={handleMyHeroDoubleClick}
            onContextMenu={handleMyHeroContextMenu}
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
        )}

        {/* ============= PLAYER 3D HERO (bottom-right) =============
            Under lg (< 1024px) the figurine floats above the hand of cards so
            it never collides with them; at lg+ it anchors to the corner. */}
        {myPlayer.hero.heroDefinition?.glbUrl && (
          <div className="absolute right-[1%] bottom-[28%] lg:bottom-[1%] z-40 flex flex-col items-center gap-1">
            <Hero3DViewer
              hero={myPlayer.hero}
              isOpponent={false}
              isValidTarget={validTargets.includes("friendly_hero")}
              damageAmount={getDamage("friendly_hero")}
              powerReadyHalo={powerHalo}
              onClick={handleMyHeroClick}
              onDoubleClick={handleMyHeroDoubleClick}
              onContextMenu={handleMyHeroContextMenu}
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
            {/* Mana orbs directly under the 3D hero, next to the HP number
                rendered inside the canvas. */}
            <ManaBar current={myPlayer.mana} max={myPlayer.maxMana} />
          </div>
        )}

        {/* ============= END TURN + TIMER + CANCEL ============= */}
        <div className="absolute right-[2%] top-[44%] -translate-y-1/2 z-20 flex flex-col items-center gap-3">
          {targetingMode !== "none" && (
            <button
              onClick={clearSelection}
              className="text-xs text-accent hover:text-accent/80 transition-colors bg-black/50 px-3 py-1 rounded"
            >
              Cancel targeting
            </button>
          )}
          <TurnTimer
            isMyTurn={myTurn}
            onTimeUp={handleEndTurn}
            turnNumber={gameState.turnNumber}
            turnStartedAt={gameState.turnStartedAt}
          />
          <button
            onClick={handleEndTurn}
            disabled={!myTurn}
            className={`relative w-[140px] h-[46px] transition-all ${
              myTurn
                ? "hover:scale-105 hover:brightness-110 cursor-pointer"
                : "brightness-50 saturate-0 cursor-not-allowed"
            }`}
          >
            <img
              src="/images/end-turn-btn.svg"
              alt=""
              className="absolute inset-0 w-full h-full"
            />
            <span className={`relative z-10 font-bold text-sm tracking-wide ${
              myTurn ? "text-[#2a1a00] drop-shadow-[0_1px_0_rgba(255,255,255,0.3)]" : "text-gray-500"
            }`}>
              END TURN
            </span>
          </button>
        </div>

        {/* ============= PLAYER HAND ============= */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-1 px-6 pb-4 pt-1 overflow-visible z-30">
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
                  if (cardInstance.card.card_type === "creature") return;
                  const action = selectCardInHand(cardInstance.instanceId);
                  broadcast(action);
                }}
              />
            );
          })}
        </div>
      </div>{/* end 16:9 board container */}

      {/* ============= FIXED OVERLAYS ============= */}
      {mulliganOverlayRequired && (
        <MulliganOverlay
          hand={myPlayer.hand}
          onConfirm={handleMulliganConfirm}
          waitingForOpponent={myMulliganDone}
          onRevealComplete={() => {
            setMulliganOverlayRequired(false);
            // The mulligan pipeline skipped draw_card on purpose; fire it now
            // so the turn-start draw (and the Mana Spark for the 2nd player)
            // has audible feedback at the exact moment they become visible.
            const audio = useAudioStore.getState();
            const url = audio.standardSfxUrls["draw_card"];
            if (url && audio.userHasInteracted && !audio.settings.sfxMuted) {
              SfxEngine.getInstance().play(url);
            }
          }}
        />
      )}
      {graveyardView && targetingMode !== "graveyard" && (
        <GraveyardOverlay
          cards={
            graveyardView === "my"
              ? myPlayer.graveyard
              : opponent.graveyard
          }
          title={
            graveyardView === "my"
              ? "Votre Cimetière"
              : "Cimetière adverse"
          }
          onClose={() => setGraveyardView(null)}
        />
      )}
      {targetingMode === "graveyard" && (
        <GraveyardOverlay
          cards={myPlayer.graveyard}
          title="Choisissez une carte"
          onClose={clearSelection}
          selectableInstanceIds={validTargets}
          onSelectCard={(id) => {
            const action = selectTarget(id);
            if (action) broadcast(action);
          }}
        />
      )}
      {targetingMode === "divination" && divinationCards.length > 0 && (
        <DivinationOverlay
          cards={divinationCards}
          onChoose={(idx) => {
            const action = selectTarget(String(idx));
            if (action) broadcast(action);
          }}
          onCancel={clearSelection}
        />
      )}
      {targetingMode === "selection" && selectionCards.length > 0 && (
        <SelectionOverlay
          cards={selectionCards}
          onChoose={(cardId) => {
            const action = selectTarget(String(cardId));
            if (action) broadcast(action);
          }}
        />
      )}
      {targetingMode === "tactique_keywords" && tactiqueAvailableKeywords.length > 0 && (
        <TactiqueKeywordOverlay
          keywords={tactiqueAvailableKeywords}
          maxSelections={tactiqueMaxSelections}
          onConfirm={(selected) => {
            const action = selectTarget(JSON.stringify(selected));
            if (action) broadcast(action);
          }}
          onCancel={clearSelection}
        />
      )}
      <CostPaymentOverlay onConfirmedAction={broadcast} />
      {/* Action history (EffectLog) hidden for now per design feedback —
          the entries are still being logged in the store, the overlay
          is just not rendered. Re-enable by removing the comment when
          we revisit the feature. */}
      {false && <EffectLog entries={effectLog} />}
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

      {/* Multi-target spell banner */}
      {targetingMode === "spell_multi" && spellTargetSlots.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-purple-900/90 border border-purple-500 rounded-lg px-6 py-3 text-center backdrop-blur-sm">
          <p className="text-purple-200 text-sm">
            Cible {currentTargetSlotIndex + 1}/{spellTargetSlots.length}
          </p>
          <p className="text-white font-bold">
            {spellTargetSlots[currentTargetSlotIndex]?.label ?? "Choisissez une cible"}
          </p>
        </div>
      )}

      {/* Damage animation overlay */}
      <DamageOverlay events={damageEvents} />
      <SpellCastOverlay event={spellCastEvent} onComplete={clearSpellCastEvent} />
      <FireBreathOverlay event={fireBreathEvent} onComplete={clearFireBreathEvent} />
      <HeroPowerOverlay event={heroPowerCastEvent} onComplete={clearHeroPowerCastEvent} />
      <GraveyardAffectOverlay event={graveyardAffectEvent} onComplete={clearGraveyardAffectEvent} />
      <DiscardFromHandOverlay event={discardFromHandEvent} onComplete={clearDiscardFromHandEvent} />
      <TempeteOverlay event={tempeteEvent} onComplete={clearTempeteEvent} />

      {/* Targeting arrow overlay */}
      <TargetingArrow
        targetingMode={targetingMode}
        sourceInstanceId={selectedAttackerInstanceId ?? selectedCardInstanceId ?? (targetingMode === "hero_power" ? "hero_power" : null)}
        hoveredTargetId={hoveredTargetId}
      />

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {heroDescriptionDef && (
        <HeroPowerDescriptionOverlay
          heroDef={heroDescriptionDef}
          activationsUsed={
            heroDescriptionDef === myHeroDef
              ? myPlayer.hero.heroPowerActivationsUsed
              : opponent.hero.heroPowerActivationsUsed
          }
          onClose={() => setHeroDescriptionDef(null)}
        />
      )}
    </div>
  );
}
