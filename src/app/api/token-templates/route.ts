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
    .from('token_templates')
    .select('*')
    .order('race');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();

  try {
    const { race, name, imageBase64, imageMimeType, updateId } = await request.json();
    if (!race || !name) return NextResponse.json({ error: 'Race et nom requis' }, { status: 400 });

    let image_url: string | null = null;
    if (imageBase64 && imageMimeType) {
      const buffer = Buffer.from(imageBase64, 'base64');
      const ext = imageMimeType.split('/')[1] || 'webp';
      const filePath = `token_${race.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('card-images')
        .upload(filePath, buffer, { upsert: true, contentType: imageMimeType });
      if (uploadErr) throw new Error(`Image: ${uploadErr.message}`);
      const { data: urlData } = supabase.storage.from('card-images').getPublicUrl(filePath);
      image_url = urlData.publicUrl;
    }

    const templateData: Record<string, unknown> = { race, name };
    if (image_url) templateData.image_url = image_url;

    if (updateId) {
      const { error: updateErr } = await supabase
        .from('token_templates')
        .update(templateData)
        .eq('id', updateId);
      if (updateErr) throw new Error(updateErr.message);
      return NextResponse.json({ success: true, updated: true });
    } else {
      if (!image_url) templateData.image_url = null;
      const { error: insertErr } = await supabase.from('token_templates').insert(templateData);
      if (insertErr) throw new Error(insertErr.message);
      return NextResponse.json({ success: true, updated: false });
    }
  } catch (err) {
    console.error('[token-templates] error:', err);
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

    const { error } = await supabase.from('token_templates').delete().eq('id', id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[token-templates] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}
