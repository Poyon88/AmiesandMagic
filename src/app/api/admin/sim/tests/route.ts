// /api/admin/sim/tests — ADMIN — historique des tests du simulateur (sim_tests).
//   GET            → liste légère (sans les parties) ; ?id= → la ligne complète
//   POST           → crée un test (puis purge des tests CIBLÉS au-delà des 300 derniers)
//   PATCH { id, status?, results?, games? } → avancement / résultats
//   DELETE { id }  → supprime le test (et les parties d'un lot)
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';

const GARDER_TESTS_CIBLES = 300;
const LEGER = 'id, created_at, updated_at, kind, label, policy, catalogue_hash, status, config';

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const id = new URL(request.url).searchParams.get('id');
  if (id) {
    const { data, error } = await auth.supabase.from('sim_tests').select('*').eq('id', Number(id)).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Test introuvable' }, { status: 404 });
    return NextResponse.json(data);
  }
  // Le total figure dans les résultats : on le joint sans rapatrier le reste.
  const { data, error } = await auth.supabase.from('sim_tests')
    .select(`${LEGER}, total:results->total`).order('created_at', { ascending: false }).limit(GARDER_TESTS_CIBLES + 50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const b = await request.json().catch(() => ({}));
  if (b.kind !== 'cible' && b.kind !== 'lot') return NextResponse.json({ error: 'kind attendu : cible ou lot' }, { status: 400 });
  if (typeof b.catalogue_hash !== 'string' || typeof b.policy !== 'string') return NextResponse.json({ error: 'catalogue_hash et policy requis' }, { status: 400 });
  const { data, error } = await auth.supabase.from('sim_tests').insert({
    kind: b.kind, label: b.label ?? null, policy: b.policy, catalogue_hash: b.catalogue_hash,
    config: b.config ?? {}, decks: b.decks ?? [], created_by: auth.user.id,
  }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // PURGE : seuls les 300 derniers tests CIBLÉS sont gardés (les lots ne sont
  // jamais purgés automatiquement — ils nourrissent l'écran d'Équilibrage).
  const { data: vieux } = await auth.supabase.from('sim_tests').select('id')
    .eq('kind', 'cible').order('created_at', { ascending: false }).range(GARDER_TESTS_CIBLES, GARDER_TESTS_CIBLES + 999);
  if (vieux?.length) await auth.supabase.from('sim_tests').delete().in('id', vieux.map((v) => v.id));

  return NextResponse.json({ id: data.id });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const b = await request.json().catch(() => ({}));
  const id = Number(b.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'id manquant' }, { status: 400 });
  const maj: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.status === 'en_cours' || b.status === 'fini' || b.status === 'interrompu') maj.status = b.status;
  if (b.results !== undefined) maj.results = b.results;
  if (Array.isArray(b.games)) maj.games = b.games;
  const { error } = await auth.supabase.from('sim_tests').update(maj).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const b = await request.json().catch(() => ({}));
  const id = Number(b.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'id manquant' }, { status: 400 });
  const { error: e1 } = await auth.supabase.from('sim_deck_snapshots').delete().eq('sim_test_id', id);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  const { error } = await auth.supabase.from('sim_tests').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
