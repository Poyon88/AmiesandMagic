// GET /api/tickets — les tickets de tournoi du joueur connecté.
//
// Rend le compte utilisable ET le détail des péremptions : c'est la date qui
// donne son urgence au ticket, et un simple total la cacherait.
import { NextResponse } from "next/server";
import { getAuthUser, getAdminClient } from "@/lib/payments/stripe";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const supabase = getAdminClient();

  const { data: rows, error } = await supabase
    .from("tournament_tickets")
    .select("id, acquired_at, expires_at")
    .eq("user_id", user.id)
    .is("spent_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true });

  if (error) {
    console.error("[tickets] lecture", error);
    return NextResponse.json({ error: "Lecture impossible" }, { status: 500 });
  }

  const { data: wallet } = await supabase
    .from("wallets").select("ticket_debt").eq("user_id", user.id).maybeSingle();

  return NextResponse.json({
    available: rows?.length ?? 0,
    debt: wallet?.ticket_debt ?? 0,
    // `expires_at` est une borne EXCLUSIVE : le dernier jour utilisable est la
    // veille. Les écrans affichent `last_day`, jamais `expires_at`, sinon ils
    // annonceraient un jour de trop.
    tickets: (rows ?? []).map((t) => ({
      id: t.id,
      acquired_at: t.acquired_at,
      expires_at: t.expires_at,
      last_day: new Date(new Date(t.expires_at).getTime() - 86_400_000).toISOString(),
    })),
  });
}
