// Authentification commune des routes de partie : l'appelant doit être l'un
// des deux joueurs. Les lectures/écritures se font ensuite en service role.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAdminClient } from "@/lib/admin/requireAdmin";
import type { MatchRow } from "@/lib/game/match-setup";

export interface MatchContext {
  userId: string;
  db: ReturnType<typeof getAdminClient>;
  match: MatchRow & { status: string; winner_id: string | null; result_source: string | null };
}

export async function matchContext(matchId: string): Promise<MatchContext | { error: string; status: number }> {
  const cookieStore = await cookies();
  const auth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() { /* lecture seule */ } } },
  );
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: "unauthenticated", status: 401 };

  const db = getAdminClient();
  // `select("*")` : `result_source` n'existe qu'une fois la migration
  // d'intégrité appliquée ; nommer la colonne ferait échouer la lecture avant.
  const { data: match, error } = await db.from("matches").select("*").eq("id", matchId).maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!match) return { error: "not_found", status: 404 };
  if (match.player1_id !== user.id && match.player2_id !== user.id) return { error: "forbidden", status: 403 };
  return {
    userId: user.id,
    db,
    match: { ...match, result_source: match.result_source ?? null },
  };
}
