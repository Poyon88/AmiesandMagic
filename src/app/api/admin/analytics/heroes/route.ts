import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { aggregateByHero, fetchHeroes, fetchSnapshots, Period } from '@/lib/admin/analytics';

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const period = (searchParams.get('period') ?? 'all') as Period;
  const minGames = Number(searchParams.get('minGames') ?? 10);
  try {
    const [snapshots, heroes] = await Promise.all([
      fetchSnapshots(auth.supabase, period),
      fetchHeroes(auth.supabase),
    ]);
    const stats = aggregateByHero(snapshots, heroes, minGames);
    return NextResponse.json({ stats, total_matches: snapshots.length / 2 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
