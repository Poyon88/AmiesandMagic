import { NextResponse } from 'next/server';

const IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
];

export async function POST(request: Request) {
  const { prompt, referenceImageBase64, referenceImageMimeType } = await request.json();
  if (!prompt) {
    return NextResponse.json({ error: 'Prompt requis' }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY non configurée' }, { status: 500 });
  }

  // Build the multimodal parts: text prompt + optional reference image.
  const promptText = `Generate an image with absolutely no text, no letters, no words, no writing, no captions, no labels, no watermarks anywhere in the image. The image must contain zero readable characters. Description: ${prompt}`;
  const requestParts: Array<
    | { text: string }
    | { inline_data: { mime_type: string; data: string } }
  > = [{ text: promptText }];
  if (referenceImageBase64 && referenceImageMimeType) {
    requestParts.push({
      inline_data: {
        mime_type: referenceImageMimeType,
        data: referenceImageBase64,
      },
    });
  }

  // Try models in order until one works
  for (const model of IMAGE_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: requestParts }],
            generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
          }),
        }
      );

      const data = await res.json();

      if (data.error) {
        // If quota exceeded, try next model
        if (data.error.code === 429 || data.error.message?.includes('quota')) continue;
        // If model doesn't support image, try next
        if (data.error.code === 400) continue;
        throw new Error(data.error.message);
      }

      // Extract image from response
      const parts = data.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData);

      if (imagePart?.inlineData) {
        return NextResponse.json({
          imageBase64: imagePart.inlineData.data,
          mimeType: imagePart.inlineData.mimeType,
          model,
        });
      }

      // Model responded but no image — try next
      continue;
    } catch (err) {
      console.error(`[generate-image] ${model} failed:`, err);
      continue;
    }
  }

  return NextResponse.json(
    { error: 'Tous les modèles ont échoué. Réessayez dans quelques secondes (quota).' },
    { status: 503 }
  );
}
