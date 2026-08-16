// POST /api/tournaments/enter — { tournament_id }
//
// Inscription à un tournoi PAR CONSOMMATION D'UN TICKET. Aucun argent réel
// n'entre en jeu : c'est tout l'intérêt du modèle par ticket, et c'est ce qui
// fait disparaître le cas « tournoi rempli pendant le paiement ».
//
// Toute la logique — place disponible, doublon, dette, choix du ticket qui
// périme le plus tôt — vit dans `enter_tournament_with_ticket`, en une seule
// transaction. Cette route ne fait que porter l'identité de l'appelant.
import { NextResponse } from "next/server";
import { getAuthUser, getAdminClient } from "@/lib/payments/stripe";

/** Messages destinés au joueur. Les codes viennent du moteur ; les traduire
 *  ici, en un seul endroit, évite que chaque écran invente les siens. */
const MESSAGES: Record<string, string> = {
  tournament_missing: "Ce tournoi n'existe pas.",
  tournament_closed: "Les inscriptions sont fermées.",
  tournament_full: "Ce tournoi est complet.",
  already_entered: "Vous êtes déjà inscrit à ce tournoi.",
  no_ticket: "Il vous faut un ticket de tournoi valide.",
  ticket_debt: "Un remboursement a laissé un solde de tickets à régulariser.",
};

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const tournamentId = typeof body?.tournament_id === "string" ? body.tournament_id : "";
  if (!tournamentId) return NextResponse.json({ error: "tournament_id requis" }, { status: 400 });

  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc("enter_tournament_with_ticket", {
    p_user_id: user.id,
    p_tournament_id: tournamentId,
  });

  if (error) {
    console.error("[tournaments/enter]", error);
    return NextResponse.json({ error: "Inscription impossible" }, { status: 500 });
  }

  const result = data as { entered?: boolean; ticket_spent?: boolean; error?: string };

  if (result?.error) {
    // 409 et non 400 : la demande était valide, c'est l'état du monde qui s'y
    // oppose — et il peut changer.
    return NextResponse.json(
      { error: MESSAGES[result.error] ?? "Inscription impossible", code: result.error },
      { status: result.error === "tournament_missing" ? 404 : 409 },
    );
  }

  return NextResponse.json({ entered: true, ticket_spent: result?.ticket_spent ?? false });
}
