// GET /api/credits — solde de crédits marché, lots (actifs + expirés récents)
// et 50 derniers mouvements. `?userId=` : réservé aux admins.
//
// Alerte d'expiration SANS cron : à la lecture, chaque lot actif qui expire
// dans moins de CREDIT_EXPIRY_ALERT_DAYS jours et n'a pas encore été signalé
// déclenche UNE notification (expiry_notified_at posé dans la foulée).
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAdminClient } from "@/lib/admin/requireAdmin";
import { CREDIT_EXPIRY_ALERT_DAYS } from "@/lib/economy/constants";
import type { CreditGrant, CreditsSummary } from "@/lib/economy/types";

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() { /* lecture seule */ } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

const JOUR = 86_400_000;

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const supabase = getAdminClient();

  let cible = user.id;
  const demande = new URL(request.url).searchParams.get("userId");
  if (demande && demande !== user.id) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    cible = demande;
  }

  const now = Date.now();
  const depuis = new Date(now - 60 * JOUR).toISOString();
  const [{ data: grants, error: gErr }, { data: tx, error: tErr }] = await Promise.all([
    supabase
      .from("credit_grants")
      .select("id, amount, spent, expires_at, source, created_at, expiry_notified_at")
      .eq("user_id", cible)
      .gte("expires_at", depuis)
      .order("expires_at", { ascending: true })
      .limit(200),
    supabase
      .from("credit_transactions")
      .select("id, type, amount, balance_after, description, metadata, created_at")
      .eq("user_id", cible)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // Migration non appliquée : on le dit plutôt que d'afficher un solde nul.
  if (gErr || tErr) {
    console.error("[credits] lecture", gErr ?? tErr);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const actifs = (grants ?? []).filter((g) => g.spent < g.amount && Date.parse(g.expires_at) > now);
  const balance = actifs.reduce((n, g) => n + g.amount - g.spent, 0);
  const premier = actifs[0];
  const nextExpiry = premier
    ? {
        at: premier.expires_at,
        amount: actifs
          .filter((g) => g.expires_at === premier.expires_at)
          .reduce((n, g) => n + g.amount - g.spent, 0),
      }
    : null;

  // Alerte d'expiration — seulement pour le joueur lui-même, pas pour un admin
  // qui consulte un compte.
  if (cible === user.id) {
    const aSignaler = actifs.filter(
      (g) => !g.expiry_notified_at && Date.parse(g.expires_at) - now < CREDIT_EXPIRY_ALERT_DAYS * JOUR,
    );
    if (aSignaler.length) {
      const ids = aSignaler.map((g) => g.id);
      // Pose la marque d'abord, sur les seuls lots encore non marqués : deux
      // lectures simultanées ne notifient pas deux fois.
      const { data: marques } = await supabase
        .from("credit_grants")
        .update({ expiry_notified_at: new Date(now).toISOString() })
        .in("id", ids)
        .is("expiry_notified_at", null)
        .select("id, amount, spent, expires_at");
      const total = (marques ?? []).reduce((n, g) => n + g.amount - g.spent, 0);
      if (total > 0) {
        const fin = (marques ?? []).map((g) => g.expires_at).sort()[0];
        const date = new Date(fin).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
        await supabase.from("notifications").insert({
          user_id: cible,
          type: "credits_expiring",
          title: "Crédits bientôt expirés",
          message: `${total} crédit${total > 1 ? "s" : ""} marché expire${total > 1 ? "nt" : ""} le ${date}. Utilisez-les aux enchères avant cette date.`,
          metadata: { grant_ids: ids, amount: total, expires_at: fin },
        });
      }
    }
  }

  const summary: CreditsSummary = {
    balance,
    nextExpiry,
    grants: (grants ?? []).map(({ id, amount, spent, expires_at, source, created_at }): CreditGrant => ({
      id, amount, spent, expires_at, source, created_at,
    })),
    transactions: (tx ?? []) as CreditsSummary["transactions"],
  };
  return NextResponse.json(summary);
}
