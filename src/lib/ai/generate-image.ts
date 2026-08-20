// Shared image-generation helper used by both /api/cards/generate-image (card
// art / icons / card backs) and /api/heroes/generate-portrait (hero portraits).
//
// Strategy: when `highRes` is set and no reference image is attached, try the
// Imagen :predict endpoint (up to 2K on Imagen 4 Ultra). Otherwise — or if all
// Imagen models are exhausted — fall back to Gemini multimodal which supports
// reference-image conditioning but caps at ~1024px.

// ORDRE = ORDRE D'ESSAI, du plus récent au plus ancien. La boucle s'arrête au
// premier modèle qui répond : le premier de la liste est donc celui qui sert
// réellement tant qu'il fonctionne, les suivants ne sont que des filets.
//
// La liste était rangée à l'envers (2.5 en tête) : dès qu'une image de référence
// était jointe — seul cas qui emprunte ce chemin — c'était toujours 2.5 Flash
// qui produisait l'illustration, et les modèles 3.x n'étaient jamais atteints.
//
// En ajouter un : le mettre EN TÊTE, pas à la suite.
const GEMINI_MODELS = [
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
  'gemini-2.5-flash-image',
];

// Même convention : le plus récent d'abord. Cette liste-ci l'était déjà.
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
  /** Modèle IMPOSÉ. Sans lui, la cascade habituelle s'applique. Avec lui, aucun
   *  repli : comparer deux modèles n'a de sens que si l'on sait lequel a
   *  répondu, et un repli silencieux ferait passer le rendu de l'un pour celui
   *  de l'autre. Un échec est donc remonté tel quel. */
  model?: string;
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
  errorSink: string[],
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
    errorSink.push(`${model}: [${data.error.code}] ${data.error.message}`);
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
  errorSink: string[],
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
    errorSink.push(`${model}: [${data.error.code}] ${data.error.message}`);
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

  const promptTexteBase = `Generate an image with absolutely no text, no letters, no words, no writing, no captions, no labels, no watermarks anywhere in the image. The image must contain zero readable characters. Description: ${prompt}`;
  const promptText = promptTexteBase;
  const ratio = aspectRatio ?? '1:1';
  const hasReference = !!(referenceImageBase64 && referenceImageMimeType);
  const errorSink: string[] = [];

  // MODÈLE IMPOSÉ (comparaison depuis la forge) : un seul essai, et l'échec
  // remonte au lieu de glisser vers un autre modèle.
  if (opts.model) {
    const impose = opts.model;
    const estImagen = impose.startsWith('imagen-');
    const result = estImagen
      ? await callImagen(impose, promptText, apiKey, ratio, '2K', errorSink)
      : await callGemini(impose, promptText, apiKey, errorSink, referenceImageBase64, referenceImageMimeType);
    if (result) return result;
    throw new GenerateImageError(
      `Le modèle « ${impose} » n'a rien renvoyé. Détails: ${errorSink.join(' | ') || '(aucune erreur capturée)'}`,
      502,
    );
  }

  // Imagen path — high-res, no reference image. If a reference was attached,
  // skip Imagen entirely since its :predict endpoint doesn't accept inline
  // image conditioning the way Gemini's multimodal does.
  if (highRes && !hasReference) {
    for (const model of IMAGEN_MODELS_2K) {
      try {
        const result = await callImagen(model, promptText, apiKey, ratio, '2K', errorSink);
        if (result) return result;
      } catch (err) {
        errorSink.push(`${model}: ${err instanceof Error ? err.message : String(err)}`);
        console.error(`[generate-image] Imagen ${model} failed:`, err);
      }
    }
  }

  // Imagen a été tenté et n'a rien donné : on le DIT. Ces échecs ne remontaient
  // jusqu'ici que si Gemini échouait lui aussi — or c'est précisément quand
  // Gemini réussit que le silence trompe : l'illustration part en résolution
  // Gemini alors que l'auteur croit obtenir du 2K.
  if (highRes && !hasReference && errorSink.length > 0) {
    console.warn(`[generate-image] Imagen indisponible, repli sur Gemini. ${errorSink.join(' | ')}`);
  }

  // Gemini multimodal — supports reference images, lower max resolution.
  for (const model of GEMINI_MODELS) {
    try {
      const result = await callGemini(
        model,
        promptText,
        apiKey,
        errorSink,
        referenceImageBase64,
        referenceImageMimeType,
      );
      if (result) return result;
    } catch (err) {
      errorSink.push(`${model}: ${err instanceof Error ? err.message : String(err)}`);
      console.error(`[generate-image] Gemini ${model} failed:`, err);
    }
  }

  // Classify the failure: invalid key (401/403 or "API key not valid") vs quota
  // (429) vs unknown model (404) vs everything else.
  const joined = errorSink.join(' | ');
  const looksLikeAuth = /API key not valid|API_KEY_INVALID|\b401\b|\b403\b|PERMISSION_DENIED|UNAUTHENTICATED/i.test(joined);
  const looksLikeQuota = /\b429\b|quota|RESOURCE_EXHAUSTED/i.test(joined);
  const looksLikeNotFound = /\b404\b|not found|NOT_FOUND/i.test(joined);

  const message = looksLikeAuth
    ? `Clé GEMINI_API_KEY invalide ou sans accès au modèle. Détails: ${joined}`
    : looksLikeQuota
      ? `Quota Gemini atteint. Réessaye dans quelques secondes. Détails: ${joined}`
      : looksLikeNotFound
        ? `Aucun modèle disponible (404). Les noms de modèles sont peut-être obsolètes. Détails: ${joined}`
        : `Tous les modèles ont échoué. Détails: ${joined || '(aucune erreur capturée)'}`;
  throw new GenerateImageError(message, 503);
}
