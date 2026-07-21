import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAdminClient } from "@/lib/admin/requireAdmin";
import { isValidStarterFaction } from "@/lib/auth/starterFaction";

// POST /api/profile/faction — { faction }
//
// Enregistre la faction offerte au joueur. Comme /api/profile/username, la
// route passe par `service_role` : rls-hardening retire `UPDATE` sur `profiles`
// aux clients, et cette colonne conditionne l'accès à des cartes — un joueur
// capable de l'écrire changerait de faction à volonté et obtiendrait tout le
// catalogue commun gratuitement.
//
// Le choix est DÉFINITIF : la route refuse si `starter_faction` est déjà
// renseignée. Sans cette garde, elle serait un changement de faction gratuit et
// illimité, ce qui viderait l'option payante de son sens.

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

  let body: { faction?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!isValidStarterFaction(body.faction)) {
    return NextResponse.json({ error: "invalid_faction" }, { status: 422 });
  }
  const faction = body.faction;

  const supabase = getAdminClient();

  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("starter_faction")
    .eq("id", user.id)
    .single();

  if (readError) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  if (profile?.starter_faction) {
    // Déjà choisie. 409 plutôt que 403 : ce n'est pas un défaut de droit, c'est
    // un état qui rend l'opération sans objet.
    return NextResponse.json({ error: "already_chosen" }, { status: 409 });
  }

  // Le filtre `is null` referme la fenêtre de course entre la lecture ci-dessus
  // et l'écriture : deux requêtes simultanées ne peuvent pas toutes deux
  // enregistrer une faction.
  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ starter_faction: faction })
    .eq("id", user.id)
    .is("starter_faction", null)
    .select("starter_faction");

  if (error) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "already_chosen" }, { status: 409 });
  }

  return NextResponse.json({ faction });
}
