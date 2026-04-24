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

// POST /api/heroes/upload-url
//
// Returns a signed upload URL against the `hero-models` bucket so the browser
// can stream large GLB files (up to the Supabase object size limit, 50 GB by
// default on paid tiers, 50 MB on free) straight to Supabase Storage without
// hitting Netlify Functions' ~6 MB body limit. The caller then POSTs /api/
// heroes with `glbUrl` set to the returned `publicUrl`.
//
// Input (optional): { ext?: "glb" | "gltf" }
// Output: { signedUrl, token, path, publicUrl }
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const rawExt = typeof body?.ext === 'string' ? body.ext.toLowerCase() : 'glb';
  const ext = /^(glb|gltf)$/.test(rawExt) ? rawExt : 'glb';
  const prefix = typeof body?.prefix === 'string' && /^[a-z_]{1,16}$/i.test(body.prefix)
    ? body.prefix
    : 'hero';
  const filePath = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const supabase = getAdminClient();
  const { data, error } = await supabase.storage
    .from('hero-models')
    .createSignedUploadUrl(filePath);
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'Impossible de créer l\'URL signée' },
      { status: 500 },
    );
  }

  const { data: urlData } = supabase.storage.from('hero-models').getPublicUrl(filePath);

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    path: filePath,
    publicUrl: urlData.publicUrl,
  });
}
