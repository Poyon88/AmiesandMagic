// GET /api/payments/status?session_id=cs_...
//
// Sert la page de retour, qui SONDE en attendant la confirmation. Elle ne
// décide de rien : elle lit l'état écrit par le webhook, seul à faire foi.
//
// Le filtre sur `user_id` n'est pas décoratif : un identifiant de session est
// devinable dans une URL partagée, et personne ne doit lire le paiement d'un
// autre.
import { NextResponse } from "next/server";
import { getAuthUser, getAdminClient } from "@/lib/payments/stripe";

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "session_id requis" }, { status: 400 });

  const supabase = getAdminClient();
  const { data } = await supabase
    .from("payments")
    .select("status, type, reference, amount_cents, currency, gold_amount, created_at")
    .eq("stripe_session_id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "Paiement introuvable" }, { status: 404 });

  return NextResponse.json(data);
}
