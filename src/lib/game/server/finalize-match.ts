// Clôture d'une partie par le serveur : rejeu, décision, écriture du résultat.
// Partagée par la route finalize (appelée par les joueurs) et par la clôture
// automatique des parties inactives, pour qu'il n'existe qu'une seule règle.
import type { getAdminClient } from "@/lib/admin/requireAdmin";
import { initialStateFromSetup, setupFromSnapshot, type MatchSetupSnapshot } from "@/lib/game/match-setup";
import { replayMatch, type ActionRow, type MulliganRow } from "@/lib/game/replay";
import { decideResult, type ResultDecision } from "@/lib/game/match-result";

type Db = ReturnType<typeof getAdminClient>;

export type MatchACloturer = { id: string; player1_id: string; player2_id: string };

/** Décide du résultat et l'écrit s'il y a un vainqueur. `winnerId` nul : rien de
 *  concluant, la partie n'a pas été touchée.
 *  @throws si la lecture du journal ou l'écriture échoue. */
export async function cloturerPartie(
  db: Db,
  match: MatchACloturer,
  claimedWinner: string | null,
): Promise<ResultDecision> {
  const id = match.id;
  const players: [string, string] = [match.player1_id, match.player2_id];
  const { data: setupRow, error: setupErr } = await db.from("match_setups").select("setup").eq("match_id", id).maybeSingle();

  let decision: ResultDecision;
  if (setupErr || !setupRow) {
    decision = decideResult({
      hasSetup: false, replayFinished: false, replayWinner: null, anomalies: [],
      changedCardIds: [], missingCardIds: [], claimedWinner, players,
    });
  } else {
    const snap = setupRow.setup as MatchSetupSnapshot;
    const [{ setup, changedCardIds, missingCardIds }, actionsRes, mulligansRes] = await Promise.all([
      setupFromSnapshot(db, snap),
      db.from("match_actions").select("seq, action, author_id").eq("match_id", id).order("seq", { ascending: true }),
      db.from("match_mulligans").select("player_id, action").eq("match_id", id),
    ]);
    if (actionsRes.error) throw new Error(actionsRes.error.message);

    // Le moteur trace abondamment ; inutile d'inonder les journaux du serveur.
    const log = console.log, warn = console.warn, info = console.info, debug = console.debug;
    console.log = console.warn = console.info = console.debug = () => {};
    let replay;
    try {
      replay = replayMatch(
        initialStateFromSetup(setup, snap.decouverteAlternee),
        (mulligansRes.data ?? []) as MulliganRow[],
        (actionsRes.data ?? []) as ActionRow[],
      );
    } catch (e) {
      replay = null;
      console.error("[finalize] rejeu en échec", id, e);
    } finally {
      console.log = log; console.warn = warn; console.info = info; console.debug = debug;
    }

    decision = decideResult({
      hasSetup: true,
      replayFinished: replay?.state.phase === "finished",
      replayWinner: replay?.state.winner ?? null,
      anomalies: replay?.anomalies ?? [{ seq: null, kind: "gap", detail: "rejeu en échec" }],
      changedCardIds,
      missingCardIds,
      claimedWinner,
      players,
    });
  }

  if (!decision.winnerId) return decision;

  const update: Record<string, unknown> = {
    status: "finished",
    winner_id: decision.winnerId,
    finished_at: new Date().toISOString(),
    result_source: decision.source,
    result_notes: decision.notes,
  };
  // Un résultat « server » n'est jamais écrasé (NULL = première clôture).
  const { error } = await db
    .from("matches")
    .update(update)
    .eq("id", id)
    .or("result_source.is.null,result_source.neq.server");
  if (error) throw new Error(error.message);

  if (decision.source !== "server") console.warn("[finalize]", id, decision.source, decision.notes);
  return decision;
}
