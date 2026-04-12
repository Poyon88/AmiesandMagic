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
    .select('*, music_tracks:music_track_id(id, name, file_url), tense_track:tense_track_id(id, name, file_url), victory_track:victory_track_id(id, name, file_url), defeat_track:defeat_track_id(id, name, file_url)')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();

  try {
    const { name, imageBase64, imageMimeType, music_track_id, tense_track_id, victory_track_id, defeat_track_id } = await request.json();
    if (!name || !imageBase64 || !imageMimeType) {
      return NextResponse.json({ error: 'Nom et image requis' }, { status: 400 });
    }

    const buffer = Buffer.from(imageBase64, 'base64');
    const ext = imageMimeType.split('/')[1] || 'webp';
    const filePath = `board_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('board-images')
      .upload(filePath, buffer, { upsert: true, contentType: imageMimeType });
    if (uploadErr) throw new Error(`Image: ${uploadErr.message}`);

    const { data: urlData } = supabase.storage.from('board-images').getPublicUrl(filePath);
    const image_url = urlData.publicUrl;

    const insertData: Record<string, unknown> = { name, image_url };
    if (music_track_id != null) insertData.music_track_id = music_track_id;
    if (tense_track_id != null) insertData.tense_track_id = tense_track_id;
    if (victory_track_id != null) insertData.victory_track_id = victory_track_id;
    if (defeat_track_id != null) insertData.defeat_track_id = defeat_track_id;

    const { error } = await supabase.from('game_boards').insert(insertData);
    if (error) throw new Error(error.message);

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
    const { id, name, is_active, music_track_id, tense_track_id, victory_track_id, defeat_track_id, imageBase64, imageMimeType } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (is_active !== undefined) updates.is_active = is_active;
    if (music_track_id !== undefined) updates.music_track_id = music_track_id;
    if (tense_track_id !== undefined) updates.tense_track_id = tense_track_id;
    if (victory_track_id !== undefined) updates.victory_track_id = victory_track_id;
    if (defeat_track_id !== undefined) updates.defeat_track_id = defeat_track_id;

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

    const { error } = await supabase.from('game_boards').update(updates).eq('id', id);
    if (error) throw new Error(error.message);

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
