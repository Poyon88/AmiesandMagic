// /api/admin/sim/lot — ADMIN — parties d'un LOT sur decks existants.
//   GET ?testId=  → k des parties déjà enregistrées (reprise d'un lot interrompu)
//   POST { testId, rows } → insère les lignes `sim_deck_snapshots` (cf. lot-rows.ts)
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { kDepuisMatchId } from '@/lib/sim/lot-rows';

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const testId = Number(new URL(request.url).searchParams.get('testId'));
  if (!Number.isFinite(testId)) return NextResponse.json({ error: 'testId manquant' }, { status: 400 });
  const ks = new Set<number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await auth.supabase.from('sim_deck_snapshots').select('match_id')
      .eq('sim_test_id', testId).order('id').range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const r of data ?? []) ks.add(kDepuisMatchId(r.match_id));
    if ((data?.length ?? 0) < 1000) break;
  }
  return NextResponse.json({ faits: [...ks] });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const b = await request.json().catch(() => ({}));
  const testId = Number(b.testId);
  if (!Number.isFinite(testId) || !Array.isArray(b.rows)) return NextResponse.json({ error: 'testId et rows requis' }, { status: 400 });
  if (b.rows.some((r: { sim_test_id?: number }) => r.sim_test_id !== testId)) return NextResponse.json({ error: 'lignes d’un autre test' }, { status: 400 });
  if (b.rows.length > 2000) return NextResponse.json({ error: 'au plus 2000 lignes par envoi' }, { status: 400 });
  const { error } = await auth.supabase.from('sim_deck_snapshots').insert(b.rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, n: b.rows.length });
}
