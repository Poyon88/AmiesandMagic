// POST /api/matches/[id]/finalize — { claimedWinner? } — clôt la partie.
//
// Le résultat n'est plus écrit par le navigateur : le serveur rejoue la partie
// (configuration figée au lancement + mulligans + journal signé) et décide.
// Voir decideResult pour les trois provenances (server / review / client).
//
// Appelée par les DEUX clients à la fin : idempotente, et un résultat
// « server » n'est jamais rétrogradé. Un résultat « review » ou « client » peut
// être réévalué — le second appel arrive souvent après que la dernière action a
// été journalisée, et le rejeu peut alors aboutir.
import { NextResponse } from "next/server";
import { matchContext } from "@/lib/game/server/match-auth";
import { initialStateFromSetup, setupFromSnapshot, type MatchSetupSnapshot } from "@/lib/game/match-setup";
import { replayMatch, type ActionRow, type MulliganRow } from "@/lib/game/replay";
import { decideResult } from "@/lib/game/match-result";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await matchContext(id);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { db, match } = ctx;

  let claimedWinner: string | null = null;
  try {
    const body = await request.json();
    if (typeof body?.claimedWinner === "string") claimedWinner = body.claimedWinner;
  } catch { /* corps vide accepté */ }

  if (match.status === "finished" && match.result_source === "server") {
    return NextResponse.json({ winnerId: match.winner_id, source: "server", already: true });
  }

  const players: [string, string] = [match.player1_id, match.player2_id];
  const { data: setupRow, error: setupErr } = await db.from("match_setups").select("setup").eq("match_id", id).maybeSingle();

  let decision;
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
    if (actionsRes.error) return NextResponse.json({ error: actionsRes.error.message }, { status: 500 });

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

  // Rien de concluant et aucun vainqueur déclaré : la partie reste ouverte.
  if (!decision.winnerId) {
    return NextResponse.json({ winnerId: null, source: decision.source, notes: decision.notes }, { status: 202 });
  }

  const update: Record<string, unknown> = {
    status: "finished",
    winner_id: decision.winnerId,
    finished_at: new Date().toISOString(),
    result_source: decision.source,
    result_notes: decision.notes,
  };
  // Un résultat « server » n'est jamais écrasé (NULL = première clôture).
  let { error } = await db
    .from("matches")
    .update(update)
    .eq("id", id)
    .or("result_source.is.null,result_source.neq.server");
  if (error && /result_source|result_notes/.test(error.message)) {
    // Migration non appliquée : clôture à l'ancienne, sans provenance.
    const r = await db.from("matches").update({ status: "finished", winner_id: decision.winnerId, finished_at: update.finished_at }).eq("id", id);
    error = r.error;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (decision.source !== "server") console.warn("[finalize]", id, decision.source, decision.notes);
  return NextResponse.json(decision);
}
