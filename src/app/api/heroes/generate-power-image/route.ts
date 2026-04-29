import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { generateImage, GenerateImageError } from '@/lib/ai/generate-image';

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

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await request.json().catch(() => ({})) as {
    prompt?: string;
    referenceImageBase64?: string;
    referenceImageMimeType?: string;
  };

  const { prompt, referenceImageBase64, referenceImageMimeType } = body;

  if (typeof prompt !== 'string' || !prompt.trim()) {
    return NextResponse.json({ error: 'Prompt requis' }, { status: 400 });
  }
  if (typeof referenceImageBase64 !== 'string' || !referenceImageBase64) {
    return NextResponse.json({ error: 'Image de référence (portrait du héros) requise' }, { status: 400 });
  }
  if (typeof referenceImageMimeType !== 'string' || !referenceImageMimeType) {
    return NextResponse.json({ error: 'MIME type de la référence requis' }, { status: 400 });
  }

  try {
    // Reference image present → forces Gemini multimodal path. Imagen :predict
    // doesn't accept inline image conditioning, so highRes flag is irrelevant
    // here. We still hint the desired aspect ratio via the prompt itself.
    const result = await generateImage({
      prompt,
      aspectRatio: '5:7',
      referenceImageBase64,
      referenceImageMimeType,
    });
    // No chroma-key here — the power image is full-bleed art that sits inside
    // the HeroPowerCastOverlay frame, not a transparent cutout.
    return NextResponse.json({
      imageBase64: result.imageBase64,
      mimeType: result.mimeType,
      model: result.model,
    });
  } catch (err) {
    if (err instanceof GenerateImageError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 },
    );
  }
}
