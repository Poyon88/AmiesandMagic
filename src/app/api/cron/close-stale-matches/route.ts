// GET /api/cron/close-stale-matches — clôt les parties restées « active » sans
// activité (voir vercel.json). Vercel envoie `Authorization: Bearer CRON_SECRET`.
//
// Une partie dont le dernier état a un vainqueur passe par la clôture normale.
// Les autres ont été interrompues : elles deviennent `abandoned`, sans vainqueur
// ni résultat d'équilibrage. Un tournoi appliquera ses propres règles de forfait.
import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin/requireAdmin";
import { derniereActivite, partieInactive, DELAI_INACTIVITE_MS } from "@/lib/game/match-result";
import { cloturerPartie } from "@/lib/game/server/finalize-match";

/** Par passage : le rejeu est coûteux, le reste attendra le suivant. */
const LOT = 100;
const BUDGET_MS = 45_000;

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const debut = Date.now();
  const db = getAdminClient();
  const { data: parties, error } = await db
    .from("matches")
    .select("id, player1_id, player2_id, created_at")
    .eq("status", "active")
    .lt("created_at", new Date(debut - DELAI_INACTIVITE_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(LOT);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bilan = { examinees: 0, encoreActives: 0, cloturees: 0, abandonnees: 0, erreurs: 0 };
  for (const partie of parties ?? []) {
    if (Date.now() - debut > BUDGET_MS) break;
    bilan.examinees++;
    try {
      const [{ data: action }, { data: etat }] = await Promise.all([
        db.from("match_actions").select("created_at").eq("match_id", partie.id)
          .order("seq", { ascending: false }).limit(1).maybeSingle(),
        db.from("match_state").select("updated_at, state->>phase, state->>winner").eq("match_id", partie.id).maybeSingle(),
      ]);
      const snapshot = etat as { updated_at: string | null; phase: string | null; winner: string | null } | null;
      const signeDeVie = derniereActivite([partie.created_at, action?.created_at, snapshot?.updated_at]);
      if (!partieInactive(signeDeVie, Date.now())) {
        bilan.encoreActives++;
        continue;
      }

      const declare = snapshot?.phase === "finished" ? snapshot.winner : null;
      const decision = await cloturerPartie(db, partie, declare);
      if (decision.winnerId) {
        bilan.cloturees++;
        continue;
      }

      const { error: abandon } = await db
        .from("matches")
        .update({
          status: "abandoned",
          finished_at: new Date().toISOString(),
          result_notes: ["inactivité"],
        })
        .eq("id", partie.id)
        .eq("status", "active");
      if (abandon) throw new Error(abandon.message);
      bilan.abandonnees++;
    } catch (e) {
      bilan.erreurs++;
      console.error("[cron matches]", partie.id, e);
    }
  }

  return NextResponse.json(bilan);
}
