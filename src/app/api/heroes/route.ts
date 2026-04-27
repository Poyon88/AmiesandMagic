import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* read-only */ },
      },
    },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  return user;
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const ALLOWED_RACES = new Set([
  'elves', 'dwarves', 'halflings', 'humans', 'beastmen',
  'giants', 'dark_elves', 'orcs_goblins', 'undead',
]);
const ALLOWED_POWER_TYPES = new Set(['active', 'passive']);
const ALLOWED_RARITIES = new Set(['Commune', 'Peu Commune', 'Rare', 'Épique', 'Légendaire']);

async function uploadToBucket(
  supabase: ReturnType<typeof getAdminClient>,
  bucket: string,
  base64: string,
  mimeType: string,
  prefix: string,
): Promise<string> {
  const buffer = Buffer.from(base64, 'base64');
  const ext = mimeType.split('/').pop()?.replace('+xml', '') || 'bin';
  const filePath = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, buffer, { upsert: true, contentType: mimeType });
  if (error) throw new Error(`Upload ${bucket}: ${error.message}`);
  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('heroes')
    .select('*')
    .order('race', { ascending: true })
    .order('id', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const {
      name, race,
      power_name, power_type, power_cost, power_effect, power_description,
      glbBase64, glbMimeType, glbUrl,
      thumbnailBase64, thumbnailMimeType,
      rarity, max_prints, is_default, is_active,
    } = body as Record<string, unknown>;

    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Nom requis' }, { status: 400 });
    }
    if (typeof race !== 'string' || !ALLOWED_RACES.has(race)) {
      return NextResponse.json({ error: 'Race invalide' }, { status: 400 });
    }

    // GLB source (optional): either base64 upload OR an already-hosted URL.
    let finalGlbUrl: string | null = null;
    if (typeof glbBase64 === 'string' && typeof glbMimeType === 'string') {
      finalGlbUrl = await uploadToBucket(supabase, 'hero-models', glbBase64, glbMimeType, 'hero');
    } else if (typeof glbUrl === 'string' && glbUrl.trim()) {
      finalGlbUrl = glbUrl.trim();
    }

    let finalThumbnailUrl: string | null = null;
    if (typeof thumbnailBase64 === 'string' && typeof thumbnailMimeType === 'string') {
      finalThumbnailUrl = await uploadToBucket(
        supabase, 'hero-models', thumbnailBase64, thumbnailMimeType, 'hero_thumb',
      );
    }

    // The hero needs at least one visual: a 3D model (GLB) OR a 2D image.
    // The in-game viewer routes on `glb_url` so without either the player
    // ends up with a faceless emoji placeholder.
    if (!finalGlbUrl && !finalThumbnailUrl) {
      return NextResponse.json(
        { error: 'Modèle 3D (GLB) ou image 2D requis' },
        { status: 400 },
      );
    }

    const insert: Record<string, unknown> = {
      name: name.trim(),
      race,
      glb_url: finalGlbUrl,
      thumbnail_url: finalThumbnailUrl,
    };

    if (typeof power_name === 'string') insert.power_name = power_name;
    if (typeof power_type === 'string' && ALLOWED_POWER_TYPES.has(power_type)) insert.power_type = power_type;
    if (typeof power_cost === 'number') insert.power_cost = power_cost;
    if (power_effect !== undefined) insert.power_effect = power_effect;
    if (typeof power_description === 'string') insert.power_description = power_description;

    if (typeof rarity === 'string' && ALLOWED_RARITIES.has(rarity)) insert.rarity = rarity;
    if (typeof max_prints === 'number') insert.max_prints = max_prints;
    if (typeof is_active === 'boolean') insert.is_active = is_active;

    if (is_default === true) {
      // Partial unique index enforces one default per race — clear existing
      // default on this race first.
      await supabase.from('heroes').update({ is_default: false })
        .eq('race', race).eq('is_default', true);
      insert.is_default = true;
    }

    const { data, error } = await supabase
      .from('heroes')
      .insert(insert)
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, hero: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();

  try {
    const body = await request.json();
    const {
      id, name,
      power_name, power_type, power_cost, power_effect, power_description,
      glbBase64, glbMimeType, glbUrl,
      thumbnailBase64, thumbnailMimeType,
      rarity, max_prints, is_default, is_active,
    } = body as Record<string, unknown>;

    if (typeof id !== 'number') {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (typeof name === 'string') updates.name = name;
    if (typeof power_name === 'string') updates.power_name = power_name;
    if (typeof power_type === 'string' && ALLOWED_POWER_TYPES.has(power_type)) updates.power_type = power_type;
    if (typeof power_cost === 'number') updates.power_cost = power_cost;
    if (power_effect !== undefined) updates.power_effect = power_effect;
    if (typeof power_description === 'string') updates.power_description = power_description;
    if (typeof rarity === 'string' && ALLOWED_RARITIES.has(rarity)) updates.rarity = rarity;
    if (max_prints !== undefined) {
      updates.max_prints = typeof max_prints === 'number' ? max_prints : null;
    }
    if (typeof is_active === 'boolean') updates.is_active = is_active;

    if (typeof glbBase64 === 'string' && typeof glbMimeType === 'string') {
      updates.glb_url = await uploadToBucket(supabase, 'hero-models', glbBase64, glbMimeType, 'hero');
    } else if (typeof glbUrl === 'string' && glbUrl.trim()) {
      updates.glb_url = glbUrl.trim();
    }

    if (typeof thumbnailBase64 === 'string' && typeof thumbnailMimeType === 'string') {
      updates.thumbnail_url = await uploadToBucket(
        supabase, 'hero-models', thumbnailBase64, thumbnailMimeType, 'hero_thumb',
      );
    }

    if (is_default === true) {
      // Need race to enforce the partial unique index — read from DB.
      const { data: row } = await supabase.from('heroes').select('race').eq('id', id).single();
      if (row?.race) {
        await supabase.from('heroes').update({ is_default: false })
          .eq('race', row.race).eq('is_default', true).neq('id', id);
      }
      updates.is_default = true;
    } else if (is_default === false) {
      updates.is_default = false;
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from('heroes').update(updates).eq('id', id);
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();

  try {
    const { id } = await request.json();
    if (typeof id !== 'number') {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    }

    // Best-effort cleanup of GLB + thumbnail in the bucket. Non-fatal if
    // storage removal fails (e.g. URL is external — Meshy CDN).
    const { data: hero } = await supabase
      .from('heroes')
      .select('glb_url, thumbnail_url')
      .eq('id', id)
      .single();

    const toRemove: string[] = [];
    for (const url of [hero?.glb_url, hero?.thumbnail_url]) {
      if (typeof url !== 'string') continue;
      const marker = '/hero-models/';
      const idx = url.indexOf(marker);
      if (idx >= 0) toRemove.push(url.slice(idx + marker.length));
    }
    if (toRemove.length > 0) {
      await supabase.storage.from('hero-models').remove(toRemove);
    }

    const { error } = await supabase.from('heroes').delete().eq('id', id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 },
    );
  }
}
