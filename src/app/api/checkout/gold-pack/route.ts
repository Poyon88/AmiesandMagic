// POST /api/checkout/gold-pack — { pack_code }
//
// Ouvre une session Stripe Checkout hébergée pour l'achat d'un pack de pièces
// d'or. Le client n'envoie QU'UN CODE : le prix vient du `price_id` configuré
// côté serveur, jamais du navigateur.
//
// ⚠️ Cette route ne crédite RIEN. Elle inscrit un paiement `pending` et rend
// une URL de redirection. Le crédit n'a lieu qu'à la réception du webhook
// `checkout.session.completed` — voir /api/stripe/webhook.
import { NextResponse } from "next/server";
import { findGoldPack, requirePriceId, CHECKOUT_EXPIRY_MINUTES } from "@/lib/payments/config";
import { getStripe, getAuthUser, getAdminClient, ensureStripeCustomer, siteUrl } from "@/lib/payments/stripe";

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const packCode = typeof body?.pack_code === "string" ? body.pack_code : "";
  const pack = findGoldPack(packCode);
  if (!pack) return NextResponse.json({ error: "Pack inconnu" }, { status: 400 });

  const supabase = getAdminClient();
  const stripe = getStripe();

  let priceId: string;
  try {
    priceId = requirePriceId(pack.priceEnvVar);
  } catch (e) {
    console.error("[checkout/gold-pack] configuration", e);
    return NextResponse.json({ error: "Boutique indisponible" }, { status: 503 });
  }

  const customerId = await ensureStripeCustomer(supabase, user.id, user.email);
  const base = siteUrl(request);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    // `client_reference_id` et les metadata sont les DEUX seuls liens entre la
    // session et notre joueur. Le webhook n'a rien d'autre pour l'identifier.
    client_reference_id: user.id,
    metadata: { user_id: user.id, type: "gold_pack", pack_code: pack.code },
    expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRY_MINUTES * 60,
    success_url: `${base}/paiement/succes?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/paiement/annule`,
  });

  // Paiement en attente : il rend `checkout.session.expired` exploitable (sinon
  // rien à passer en échec) et fait apparaître la tentative dans l'historique.
  // `gold_amount` est figé ICI, depuis la configuration serveur : le webhook ne
  // le recalcule pas, il l'applique.
  const { error } = await supabase.from("payments").insert({
    user_id: user.id,
    stripe_session_id: session.id,
    type: "gold_pack",
    reference: pack.code,
    gold_amount: pack.gold,
    status: "pending",
  });

  if (error) {
    console.error("[checkout/gold-pack] insertion du paiement", error);
    // La session Stripe existe mais nous n'avons rien pour la reconnaître :
    // mieux vaut la fermer que laisser le joueur payer dans le vide.
    await stripe.checkout.sessions.expire(session.id).catch(() => {});
    return NextResponse.json({ error: "Impossible d'ouvrir le paiement" }, { status: 500 });
  }

  return NextResponse.json({ url: session.url, session_id: session.id });
}
