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

// GET /api/board-prints?boardId=X — list prints for a board, enriched with owner username.
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const boardId = searchParams.get('boardId');
  if (!boardId) return NextResponse.json({ error: 'boardId requis' }, { status: 400 });

  const supabaseAdmin = getAdminClient();
  const { data, error } = await supabaseAdmin
    .from('user_board_prints')
    .select('id, board_id, print_number, max_prints, owner_id, is_tradeable, assigned_at, created_at')
    .eq('board_id', Number(boardId))
    .order('print_number');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ownerIds = [...new Set((data ?? []).filter((p) => p.owner_id).map((p) => p.owner_id))];
  let profileMap: Record<string, string> = {};
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, username')
      .in('id', ownerIds);
    if (profiles) {
      profileMap = Object.fromEntries(profiles.map((p) => [p.id, p.username]));
    }
  }

  const enriched = (data ?? []).map((p) => ({
    ...p,
    owner_username: p.owner_id ? profileMap[p.owner_id] ?? null : null,
  }));

  return NextResponse.json(enriched);
}

// PATCH /api/board-prints — assign/unassign, toggle tradeable.
export async function PATCH(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabaseAdmin = getAdminClient();

  try {
    const { printId, ownerId, isTradeable } = await request.json();
    if (!printId) return NextResponse.json({ error: 'printId requis' }, { status: 400 });

    const update: Record<string, unknown> = {};

    if (ownerId !== undefined) {
      update.owner_id = ownerId || null;
      update.assigned_at = ownerId ? new Date().toISOString() : null;
    }

    if (isTradeable !== undefined) {
      update.is_tradeable = isTradeable;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Rien à mettre à jour' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('user_board_prints')
      .update(update)
      .eq('id', printId);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[board-prints] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}
