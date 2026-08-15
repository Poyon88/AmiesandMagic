// GET /api/payments — historique des paiements du joueur connecté.
//
// Lecture seule, bornée au demandeur. Aucune donnée carte n'existe de notre
// côté : Checkout hébergé les garde chez Stripe, nous n'en voyons jamais.
import { NextResponse } from "next/server";
import { getAuthUser, getAdminClient } from "@/lib/payments/stripe";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("payments")
    .select("id, type, reference, amount_cents, currency, status, gold_amount, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[payments] lecture", error);
    return NextResponse.json({ error: "Lecture impossible" }, { status: 500 });
  }

  return NextResponse.json({ payments: data ?? [] });
}
