import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { FACTIONS } from '@/lib/card-engine/constants';
import { ABILITIES } from '@/lib/game/abilities';
import { validateFactionClan } from '@/lib/validation/faction-clan';

const ALLOWED_POWER_MODES = new Set(['grant_keyword', 'spell_trigger', 'aura']);

type PowerEffectV2 = {
  mode: string;
  keywordId: string;
  params?: { amount?: number; attack?: number; health?: number };
  tokenId?: number | null;
};

function validatePowerEffect(
  raw: unknown,
): { ok: true; value: PowerEffectV2 } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'powerEffect requis (objet { mode, keywordId, … })' };
  }
  const obj = raw as Record<string, unknown>;
  const mode = obj.mode;
  const keywordId = obj.keywordId;
  if (typeof mode !== 'string' || !ALLOWED_POWER_MODES.has(mode)) {
    return { ok: false, error: 'powerEffect.mode doit être grant_keyword, spell_trigger ou aura' };
  }
  if (typeof keywordId !== 'string' || !keywordId.trim()) {
    return { ok: false, error: 'powerEffect.keywordId requis' };
  }
  if (!(keywordId in ABILITIES)) {
    return { ok: false, error: `Mot-clé "${keywordId}" introuvable dans ABILITIES` };
  }
  const params = obj.params as Record<string, unknown> | undefined;
  const validated: PowerEffectV2 = { mode, keywordId };
  if (params && typeof params === 'object') {
    const out: { amount?: number; attack?: number; health?: number } = {};
    if (params.amount !== undefined) {
      if (typeof params.amount !== 'number' || params.amount < 0) {
        return { ok: false, error: 'powerEffect.params.amount doit être un nombre ≥ 0' };
      }
      out.amount = params.amount;
    }
    if (params.attack !== undefined) {
      if (typeof params.attack !== 'number' || params.attack < 0) {
        return { ok: false, error: 'powerEffect.params.attack doit être un nombre ≥ 0' };
      }
      out.attack = params.attack;
    }
    if (params.health !== undefined) {
      if (typeof params.health !== 'number' || params.health < 0) {
        return { ok: false, error: 'powerEffect.params.health doit être un nombre ≥ 0' };
      }
      out.health = params.health;
    }
    if (Object.keys(out).length > 0) validated.params = out;
  }
  if (obj.tokenId !== undefined && obj.tokenId !== null) {
    if (typeof obj.tokenId !== 'number' || !Number.isInteger(obj.tokenId)) {
      return { ok: false, error: 'powerEffect.tokenId doit être un entier ou null' };
    }
    validated.tokenId = obj.tokenId;
  }
  return { ok: true, value: validated };
}

function validateUsageLimit(raw: unknown): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    return { ok: false, error: "power_usage_limit doit être null (illimité) ou un entier ≥ 1" };
  }
  return { ok: true, value: raw };
}

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

// Legacy simplified race IDs from the original 9-race hero system. Still
// accepted so existing rows survive, and so heroes that don't pick a faction
// can still default to one of these.
const LEGACY_SIMPLIFIED_RACES = new Set([
  'elves', 'dwarves', 'halflings', 'humans', 'beastmen',
  'giants', 'dark_elves', 'orcs_goblins', 'undead',
]);

// Set of every race string that exists anywhere in FACTIONS[*].races. The
// HeroManager UI cascades faction → race using these values, so any race the
// user can pick from the dropdown lives in this set.
const FACTION_GRANULAR_RACES = new Set(
  Object.values(FACTIONS).flatMap((f) => f.races),
);

function isAllowedRace(race: string): boolean {
  return LEGACY_SIMPLIFIED_RACES.has(race) || FACTION_GRANULAR_RACES.has(race);
}

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
      name, race, faction, clan,
      power_name, power_cost, power_effect, power_description,
      power_usage_limit,
      glbBase64, glbMimeType, glbUrl,
      thumbnailBase64, thumbnailMimeType,
      powerImageBase64, powerImageMimeType,
      rarity, max_prints, is_default, is_active,
    } = body as Record<string, unknown>;

    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Nom requis' }, { status: 400 });
    }
    if (typeof race !== 'string' || !isAllowedRace(race)) {
      return NextResponse.json({ error: 'Race invalide' }, { status: 400 });
    }

    const fc = validateFactionClan(faction, clan);
    if (!fc.ok) return NextResponse.json({ error: fc.error }, { status: 400 });

    const peVal = validatePowerEffect(power_effect);
    if (!peVal.ok) return NextResponse.json({ error: peVal.error }, { status: 400 });

    const ulVal = validateUsageLimit(power_usage_limit);
    if (!ulVal.ok) return NextResponse.json({ error: ulVal.error }, { status: 400 });

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

    let finalPowerImageUrl: string | null = null;
    if (typeof powerImageBase64 === 'string' && typeof powerImageMimeType === 'string') {
      finalPowerImageUrl = await uploadToBucket(
        supabase, 'hero-models', powerImageBase64, powerImageMimeType, 'power_image',
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
      faction: fc.faction,
      clan: fc.clan,
      glb_url: finalGlbUrl,
      thumbnail_url: finalThumbnailUrl,
      power_image_url: finalPowerImageUrl,
    };

    if (typeof power_name === 'string') insert.power_name = power_name;
    if (typeof power_cost === 'number') insert.power_cost = power_cost;
    insert.power_effect = peVal.value;
    insert.power_usage_limit = ulVal.value;
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
      id, name, faction, clan,
      power_name, power_cost, power_effect, power_description,
      power_usage_limit,
      glbBase64, glbMimeType, glbUrl,
      thumbnailBase64, thumbnailMimeType,
      powerImageBase64, powerImageMimeType,
      rarity, max_prints, is_default, is_active,
    } = body as Record<string, unknown>;

    if (typeof id !== 'number') {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (typeof name === 'string') updates.name = name;
    if (faction !== undefined || clan !== undefined) {
      const fc = validateFactionClan(faction, clan);
      if (!fc.ok) return NextResponse.json({ error: fc.error }, { status: 400 });
      if (faction !== undefined) updates.faction = fc.faction;
      if (clan !== undefined) updates.clan = fc.clan;
    }
    if (typeof power_name === 'string') updates.power_name = power_name;
    if (typeof power_cost === 'number') updates.power_cost = power_cost;
    if (power_effect !== undefined) {
      const peVal = validatePowerEffect(power_effect);
      if (!peVal.ok) return NextResponse.json({ error: peVal.error }, { status: 400 });
      updates.power_effect = peVal.value;
    }
    if (power_usage_limit !== undefined) {
      const ulVal = validateUsageLimit(power_usage_limit);
      if (!ulVal.ok) return NextResponse.json({ error: ulVal.error }, { status: 400 });
      updates.power_usage_limit = ulVal.value;
    }
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

    if (typeof powerImageBase64 === 'string' && typeof powerImageMimeType === 'string') {
      updates.power_image_url = await uploadToBucket(
        supabase, 'hero-models', powerImageBase64, powerImageMimeType, 'power_image',
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
