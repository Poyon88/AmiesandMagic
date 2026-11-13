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
import { gateFeature, requireAdult } from "@/lib/geo/rules";

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const pack = findTicketPack(typeof body?.pack_code === "string" ? body.pack_code : "");
  if (!pack) return NextResponse.json({ error: "Pack inconnu" }, { status: 400 });

  // Règles du pays de connexion (réglées dans /admin/pays), puis majorité
  // déclarée. Les deux AVANT tout appel à Stripe : un pays fermé ne doit même
  // pas voir s'ouvrir une session de paiement.
  const geo = await gateFeature(request, "tickets");
  if (geo.error) return geo.error;

  const supabase = getAdminClient();
  const adult = await requireAdult(supabase, user.id, geo.rules);
  if (adult.error) return adult.error;
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

  // Ce que Stripe doit savoir pour rester cohérent avec nos règles : le pays
  // de connexion, l'âge minimum qui s'y applique et la date de la déclaration
  // de majorité du joueur.
  const conformite = {
    request_country: geo.country,
    min_age: String(geo.rules.min_age),
    adult_declared_at: adult.declaredAt,
  };

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: user.id,
    metadata: { user_id: user.id, type: "ticket_pack", pack_code: pack.code, ...conformite },
    // Mêmes informations sur le PAIEMENT lui-même : c'est là qu'on les lit dans
    // le tableau de bord Stripe et que les règles Radar peuvent s'y adosser.
    payment_intent_data: { metadata: { user_id: user.id, type: "ticket_pack", ...conformite } },
    // Adresse de facturation exigée : le pays qu'elle porte est enregistré par
    // le webhook (`customer_country`) et sert de preuve pour la TVA. Il n'est
    // PAS comparé au pays de connexion — aucun refus ni remboursement.
    billing_address_collection: "required",
    customer_update: { address: "auto" },
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
    request_country: geo.country,
  });

  if (error) {
    console.error("[checkout/ticket-pack] insertion du paiement", error);
    await stripe.checkout.sessions.expire(session.id).catch(() => {});
    return NextResponse.json({ error: "Impossible d'ouvrir le paiement" }, { status: 500 });
  }

  return NextResponse.json({ url: session.url, session_id: session.id });
}
