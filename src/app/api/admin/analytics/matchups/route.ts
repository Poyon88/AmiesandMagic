import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { aggregateMatchups, fetchCards, fetchSnapshots, primaryAttributeOf, Period } from '@/lib/admin/analytics';

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const period = (searchParams.get('period') ?? 'all') as Period;
  const by = searchParams.get('by') === 'clan' ? 'clan' : 'faction';
  try {
    const snapshots = await fetchSnapshots(auth.supabase, period);
    let cells;
    if (by === 'clan') {
      const cards = await fetchCards(auth.supabase);
      cells = aggregateMatchups(snapshots, (s) => primaryAttributeOf(s, cards, 'clan'));
    } else {
      cells = aggregateMatchups(snapshots);
    }
    const factions = Array.from(new Set(cells.flatMap((c) => [c.faction_a, c.faction_b]))).sort();
    return NextResponse.json({ factions, cells, total_matches: snapshots.length / 2, by });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
