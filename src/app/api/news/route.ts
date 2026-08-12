// CRUD admin des news (modèle : /api/showcase, avec requireAdmin partagé).
// Lecture publique : PAS de GET public ici — le bandeau et /news/[slug] lisent
// Supabase directement en RSC via la policy RLS « Public read news ».
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { NEWS_SLUG_RE } from '@/lib/news/types';
import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'news-images';

/** Upload d'un visuel base64 → URL publique (pattern api/cards/save). */
async function uploadImage(
  supabase: SupabaseClient,
  imageBase64: string,
  imageMimeType: string,
): Promise<string> {
  const buffer = Buffer.from(imageBase64, 'base64');
  const ext = imageMimeType.split('/')[1] || 'webp';
  const filePath = `news_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, { upsert: true, contentType: imageMimeType, cacheControl: '31536000' });
  if (error) throw new Error(`Image : ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

/** Chemin Storage depuis l'URL publique (pour supprimer l'ancien fichier). */
function storagePathFromUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
}

// GET /api/news — admin : toutes les news (l'admin voit aussi les inactives).
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { data, error } = await auth.supabase
    .from('news')
    .select('*')
    .order('sort_order')
    .order('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ news: data ?? [] });
}

// POST /api/news — admin : création.
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json();
  const { slug, title, teaser, body_md, image_style, image_prompt, imageBase64, imageMimeType } =
    body as {
      slug?: string; title?: string; teaser?: string; body_md?: string;
      image_style?: string; image_prompt?: string;
      imageBase64?: string; imageMimeType?: string;
    };

  if (!title?.trim()) return NextResponse.json({ error: 'title requis' }, { status: 400 });
  if (!slug || !NEWS_SLUG_RE.test(slug)) {
    return NextResponse.json({ error: 'slug invalide (attendu : a-z, 0-9, tirets)' }, { status: 400 });
  }

  try {
    let image_url: string | null = null;
    if (imageBase64 && imageMimeType) {
      image_url = await uploadImage(auth.supabase, imageBase64, imageMimeType);
    }

    // sort_order = fin de liste (max + 1) pour que la nouvelle news s'ajoute
    // après les existantes sans écraser l'ordre choisi par l'admin.
    const { data: maxRow } = await auth.supabase
      .from('news')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await auth.supabase
      .from('news')
      .insert({
        slug,
        title: title.trim(),
        teaser: teaser ?? '',
        body_md: body_md ?? '',
        image_url,
        image_style: image_style ?? null,
        image_prompt: image_prompt ?? null,
        sort_order: (maxRow?.sort_order ?? -1) + 1,
      })
      .select('*')
      .single();

    if (error) {
      // 23505 = contrainte UNIQUE (slug déjà pris).
      const status = error.code === '23505' ? 409 : 500;
      return NextResponse.json({ error: status === 409 ? `slug « ${slug} » déjà utilisé` : error.message }, { status });
    }
    return NextResponse.json({ news: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur inconnue' }, { status: 500 });
  }
}

// PATCH /api/news — admin : édition partielle, toggle actif, réordonnancement.
export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json();

  // Variante réordonnancement : { orders: [{id, sort_order}] } (comme showcase).
  const { orders } = body as { orders?: { id: number; sort_order: number }[] };
  if (orders?.length) {
    for (const { id, sort_order } of orders) {
      await auth.supabase.from('news').update({ sort_order, updated_at: new Date().toISOString() }).eq('id', id);
    }
    return NextResponse.json({ success: true });
  }

  const { id, slug, title, teaser, body_md, image_style, image_prompt, active, imageBase64, imageMimeType } =
    body as {
      id?: number; slug?: string; title?: string; teaser?: string; body_md?: string;
      image_style?: string | null; image_prompt?: string | null; active?: boolean;
      imageBase64?: string; imageMimeType?: string;
    };
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });
  if (slug !== undefined && !NEWS_SLUG_RE.test(slug)) {
    return NextResponse.json({ error: 'slug invalide (attendu : a-z, 0-9, tirets)' }, { status: 400 });
  }

  try {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (slug !== undefined) patch.slug = slug;
    if (title !== undefined) patch.title = title.trim();
    if (teaser !== undefined) patch.teaser = teaser;
    if (body_md !== undefined) patch.body_md = body_md;
    if (image_style !== undefined) patch.image_style = image_style;
    if (image_prompt !== undefined) patch.image_prompt = image_prompt;
    if (active !== undefined) patch.active = active;

    if (imageBase64 && imageMimeType) {
      // Nouvelle image : upload puis suppression de l'ancienne (best-effort).
      const { data: current } = await auth.supabase.from('news').select('image_url').eq('id', id).single();
      patch.image_url = await uploadImage(auth.supabase, imageBase64, imageMimeType);
      const oldPath = storagePathFromUrl(current?.image_url ?? null);
      if (oldPath) await auth.supabase.storage.from(BUCKET).remove([oldPath]);
    }

    const { data, error } = await auth.supabase
      .from('news')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      const status = error.code === '23505' ? 409 : 500;
      return NextResponse.json({ error: status === 409 ? `slug « ${slug} » déjà utilisé` : error.message }, { status });
    }
    return NextResponse.json({ news: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur inconnue' }, { status: 500 });
  }
}

// DELETE /api/news — admin : suppression (fichier Storage inclus, best-effort).
export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json();
  const { id } = body as { id?: number };
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

  const { data: current } = await auth.supabase.from('news').select('image_url').eq('id', id).single();
  const { error } = await auth.supabase.from('news').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const path = storagePathFromUrl(current?.image_url ?? null);
  if (path) await auth.supabase.storage.from(BUCKET).remove([path]);

  return NextResponse.json({ success: true });
}
