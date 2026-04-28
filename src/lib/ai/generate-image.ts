// Shared image-generation helper used by both /api/cards/generate-image (card
// art / icons / card backs) and /api/heroes/generate-portrait (hero portraits).
//
// Strategy: when `highRes` is set and no reference image is attached, try the
// Imagen :predict endpoint (up to 2K on Imagen 4 Ultra). Otherwise — or if all
// Imagen models are exhausted — fall back to Gemini multimodal which supports
// reference-image conditioning but caps at ~1024px.

const GEMINI_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
];

const IMAGEN_MODELS_2K = [
  'imagen-4.0-ultra-generate-001',
  'imagen-4.0-generate-001',
  'imagen-3.0-generate-002',
];

export type GenerateImageOptions = {
  prompt: string;
  highRes?: boolean;
  aspectRatio?: string;
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
};

export type GenerateImageResult = {
  imageBase64: string;
  mimeType: string;
  model: string;
};

export class GenerateImageError extends Error {
  constructor(message: string, public status: number = 500) {
    super(message);
    this.name = 'GenerateImageError';
  }
}

async function callImagen(
  model: string,
  prompt: string,
  apiKey: string,
  aspectRatio: string,
  size: '1K' | '2K',
): Promise<GenerateImageResult | null> {
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
): Promise<GenerateImageResult | null> {
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

export async function generateImage(opts: GenerateImageOptions): Promise<GenerateImageResult> {
  const { prompt, highRes, aspectRatio, referenceImageBase64, referenceImageMimeType } = opts;
  if (!prompt) throw new GenerateImageError('Prompt requis', 400);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GenerateImageError('GEMINI_API_KEY non configurée', 500);

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
        if (result) return result;
      } catch (err) {
        console.error(`[generate-image] Imagen ${model} failed:`, err);
      }
    }
  }

  // Gemini multimodal — supports reference images, lower max resolution.
  for (const model of GEMINI_MODELS) {
    try {
      const result = await callGemini(
        model,
        promptText,
        apiKey,
        referenceImageBase64,
        referenceImageMimeType,
      );
      if (result) return result;
    } catch (err) {
      console.error(`[generate-image] Gemini ${model} failed:`, err);
    }
  }

  throw new GenerateImageError(
    'Tous les modèles ont échoué. Réessayez dans quelques secondes (quota).',
    503,
  );
}
