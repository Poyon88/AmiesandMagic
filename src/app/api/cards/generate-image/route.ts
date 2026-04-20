import { NextResponse } from 'next/server';

// Gemini multimodal image generation — supports reference images but caps at
// ~1024px native. Used for card illustrations, icons, card backs, and as a
// fallback whenever Imagen can't be used or fails.
const GEMINI_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
];

// Imagen — higher native resolution (up to 2K on Ultra). Single-prompt only,
// no reference-image support on this endpoint. Selected when the caller sets
// `highRes: true` and doesn't attach a reference image.
const IMAGEN_MODELS_2K = [
  'imagen-4.0-ultra-generate-001',
  'imagen-4.0-generate-001',
  'imagen-3.0-generate-002',
];

type ImageResult = {
  imageBase64: string;
  mimeType: string;
  model: string;
};

async function callImagen(
  model: string,
  prompt: string,
  apiKey: string,
  aspectRatio: string,
  size: '1K' | '2K',
): Promise<ImageResult | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio,
          // `sampleImageSize` is only honored by Imagen 4 Ultra; other Imagen
          // models silently ignore it and return their default resolution.
          sampleImageSize: size,
        },
      }),
    },
  );
  const data = await res.json();
  if (data.error) {
    if (data.error.code === 429 || data.error.message?.includes('quota')) return null;
    if (data.error.code === 400 || data.error.code === 404) return null;
    throw new Error(data.error.message);
  }
  const pred = data.predictions?.[0];
  if (pred?.bytesBase64Encoded) {
    return {
      imageBase64: pred.bytesBase64Encoded,
      mimeType: pred.mimeType ?? 'image/png',
      model,
    };
  }
  return null;
}

async function callGemini(
  model: string,
  promptText: string,
  apiKey: string,
  referenceImageBase64?: string,
  referenceImageMimeType?: string,
): Promise<ImageResult | null> {
  const parts: Array<
    | { text: string }
    | { inline_data: { mime_type: string; data: string } }
  > = [{ text: promptText }];
  if (referenceImageBase64 && referenceImageMimeType) {
    parts.push({
      inline_data: {
        mime_type: referenceImageMimeType,
        data: referenceImageBase64,
      },
    });
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
      }),
    },
  );
  const data = await res.json();
  if (data.error) {
    if (data.error.code === 429 || data.error.message?.includes('quota')) return null;
    if (data.error.code === 400 || data.error.code === 404) return null;
    throw new Error(data.error.message);
  }
  const candidateParts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = candidateParts.find(
    (p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData,
  );
  if (imagePart?.inlineData) {
    return {
      imageBase64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType,
      model,
    };
  }
  return null;
}

export async function POST(request: Request) {
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

  if (!prompt) {
    return NextResponse.json({ error: 'Prompt requis' }, { status: 400 });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY non configurée' }, { status: 500 });
  }

  const promptText = `Generate an image with absolutely no text, no letters, no words, no writing, no captions, no labels, no watermarks anywhere in the image. The image must contain zero readable characters. Description: ${prompt}`;
  const ratio = aspectRatio ?? '1:1';
  const hasReference = !!(referenceImageBase64 && referenceImageMimeType);

  // Imagen path — high-res, no reference image. If a reference was attached,
  // skip Imagen entirely since its :predict endpoint doesn't accept inline
  // image conditioning the way Gemini's multimodal does.
  if (highRes && !hasReference) {
    for (const model of IMAGEN_MODELS_2K) {
      try {
        const result = await callImagen(model, promptText, apiKey, ratio, '2K');
        if (result) return NextResponse.json(result);
      } catch (err) {
        console.error(`[generate-image] Imagen ${model} failed:`, err);
        // continue to next model / fallback
      }
    }
    // Imagen exhausted — fall through to Gemini as a last resort.
  }

  // Gemini multimodal path — supports reference images, lower max resolution.
  for (const model of GEMINI_MODELS) {
    try {
      const result = await callGemini(
        model,
        promptText,
        apiKey,
        referenceImageBase64,
        referenceImageMimeType,
      );
      if (result) return NextResponse.json(result);
    } catch (err) {
      console.error(`[generate-image] Gemini ${model} failed:`, err);
    }
  }

  return NextResponse.json(
    { error: 'Tous les modèles ont échoué. Réessayez dans quelques secondes (quota).' },
    { status: 503 },
  );
}
