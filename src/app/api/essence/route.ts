// GET /api/essence — solde d'essence et 50 derniers mouvements du joueur.
// `?userId=` : réservé aux admins (écran Économie).
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAdminClient } from "@/lib/admin/requireAdmin";

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

  const [{ data: wallet, error: wErr }, { data: tx, error: tErr }] = await Promise.all([
    supabase.from("wallets").select("essence").eq("user_id", cible).maybeSingle(),
    supabase
      .from("essence_transactions")
      .select("id, type, amount, essence_after, description, metadata, created_at")
      .eq("user_id", cible)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // Migration non appliquée : la colonne ou la table manque. On le dit
  // explicitement plutôt que d'afficher un solde de 0 trompeur.
  if (wErr || tErr) {
    console.error("[essence] lecture", wErr ?? tErr);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  return NextResponse.json({ essence: wallet?.essence ?? 0, transactions: tx ?? [] });
}
