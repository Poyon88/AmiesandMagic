"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useGameStore } from "@/lib/store/gameStore";
import { applyAction } from "@/lib/game/engine";
import GameBoard from "@/components/game/GameBoard";
import type { Card, GameAction } from "@/lib/game/types";

interface MatchData {
  player1_id: string;
  player2_id: string;
  player1_deck_id: number;
  player2_deck_id: number;
}

export default function GamePage() {
  const { matchId } = useParams<{ matchId: string }>();
  const supabase = createClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [phase, setPhase] = useState<"loading" | "waiting" | "playing">("loading");
  const [error, setError] = useState("");
  const matchDataRef = useRef<{
    match: MatchData;
    p1Cards: { card: Card; quantity: number }[];
    p2Cards: { card: Card; quantity: number }[];
  } | null>(null);
  const gameInitializedRef = useRef(false);

  const {
    setGameState,
    setLocalPlayerId,
    initGame,
  } = useGameStore();

  // Initialize match
  useEffect(() => {
    let cancelled = false;

    async function loadMatch() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
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

        if (cancelled) return;
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

        if (cancelled) return;

        // Sort by card_id to guarantee identical ordering on both clients
        const p1Cards = (p1DeckCards.data ?? [])
          .sort((a, b) => a.card_id - b.card_id)
          .map((dc) => ({
            card: dc.cards as unknown as Card,
            quantity: dc.quantity,
          }));
        const p2Cards = (p2DeckCards.data ?? [])
          .sort((a, b) => a.card_id - b.card_id)
          .map((dc) => ({
            card: dc.cards as unknown as Card,
            quantity: dc.quantity,
          }));

        // Store match data for later initialization
        matchDataRef.current = { match, p1Cards, p2Cards };

        // Join realtime channel with presence
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

              // Also close the match from the receiving side
              if (newState.phase === "finished" && newState.winner) {
                supabase
                  .from("matches")
                  .update({
                    status: "finished",
                    winner_id: newState.winner,
                    finished_at: new Date().toISOString(),
                  })
                  .eq("id", matchId)
                  .then(() => {});
              }
            }
          })
          .on("presence", { event: "sync" }, () => {
            const state = channel.presenceState();
            const playerCount = Object.keys(state).length;

            if (playerCount >= 2 && !gameInitializedRef.current && matchDataRef.current) {
              gameInitializedRef.current = true;
              const { match: m, p1Cards: p1, p2Cards: p2 } = matchDataRef.current;

              const seed = parseInt(matchId.replace(/-/g, "").slice(0, 8), 16);
              const firstPlayer: 0 | 1 = seed % 2 === 0 ? 0 : 1;

              initGame(m.player1_id, m.player2_id, p1, p2, firstPlayer, seed);
              setPhase("playing");
            }
          })
          .subscribe(async (status) => {
            if (status === "SUBSCRIBED") {
              await channel.track({ user_id: user.id });
            }
          });

        channelRef.current = channel;
        setPhase("waiting");
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load match");
          console.error(err);
        }
      }
    }

    loadMatch();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
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

  if (phase === "loading" || phase === "waiting") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-bounce">⚔️</div>
          <p className="text-foreground/50">
            {phase === "loading" ? "Loading match..." : "Waiting for opponent..."}
          </p>
        </div>
      </div>
    );
  }

  return <GameBoard onAction={handleAction} />;
}
