// Chroma-key post-processing for hero portraits.
//
// The image-gen prompt instructs the model to fill everything outside the
// round frame with pure neon cyan (0, 255, 255). Imagen honors this almost
// exactly; Gemini (used when a reference image is attached) often drifts to a
// neighboring turquoise / teal. Rather than tuning a static tolerance for
// every drift, we detect the actual background color by sampling the four
// corners — which are mathematically guaranteed to be outside a round frame
// centered in a square image — and use that as the chroma key. Falls back
// to pure neon cyan if the corners disagree (e.g. the model ignored the
// instruction and produced a real scene).

import sharp from 'sharp';

export type ChromaKeyOptions = {
  // Override the auto-detected key. Useful for tests.
  key?: { r: number; g: number; b: number };
  // Squared RGB distance threshold. Pixels closer than this become fully
  // transparent.
  toleranceSq?: number;
  // Soft edge: pixels within this extra distance get partial transparency
  // (anti-aliased fringe) so the cutout looks clean.
  featherSq?: number;
};

const FALLBACK_KEY = { r: 0, g: 255, b: 255 };
const DEFAULT_TOLERANCE_SQ = 90 * 90;
const DEFAULT_FEATHER_SQ = 140 * 140;

// Pixel size of each corner sample patch.
const CORNER_PATCH = 24;
// Max RGB distance from the 4-corner mean before we consider the corners
// inconsistent (i.e. the model drew a real scene instead of a flat fill).
const CORNER_AGREEMENT_THRESHOLD = 35;

function avgPatch(
  data: Buffer,
  width: number,
  channels: number,
  x: number,
  y: number,
  size: number,
): { r: number; g: number; b: number } {
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const i = ((y + dy) * width + (x + dx)) * channels;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }
  return { r: r / n, g: g / n, b: b / n };
}

function detectCornerKey(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): { r: number; g: number; b: number } | null {
  if (width < CORNER_PATCH * 2 || height < CORNER_PATCH * 2) return null;
  const corners = [
    avgPatch(data, width, channels, 0, 0, CORNER_PATCH),
    avgPatch(data, width, channels, width - CORNER_PATCH, 0, CORNER_PATCH),
    avgPatch(data, width, channels, 0, height - CORNER_PATCH, CORNER_PATCH),
    avgPatch(data, width, channels, width - CORNER_PATCH, height - CORNER_PATCH, CORNER_PATCH),
  ];
  const mean = {
    r: corners.reduce((s, p) => s + p.r, 0) / corners.length,
    g: corners.reduce((s, p) => s + p.g, 0) / corners.length,
    b: corners.reduce((s, p) => s + p.b, 0) / corners.length,
  };
  for (const c of corners) {
    const d = Math.hypot(c.r - mean.r, c.g - mean.g, c.b - mean.b);
    if (d > CORNER_AGREEMENT_THRESHOLD) return null;
  }
  return {
    r: Math.round(mean.r),
    g: Math.round(mean.g),
    b: Math.round(mean.b),
  };
}

export async function chromaKeyToPng(
  inputBase64: string,
  _inputMimeType: string,
  opts: ChromaKeyOptions = {},
): Promise<{ base64: string; mimeType: string }> {
  const toleranceSq = opts.toleranceSq ?? DEFAULT_TOLERANCE_SQ;
  const featherSq = opts.featherSq ?? DEFAULT_FEATHER_SQ;

  const inputBuffer = Buffer.from(inputBase64, 'base64');

  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels; // 4 after ensureAlpha()
  const detected = opts.key ?? detectCornerKey(data, info.width, info.height, channels);
  const key = detected ?? FALLBACK_KEY;

  const px = Buffer.from(data);
  for (let i = 0; i < px.length; i += channels) {
    const dr = px[i] - key.r;
    const dg = px[i + 1] - key.g;
    const db = px[i + 2] - key.b;
    const distSq = dr * dr + dg * dg + db * db;
    if (distSq <= toleranceSq) {
      px[i + 3] = 0;
    } else if (distSq <= featherSq) {
      const t = (distSq - toleranceSq) / (featherSq - toleranceSq);
      px[i + 3] = Math.round(px[i + 3] * t);
    }
  }

  const out = await sharp(px, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return {
    base64: out.toString('base64'),
    mimeType: 'image/png',
  };
}
