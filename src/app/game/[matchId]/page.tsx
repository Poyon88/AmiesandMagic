"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useGameStore } from "@/lib/store/gameStore";
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
    factionCards: Card[];
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
        const [p1DeckCards, p2DeckCards, p1DeckData, p2DeckData, tokenTemplatesRes, defaultBoardRes] = await Promise.all([
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
            .select("hero_id, board_id, heroes(*)")
            .eq("id", match.player1_deck_id)
            .single(),
          supabase
            .from("decks")
            .select("hero_id, board_id, heroes(*)")
            .eq("id", match.player2_deck_id)
            .single(),
          supabase
            .from("token_templates")
            .select("*"),
          supabase
            .from("game_boards")
            .select("id")
            .eq("is_default", true)
            .eq("is_active", true)
            .maybeSingle(),
        ]);

        // Store token templates
        useGameStore.getState().setTokenTemplates(tokenTemplatesRes.data ?? []);

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

        // Load faction card pool for Sélection X keyword
        const deckFactions = new Set(
          [...p1Cards, ...p2Cards]
            .map((c) => c.card.faction)
            .filter(Boolean) as string[]
        );
        deckFactions.add("Mercenaires");
        const [factionCardsRes, manaSparkRes] = await Promise.all([
          supabase.from("cards").select("*").in("faction", Array.from(deckFactions)),
          supabase.from("cards").select("*").eq("name", "Mana Spark").eq("card_type", "spell").limit(1),
        ]);
        const factionCards = factionCardsRes.data ?? [];
        // Ensure Mana Spark is in the pool (may not be if Humains not in deck factions)
        const manaSpark = manaSparkRes.data?.[0];
        if (manaSpark && !factionCards.find((c: { id: number }) => c.id === manaSpark.id)) {
          factionCards.push(manaSpark);
        }

        // Determine which board the match uses: the second player's deck board,
        // falling back to the admin-chosen default board.
        const seed = parseInt(matchId.replace(/-/g, "").slice(0, 8), 16);
        const firstPlayerIdx: 0 | 1 = seed % 2 === 0 ? 0 : 1;
        const secondPlayerIdx = firstPlayerIdx === 0 ? 1 : 0;
        const secondPlayerDeck = [p1DeckData.data, p2DeckData.data][secondPlayerIdx] as
          | { board_id: number | null }
          | null;
        const targetBoardId =
          secondPlayerDeck?.board_id ?? defaultBoardRes.data?.id ?? null;

        if (targetBoardId) {
          const { data: boardRow } = await supabase
            .from("game_boards")
            .select("id, name, image_url, music_tracks:music_track_id(file_url), tense_track:tense_track_id(file_url), victory_track:victory_track_id(file_url), defeat_track:defeat_track_id(file_url), game_board_music_tracks(music_tracks(file_url))")
            .eq("id", targetBoardId)
            .maybeSingle();
          if (boardRow) {
            useGameStore.getState().setBoardImageUrl(boardRow.image_url);
            const board = boardRow as Record<string, unknown>;
            const musicData = board.music_tracks as { file_url: string } | null;
            const tenseData = board.tense_track as { file_url: string } | null;
            const victoryData = board.victory_track as { file_url: string } | null;
            const defeatData = board.defeat_track as { file_url: string } | null;
            const playlistRows = (board.game_board_music_tracks as { music_tracks: { file_url: string } | null }[] | null) ?? [];
            const playlistUrls = playlistRows
              .map((r) => r.music_tracks?.file_url)
              .filter((u): u is string => !!u);
            if (musicData?.file_url && !playlistUrls.includes(musicData.file_url)) {
              playlistUrls.push(musicData.file_url);
            }
            const store = useGameStore.getState();
            store.setBoardMusicUrls(playlistUrls);
            if (tenseData?.file_url) store.setBoardTenseMusicUrl(tenseData.file_url);
            if (victoryData?.file_url) store.setBoardVictoryMusicUrl(victoryData.file_url);
            if (defeatData?.file_url) store.setBoardDefeatMusicUrl(defeatData.file_url);
          }
        }

        // Store match data for later initialization
        matchDataRef.current = { match, p1Cards, p2Cards, p1Hero, p2Hero, factionCards: (factionCards ?? []) as unknown as Card[] };

        // Join realtime channel with presence
        const channel = supabase.channel(`match:${matchId}`, {
          config: { broadcast: { self: false } },
        });

        channel
          .on("broadcast", { event: "game_action" }, (payload) => {
            const action = payload.payload as GameAction;
            const store = useGameStore.getState();
            if (store.gameState) {
              // Route the incoming action through dispatchAction so SFX,
              // damage events, spell/fire-breath overlays and death animations
              // all fire on the receiving side. We intentionally do NOT
              // re-broadcast — dispatchAction only mutates local state.
              store.dispatchAction(action);

              const newState = useGameStore.getState().gameState;
              if (newState?.phase === "finished" && newState.winner) {
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
              const { match: m, p1Cards: p1, p2Cards: p2, p1Hero, p2Hero, factionCards } = matchDataRef.current;

              const seed = parseInt(matchId.replace(/-/g, "").slice(0, 8), 16);
              const firstPlayer: 0 | 1 = seed % 2 === 0 ? 0 : 1;

              initGame(m.player1_id, m.player2_id, p1, p2, firstPlayer, seed, p1Hero, p2Hero, factionCards);
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
