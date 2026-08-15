// POST /api/checkout/tournament — { tournament_id, deck_id? }
//
// Ouvre une session Stripe Checkout pour une inscription en tournoi payant.
//
// Les vérifications faites ici (tournoi ouvert, place disponible, joueur non
// inscrit) sont un CONFORT, pas une garantie : entre l'ouverture de la session
// et le paiement, le tournoi peut se remplir. La vérification qui fait foi est
// refaite sous verrou dans `apply_checkout_completed`, à la réception du
// webhook, et déclenche un remboursement automatique si la place a disparu.
import { NextResponse } from "next/server";
import { requirePriceId, TOURNAMENT_ENTRY_PRICE_ENV, CHECKOUT_EXPIRY_MINUTES } from "@/lib/payments/config";
import { getStripe, getAuthUser, getAdminClient, ensureStripeCustomer, siteUrl } from "@/lib/payments/stripe";

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const tournamentId = typeof body?.tournament_id === "string" ? body.tournament_id : "";
  const deckId = typeof body?.deck_id === "string" ? body.deck_id : null;
  if (!tournamentId) return NextResponse.json({ error: "tournament_id requis" }, { status: 400 });

  const supabase = getAdminClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, status, capacity, name")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament) return NextResponse.json({ error: "Tournoi introuvable" }, { status: 404 });
  if (tournament.status !== "open") {
    return NextResponse.json({ error: "Les inscriptions sont fermées" }, { status: 409 });
  }

  const { count: taken } = await supabase
    .from("tournament_entries")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId);

  if ((taken ?? 0) >= tournament.capacity) {
    return NextResponse.json({ error: "Tournoi complet" }, { status: 409 });
  }

  const { data: already } = await supabase
    .from("tournament_entries")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (already) return NextResponse.json({ error: "Déjà inscrit" }, { status: 409 });

  // Un paiement déjà en attente pour ce tournoi : on ne rouvre pas une seconde
  // session, sinon le joueur peut payer deux fois pour une place unique.
  const { data: pending } = await supabase
    .from("payments")
    .select("stripe_session_id")
    .eq("user_id", user.id)
    .eq("type", "tournament_entry")
    .eq("reference", tournamentId)
    .eq("status", "pending")
    .maybeSingle();

  if (pending) {
    return NextResponse.json(
      { error: "Un paiement est déjà en cours pour ce tournoi", session_id: pending.stripe_session_id },
      { status: 409 },
    );
  }

  const stripe = getStripe();
  let priceId: string;
  try {
    priceId = requirePriceId(TOURNAMENT_ENTRY_PRICE_ENV);
  } catch (e) {
    console.error("[checkout/tournament] configuration", e);
    return NextResponse.json({ error: "Inscriptions indisponibles" }, { status: 503 });
  }

  const customerId = await ensureStripeCustomer(supabase, user.id, user.email);
  const base = siteUrl(request);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: user.id,
    metadata: { user_id: user.id, type: "tournament_entry", tournament_id: tournamentId },
    expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRY_MINUTES * 60,
    success_url: `${base}/paiement/succes?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/paiement/annule`,
  });

  const { error } = await supabase.from("payments").insert({
    user_id: user.id,
    stripe_session_id: session.id,
    type: "tournament_entry",
    reference: tournamentId,
    status: "pending",
  });

  if (error) {
    console.error("[checkout/tournament] insertion du paiement", error);
    await stripe.checkout.sessions.expire(session.id).catch(() => {});
    return NextResponse.json({ error: "Impossible d'ouvrir le paiement" }, { status: 500 });
  }

  // `deck_id` n'est pas encore exploité : la légalité de deck se vérifiera
  // quand le moteur de tournoi existera. On l'accepte pour ne pas avoir à
  // changer le contrat client à ce moment-là.
  void deckId;

  return NextResponse.json({ url: session.url, session_id: session.id });
}
