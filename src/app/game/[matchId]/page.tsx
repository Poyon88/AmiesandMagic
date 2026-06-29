"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useGameStore } from "@/lib/store/gameStore";
import { useAudioStore } from "@/lib/store/audioStore";
import SfxEngine from "@/lib/audio/SfxEngine";
import GameBoard from "@/components/game/GameBoard";
import OrientationLock from "@/components/shared/OrientationLock";
import type { Card, GameAction, GameState, HeroDefinition, HeroPowerEffect, Race } from "@/lib/game/types";
import { syncHash, reconcileVerdict } from "@/lib/game/stateHash";

interface HeroRow {
  id: number;
  name: string;
  race: string;
  faction?: string | null;
  clan?: string | null;
  power_name: string;
  power_cost: number;
  power_effect: HeroPowerEffect;
  power_description: string;
  power_usage_limit?: number | null;
  glb_url?: string | null;
  thumbnail_url?: string | null;
  power_image_url?: string | null;
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
    faction: row.faction ?? null,
    clan: row.clan ?? null,
    powerName: row.power_name,
    powerCost: row.power_cost,
    powerEffect: row.power_effect,
    powerDescription: row.power_description,
    powerUsageLimit: row.power_usage_limit ?? null,
    glbUrl: row.glb_url ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    powerImageUrl: row.power_image_url ?? null,
  };
}

