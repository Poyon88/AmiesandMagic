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

// GET /api/heroes/owned — returns every hero the caller can see in their
// collection: all active "Commune" heroes (granted to everyone by default,
// no print row required) plus any non-common heroes the caller actually owns
// (via user_hero_prints). Mirrors the boards collection pattern: query all
// active commons + query owned prints, then merge in code (no migration /
// backfill needed). Duplicates are deduped by hero id.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();
  const [commonRes, ownedRes] = await Promise.all([
    supabase
      .from('heroes')
      .select('*')
      .eq('is_active', true)
      .eq('rarity', 'Commune'),
    supabase
      .from('user_hero_prints')
      .select('hero_id, acquired_at, hero:heroes(*)')
      .eq('user_id', user.id),
  ]);

  if (commonRes.error) return NextResponse.json({ error: commonRes.error.message }, { status: 500 });
  if (ownedRes.error) return NextResponse.json({ error: ownedRes.error.message }, { status: 500 });

  const byId = new Map<number, Record<string, unknown>>();
  for (const hero of commonRes.data ?? []) {
    if (hero && typeof hero.id === 'number') byId.set(hero.id, hero);
  }
  for (const row of ownedRes.data ?? []) {
    const hero = row.hero as unknown as Record<string, unknown> | null;
    // Skip inactive heroes; the `heroes` join already excludes deleted rows.
    if (hero && typeof hero.id === 'number' && hero.is_active !== false) {
      byId.set(hero.id, hero);
    }
  }

  const heroes = Array.from(byId.values());
  return NextResponse.json({ heroes });
}
