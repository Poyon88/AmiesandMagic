import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { evolutionFor, fetchCards, fetchHeroes, fetchSnapshots, Period } from '@/lib/admin/analytics';

type EntityType = 'card' | 'hero' | 'faction' | 'race' | 'clan' | 'ability';

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const period = (searchParams.get('period') ?? 'all') as Period;
  const entity = searchParams.get('entity') as EntityType | null;
  const key = searchParams.get('key');
  if (!entity || !key) {
    return NextResponse.json({ error: 'entity et key requis' }, { status: 400 });
  }
  try {
    const [snapshots, cards, heroes] = await Promise.all([
      fetchSnapshots(auth.supabase, period),
      fetchCards(auth.supabase),
      fetchHeroes(auth.supabase),
    ]);
    const series = evolutionFor(snapshots, cards, heroes, entity, key);
    return NextResponse.json({ series });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
