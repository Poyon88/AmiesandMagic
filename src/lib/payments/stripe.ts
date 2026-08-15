// Client Stripe et helpers d'authentification partagés par les routes de
// paiement.
//
// ⚠️ Ce module est SERVEUR UNIQUEMENT. `STRIPE_SECRET_KEY` ne doit jamais
// traverser le bundle client : ne l'importez pas depuis un composant "use client".
import Stripe from "stripe";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

let cached: Stripe | null = null;

/** Instance Stripe, créée à la demande. Pas au chargement du module : une clé
 *  absente ferait alors planter le build de TOUTES les routes, y compris celles
 *  qui ne touchent pas au paiement. */
export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY est absent de l'environnement.");
  cached = new Stripe(key);
  return cached;
}

/** Utilisateur authentifié depuis les cookies de session (même schéma que les
 *  routes existantes, cf. /api/wallet/credit). */
export async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => { /* lecture seule */ } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Client `service_role` — contourne RLS. Toute écriture d'argent passe par lui. */
export function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** Client Stripe du joueur, créé au premier paiement puis réutilisé.
 *
 *  Regrouper les paiements sous un même client rend l'historique lisible côté
 *  tableau de bord Stripe et permet au joueur de retrouver ses moyens de
 *  paiement. Aucune donnée carte ne transite par nous : Checkout hébergé les
 *  garde de son côté. */
export async function ensureStripeCustomer(
  supabase: SupabaseClient,
  userId: string,
  email: string | null | undefined,
): Promise<string> {
  const { data: existing } = await supabase
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  const customer = await getStripe().customers.create({
    email: email ?? undefined,
    metadata: { user_id: userId },
  });

  // `upsert` et non `insert` : deux onglets ouvrant un paiement en même temps
  // créeraient deux clients Stripe. Le second perd la course et on garde celui
  // déjà enregistré, plutôt que de faire échouer son paiement.
  const { data: saved } = await supabase
    .from("stripe_customers")
    .upsert({ user_id: userId, stripe_customer_id: customer.id }, { onConflict: "user_id", ignoreDuplicates: true })
    .select("stripe_customer_id")
    .maybeSingle();

  if (saved?.stripe_customer_id && saved.stripe_customer_id !== customer.id) {
    return saved.stripe_customer_id;
  }

  const { data: winner } = await supabase
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  return winner?.stripe_customer_id ?? customer.id;
}

/** URL de base du site, pour les retours Checkout. */
export function siteUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  return new URL(request.url).origin;
}
