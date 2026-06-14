import { NextResponse } from 'next/server';
import { generateImage, GenerateImageError } from '@/lib/ai/generate-image';
import { requireAdmin } from '@/lib/admin/requireAdmin';

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const {
    prompt,
    referenceImageBase64,
    referenceImageMimeType,
    highRes,
    aspectRatio,
  } = (await request.json()) as {
    prompt?: string;
    referenceImageBase64?: string;
    referenceImageMimeType?: string;
    highRes?: boolean;
    aspectRatio?: string;
  };

  try {
    const result = await generateImage({
      prompt: prompt ?? '',
      highRes,
      aspectRatio,
      referenceImageBase64,
      referenceImageMimeType,
    });
    return NextResponse.json(result);
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
