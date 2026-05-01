import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { validateFactionClan, validateRace } from '@/lib/validation/faction-clan';

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
    }
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

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('game_boards')
    .select('*, music_tracks:music_track_id(id, name, file_url), tense_track:tense_track_id(id, name, file_url), victory_track:victory_track_id(id, name, file_url), defeat_track:defeat_track_id(id, name, file_url), game_board_music_tracks(track_id, music_tracks(id, name, file_url))')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();

  try {
    const {
      name,
      imageBase64, imageMimeType, imageUrl,
      music_track_id, tense_track_id, victory_track_id, defeat_track_id,
      rarity, max_prints, is_default,
      // MTGO layout extras: optional layout id ("classic" | "mtgo") and
      // optional graveyard image (base64 + mime). Stored in the new
      // `layout` and `graveyard_image_url` columns added by migration.
      layout,
      graveyardImageBase64, graveyardImageMimeType,
      faction, race, clan,
    } = await request.json();
    if (!name) return NextResponse.json({ error: 'Nom requis' }, { status: 400 });

    const fc = validateFactionClan(faction ?? null, clan ?? null);
    if (!fc.ok) return NextResponse.json({ error: fc.error }, { status: 400 });
    const rc = validateRace(race ?? null, fc.faction);
    if (!rc.ok) return NextResponse.json({ error: rc.error }, { status: 400 });

    // Image source: either base64 upload (legacy) OR an already-hosted public
    // URL produced by the direct /api/boards/upload-url flow. The latter
    // bypasses the body-size limit for large Imagen renders.
    let image_url: string;
    if (typeof imageUrl === 'string' && imageUrl.trim()) {
      image_url = imageUrl.trim();
    } else if (imageBase64 && imageMimeType) {
      const buffer = Buffer.from(imageBase64, 'base64');
      const ext = imageMimeType.split('/')[1] || 'webp';
      const filePath = `board_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('board-images')
        .upload(filePath, buffer, { upsert: true, contentType: imageMimeType });
      if (uploadErr) throw new Error(`Image: ${uploadErr.message}`);
      const { data: urlData } = supabase.storage.from('board-images').getPublicUrl(filePath);
      image_url = urlData.publicUrl;
    } else {
      return NextResponse.json({ error: 'Image requise (base64 ou URL)' }, { status: 400 });
    }

    // Optional graveyard image — uploaded to the same bucket as the main
    // board image so it shares the storage / signed-URL pipeline.
    let graveyard_image_url: string | null = null;
    if (graveyardImageBase64 && graveyardImageMimeType) {
      const buffer = Buffer.from(graveyardImageBase64, 'base64');
      const ext = (graveyardImageMimeType as string).split('/')[1] || 'webp';
      const filePath = `graveyard_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('board-images')
        .upload(filePath, buffer, { upsert: true, contentType: graveyardImageMimeType });
      if (uploadErr) throw new Error(`Cimetière: ${uploadErr.message}`);
      const { data: urlData } = supabase.storage.from('board-images').getPublicUrl(filePath);
      graveyard_image_url = urlData.publicUrl;
    }

    const insertData: Record<string, unknown> = { name, image_url };
    if (typeof layout === 'string' && (layout === 'classic' || layout === 'mtgo')) {
      insertData.layout = layout;
    }
    if (graveyard_image_url) insertData.graveyard_image_url = graveyard_image_url;
    if (music_track_id != null) insertData.music_track_id = music_track_id;
    if (tense_track_id != null) insertData.tense_track_id = tense_track_id;
    if (victory_track_id != null) insertData.victory_track_id = victory_track_id;
    if (defeat_track_id != null) insertData.defeat_track_id = defeat_track_id;
    if (rarity != null) insertData.rarity = rarity;
    if (max_prints != null) insertData.max_prints = max_prints;
    if (fc.faction) insertData.faction = fc.faction;
    if (rc.race) insertData.race = rc.race;
    if (fc.clan) insertData.clan = fc.clan;
    if (is_default === true) {
      // Only one default allowed — clear any previous one.
      await supabase.from('game_boards').update({ is_default: false }).eq('is_default', true);
      insertData.is_default = true;
    }

    const { data: inserted, error } = await supabase
      .from('game_boards')
      .insert(insertData)
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    // Mirror the legacy single-track pick into the playlist join table so the
    // new board starts with a consistent playlist membership.
    if (inserted?.id && music_track_id != null) {
      await supabase.from('game_board_music_tracks').insert({ board_id: inserted.id, track_id: music_track_id });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();

  try {
    const { id, name, is_active, music_track_id, music_track_ids, tense_track_id, victory_track_id, defeat_track_id, imageBase64, imageMimeType, rarity, max_prints, is_default } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (is_active !== undefined) updates.is_active = is_active;
    if (music_track_id !== undefined) updates.music_track_id = music_track_id;
    if (tense_track_id !== undefined) updates.tense_track_id = tense_track_id;
    if (victory_track_id !== undefined) updates.victory_track_id = victory_track_id;
    if (defeat_track_id !== undefined) updates.defeat_track_id = defeat_track_id;
    if (rarity !== undefined) updates.rarity = rarity;
    if (max_prints !== undefined) updates.max_prints = max_prints;

    if (is_default === true) {
      // Clear any other default before setting this one (partial unique index).
      await supabase.from('game_boards').update({ is_default: false }).eq('is_default', true).neq('id', id);
      updates.is_default = true;
    } else if (is_default === false) {
      updates.is_default = false;
    }

    if (imageBase64 && imageMimeType) {
      const buffer = Buffer.from(imageBase64, 'base64');
      const ext = imageMimeType.split('/')[1] || 'webp';
      const filePath = `board_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('board-images')
        .upload(filePath, buffer, { upsert: true, contentType: imageMimeType });
      if (uploadErr) throw new Error(`Image: ${uploadErr.message}`);

      const { data: urlData } = supabase.storage.from('board-images').getPublicUrl(filePath);
      updates.image_url = urlData.publicUrl;
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from('game_boards').update(updates).eq('id', id);
      if (error) throw new Error(error.message);
    }

    // Replace playlist membership when the caller passed music_track_ids.
    if (Array.isArray(music_track_ids)) {
      const { error: delErr } = await supabase.from('game_board_music_tracks').delete().eq('board_id', id);
      if (delErr) throw new Error(delErr.message);
      if (music_track_ids.length > 0) {
        const rows = music_track_ids
          .filter((tid: unknown) => typeof tid === 'number')
          .map((tid: number) => ({ board_id: id, track_id: tid }));
        if (rows.length > 0) {
          const { error: insErr } = await supabase.from('game_board_music_tracks').insert(rows);
          if (insErr) throw new Error(insErr.message);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();

  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    // Get the board to find the image path
    const { data: board } = await supabase.from('game_boards').select('image_url').eq('id', id).single();
    if (board?.image_url) {
      const url = new URL(board.image_url);
      const storagePath = url.pathname.split('/board-images/')[1];
      if (storagePath) {
        await supabase.storage.from('board-images').remove([storagePath]);
      }
    }

    const { error } = await supabase.from('game_boards').delete().eq('id', id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}
