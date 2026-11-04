// POST /api/essence/craft — forge une carte limitée au hasard contre de l'essence.
//
// Tout le tirage et la règle monétaire vivent dans `craft_with_essence`
// (PL/pgSQL) : débit et attribution dans la même transaction. Cette route porte
// la demande, traduit les refus et joint l'objet tiré pour le reveal. Le
// paramètre de test `p_roll` n'est JAMAIS transmis.
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAdminClient } from "@/lib/admin/requireAdmin";
import type { CraftResult } from "@/lib/economy/types";

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

const REFUS: Readonly<Record<string, { message: string; status: number }>> = {
  insufficient_essence: { message: "Essence insuffisante.", status: 402 },
  pool_empty: { message: "Plus aucune carte limitée n'est disponible à la forge.", status: 409 },
};

export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc("craft_with_essence", { p_user_id: user.id });

  if (error) {
    console.error("[essence] forge", error);
    return NextResponse.json({ error: "server_error", message: "La forge a échoué." }, { status: 500 });
  }

  const resultat = data as (CraftResult & { error?: string }) | null;
  if (!resultat || resultat.error) {
    const code = resultat?.error ?? "server_error";
    const refus = REFUS[code];
    return NextResponse.json(
      { ...resultat, error: code, message: refus?.message ?? code },
      { status: refus?.status ?? 409 },
    );
  }

  // L'attribution est faite : un échec de lecture ici ne doit pas faire croire
  // au joueur que la forge a raté. Le reveal se contente alors des métadonnées.
  if (resultat.kind === "hero") {
    const { data: hero } = await supabase
      .from("heroes")
      .select("id, name, thumbnail_url, race")
      .eq("id", resultat.id)
      .maybeSingle();
    if (hero) resultat.hero = hero;
  } else {
    const { data: card } = await supabase.from("cards").select("*").eq("id", resultat.id).maybeSingle();
    if (card) resultat.card = card;
  }

  return NextResponse.json(resultat);
}
