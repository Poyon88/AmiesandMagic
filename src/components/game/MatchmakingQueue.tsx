"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface ValidDeck {
  id: number;
  name: string;
  cardCount: number;
}

export default function MatchmakingQueue({
  userId,
  validDecks,
}: {
  userId: string;
  validDecks: ValidDeck[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(
    validDecks[0]?.id ?? null
  );
  const [inQueue, setInQueue] = useState(false);
  const [queueTime, setQueueTime] = useState(0);
  const [error, setError] = useState("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollingRef = useRef<boolean>(false);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const matchFoundRef = useRef<boolean>(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pollingRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      channelRef.current?.unsubscribe();
    };
  }, []);

  const navigateToMatch = useCallback(
    (matchId: string) => {
      if (matchFoundRef.current) return; // prevent double navigation
      matchFoundRef.current = true;
      pollingRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      channelRef.current?.unsubscribe();
      router.push(`/game/${matchId}`);
    },
    [router]
  );

  const pollForMatch = useCallback(
    async (deckId: number) => {
      if (!pollingRef.current || matchFoundRef.current) return;

      try {
        // Check if another player already created a match with us
        const { data: existingMatch } = await supabase
          .from("matches")
          .select("id")
          .eq("status", "active")
          .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (existingMatch) {
          // We were already matched by the other player
          // Remove ourselves from queue
          await supabase
            .from("matchmaking_queue")
            .delete()
            .eq("user_id", userId);
          navigateToMatch(existingMatch.id);
          return;
        }

        // Look for an opponent in the queue
        const { data: queueEntries } = await supabase
          .from("matchmaking_queue")
          .select("*")
          .neq("user_id", userId)
          .order("joined_at")
          .limit(1);

        if (queueEntries && queueEntries.length > 0 && pollingRef.current) {
          const opponent = queueEntries[0];

          // Try to create match (we are player1)
          const { data: match, error: matchError } = await supabase
            .from("matches")
            .insert({
              player1_id: userId,
              player2_id: opponent.user_id,
              player1_deck_id: deckId,
              player2_deck_id: opponent.deck_id,
              status: "active",
            })
            .select("id")
            .single();

          if (match && !matchError) {
            // Remove ourselves from queue (opponent will detect the match and remove themselves)
            await supabase
              .from("matchmaking_queue")
              .delete()
              .eq("user_id", userId);

            navigateToMatch(match.id);
            return;
          }
        }
      } catch (err) {
        console.error("Poll error:", err);
      }

      // Continue polling
      if (pollingRef.current && !matchFoundRef.current) {
        pollTimeoutRef.current = setTimeout(() => pollForMatch(deckId), 2000);
      }
    },
    [userId, supabase, navigateToMatch]
  );

  async function joinQueue() {
    if (!selectedDeckId) {
      setError("Please select a deck");
      return;
    }

    setError("");
    setInQueue(true);
    setQueueTime(0);
    matchFoundRef.current = false;
    pollingRef.current = true;

    // Start timer
    timerRef.current = setInterval(() => {
      setQueueTime((prev) => prev + 1);
    }, 1000);

    // Clean any stale queue entry first
    await supabase
      .from("matchmaking_queue")
      .delete()
      .eq("user_id", userId);

    // Insert into queue
    const { error: insertError } = await supabase
      .from("matchmaking_queue")
      .insert({ user_id: userId, deck_id: selectedDeckId });

    if (insertError && insertError.code !== "23505") {
      setError(insertError.message);
      setInQueue(false);
      pollingRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Start polling
    pollForMatch(selectedDeckId);
  }

  async function leaveQueue() {
    pollingRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    channelRef.current?.unsubscribe();

    await supabase
      .from("matchmaking_queue")
      .delete()
      .eq("user_id", userId);

    setInQueue(false);
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-md p-8 bg-secondary rounded-xl border border-card-border shadow-2xl">
        <h1 className="text-3xl font-bold text-center text-primary mb-2">
          Play
        </h1>
        <p className="text-center text-foreground/50 text-sm mb-8">
          Find an opponent and battle
        </p>

        {!inQueue ? (
          <>
            {validDecks.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-foreground/50 mb-4">
                  You need at least one valid deck (50 cards) to play.
                </p>
                <button
                  onClick={() => router.push("/decks/builder")}
                  className="px-6 py-2 bg-primary hover:bg-primary-dark text-background font-bold rounded-lg transition-colors"
                >
                  Create a Deck
                </button>
              </div>
            ) : (
              <>
                <label className="block text-sm font-medium text-foreground/70 mb-2">
                  Select your deck:
                </label>
                <div className="space-y-2 mb-6">
                  {validDecks.map((deck) => (
                    <button
                      key={deck.id}
                      onClick={() => setSelectedDeckId(deck.id)}
                      className={`w-full p-3 rounded-lg border-2 text-left transition-colors ${
                        selectedDeckId === deck.id
                          ? "border-primary bg-primary/10"
                          : "border-card-border bg-background hover:border-primary/40"
                      }`}
                    >
                      <div className="font-medium text-foreground">
                        {deck.name}
                      </div>
                      <div className="text-xs text-success">
                        {deck.cardCount} cards
                      </div>
                    </button>
                  ))}
                </div>

                {error && (
                  <p className="text-accent text-sm mb-4">{error}</p>
                )}

                <button
                  onClick={joinQueue}
                  disabled={!selectedDeckId}
                  className="w-full py-3 bg-accent hover:bg-accent/80 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  Find Match
                </button>
              </>
            )}

            <button
              onClick={() => router.push("/")}
              className="w-full mt-3 py-2 bg-background border border-card-border rounded-lg text-foreground/60 hover:text-foreground transition-colors text-sm"
            >
              Back to Menu
            </button>
          </>
        ) : (
          <div className="text-center py-8">
            <div className="text-5xl mb-6 animate-pulse">⚔️</div>
            <p className="text-foreground/70 text-lg mb-2">
              Searching for opponent...
            </p>
            <p className="text-foreground/40 text-2xl font-mono mb-8">
              {formatTime(queueTime)}
            </p>
            <button
              onClick={leaveQueue}
              className="px-8 py-2 bg-background border border-card-border rounded-lg text-foreground/60 hover:text-foreground hover:border-accent/40 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
