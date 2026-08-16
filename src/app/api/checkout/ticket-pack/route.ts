// POST /api/checkout/ticket-pack — { pack_code }
//
// Achat de TICKETS de tournoi. Le client n'envoie qu'un code : le prix vient du
// `price_id` configuré côté serveur.
//
// ⚠️ Cette route ne crédite rien et n'inscrit à rien. Les tickets n'arrivent
// qu'à la réception du webhook `checkout.session.completed`, et l'inscription à
// un tournoi est une opération SÉPARÉE, gratuite, qui dépense un ticket.
import { NextResponse } from "next/server";
import { findTicketPack, requirePriceId, CHECKOUT_EXPIRY_MINUTES } from "@/lib/payments/config";
import { getStripe, getAuthUser, getAdminClient, ensureStripeCustomer, siteUrl } from "@/lib/payments/stripe";

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const pack = findTicketPack(typeof body?.pack_code === "string" ? body.pack_code : "");
  if (!pack) return NextResponse.json({ error: "Pack inconnu" }, { status: 400 });

  const supabase = getAdminClient();
  const stripe = getStripe();

  let priceId: string;
  try {
    priceId = requirePriceId(pack.priceEnvVar);
  } catch (e) {
    console.error("[checkout/ticket-pack] configuration", e);
    return NextResponse.json({ error: "Boutique indisponible" }, { status: 503 });
  }

  const customerId = await ensureStripeCustomer(supabase, user.id, user.email);
  const base = siteUrl(request);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: user.id,
    metadata: { user_id: user.id, type: "ticket_pack", pack_code: pack.code },
    expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRY_MINUTES * 60,
    success_url: `${base}/paiement/succes?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/paiement/annule`,
  });

  // `ticket_amount` est figé ICI, depuis la configuration serveur : le webhook
  // ne le recalcule pas, il l'applique.
  const { error } = await supabase.from("payments").insert({
    user_id: user.id,
    stripe_session_id: session.id,
    type: "ticket_pack",
    reference: pack.code,
    ticket_amount: pack.tickets,
    status: "pending",
  });

  if (error) {
    console.error("[checkout/ticket-pack] insertion du paiement", error);
    await stripe.checkout.sessions.expire(session.id).catch(() => {});
    return NextResponse.json({ error: "Impossible d'ouvrir le paiement" }, { status: 500 });
  }

  return NextResponse.json({ url: session.url, session_id: session.id });
}
