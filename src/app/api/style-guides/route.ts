// CRUD admin des CHARTES GRAPHIQUES par clan (table `style_guides`).
// Modèle : /api/news (requireAdmin partagé, client service_role). La table n'a
// aucune policy RLS : ces routes sont le seul chemin d'accès.
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { FACTIONS, getAllClanNames } from '@/lib/card-engine/constants';
import { STYLE_GUIDE_FIELDS } from '@/lib/ai/style-guide';

/** Tous les clans déclarés en code (leur nom EST leur identifiant). */
function clansConnus(): Set<string> {
  return new Set(Object.keys(FACTIONS).flatMap((f) => getAllClanNames(f)));
}

/** Champs texte d'une charte, nettoyés : chaînes vides ⇒ null. */
function champs(body: Record<string, unknown>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const { key } of STYLE_GUIDE_FIELDS) {
    if (key in body) {
      const v = typeof body[key] === 'string' ? (body[key] as string).trim() : '';
      out[key] = v || null;
    }
  }
  return out;
}

// GET /api/style-guides[?clan=…] — défaut d'abord, puis par nom.
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const clan = new URL(request.url).searchParams.get('clan');
  let q = auth.supabase.from('style_guides').select('*');
  if (clan) q = q.eq('clan', clan);
  const { data, error } = await q.order('clan').order('is_default', { ascending: false }).order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** Retire le défaut aux autres chartes du clan (avant d'en poser un nouveau :
 *  l'index unique partiel refuserait sinon le second défaut). */
async function retirerDefaut(supabase: NonNullable<Awaited<ReturnType<typeof requireAdmin>>['supabase']>, clan: string, sauf?: number) {
  let q = supabase.from('style_guides').update({ is_default: false }).eq('clan', clan).eq('is_default', true);
  if (sauf) q = q.neq('id', sauf);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

// POST /api/style-guides — crée. La 1ʳᵉ charte d'un clan devient son défaut.
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const clan = typeof body?.clan === 'string' ? body.clan : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!clansConnus().has(clan)) return NextResponse.json({ error: `Clan inconnu : ${clan}` }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'Nom requis' }, { status: 400 });
  try {
    const { count } = await auth.supabase.from('style_guides').select('id', { count: 'exact', head: true }).eq('clan', clan);
    const isDefault = body?.is_default === true || (count ?? 0) === 0;
    if (isDefault) await retirerDefaut(auth.supabase, clan);
    const { data, error } = await auth.supabase
      .from('style_guides')
      .insert({ clan, name, is_default: isDefault, ...champs(body!) })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// PUT /api/style-guides — modifie { id, ...champs, name?, is_default? }.
export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === 'number' ? body.id : NaN;
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id requis' }, { status: 400 });
  try {
    const { data: cur, error: e1 } = await auth.supabase.from('style_guides').select('clan, is_default').eq('id', id).single();
    if (e1 || !cur) return NextResponse.json({ error: 'Charte introuvable' }, { status: 404 });
    const patch: Record<string, unknown> = champs(body!);
    if (typeof body?.name === 'string') {
      if (!body.name.trim()) return NextResponse.json({ error: 'Nom requis' }, { status: 400 });
      patch.name = body.name.trim();
    }
    if (body?.is_default === true && !cur.is_default) {
      await retirerDefaut(auth.supabase, cur.clan, id);
      patch.is_default = true;
    }
    // Retirer le défaut sans en désigner un autre laisserait le clan sans
    // charte pour la génération automatique : on l'interdit.
    if (body?.is_default === false && cur.is_default) {
      return NextResponse.json({ error: 'Désignez une autre charte par défaut plutôt que de retirer celle-ci.' }, { status: 409 });
    }
    const { data, error } = await auth.supabase.from('style_guides').update(patch).eq('id', id).select('*').single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// DELETE /api/style-guides — { id }. La charte par défaut ne se supprime que si
// elle est la dernière du clan (sinon : en désigner une autre d'abord).
export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === 'number' ? body.id : NaN;
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id requis' }, { status: 400 });
  const { data: cur } = await auth.supabase.from('style_guides').select('clan, is_default').eq('id', id).maybeSingle();
  if (!cur) return NextResponse.json({ error: 'Charte introuvable' }, { status: 404 });
  if (cur.is_default) {
    const { count } = await auth.supabase.from('style_guides').select('id', { count: 'exact', head: true }).eq('clan', cur.clan);
    if ((count ?? 0) > 1) {
      return NextResponse.json({ error: 'Charte par défaut : désignez-en une autre avant de la supprimer.' }, { status: 409 });
    }
  }
  const { error } = await auth.supabase.from('style_guides').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
