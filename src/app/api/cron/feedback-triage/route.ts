// Cron de rattrapage du tri des retours joueurs.
//
// Le tri se fait normalement tout de suite après l'envoi (`after` dans
// /api/feedback). Ce cron reprend les fils dont le tri a échoué (API
// indisponible, fonction coupée) ou qui ont reçu un message pendant qu'un tri
// tournait. Trois tentatives au plus par message : au-delà, le fil reste
// marqué avec son erreur et l'admin le relance à la main.
//
// Protégé par CRON_SECRET, comme close-stale-matches.
import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin/requireAdmin";
import { trierFil } from "@/lib/feedback/agent";

export const maxDuration = 60;

const LOT = 20;
const BUDGET_MS = 45_000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = getAdminClient();
  // Deux minutes de marge : on ne double pas un tri immédiat encore en cours.
  const avant = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data, error } = await supabase
    .from("feedback_threads")
    .select("id")
    .eq("needs_triage", true)
    .lt("triage_attempts", 3)
    .lt("last_message_at", avant)
    .order("last_message_at")
    .limit(LOT);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const debut = Date.now();
  const bilan = { trie: 0, ignore: 0, echec: 0, restants: 0 };
  for (const [i, t] of (data ?? []).entries()) {
    if (Date.now() - debut > BUDGET_MS) {
      bilan.restants = (data ?? []).length - i;
      break;
    }
    bilan[await trierFil(supabase, t.id)]++;
  }
  return NextResponse.json(bilan);
}
