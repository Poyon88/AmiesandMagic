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
import { cloturerPartie } from "@/lib/game/server/finalize-match";

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

  let decision;
  try {
    decision = await cloturerPartie(db, match, claimedWinner);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "clôture impossible" }, { status: 500 });
  }

  // Rien de concluant et aucun vainqueur déclaré : la partie reste ouverte.
  if (!decision.winnerId) {
    return NextResponse.json({ winnerId: null, source: decision.source, notes: decision.notes }, { status: 202 });
  }
  return NextResponse.json(decision);
}
