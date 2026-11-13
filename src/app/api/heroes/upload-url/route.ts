import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';

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
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const rawExt = typeof body?.ext === 'string' ? body.ext.toLowerCase() : 'glb';
  const ext = /^(glb|gltf)$/.test(rawExt) ? rawExt : 'glb';
  const prefix = typeof body?.prefix === 'string' && /^[a-z_]{1,16}$/i.test(body.prefix)
    ? body.prefix
    : 'hero';
  const filePath = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const supabase = auth.supabase;
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
