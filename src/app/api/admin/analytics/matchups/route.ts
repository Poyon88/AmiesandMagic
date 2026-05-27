import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { aggregateMatchups, fetchSnapshots, Period } from '@/lib/admin/analytics';

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const period = (searchParams.get('period') ?? 'all') as Period;
  try {
    const snapshots = await fetchSnapshots(auth.supabase, period);
    const cells = aggregateMatchups(snapshots);
    const factions = Array.from(new Set(cells.flatMap((c) => [c.faction_a, c.faction_b]))).sort();
    return NextResponse.json({ factions, cells, total_matches: snapshots.length / 2 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
