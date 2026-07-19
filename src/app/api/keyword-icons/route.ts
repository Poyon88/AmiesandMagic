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

// GET /api/keyword-icons — public, returns all custom icons
export async function GET() {
  const supabase = getAdminClient();
  // Tente d'inclure `scale` ; repli si la colonne n'existe pas encore (migration
  // non appliquée) pour ne jamais casser l'affichage des icônes.
  let { data, error } = await supabase
    .from('keyword_icons')
    .select('keyword, icon_url, scale');
  if (error) {
    ({ data, error } = await supabase.from('keyword_icons').select('keyword, icon_url'));
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ icons: data ?? [] });
}

// POST /api/keyword-icons — admin only, upload icon for a keyword
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const formData = await request.formData();
  const keyword = formData.get('keyword') as string;
  const file = formData.get('file') as File | null;
  const scaleRaw = formData.get('scale');

  if (!keyword) return NextResponse.json({ error: 'keyword requis' }, { status: 400 });

  // Parse an optional `scale` (facteur d'échelle d'affichage). Borné à
  // [0.25, 4] pour éviter les valeurs aberrantes.
  let scale: number | null = null;
  if (scaleRaw != null && scaleRaw !== '') {
    const n = Number(scaleRaw);
    if (!Number.isFinite(n)) return NextResponse.json({ error: 'scale invalide' }, { status: 400 });
    scale = Math.min(4, Math.max(0.25, n));
  }

  // Mise à jour de l'échelle seule (sans nouveau fichier) : l'icône doit déjà
  // exister (l'échelle n'a de sens qu'avec une image uploadée).
  if (!file && scale != null) {
    const { error } = await supabase
      .from('keyword_icons')
      .update({ scale, updated_at: new Date().toISOString() })
      .eq('keyword', keyword);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, scale });
  }

  if (file) {
    // Upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split('.').pop() ?? 'png';
    const filePath = `keyword_${keyword}_${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('card-images')
      .upload(filePath, buffer, { upsert: true, contentType: file.type, cacheControl: '31536000' });

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: urlData } = supabase.storage
      .from('card-images')
      .getPublicUrl(filePath);

    const iconUrl = urlData.publicUrl;

    // Upsert in keyword_icons table. `scale` n'est inclus que s'il est fourni,
    // pour ne pas réinitialiser l'échelle existante lors d'un simple ré-upload.
    const row: Record<string, unknown> = { keyword, icon_url: iconUrl, updated_at: new Date().toISOString() };
    if (scale != null) row.scale = scale;
    const { error } = await supabase
      .from('keyword_icons')
      .upsert(row, { onConflict: 'keyword' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, icon_url: iconUrl });
  }

  return NextResponse.json({ error: 'Fichier requis' }, { status: 400 });
}

// DELETE /api/keyword-icons — admin only, reset to default emoji
export async function DELETE(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = getAdminClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const body = await request.json();
  const { keyword } = body as { keyword: string };

  if (!keyword) return NextResponse.json({ error: 'keyword requis' }, { status: 400 });

  await supabase.from('keyword_icons').delete().eq('keyword', keyword);

  return NextResponse.json({ success: true });
}
