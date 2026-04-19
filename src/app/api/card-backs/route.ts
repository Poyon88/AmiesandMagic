import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
    .from('card_backs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();

  try {
    const { name, imageBase64, imageMimeType, rarity, max_prints, is_default } = await request.json();
    if (!name || !imageBase64 || !imageMimeType) {
      return NextResponse.json({ error: 'Nom et image requis' }, { status: 400 });
    }

    const buffer = Buffer.from(imageBase64, 'base64');
    const ext = imageMimeType.split('/')[1] || 'webp';
    const filePath = `card_back_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('card-back-images')
      .upload(filePath, buffer, { upsert: true, contentType: imageMimeType });
    if (uploadErr) throw new Error(`Image: ${uploadErr.message}`);

    const { data: urlData } = supabase.storage.from('card-back-images').getPublicUrl(filePath);
    const image_url = urlData.publicUrl;

    const insertData: Record<string, unknown> = { name, image_url };
    if (rarity != null) insertData.rarity = rarity;
    if (max_prints != null) insertData.max_prints = max_prints;
    if (is_default === true) {
      await supabase.from('card_backs').update({ is_default: false }).eq('is_default', true);
      insertData.is_default = true;
    }

    const { data: inserted, error } = await supabase
      .from('card_backs')
      .insert(insertData)
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, id: inserted?.id });
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
    const { id, name, is_active, rarity, max_prints, is_default, imageBase64, imageMimeType } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (is_active !== undefined) updates.is_active = is_active;
    if (rarity !== undefined) updates.rarity = rarity;
    if (max_prints !== undefined) updates.max_prints = max_prints;

    if (is_default === true) {
      await supabase.from('card_backs').update({ is_default: false }).eq('is_default', true).neq('id', id);
      updates.is_default = true;
    } else if (is_default === false) {
      updates.is_default = false;
    }

    if (imageBase64 && imageMimeType) {
      const buffer = Buffer.from(imageBase64, 'base64');
      const ext = imageMimeType.split('/')[1] || 'webp';
      const filePath = `card_back_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('card-back-images')
        .upload(filePath, buffer, { upsert: true, contentType: imageMimeType });
      if (uploadErr) throw new Error(`Image: ${uploadErr.message}`);

      const { data: urlData } = supabase.storage.from('card-back-images').getPublicUrl(filePath);
      updates.image_url = urlData.publicUrl;
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from('card_backs').update(updates).eq('id', id);
      if (error) throw new Error(error.message);
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

    const { data: cb } = await supabase.from('card_backs').select('image_url').eq('id', id).single();
    if (cb?.image_url) {
      const url = new URL(cb.image_url);
      const storagePath = url.pathname.split('/card-back-images/')[1];
      if (storagePath) {
        await supabase.storage.from('card-back-images').remove([storagePath]);
      }
    }

    const { error } = await supabase.from('card_backs').delete().eq('id', id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}
