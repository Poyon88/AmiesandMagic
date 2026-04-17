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
  const { data, error } = await supabase
    .from('keyword_icons')
    .select('keyword, icon_url');

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

  if (!keyword) return NextResponse.json({ error: 'keyword requis' }, { status: 400 });

  if (file) {
    // Upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split('.').pop() ?? 'png';
    const filePath = `keyword_${keyword}_${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('card-images')
      .upload(filePath, buffer, { upsert: true, contentType: file.type });

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: urlData } = supabase.storage
      .from('card-images')
      .getPublicUrl(filePath);

    const iconUrl = urlData.publicUrl;

    // Upsert in keyword_icons table
    const { error } = await supabase
      .from('keyword_icons')
      .upsert({ keyword, icon_url: iconUrl, updated_at: new Date().toISOString() }, { onConflict: 'keyword' });

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
