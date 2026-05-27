import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';

/**
 * Rejoue la capture pour les parties déjà `finished` qui n'ont pas encore
 * de ligne dans `match_results`. Appelle la fonction Postgres
 * `capture_match_result_for(match_id)` définie dans la migration.
 */
export async function POST() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  // Trouver les matches finished sans match_results
  const { data: missing, error } = await auth.supabase
    .from('matches')
    .select('id')
    .eq('status', 'finished')
    .not('winner_id', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: existing } = await auth.supabase
    .from('match_results')
    .select('match_id');
  const seen = new Set((existing ?? []).map((r) => r.match_id));
  const toProcess = (missing ?? []).filter((m) => !seen.has(m.id));

  let processed = 0;
  let failed = 0;
  for (const m of toProcess) {
    const { error: rpcError } = await auth.supabase.rpc('capture_match_result_for', { p_match_id: m.id });
    if (rpcError) failed += 1;
    else processed += 1;
  }

  return NextResponse.json({ processed, failed, scanned: toProcess.length });
}
