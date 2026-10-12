import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { sanitizeBrief } from '@/lib/card-engine/brief';
import { sanitizePlan } from '@/lib/ai/card-concepts';

/** Brief assaini + plan de concepts (étape Concepts), rangé dans le même jsonb. */
function briefAvecPlan(body: { brief?: unknown; plan?: unknown }) {
  const { brief } = sanitizeBrief(body.brief);
  const plan = sanitizePlan(body.plan);
  return plan ? { ...brief, plan } : brief;
}

// /api/forge/briefs — ADMIN — historique des briefs de la Création assistée.
//   GET              → liste (récents d'abord), avec le compte des cartes créées
//   GET ?id=N        → un brief + ses items (cartes créées / erreurs)
//   POST  { title, brief, chat, plan? }     → enregistre un brief (assaini ; plan = concepts)
//   PUT   { id, title?, brief?, chat? }     → met à jour
//   PATCH { briefId, runId, items:[…] }     → trace des cartes d'un lancement
//   DELETE { id }

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const supabase = auth.supabase;
  const id = new URL(request.url).searchParams.get('id');

  if (id) {
    const { data: brief, error } = await supabase.from('card_briefs').select('*').eq('id', Number(id)).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!brief) return NextResponse.json({ error: 'Brief introuvable' }, { status: 404 });
    const { data: items } = await supabase
      .from('card_brief_items').select('id, run_id, position, card_id, status, error, created_at')
      .eq('brief_id', brief.id).order('created_at', { ascending: false }).order('position');
    const ids = (items ?? []).map((i) => i.card_id).filter((x): x is number => x != null);
    const { data: cartes } = ids.length
      ? await supabase.from('cards').select('id, name, rarity, image_url, status').in('id', ids)
      : { data: [] };
    return NextResponse.json({ ...brief, items: items ?? [], cards: cartes ?? [] });
  }

  const { data, error } = await supabase
    .from('card_briefs').select('id, title, brief, created_at, updated_at').order('updated_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: items } = await supabase.from('card_brief_items').select('brief_id, status').in('brief_id', (data ?? []).map((b) => b.id));
  const crees = new Map<number, number>();
  for (const i of items ?? []) if (i.status === 'created') crees.set(i.brief_id, (crees.get(i.brief_id) ?? 0) + 1);
  return NextResponse.json((data ?? []).map((b) => ({ ...b, created_cards: crees.get(b.id) ?? 0 })));
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const brief = briefAvecPlan(body ?? {});
  const { data, error } = await auth.supabase.from('card_briefs').insert({
    title: typeof body?.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 120) : brief.title || 'Brief sans titre',
    brief,
    chat: Array.isArray(body?.chat) ? body.chat.slice(-80) : [],
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'id manquant' }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (typeof body.title === 'string') patch.title = body.title.trim().slice(0, 120);
  if (body.brief) patch.brief = briefAvecPlan(body);
  if (Array.isArray(body.chat)) patch.chat = body.chat.slice(-80);
  const { data, error } = await auth.supabase.from('card_briefs').update(patch).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const briefId = Number(body?.briefId);
  const runId = typeof body?.runId === 'string' ? body.runId.slice(0, 64) : '';
  if (!Number.isFinite(briefId) || !runId || !Array.isArray(body?.items)) {
    return NextResponse.json({ error: 'briefId, runId et items requis' }, { status: 400 });
  }
  const rows = body.items.slice(0, 100).map((i: { position?: number; card_id?: number | null; status?: string; error?: string | null }) => ({
    brief_id: briefId, run_id: runId, position: Number(i.position) || 0,
    card_id: typeof i.card_id === 'number' ? i.card_id : null,
    status: i.status === 'created' || i.status === 'error' ? i.status : 'pending',
    error: typeof i.error === 'string' ? i.error.slice(0, 500) : null,
  }));
  const { error } = await auth.supabase.from('card_brief_items').insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auth.supabase.from('card_briefs').update({ updated_at: new Date().toISOString() }).eq('id', briefId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'id manquant' }, { status: 400 });
  const { error } = await auth.supabase.from('card_briefs').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