export default function GamePage() {
  const { matchId } = useParams<{ matchId: string }>();
  const supabase = createClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const presencePollRef = useRef<NodeJS.Timeout | null>(null);

  // Re-fetch the SFX catalog on game page mount so recently admin-uploaded
  // sound effects (summon, timer_warning, …) are picked up without requiring
  // a full app reload.
  useEffect(() => {
    fetch("/api/sfx", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        const urls: Record<string, string> = {};
        for (const t of data) urls[t.event_type] = t.file_url;
        useAudioStore.getState().setStandardSfxUrls(urls);
        SfxEngine.getInstance().preload(Object.values(urls));
      })
      .catch(() => {});
  }, []);
  const [phase, setPhase] = useState<"loading" | "waiting" | "playing">("loading");
  const [error, setError] = useState("");
  // Set when an action could not be persisted to match_actions after retries.
  // A missing row means the opponent can't resync past that seq, so we surface
  // a non-blocking banner inviting a reload rather than failing silently.
  const [persistWarning, setPersistWarning] = useState(false);
  const matchDataRef = useRef<{
    match: MatchData;
    p1Cards: { card: Card; quantity: number }[];
    p2Cards: { card: Card; quantity: number }[];
    p1Hero: HeroDefinition | null;
    p2Hero: HeroDefinition | null;
    factionCards: Card[];
    allSpells: Card[];
    p1OwnedLimitedIds: number[];
    p2OwnedLimitedIds: number[];
  } | null>(null);
  const gameInitializedRef = useRef(false);
  // Per-match monotonic action sequence. The sender increments and tags
  // each broadcast ; the receiver detects gaps and replays missing rows
  // from match_actions. Both clients converge on the same lastSeq because
  // only the active player can dispatch (UI lock) and the sender always
  // increments by exactly 1 per dispatched action.
  const lastSeqRef = useRef(0);
  // Async-safe lock so concurrent broadcasts can't trigger overlapping
  // gap-fetches that would replay the same seqs twice.
  const inflightCatchupRef = useRef<Promise<void> | null>(null);
  // Rattrapage de l'état depuis match_actions ; défini dans loadMatch et appelé
  // au réveil de veille / retour réseau / re-souscription realtime.
  const resyncRef = useRef<(() => void) | null>(null);
  // Seq d'un snapshot à écrire dès que l'animation de l'action locale se termine
  // (le commit du gameState est différé pendant l'animation — cf. writeSnapshot).
  const pendingSnapshotSeqRef = useRef<number | null>(null);
  // Dernier checkpoint {seq, hash} reçu de l'adversaire (hash faisant autorité
  // de l'état post-action). Comparé à notre propre hash dès qu'on a appliqué le
  // même seq et qu'on est au repos ; sur divergence on adopte le snapshot.
  const pendingCheckpointRef = useRef<{ seq: number; hash: string } | null>(null);
  const reconcileRef = useRef<(() => void) | null>(null);

  const {
    setGameState,
    setLocalPlayerId,
    initGame,
    setOwnedLimitedCardIds,
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

        // Fetch both player deck cards and hero data.
        // Token templates go through the `/api/token-templates` endpoint
        // (service-role) instead of a direct Supabase read — the table has
        // no public RLS read policy, so a client-side
        // `supabase.from("token_templates").select("*")` returns []
        // silently and creature spawns from Convocation X / Convocations
        // multiples / Lycanthropie X end up looking up an empty registry
        // at game time.
        const [p1DeckCards, p2DeckCards, p1DeckData, p2DeckData, tokenTemplatesJson, defaultBoardRes, p1CollectionsJson, p2CollectionsJson] = await Promise.all([
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
            .select("hero_id, board_id, card_back_id, heroes(*), card_back:card_back_id(image_url)")
            .eq("id", match.player1_deck_id)
            .single(),
          supabase
            .from("decks")
            .select("hero_id, board_id, card_back_id, heroes(*), card_back:card_back_id(image_url)")
            .eq("id", match.player2_deck_id)
            .single(),
          fetch("/api/token-templates").then((r) => (r.ok ? r.json() : [])),
          supabase
            .from("game_boards")
            .select("id")
            .eq("is_default", true)
            .eq("is_active", true)
            .maybeSingle(),
          // Owned-limited card ids for both players. RLS on card_prints
          // hides the opponent's rows from a direct supabase read, so we
          // proxy through /api/collections (service role).
          fetch(`/api/collections?userId=${match.player1_id}`).then((r) => (r.ok ? r.json() : { limitedCardIds: [] })),
          fetch(`/api/collections?userId=${match.player2_id}`).then((r) => (r.ok ? r.json() : { limitedCardIds: [] })),
        ]);

        // Store token templates
        useGameStore.getState().setTokenTemplates(Array.isArray(tokenTemplatesJson) ? tokenTemplatesJson : []);

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
        const [factionCardsRes, manaSparkRes, allSpellsRes] = await Promise.all([
          supabase.from("cards").select("*").in("faction", Array.from(deckFactions)),
          supabase.from("cards").select("*").eq("name", "Mana Spark").eq("card_type", "spell").limit(1),
          // Concentration X: needs every spell across every faction/set, not
          // just the deck-faction subset that factionCardPool covers.
          supabase.from("cards").select("*").eq("card_type", "spell"),
        ]);
        const factionCards = factionCardsRes.data ?? [];
        // Ensure Mana Spark is in the pool (may not be if Humains not in deck factions)
        const manaSpark = manaSparkRes.data?.[0];
        if (manaSpark && !factionCards.find((c: { id: number }) => c.id === manaSpark.id)) {
          factionCards.push(manaSpark);
        }
        const allSpells = (allSpellsRes.data ?? []) as import("@/lib/game/types").Card[];

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
          // Aliasing the directly-linked single track field to `single_music_track`
          // (instead of the previous `music_tracks` alias) prevents a potential
          // shadowing of the actual `music_tracks` table reference inside the
          // embedded `game_board_music_tracks(...)` join — PostgREST resolves
          // embed names against the schema, and reusing a table name as a
          // top-level alias has produced inconsistent shapes in some cases.
          const { data: boardRow, error: boardErr } = await supabase
            .from("game_boards")
            .select("id, name, image_url, layout, graveyard_image_url, single_music_track:music_track_id(file_url), tense_track:tense_track_id(file_url), victory_track:victory_track_id(file_url), defeat_track:defeat_track_id(file_url), game_board_music_tracks(track_id, music_tracks(file_url))")
            .eq("id", targetBoardId)
            .maybeSingle();
          if (boardErr) console.warn("[game] board load error:", boardErr);
          if (boardRow) {
            useGameStore.getState().setBoardImageUrl(boardRow.image_url);
            const board = boardRow as Record<string, unknown>;
            useGameStore.getState().setBoardLayout((board.layout as string) ?? "classic");
            useGameStore.getState().setBoardGraveyardImageUrl((board.graveyard_image_url as string | null) ?? null);
            const musicData = board.single_music_track as { file_url: string } | null;
            const tenseData = board.tense_track as { file_url: string } | null;
            const victoryData = board.victory_track as { file_url: string } | null;
            const defeatData = board.defeat_track as { file_url: string } | null;
            // PostgREST can return the embedded `music_tracks` either as an
            // object or as an array; normalize both shapes.
            const playlistRows = (board.game_board_music_tracks as { music_tracks: { file_url: string } | { file_url: string }[] | null }[] | null) ?? [];
            const playlistUrls = playlistRows
              .flatMap((r) => {
                const mt = r.music_tracks;
                if (!mt) return [];
                return Array.isArray(mt) ? mt.map((m) => m.file_url) : [mt.file_url];
              })
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

        // Card backs — extract each deck's chosen card back and assign to local vs opponent.
        const p1CardBack = (p1DeckData.data as { card_back: { image_url: string } | null } | null)?.card_back;
        const p2CardBack = (p2DeckData.data as { card_back: { image_url: string } | null } | null)?.card_back;
        const localIsP1 = user.id === match.player1_id;
        const myBackUrl = (localIsP1 ? p1CardBack : p2CardBack)?.image_url ?? null;
        const oppBackUrl = (localIsP1 ? p2CardBack : p1CardBack)?.image_url ?? null;
        // Fallback: default card back if a deck has none configured.
        let fallbackBackUrl: string | null = null;
        if (!myBackUrl || !oppBackUrl) {
          const { data: def } = await supabase
            .from("card_backs")
            .select("image_url")
            .eq("is_default", true)
            .eq("is_active", true)
            .maybeSingle();
          fallbackBackUrl = def?.image_url ?? null;
        }
        useGameStore.getState().setMyCardBackUrl(myBackUrl ?? fallbackBackUrl);
        useGameStore.getState().setOpponentCardBackUrl(oppBackUrl ?? fallbackBackUrl);

        // Store match data for later initialization
        const p1OwnedLimitedIds = Array.isArray(p1CollectionsJson?.limitedCardIds) ? p1CollectionsJson.limitedCardIds : [];
        const p2OwnedLimitedIds = Array.isArray(p2CollectionsJson?.limitedCardIds) ? p2CollectionsJson.limitedCardIds : [];
        matchDataRef.current = { match, p1Cards, p2Cards, p1Hero, p2Hero, factionCards: (factionCards ?? []) as unknown as Card[], allSpells, p1OwnedLimitedIds, p2OwnedLimitedIds };

        // Join realtime channel with presence
        const channel = supabase.channel(`match:${matchId}`, {
          config: { broadcast: { self: false } },
        });

        // Applique une action reçue (broadcast ou rattrapage). Sérialisé via le
        // pipeline d'animation : si une anim joue déjà, on empile.
        const applyOne = (a: GameAction) => {
          const store = useGameStore.getState();
          if (!store.gameState) return;
          if (a.type === "concede") {
            store.dispatchAction(a);
          } else if (store.isAnimating) {
            useGameStore.setState((s) => ({
              pendingIncomingActions: [...s.pendingIncomingActions, a],
            }));
          } else {
            store.dispatchAction(a);
          }
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
        };

        // Rattrape TOUTES les actions persistées au-delà de lastSeq. Appelé au
        // réveil de veille (visibilitychange), au retour réseau (online) et à la
        // re-souscription realtime (SUBSCRIBED) — car pendant la veille le
        // websocket meurt et plus aucun broadcast n'arrive pour déclencher le
        // rattrapage de gap habituel. Sérialisé avec les gap-fetch.
        const resyncFromLog = () => {
          if (!useGameStore.getState().gameState) return; // partie pas encore initialisée
          const run = (inflightCatchupRef.current ?? Promise.resolve()).then(async () => {
            // 1) Adopte le snapshot serveur faisant autorité s'il nous devance.
            //    Récupère d'un coup l'état (RNG inclus via state.rngState) après
            //    une veille/déconnexion où des actions ont pu être manquées OU le
            //    rejeu diverger. Garde !isAnimating : setGameState court-circuite
            //    la file d'animation. Le rejeu du log ci-dessous complète ensuite
            //    avec les actions plus récentes que le snapshot.
            if (!useGameStore.getState().isAnimating) {
              const { data: snap } = await supabase
                .from("match_state")
                .select("seq, state")
                .eq("match_id", matchId)
                .maybeSingle();
              const snapSeq = snap?.seq as number | undefined;
              if (snap && snapSeq != null && snapSeq > lastSeqRef.current) {
                const local = useGameStore.getState().gameState;
                if (local) {
                  // Ré-attache les pools statiques retirés du snapshot (chaque
                  // client les a déjà en mémoire depuis l'init du match).
                  useGameStore.getState().setGameState({
                    ...(snap.state as GameState),
                    factionCardPool: local.factionCardPool,
                    allSpellsPool: local.allSpellsPool,
                    tokenTemplates: local.tokenTemplates,
                  });
                  lastSeqRef.current = snapSeq;
                }
              }
            }
            // 2) Complète avec les actions journalisées après notre seq courant.
            const { data: missing, error } = await supabase
              .from("match_actions")
              .select("seq, action")
              .eq("match_id", matchId)
              .gt("seq", lastSeqRef.current)
              .order("seq", { ascending: true });
            if (error) {
              console.error("[match] resync failed", error);
              return;
            }
            for (const row of missing ?? []) {
              applyOne(row.action as GameAction);
              lastSeqRef.current = row.seq as number;
            }
            reconcileCheckpoint();
          });
          inflightCatchupRef.current = run;
          run.finally(() => {
            if (inflightCatchupRef.current === run) inflightCatchupRef.current = null;
          });
        };
        resyncRef.current = resyncFromLog;

        // Réconciliation anti-désync. L'adversaire diffuse, après chaque action,
        // un hash faisant autorité de son état post-action (cf. writeSnapshot).
        // Dès qu'on a appliqué le même seq et qu'aucune animation ne joue, on
        // compare ; sur divergence avérée (non-déterminisme du moteur OU action
        // perdue passée sous le radar du gap-recovery) on adopte le snapshot
        // serveur de ce seq. Purement additif : ne se déclenche que sur mismatch
        // confirmé, jamais sur le chemin in-order/gap normal.
        const reconcileCheckpoint = () => {
          const cp = pendingCheckpointRef.current;
          if (!cp) return;
          const store = useGameStore.getState();
          const gs = store.gameState;
          const localHash = gs ? syncHash(gs) : null;
          // Pré-vérif synchrone (sans lecture DB) : in-sync / pas aligné → rien.
          const pre = reconcileVerdict({
            localSeq: lastSeqRef.current,
            localHash,
            checkpointSeq: cp.seq,
            checkpointHash: cp.hash,
            isAnimating: store.isAnimating,
            snapSeq: null,
          });
          if (pre === "ok" || pre === "stale") { pendingCheckpointRef.current = null; return; }
          if (pre === "wait") return; // re-tenté après catch-up / fin d'animation
          // pre === "refetch" : divergence à seq égal → lit le snapshot et adopte.
          const run = (inflightCatchupRef.current ?? Promise.resolve()).then(async () => {
            const cur = pendingCheckpointRef.current;
            if (!cur || cur.seq !== cp.seq) return; // remplacé par un checkpoint plus récent
            const { data: snap } = await supabase
              .from("match_state")
              .select("seq, state")
              .eq("match_id", matchId)
              .maybeSingle();
            const snapSeq = (snap?.seq as number | undefined) ?? null;
            const s = useGameStore.getState();
            const v = reconcileVerdict({
              localSeq: lastSeqRef.current,
              localHash: s.gameState ? syncHash(s.gameState) : null,
              checkpointSeq: cur.seq,
              checkpointHash: cur.hash,
              isAnimating: s.isAnimating,
              snapSeq,
            });
            if (v === "adopt" && snap) {
              const local = s.gameState;
              if (local && !s.isAnimating && lastSeqRef.current === cur.seq) {
                useGameStore.getState().setGameState({
                  ...(snap.state as GameState),
                  factionCardPool: local.factionCardPool,
                  allSpellsPool: local.allSpellsPool,
                  tokenTemplates: local.tokenTemplates,
                });
                console.warn("[match] checkpoint mismatch — adopted authoritative snapshot", { seq: cur.seq });
              }
              pendingCheckpointRef.current = null;
            } else if (v === "refetch") {
              setTimeout(() => reconcileRef.current?.(), 400); // snapshot pas encore à jour
            } else if (v !== "wait") {
              pendingCheckpointRef.current = null; // ok / stale : plus rien à faire
            }
          });
          inflightCatchupRef.current = run;
          run.finally(() => { if (inflightCatchupRef.current === run) inflightCatchupRef.current = null; });
        };
        reconcileRef.current = reconcileCheckpoint;

        channel
          .on("broadcast", { event: "game_action" }, (payload) => {
            // Payload shape evolved: legacy broadcasts are bare actions, the
            // new shape is { action, seq }. Coerce both so an old client
            // mid-upgrade doesn't break — but seq=null actions won't trigger
            // gap recovery, they're applied as-is.
            const raw = payload.payload as GameAction | { action: GameAction; seq: number };
            const incomingAction: GameAction = "action" in raw ? raw.action : raw;
            const incomingSeq: number | null = "action" in raw ? raw.seq : null;

            // Legacy / untracked: apply as-is, can't detect or repair gaps.
            if (incomingSeq == null) {
              applyOne(incomingAction);
              return;
            }

            // Already applied (duplicate, or a stale broadcast we covered
            // via gap-fetch) — drop silently.
            if (incomingSeq <= lastSeqRef.current) return;

            // In-order : apply directly.
            if (incomingSeq === lastSeqRef.current + 1) {
              applyOne(incomingAction);
              lastSeqRef.current = incomingSeq;
              reconcileCheckpoint();
              return;
            }

            // Gap detected. Fetch the missing range from the persisted log
            // and replay in order, then apply the incoming action. Serialize
            // catchups so two near-simultaneous broadcasts don't both fetch
            // and double-apply.
            const catchup = (inflightCatchupRef.current ?? Promise.resolve()).then(async () => {
              if (incomingSeq <= lastSeqRef.current) {
                applyOne(incomingAction);
                if (incomingSeq > lastSeqRef.current) lastSeqRef.current = incomingSeq;
                return;
              }
              const { data: missing, error: missingErr } = await supabase
                .from("match_actions")
                .select("seq, action")
                .eq("match_id", matchId)
                .gt("seq", lastSeqRef.current)
                .lt("seq", incomingSeq)
                .order("seq", { ascending: true });
              if (missingErr) {
                console.error("[match] gap fetch failed", missingErr);
                return;
              }
              for (const row of missing ?? []) {
                applyOne(row.action as GameAction);
                lastSeqRef.current = row.seq as number;
              }
              applyOne(incomingAction);
              lastSeqRef.current = incomingSeq;
              reconcileCheckpoint();
            });
            inflightCatchupRef.current = catchup;
            catchup.finally(() => {
              if (inflightCatchupRef.current === catchup) {
                inflightCatchupRef.current = null;
              }
            });
          })
          .on("broadcast", { event: "mulligan" }, (payload) => {
            // Confirmation de mulligan de l'adversaire, hors voie seq (cf.
            // handleAction). Appliquée de façon idempotente : on ignore si ce
            // joueur a déjà confirmé (applyMulligan re-piocherait sinon) ou si on
            // a déjà quitté la phase mulligan — couvre les doublons de broadcast
            // et les arrivées tardives.
            const raw = payload.payload as { action: GameAction } | null;
            const a = raw?.action;
            if (!a || a.type !== "mulligan") return;
            const st = useGameStore.getState().gameState;
            if (!st || st.phase !== "mulligan") return;
            const pIdx = st.players.findIndex((p) => p.id === a.playerId);
            if (pIdx === -1 || st.mulliganReady[pIdx]) return;
            applyOne(a);
          })
          .on("broadcast", { event: "checkpoint" }, (payload) => {
            const cp = payload.payload as { seq: number; hash: string } | null;
            if (!cp || typeof cp.seq !== "number" || typeof cp.hash !== "string") return;
            const prev = pendingCheckpointRef.current;
            if (!prev || cp.seq >= prev.seq) pendingCheckpointRef.current = cp;
            reconcileCheckpoint();
          })
          .on("presence", { event: "sync" }, () => tryInit("sync"))
          .subscribe(async (status) => {
            console.log("[match] channel status", status);
            if (status === "SUBSCRIBED") {
              // Re-souscription (notamment après une coupure de veille) : on
              // rattrape les actions manquées pendant que le socket était mort.
              resyncFromLog();
              try {
                const res = await channel.track({ user_id: user.id });
                console.log("[match] presence tracked", res);
              } catch (e) {
                console.error("[match] presence track failed", e);
                // Retry once after 1s — covers transient WebSocket hiccups
                setTimeout(() => {
                  channel.track({ user_id: user.id }).catch((e2) =>
                    console.error("[match] presence track retry failed", e2)
                  );
                }, 1000);
              }
            }
          });

        // Init helper — called both by presence sync event AND the polling
        // fallback below. Sync events can occasionally be missed (transient
        // realtime hiccup, slow loader on one side), so we re-check every
        // 2s while in waiting phase as a safety net.
        function tryInit(source: "sync" | "poll") {
          if (gameInitializedRef.current) return;
          if (!matchDataRef.current) return;
          const state = channel.presenceState();
          const playerCount = Object.keys(state).length;
          if (playerCount < 2) return;
          console.log(`[match] init game from ${source} (players=${playerCount})`);
          gameInitializedRef.current = true;
          const { match: m, p1Cards: p1, p2Cards: p2, p1Hero, p2Hero, factionCards, allSpells, p1OwnedLimitedIds, p2OwnedLimitedIds } = matchDataRef.current;
          const seed = parseInt(matchId.replace(/-/g, "").slice(0, 8), 16);
          const firstPlayer: 0 | 1 = seed % 2 === 0 ? 0 : 1;
          initGame(m.player1_id, m.player2_id, p1, p2, firstPlayer, seed, p1Hero, p2Hero, factionCards, allSpells);
          setOwnedLimitedCardIds(p1OwnedLimitedIds, p2OwnedLimitedIds);
          setPhase("playing");
          if (presencePollRef.current) {
            clearInterval(presencePollRef.current);
            presencePollRef.current = null;
          }
        }

        channelRef.current = channel;
        setPhase("waiting");

        // Polling fallback against missed presence sync events.
        presencePollRef.current = setInterval(() => tryInit("poll"), 2000);
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
      if (presencePollRef.current) {
        clearInterval(presencePollRef.current);
        presencePollRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Réveil de veille (iPad) / retour réseau : forcer un rattrapage immédiat des
  // actions persistées. Pendant la veille le websocket realtime meurt, donc plus
  // aucun broadcast n'arrive pour déclencher le rattrapage habituel — sans ça
  // l'état (plateau + timer dérivé de turnStartedAt) reste figé/décalé.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") resyncRef.current?.();
    };
    const onOnline = () => resyncRef.current?.();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  // Persist an action row to match_actions, the source of truth used by gap
  // recovery / resync. Runs off the broadcast path (latency unchanged) but is
  // retried with backoff: a lost row leaves a permanent hole in the log that
  // the opponent can never resync past, causing a permanent desync. A unique
  // violation (23505) means the row is already there — treat as success.
  const persistAction = useCallback(
    async (seq: number, action: GameAction) => {
      const MAX_ATTEMPTS = 5;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const { error } = await supabase
          .from("match_actions")
          .insert({ match_id: matchId, seq, action });
        if (!error || error.code === "23505") return;
        console.error(
          `[match] persist action failed (attempt ${attempt}/${MAX_ATTEMPTS})`,
          { seq, error }
        );
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 300 * attempt));
        } else {
          // Exhausted retries — the log now has a hole at this seq.
          setPersistWarning(true);
        }
      }
    },
    [matchId, supabase]
  );

  // Upsert the authoritative full GameState into match_state, tagged with the
  // action's seq. This is the source of truth a peer adopts on resync (vs only
  // replaying the action log). The heavy static card pools are stripped — each
  // client already holds them and re-attaches on adopt — keeping the row small.
  // Fire-and-forget: snapshots are a recovery aid; the action log is primary,
  // and a stale/older snapshot is simply ignored by peers already ahead of it.
  const writeSnapshot = useCallback(
    (seq: number) => {
      const gs = useGameStore.getState().gameState;
      if (!gs) return;
      const { factionCardPool: _f, allSpellsPool: _a, tokenTemplates: _t, ...lean } = gs;
      void _f; void _a; void _t;
      supabase
        .from("match_state")
        .upsert(
          { match_id: matchId, seq, state: lean, updated_at: new Date().toISOString() },
          { onConflict: "match_id" }
        )
        .then(({ error }) => {
          if (error) console.error("[match] snapshot upsert failed", { seq, error });
        });
      // Diffuse le hash faisant autorité de cet état post-action. Le pair le
      // compare au sien une fois ce seq appliqué et adopte le snapshot ci-dessus
      // en cas de divergence silencieuse (cf. reconcileCheckpoint).
      channelRef.current?.send({
        type: "broadcast",
        event: "checkpoint",
        payload: { seq, hash: syncHash(gs) },
      });
    },
    [matchId, supabase]
  );

  // Broadcast actions to opponent. Each broadcast carries a per-match
  // monotonic seq so the receiver can detect gaps and fetch missing rows
  // from match_actions. Broadcast goes out immediately; persistence is
  // retried in the background (persistAction) so the action log stays
  // gap-free for resync.
  const handleAction = useCallback(
    (action: GameAction) => {
      // Le mulligan est la SEULE action que les deux joueurs peuvent émettre
      // simultanément. Le seq monotone est partagé et assigné par l'émetteur :
      // en jeu tour-par-tour un seul client émet à la fois, mais au mulligan les
      // deux assignent seq=1 → chacun rejette celui de l'autre comme doublon
      // (incomingSeq <= lastSeqRef) → mulligan figé. On le route donc sur un
      // event dédié IDEMPOTENT, hors de la voie seq. L'application locale a déjà
      // eu lieu dans le store (confirmMulligan) ; ici on ne fait que prévenir le
      // pair. La voie seq démarre proprement à la 1re action de tour (lastSeqRef
      // reste à 0 pendant le mulligan).
      if (action.type === "mulligan") {
        channelRef.current?.send({
          type: "broadcast",
          event: "mulligan",
          payload: { action },
        });
        // Si ce confirm a fait basculer en jeu, on fige un snapshot (le mulligan
        // n'étant pas dans le log seq, la reprise après reconnexion s'appuie sur
        // ce snapshot tant qu'aucune action de tour n'a encore été persistée).
        const st = useGameStore.getState();
        if (st.gameState?.phase === "playing" && !st.isAnimating) {
          writeSnapshot(lastSeqRef.current);
        }
        return;
      }

      const seq = lastSeqRef.current + 1;
      lastSeqRef.current = seq;

      channelRef.current?.send({
        type: "broadcast",
        event: "game_action",
        payload: { action, seq },
      });

      void persistAction(seq, action);

      // Snapshot the post-action state. On the fast path the store committed it
      // synchronously (write now); during an animation the gameState commit is
      // deferred to phaseUnlock, so defer the snapshot until the animation ends
      // (the isAnimating→false subscription below picks it up).
      if (useGameStore.getState().isAnimating) {
        pendingSnapshotSeqRef.current = seq;
      } else {
        writeSnapshot(seq);
      }

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
    [matchId, supabase, persistAction, writeSnapshot]
  );

  // Deferred-snapshot drain: when an animated local action finishes (the
  // animation pipeline flips isAnimating true→false and commits the new
  // gameState), write the snapshot that handleAction parked for it.
  useEffect(() => {
    const unsub = useGameStore.subscribe((state, prev) => {
      if (prev.isAnimating && !state.isAnimating) {
        if (pendingSnapshotSeqRef.current != null) {
          const seq = pendingSnapshotSeqRef.current;
          pendingSnapshotSeqRef.current = null;
          writeSnapshot(seq);
        }
        // L'animation bloquait toute comparaison de checkpoint : re-tente
        // maintenant que l'état est commité et le client au repos.
        reconcileRef.current?.();
      }
    });
    return unsub;
  }, [writeSnapshot]);

  if (error) {
    return (
      <>
        <OrientationLock />
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
      </>
    );
  }

  if (phase === "loading" || phase === "waiting") {
    return (
      <>
        <OrientationLock />
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-bounce">⚔️</div>
            <p className="text-foreground/50">
              {phase === "loading" ? "Loading match..." : "Waiting for opponent..."}
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <OrientationLock />
      {persistWarning && (
        <div
          role="alert"
          className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-3 px-4 py-2 bg-red-900/90 text-white text-xs sm:text-sm backdrop-blur-sm"
          style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
        >
          <span>
            Une action n&apos;a pas pu être enregistrée — risque de désynchronisation.
            Rechargez la page pour resynchroniser.
          </span>
          <button
            onClick={() => window.location.reload()}
            className="shrink-0 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 font-bold"
          >
            Recharger
          </button>
          <button
            onClick={() => setPersistWarning(false)}
            aria-label="Fermer"
            className="shrink-0 px-1.5 leading-none text-base hover:opacity-80"
          >×</button>
        </div>
      )}
      <GameBoard onAction={handleAction} />
    </>
  );
}
