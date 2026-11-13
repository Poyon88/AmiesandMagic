import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';

// POST /api/boards/upload-url
//
// Returns a signed upload URL for the `board-images` bucket so large board
// artwork (Imagen 4 Ultra 2K renders weigh 5-15 MB as base64) can be streamed
// straight to Supabase Storage instead of going through the Netlify Function
// body — which caps at ~6 MB and breaks the JSON parser on larger payloads.
//
// Input (optional): { ext?: "png" | "jpg" | "jpeg" | "webp" }
// Output: { signedUrl, token, path, publicUrl }
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const rawExt = typeof body?.ext === 'string' ? body.ext.toLowerCase().replace(/^\./, '') : 'webp';
  const ext = /^(png|jpg|jpeg|webp)$/.test(rawExt) ? rawExt : 'webp';
  const filePath = `board_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const supabase = auth.supabase;
  const { data, error } = await supabase.storage
    .from('board-images')
    .createSignedUploadUrl(filePath);
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'Impossible de créer l\'URL signée' },
      { status: 500 },
    );
  }

  const { data: urlData } = supabase.storage.from('board-images').getPublicUrl(filePath);

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    path: filePath,
    publicUrl: urlData.publicUrl,
  });
}
