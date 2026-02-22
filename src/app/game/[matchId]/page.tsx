"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useGameStore } from "@/lib/store/gameStore";
import { applyAction } from "@/lib/game/engine";
import GameBoard from "@/components/game/GameBoard";
import type { Card, GameAction, HeroDefinition, HeroPowerEffect, Race } from "@/lib/game/types";

interface HeroRow {
  id: number;
  name: string;
  race: string;
  power_name: string;
  power_type: string;
  power_cost: number;
  power_effect: HeroPowerEffect;
  power_description: string;
}

interface MatchData {
  player1_id: string;
  player2_id: string;
  player1_deck_id: number;
  player2_deck_id: number;
}

function mapHeroRow(row: HeroRow | null): HeroDefinition | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    race: row.race as Race,
    powerName: row.power_name,
    powerType: row.power_type as "active" | "passive",
    powerCost: row.power_cost,
    powerEffect: row.power_effect,
    powerDescription: row.power_description,
  };
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
    p1Hero: HeroDefinition | null;
    p2Hero: HeroDefinition | null;
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

        // Fetch both player deck cards and hero data
        const [p1DeckCards, p2DeckCards, p1DeckData, p2DeckData] = await Promise.all([
          supabase
            .from("deck_cards")
            .select("card_id, quantity, cards(*)")
            .eq("deck_id", match.player1_deck_id),
          supabase
            .from("deck_cards")
            .select("card_id, quantity, cards(*)")
            .eq("deck_id", match.player2_deck_id),
          supabase
            .from("decks")
            .select("hero_id, heroes(*)")
            .eq("id", match.player1_deck_id)
            .single(),
          supabase
            .from("decks")
            .select("hero_id, heroes(*)")
            .eq("id", match.player2_deck_id)
            .single(),
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

        // Map hero data
        const p1Hero = mapHeroRow(
          (p1DeckData.data?.heroes as unknown as HeroRow) ?? null
        );
        const p2Hero = mapHeroRow(
          (p2DeckData.data?.heroes as unknown as HeroRow) ?? null
        );

        // Store match data for later initialization
        matchDataRef.current = { match, p1Cards, p2Cards, p1Hero, p2Hero };

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
              const { match: m, p1Cards: p1, p2Cards: p2, p1Hero, p2Hero } = matchDataRef.current;

              const seed = parseInt(matchId.replace(/-/g, "").slice(0, 8), 16);
              const firstPlayer: 0 | 1 = seed % 2 === 0 ? 0 : 1;

              initGame(m.player1_id, m.player2_id, p1, p2, firstPlayer, seed, p1Hero, p2Hero);
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
