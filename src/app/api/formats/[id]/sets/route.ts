import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { id } = await params;
  const formatId = parseInt(id);
  if (isNaN(formatId)) return NextResponse.json({ error: 'ID invalide' }, { status: 400 });

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('format_sets')
    .select('set_id')
    .eq('format_id', formatId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data?.map(d => d.set_id) ?? []);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { id } = await params;
  const formatId = parseInt(id);
  if (isNaN(formatId)) return NextResponse.json({ error: 'ID invalide' }, { status: 400 });

  const supabase = getAdminClient();

  try {
    const { set_ids } = await request.json() as { set_ids: number[] };

    // Supprimer les anciennes associations
    const { error: deleteError } = await supabase
      .from('format_sets')
      .delete()
      .eq('format_id', formatId);
    if (deleteError) throw new Error(deleteError.message);

    // Insérer les nouvelles
    if (set_ids.length > 0) {
      const rows = set_ids.map(set_id => ({ format_id: formatId, set_id }));
      const { error: insertError } = await supabase
        .from('format_sets')
        .insert(rows);
      if (insertError) throw new Error(insertError.message);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}
