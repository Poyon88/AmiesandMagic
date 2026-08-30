import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAdminClient, requireAdmin } from '@/lib/admin/requireAdmin';
import { sanitizeBalanceOverrides } from '@/lib/card-engine/balance';

/** BARÈME DU MODÈLE DE COÛT — ligne unique `balance_overrides.id = 1`.
 *
 *  GET est ouvert à toute session, PUT passe par `requireAdmin` : c'est la même
 *  répartition que `/api/formats`, et elle suit la page. La forge est gardée par
 *  la session (cf. `admin/card-forge/page.tsx`), donc en interdire la LECTURE
 *  aux non-admins ferait s'ouvrir la page sur une jauge fausse plutôt que sur un
 *  refus lisible. L'ÉCRITURE, elle, change le modèle de coût du jeu entier.
 *
 *  La table n'a aucune policy RLS : ces deux routes, sous service_role, sont le
 *  seul chemin d'accès. */

const LIGNE = 1;

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* read-only */ },
      },
    }
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  return user;
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('balance_overrides')
    .select('overrides, updated_at')
    .eq('id', LIGNE)
    .maybeSingle();

  // `maybeSingle` et non `single` : tant que la migration n'est pas passée — ou
  // si la ligne a été effacée — la forge doit s'ouvrir sur les valeurs d'origine
  // plutôt que sur une erreur 500. Un barème absent EST un barème vierge.
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    overrides: sanitizeBalanceOverrides(data?.overrides),
    updated_at: data?.updated_at ?? null,
  });
}

/** PUT /api/balance — remplace le barème ENTIER (admin).
 *
 *  Remplacement plutôt que fusion : c'est ce qui rend « Rétablir l'origine »
 *  atomique. Fusionner laisserait chaque valeur un jour surchargée collée à son
 *  réglage, sans moyen de la retirer. */
export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = (await request.json().catch(() => null)) as { overrides?: unknown } | null;
  if (!body || typeof body !== 'object' || !('overrides' in body)) {
    return NextResponse.json({ error: 'overrides requis' }, { status: 400 });
  }

  // Assainir AVANT d'écrire : un JSONB accepte n'importe quelle forme, et une
  // clé inventée ou un nombre non fini resterait en base à contaminer chaque
  // ouverture de la forge.
  const overrides = sanitizeBalanceOverrides(body.overrides);

  const { data, error } = await auth.supabase
    .from('balance_overrides')
    .upsert(
      {
        id: LIGNE,
        overrides,
        updated_at: new Date().toISOString(),
        updated_by: auth.user.id,
      },
      { onConflict: 'id' },
    )
    .select('overrides, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // On rend ce qui a été RETENU, pas ce qui a été envoyé : l'éditeur affiche
  // ainsi l'état réel de la base, y compris ce que l'assainissement a écarté.
  return NextResponse.json({
    overrides: sanitizeBalanceOverrides(data?.overrides),
    updated_at: data?.updated_at ?? null,
  });
}
