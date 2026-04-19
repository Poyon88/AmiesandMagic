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

// Returns { cardBacks, ownedPrints } — every active card back + the prints
// the user currently owns. Client filters "accessible" = Commune OR owned.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();

  const [backsRes, printsRes] = await Promise.all([
    supabase
      .from('card_backs')
      .select('id, name, image_url, rarity, max_prints, is_default, is_active')
      .eq('is_active', true)
      .order('rarity', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('user_card_back_prints')
      .select('id, card_back_id, print_number, max_prints, is_tradeable')
      .eq('owner_id', user.id),
  ]);

  if (backsRes.error) return NextResponse.json({ error: backsRes.error.message }, { status: 500 });
  if (printsRes.error) return NextResponse.json({ error: printsRes.error.message }, { status: 500 });

  return NextResponse.json({
    cardBacks: backsRes.data ?? [],
    ownedPrints: printsRes.data ?? [],
  });
}
