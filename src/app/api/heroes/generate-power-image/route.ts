import { NextResponse } from 'next/server';
import { enforceAiQuota } from '@/lib/ai/rate-limit';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { generateImage, GenerateImageError } from '@/lib/ai/generate-image';

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const quota = await enforceAiQuota(auth.user.id, 'hero_power_image');
  if (!quota.ok) return quota.response;

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
