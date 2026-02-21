"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useGameStore } from "@/lib/store/gameStore";
import { applyAction } from "@/lib/game/engine";
import GameBoard from "@/components/game/GameBoard";
import type { Card, GameAction } from "@/lib/game/types";

export default function GamePage() {
  const { matchId } = useParams<{ matchId: string }>();
  const supabase = createClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const {
    gameState,
    setGameState,
    setLocalPlayerId,
    initGame,
    localPlayerId,
  } = useGameStore();

  // Initialize match
  useEffect(() => {
    async function loadMatch() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setError("Not authenticated");
          return;
        }

        setLocalPlayerId(user.id);

        // Fetch match data
        const { data: match, error: matchError } = await supabase
          .from("matches")
          .select("*")
          .eq("id", matchId)
          .single();

        if (matchError || !match) {
          setError("Match not found");
          return;
        }

        // Fetch both player deck cards
        const [p1DeckCards, p2DeckCards] = await Promise.all([
          supabase
            .from("deck_cards")
            .select("card_id, quantity, cards(*)")
            .eq("deck_id", match.player1_deck_id),
          supabase
            .from("deck_cards")
            .select("card_id, quantity, cards(*)")
            .eq("deck_id", match.player2_deck_id),
        ]);

        const p1Cards = (p1DeckCards.data ?? []).map((dc) => ({
          card: dc.cards as unknown as Card,
          quantity: dc.quantity,
        }));
        const p2Cards = (p2DeckCards.data ?? []).map((dc) => ({
          card: dc.cards as unknown as Card,
          quantity: dc.quantity,
        }));

        // Determine first player (use match id as seed for consistency)
        const firstPlayer: 0 | 1 =
          parseInt(matchId.replace(/-/g, "").slice(0, 8), 16) % 2 === 0
            ? 0
            : 1;

        // Initialize game with deterministic seed
        initGame(
          match.player1_id,
          match.player2_id,
          p1Cards,
          p2Cards,
          firstPlayer
        );

        // Join realtime channel
        const channel = supabase.channel(`match:${matchId}`, {
          config: { broadcast: { self: false } },
        });

        channel
          .on("broadcast", { event: "game_action" }, (payload) => {
            const action = payload.payload as GameAction;
            const store = useGameStore.getState();
            if (store.gameState) {
              const newState = applyAction(store.gameState, action);
              store.setGameState(newState);
            }
          })
          .subscribe();

        channelRef.current = channel;
        setLoading(false);
      } catch (err) {
        setError("Failed to load match");
        console.error(err);
      }
    }

    loadMatch();

    return () => {
      channelRef.current?.unsubscribe();
    };
  }, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Broadcast actions to opponent
  const handleAction = useCallback(
    (action: GameAction) => {
      channelRef.current?.send({
        type: "broadcast",
        event: "game_action",
        payload: action,
      });

      // Update match status on game end
      const store = useGameStore.getState();
      if (store.gameState?.phase === "finished" && store.gameState.winner) {
        supabase
          .from("matches")
          .update({
            status: "finished",
            winner_id: store.gameState.winner,
            finished_at: new Date().toISOString(),
          })
          .eq("id", matchId)
          .then(() => {});
      }
    },
    [matchId, supabase]
  );

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-accent text-lg mb-4">{error}</p>
          <button
            onClick={() => (window.location.href = "/")}
            className="px-6 py-2 bg-primary text-background rounded-lg font-bold"
          >
            Return to Menu
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-bounce">⚔️</div>
          <p className="text-foreground/50">Loading match...</p>
        </div>
      </div>
    );
  }

  return <GameBoard onAction={handleAction} />;
}
