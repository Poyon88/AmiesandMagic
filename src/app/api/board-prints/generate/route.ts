import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { LIMITED_PRINT_COUNTS } from '@/lib/card-engine/constants';

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

// POST /api/board-prints/generate
// Body: { boardId: number } — (re)generate prints for one limited board.
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabaseAdmin = getAdminClient();

  try {
    const { boardId } = await request.json();
    if (!boardId) return NextResponse.json({ error: 'boardId requis' }, { status: 400 });

    const { data: board, error: boardErr } = await supabaseAdmin
      .from('game_boards')
      .select('id, rarity, max_prints')
      .eq('id', boardId)
      .single();
    if (boardErr || !board) throw new Error(boardErr?.message ?? 'Plateau introuvable');

    if (!board.rarity || board.rarity === 'Commune') {
      return NextResponse.json({ error: 'Les plateaux communs n\'ont pas d\'exemplaires limités' }, { status: 400 });
    }

    const printCount = board.max_prints ?? LIMITED_PRINT_COUNTS[board.rarity];
    if (!printCount) {
      return NextResponse.json({ error: `Rareté "${board.rarity}" sans nombre d'exemplaires défini` }, { status: 400 });
    }

    // Only regenerate unassigned prints to avoid breaking existing ownership.
    const { error: delErr } = await supabaseAdmin
      .from('user_board_prints')
      .delete()
      .eq('board_id', board.id)
      .is('owner_id', null);
    if (delErr) throw new Error(delErr.message);

    const { data: existingPrints } = await supabaseAdmin
      .from('user_board_prints')
      .select('print_number')
      .eq('board_id', board.id);
    const taken = new Set((existingPrints ?? []).map((p) => p.print_number));

    const toInsert: { board_id: number; print_number: number; max_prints: number }[] = [];
    for (let i = 1; i <= printCount; i++) {
      if (!taken.has(i)) toInsert.push({ board_id: board.id, print_number: i, max_prints: printCount });
    }

    if (toInsert.length > 0) {
      const { error: insErr } = await supabaseAdmin.from('user_board_prints').insert(toInsert);
      if (insErr) throw new Error(insErr.message);
    }

    return NextResponse.json({ success: true, generated: toInsert.length, total: printCount });
  } catch (err) {
    console.error('[board-prints/generate] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}
