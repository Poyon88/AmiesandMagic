"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { GameFormat } from "@/lib/game/types";
import AmAtmosphere from "@/components/ui/AmAtmosphere";
import AmHeading from "@/components/ui/AmHeading";
import AmPanel from "@/components/ui/AmPanel";
import { AmButton } from "@/components/ui/AmButton";

interface ValidDeck {
  id: number;
  name: string;
  cardCount: number;
  format_id?: number | null;
}

// Polling cadence — realtime handles the common path (opponent matches us),
// the poll handles the dual case (we match an opponent already in queue).
// Kept short since the RPC is atomic so the only cost is one round-trip.
const POLL_INTERVAL_MS = 2500;
// Heartbeat must comfortably beat the RPC's 45s staleness cutoff so a real
// player keeps a hot last_seen_at.
const HEARTBEAT_INTERVAL_MS = 15000;

export default function MatchmakingQueue({
  userId,
  validDecks,
  formats,
}: {
  userId: string;
  validDecks: ValidDeck[];
  formats: GameFormat[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [selectedFormatId, setSelectedFormatId] = useState<number | null>(
    formats.find(f => f.code === 'expert-standard')?.id ?? formats[0]?.id ?? null
  );
  const formatDecks = validDecks.filter(d => !selectedFormatId || d.format_id === selectedFormatId);
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(
    formatDecks[0]?.id ?? null
  );
  const [inQueue, setInQueue] = useState(false);
  const [queueTime, setQueueTime] = useState(0);
  const [error, setError] = useState("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const inQueueRef = useRef<boolean>(false);
  const matchFoundRef = useRef<boolean>(false);

  const cleanupChannel = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, [supabase]);

  const cleanupTimers = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null; }
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
  }, []);

  const navigateToMatch = useCallback(
    (matchId: string) => {
      if (matchFoundRef.current) return;
      matchFoundRef.current = true;
      inQueueRef.current = false;
      cleanupTimers();
      cleanupChannel();
      router.push(`/game/${matchId}`);
    },
    [router, cleanupTimers, cleanupChannel]
  );

  // Best-effort queue cleanup on tab close. sendBeacon survives unload
  // better than fetch, but Supabase RPC doesn't have a beacon path so we
  // fall back to a synchronous-ish removeChannel + delete that may or may
  // not complete. The 45s staleness window catches anything we miss.
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!inQueueRef.current) return;
      try {
        supabase.from("matchmaking_queue").delete().eq("user_id", userId).then(() => {});
      } catch {
        // ignore — staleness filter will collect it
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [supabase, userId]);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      inQueueRef.current = false;
      cleanupTimers();
      cleanupChannel();
    };
  }, [cleanupTimers, cleanupChannel]);

  const pollOnce = useCallback(
    async (deckId: number, formatId: number | null) => {
      if (!inQueueRef.current || matchFoundRef.current) return;
      try {
        const { data, error: rpcError } = await supabase.rpc("find_match_or_enqueue", {
          p_user_id: userId,
          p_deck_id: deckId,
          p_format_id: formatId,
        });
        if (rpcError) {
          console.error("[matchmaking] rpc error", rpcError);
          return;
        }
        if (data) {
          navigateToMatch(data as string);
        }
      } catch (err) {
        console.error("[matchmaking] poll exception", err);
      }
    },
    [userId, supabase, navigateToMatch]
  );

  const schedulePoll = useCallback(
    (deckId: number, formatId: number | null) => {
      if (!inQueueRef.current || matchFoundRef.current) return;
      pollTimeoutRef.current = setTimeout(async () => {
        await pollOnce(deckId, formatId);
        schedulePoll(deckId, formatId);
      }, POLL_INTERVAL_MS);
    },
    [pollOnce]
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
    inQueueRef.current = true;

    // Wall-clock display timer
    timerRef.current = setInterval(() => {
      setQueueTime((prev) => prev + 1);
    }, 1000);

    // Realtime subscription FIRST so we don't miss the INSERT event our
    // opponent triggers while our initial RPC is in flight.
    const channel = supabase.channel(`matchmaking:${userId}`);
    const handleMatchRow = (row: { id: string; player1_id: string; player2_id: string; status: string }) => {
      if (matchFoundRef.current) return;
      if (row.status !== "active") return;
      if (row.player1_id !== userId && row.player2_id !== userId) return;
      // Best-effort: remove our queue entry. The RPC also does this on the
      // pairing side, so this only matters when we're player2 (matched by
      // the opponent's RPC, which deleted both queue rows already — so
      // this is usually a no-op).
      supabase.from("matchmaking_queue").delete().eq("user_id", userId).then(() => {});
      navigateToMatch(row.id);
    };
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "matches", filter: `player1_id=eq.${userId}` },
      (payload) => handleMatchRow(payload.new as Parameters<typeof handleMatchRow>[0])
    );
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "matches", filter: `player2_id=eq.${userId}` },
      (payload) => handleMatchRow(payload.new as Parameters<typeof handleMatchRow>[0])
    );
    channelRef.current = channel;
    await channel.subscribe();

    // Initial RPC: either finds an opponent and returns a match id, or
    // upserts us into the queue and returns null.
    try {
      const { data, error: rpcError } = await supabase.rpc("find_match_or_enqueue", {
        p_user_id: userId,
        p_deck_id: selectedDeckId,
        p_format_id: selectedFormatId,
      });
      if (rpcError) {
        setError(rpcError.message);
        setInQueue(false);
        inQueueRef.current = false;
        cleanupTimers();
        cleanupChannel();
        return;
      }
      if (data) {
        navigateToMatch(data as string);
        return;
      }
    } catch (err) {
      console.error("[matchmaking] initial rpc exception", err);
      setError("Erreur de connexion au matchmaking");
      setInQueue(false);
      inQueueRef.current = false;
      cleanupTimers();
      cleanupChannel();
      return;
    }

    // Heartbeat to keep our queue entry fresh past the 45s staleness cutoff.
    heartbeatRef.current = setInterval(() => {
      supabase.rpc("heartbeat_matchmaking", { p_user_id: userId }).then(({ error: hbErr }) => {
        if (hbErr) console.warn("[matchmaking] heartbeat failed", hbErr);
      });
    }, HEARTBEAT_INTERVAL_MS);

    // Backup polling — realtime should cover the "opponent matched us" path,
    // but a poll still occasionally tries to claim someone in the queue.
    schedulePoll(selectedDeckId, selectedFormatId);
  }

  async function leaveQueue() {
    inQueueRef.current = false;
    cleanupTimers();
    cleanupChannel();

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
    <div className="relative min-h-screen bg-am-bg-0 flex items-center justify-center px-4 py-12 overflow-hidden">
      <AmAtmosphere />

      <AmPanel
        corners
        glow
        className="am-animate-rise w-full max-w-md p-8 md:p-10"
      >
        <AmHeading
          as="h1"
          eyebrow="Prouve ta valeur"
          subtitle="Trouve un adversaire et bats-toi"
        >
          Jouer
        </AmHeading>

        <div className="mt-8">
          {!inQueue ? (
            <>
              {validDecks.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-am-ink-soft mb-6 font-[family-name:var(--font-crimson),serif] italic text-lg">
                    You need at least one valid deck (50 cards) to play.
                  </p>
                  <AmButton
                    variant="gold"
                    size="md"
                    onClick={() => router.push("/decks/builder")}
                  >
                    Create a Deck
                  </AmButton>
                </div>
              ) : (
                <>
                  {formats.length > 0 && (
                    <div className="mb-6">
                      <label className="block text-[11px] font-display tracking-[0.22em] uppercase text-am-gold/80 mb-3">
                        Format :
                      </label>
                      <div className="flex gap-2 flex-wrap">
                        {formats.map((f) => (
                          <button
                            key={f.id}
                            onClick={() => {
                              setSelectedFormatId(f.id);
                              const firstDeck = validDecks.find(d => d.format_id === f.id);
                              setSelectedDeckId(firstDeck?.id ?? null);
                            }}
                            className={`px-4 py-2 rounded-md border text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-am-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0 ${
                              selectedFormatId === f.id
                                ? "border-am-gold/60 bg-am-gold/15 text-am-gold-bright shadow-[0_0_18px_-6px_rgba(216,178,90,0.5)]"
                                : "border-am-gold/15 bg-am-bg-1 text-am-ink-soft hover:border-am-gold/40 hover:text-am-ink"
                            }`}
                          >
                            {f.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="am-rule mb-6" />

                  <label className="block text-[11px] font-display tracking-[0.22em] uppercase text-am-gold/80 mb-3">
                    Select your deck:
                  </label>
                  {formatDecks.length === 0 && selectedFormatId && (
                    <p className="text-am-ink-soft text-sm mb-4 font-[family-name:var(--font-crimson),serif] italic">
                      Aucun deck pour ce format. Créez-en un dans le deck builder.
                    </p>
                  )}
                  <div className="space-y-2 mb-7">
                    {formatDecks.map((deck) => (
                      <button
                        key={deck.id}
                        onClick={() => setSelectedDeckId(deck.id)}
                        className={`w-full p-4 rounded-md border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-am-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0 ${
                          selectedDeckId === deck.id
                            ? "border-am-gold/60 bg-am-gold/10 shadow-[0_0_22px_-8px_rgba(216,178,90,0.55)]"
                            : "border-am-gold/15 bg-am-bg-1 hover:border-am-gold/40 hover:bg-am-bg-3"
                        }`}
                      >
                        <div className="font-display font-semibold text-am-ink tracking-wide">
                          {deck.name}
                        </div>
                        <div className="text-xs text-am-jade mt-0.5">
                          {deck.cardCount} cards
                        </div>
                      </button>
                    ))}
                  </div>

                  {error && (
                    <p className="text-am-ember text-sm mb-4 text-center">{error}</p>
                  )}

                  <AmButton
                    variant="gold"
                    size="lg"
                    onClick={joinQueue}
                    disabled={!selectedDeckId}
                    className="w-full"
                  >
                    Find Match
                  </AmButton>
                </>
              )}

              <button
                onClick={() => router.push("/")}
                className="am-btn am-btn-ghost w-full mt-3 px-6 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-am-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0"
              >
                Back to Menu
              </button>
            </>
          ) : (
            <div className="text-center py-6">
              <div
                className="mx-auto mb-7 flex h-24 w-24 items-center justify-center rounded-full border border-am-gold/40 bg-am-bg-1/60 text-5xl am-shimmer"
                style={{ animation: "am-pulse-glow 2.2s ease-in-out infinite" }}
                aria-hidden="true"
              >
                ⚔️
              </div>
              <p className="font-display tracking-[0.18em] uppercase text-am-arcane-bright text-sm mb-3">
                Searching for opponent...
              </p>
              <p className="text-am-gold-bright text-3xl font-mono mb-2 tabular-nums">
                {formatTime(queueTime)}
              </p>
              <div className="am-rule-diamond w-32 mx-auto my-7" />
              <button
                onClick={leaveQueue}
                className="am-btn am-btn-ghost px-9 py-2.5 text-sm text-am-ember hover:!text-am-ember focus:outline-none focus-visible:ring-2 focus-visible:ring-am-ember/50 focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </AmPanel>
    </div>
  );
}
