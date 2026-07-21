import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAdminClient } from "@/lib/admin/requireAdmin";
import { normalizeUsername, validateUsername } from "@/lib/auth/username";

// POST /api/profile/username — { username }
//
// Pourquoi une route serveur plutôt qu'un update client :
// supabase-migration-rls-hardening.sql retire `UPDATE` sur `profiles` aux rôles
// `authenticated`/`anon`, parce que la table porte `role` — un client capable
// d'écrire pouvait s'auto-promouvoir admin. Le fichier prévoyait de rouvrir un
// `GRANT UPDATE (username)` le jour où l'édition self-service arriverait ; on
// s'en passe. Passer par `service_role` ici permet en plus de revalider et de
// traduire la collision, ce qu'un grant colonne ne ferait pas.
//
// La route ne cible QUE l'utilisateur authentifié : aucun `userId` n'est lu du
// corps de requête, il vient du cookie de session.

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* read-only */ },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: { username?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (typeof body.username !== "string") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Revalidation intégrale : le client a beau afficher la même règle, il n'est
  // pas une source de confiance.
  const username = normalizeUsername(body.username);
  const invalid = validateUsername(username);
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 422 });
  }

  const supabase = getAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ username, username_confirmed: true })
    .eq("id", user.id);

  if (error) {
    // 23505 = unique_violation sur profiles_username_lower_key. C'est la base
    // qui tranche, pas une vérification préalable : entre un « ce pseudo est
    // libre » et l'écriture, un autre joueur peut l'avoir pris.
    if (error.code === "23505") {
      return NextResponse.json({ error: "taken" }, { status: 409 });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ username });
}
