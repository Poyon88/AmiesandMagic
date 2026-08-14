import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireAdmin } from '@/lib/admin/requireAdmin';

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

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();
  // TOUS les formats, actifs ou non : cette route ne sert QUE l'admin (gestion
  // des formats dans la forge). La filtrer sur `is_active` faisait disparaître un
  // format désactivé de l'écran qui sert à le réactiver — un aller sans retour.
  // L'écran de jeu, lui, interroge Supabase directement et garde son filtre.
  const { data, error } = await supabase
    .from('formats')
    .select('id, code, name, description, is_active')
    .order('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** PATCH /api/formats — bascule la diffusion d'un format (admin).
 *
 *  Un format inactif disparaît de l'écran « Jouer » : c'est ainsi qu'on masque
 *  les Étendus sans les supprimer, en gardant les decks et les parties qui les
 *  référencent. */
export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id, is_active } = (await request.json()) as { id?: number; is_active?: boolean };
  if (typeof id !== 'number') return NextResponse.json({ error: 'id requis' }, { status: 400 });
  if (typeof is_active !== 'boolean') return NextResponse.json({ error: 'is_active requis' }, { status: 400 });

  const { data, error } = await auth.supabase
    .from('formats')
    .update({ is_active })
    .eq('id', id)
    .select('id, code, name, description, is_active')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
