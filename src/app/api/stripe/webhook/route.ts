// POST /api/stripe/webhook — LA SOURCE DE VÉRITÉ DES PAIEMENTS.
//
// Rien n'est crédité ni inscrit ailleurs qu'ici. La redirection de succès
// (/paiement/succes) ne fait qu'AFFICHER un état : elle peut ne jamais arriver
// (onglet fermé, réseau coupé) et elle peut être forgée par n'importe qui.
//
// Trois exigences, dans l'ordre :
//
//   1. SIGNATURE. Le corps est vérifié par `stripe.webhooks.constructEvent`
//      avant toute lecture. Sans cela, n'importe qui crédite n'importe qui.
//   2. CORPS BRUT. La signature porte sur les octets exacts. `request.json()`
//      les reformaterait et invaliderait la vérification — d'où `request.text()`.
//   3. IDEMPOTENCE. Stripe redélivre. Tout l'effet de bord vit dans des
//      fonctions PL/pgSQL gardées par le statut du paiement : un rejeu ne
//      touche aucune ligne. Voir supabase-migration-stripe-payments.sql.
//
// Code de retour : 200 dès que l'événement est traité OU sans objet pour nous.
// 500 uniquement sur échec réel, pour que Stripe retente. Un 500 sur un
// événement déjà traité déclencherait des retentatives sans fin.
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, getAdminClient } from "@/lib/payments/stripe";

// Corps brut obligatoire : ce handler ne doit jamais être servi depuis un cache.
export const dynamic = "force-dynamic";

interface WebhookOutcome {
  status: string;
  reason?: string;
  payment_id?: string;
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET absent");
    return NextResponse.json({ error: "Webhook non configuré" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Signature absente" }, { status: 400 });

  // ⚠️ `.text()` et non `.json()` — cf. point 2 de l'en-tête.
  const raw = await request.text();

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    // Signature invalide : 400, et surtout AUCUN effet en base. On ne logue pas
    // le corps — il vient d'un émetteur non authentifié.
    console.warn("[stripe/webhook] signature invalide :", (err as Error).message);
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }

  const supabase = getAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const { data, error } = await supabase.rpc("apply_checkout_completed", {
          p_session_id: session.id,
          p_payment_intent_id: typeof session.payment_intent === "string"
            ? session.payment_intent : session.payment_intent?.id ?? null,
          p_amount_cents: session.amount_total ?? 0,
          p_currency: session.currency ?? "eur",
          // Pays fourni par Stripe. Conservé pour le futur chantier TVA/OSS ;
          // aucune règle métier ne s'y adosse aujourd'hui.
          p_country: session.customer_details?.address?.country ?? null,
        });
        if (error) throw error;

        const outcome = data as WebhookOutcome;
        console.info("[stripe/webhook] completed", session.id, outcome.status, outcome.reason ?? "");

        // Place perdue pendant le paiement : l'argent a bien été pris, on le
        // rend. Le `charge.refunded` qui suivra passera le paiement en
        // `refunded` — on ne le fait pas ici, pour garder une seule écriture
        // par événement.
        if (outcome.status === "refund_needed") {
          await refundSession(stripe, session, outcome.reason ?? "unavailable");
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const { data, error } = await supabase.rpc("apply_checkout_expired", {
          p_session_id: session.id,
        });
        if (error) throw error;
        console.info("[stripe/webhook] expired", session.id, (data as WebhookOutcome).status);
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const intentId = typeof charge.payment_intent === "string"
          ? charge.payment_intent : charge.payment_intent?.id ?? null;
        if (!intentId) {
          console.warn("[stripe/webhook] charge.refunded sans payment_intent", charge.id);
          break;
        }
        const { data, error } = await supabase.rpc("apply_charge_refunded", {
          p_payment_intent_id: intentId,
        });
        if (error) throw error;
        console.info("[stripe/webhook] refunded", intentId, (data as WebhookOutcome).status);
        break;
      }

      default:
        // Tout le reste : accusé de réception sans action. On journalise le type
        // pour savoir ce que Stripe nous envoie réellement, sans jamais rien
        // écrire à l'aveugle.
        console.info("[stripe/webhook] type ignoré :", event.type);
    }
  } catch (err) {
    // Échec RÉEL du traitement → 500, pour que Stripe retente. Les fonctions
    // étant idempotentes, une retentative est sans danger.
    console.error("[stripe/webhook] échec du traitement", event.type, err);
    return NextResponse.json({ error: "Traitement en échec" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/** Remboursement automatique d'une session dont la contrepartie n'est plus
 *  disponible (tournoi rempli ou fermé pendant le paiement). */
async function refundSession(stripe: Stripe, session: Stripe.Checkout.Session, reason: string) {
  const intentId = typeof session.payment_intent === "string"
    ? session.payment_intent : session.payment_intent?.id;
  if (!intentId) {
    console.error("[stripe/webhook] remboursement impossible, aucun payment_intent", session.id, reason);
    return;
  }
  await stripe.refunds.create({
    payment_intent: intentId,
    // `metadata` et non `reason` : les motifs Stripe sont une énumération
    // fermée (duplicate / fraudulent / requested_by_customer) où aucun ne
    // décrit « la place a été prise pendant le paiement ».
    metadata: { auto_refund_reason: reason, checkout_session: session.id },
  });
  console.warn("[stripe/webhook] remboursement automatique", session.id, reason);
}
