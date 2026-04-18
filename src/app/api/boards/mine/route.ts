import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

// GET /api/boards/mine
// Returns { boards, ownedPrints } for the authenticated user:
// - boards: every active game board (commons + limited) the user may potentially see.
// - ownedPrints: rows from user_board_prints the user currently owns.
// The client is expected to filter "accessible" = rarity=Commune OR print ownership exists.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();

  const [boardsRes, printsRes] = await Promise.all([
    supabase
      .from('game_boards')
      .select('id, name, image_url, rarity, max_prints, is_default, is_active')
      .eq('is_active', true)
      .order('rarity', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('user_board_prints')
      .select('id, board_id, print_number, max_prints, is_tradeable')
      .eq('owner_id', user.id),
  ]);

  if (boardsRes.error) return NextResponse.json({ error: boardsRes.error.message }, { status: 500 });
  if (printsRes.error) return NextResponse.json({ error: printsRes.error.message }, { status: 500 });

  return NextResponse.json({
    boards: boardsRes.data ?? [],
    ownedPrints: printsRes.data ?? [],
  });
}
