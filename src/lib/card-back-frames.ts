// Registry of card-back frame overlays composited on top of the AI-generated
// illustration. Each frame is a full-canvas SVG with a transparent rectangle
// in the middle — the `innerAreaPct` tells the composer where the artwork
// should land. Composition is deterministic → no more fighting with the AI
// over clean ornamental borders.

export type CardBackFrameDef = {
  id: string;
  label: string;
  /** Public URL of the SVG overlay (served from /public). */
  svgPath: string;
  /** Transparent window coordinates, expressed as 0-1 fractions of the
   *  output canvas. The illustration is cover-fit inside this rectangle. */
  innerAreaPct: { x: number; y: number; w: number; h: number };
  /** Final composited image size, locked at the in-game 5:7 card ratio. */
  outputWidth: number;
  outputHeight: number;
};

// Frame registry. Add a new SVG to /public/card-back-frames/ and a new
// entry here to make it selectable in the forge.
export const CARD_BACK_FRAMES: CardBackFrameDef[] = [
  {
    id: "default",
    label: "Cadre standard",
    svgPath: "/card-back-frames/default.svg",
    // Inner window is x=45, y=60, w=410, h=580 in the SVG's 500×700 viewBox.
    innerAreaPct: {
      x: 45 / 500,
      y: 60 / 700,
      w: 410 / 500,
      h: 580 / 700,
    },
    // 1024 wide at 5:7 → 1433.6 rounded to 1434 → close enough that the
    // rounding error is invisible.
    outputWidth: 1024,
    outputHeight: 1434,
  },
  {
    id: "simple_black",
    label: "Simple Black",
    svgPath: "/card-back-frames/simple_black.svg",
    // Uniform 22.5 SVG-units border on all four sides → inner window
    // x=22.5, y=22.5, w=455, h=655. Keeps top/bottom visually as thin as
    // left/right once composited to 1024×1434 pixels.
    innerAreaPct: {
      x: 22.5 / 500,
      y: 22.5 / 700,
      w: 455 / 500,
      h: 655 / 700,
    },
    outputWidth: 1024,
    outputHeight: 1434,
  },
];

export function getCardBackFrame(id: string): CardBackFrameDef {
  return CARD_BACK_FRAMES.find((f) => f.id === id) ?? CARD_BACK_FRAMES[0];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

// Detects and removes uniform borders (transparent / near-black / near-white)
// around an image. Useful when an admin uploads artwork that already has its
// own matte, letterbox or passepartout — the frame below would otherwise
// double-up the padding.
//
// A row/column counts as "border" if at least 96% of its pixels are one of:
//   - transparent (alpha < 12)
//   - near-black (R+G+B < 45, e.g. pitch-black letterboxes)
//   - near-white / near-cream (R+G+B > 690, e.g. passepartout mats, ivory
//     padding, off-white margins that AI sometimes paints).
// The scan walks inward from each edge and stops at the first content line.
export async function autoTrimDarkBorders(
  base64: string,
  mime: string,
): Promise<{ base64: string; mime: string }> {
  const img = await loadImage(`data:${mime};base64,${base64}`);
  const w = img.width;
  const h = img.height;

  const probe = document.createElement("canvas");
  probe.width = w;
  probe.height = h;
  const pctx = probe.getContext("2d");
  if (!pctx) return { base64, mime };
  pctx.drawImage(img, 0, 0);
  const { data } = pctx.getImageData(0, 0, w, h);

  const BORDER_RATIO = 0.96;
  const isBorderPixel = (r: number, g: number, b: number, a: number) => {
    if (a < 12) return true;           // transparent
    const sum = r + g + b;
    if (sum < 45) return true;         // near-black
    if (sum > 690) return true;        // near-white / cream / ivory
    return false;
  };

  const rowIsBorder = (y: number) => {
    let match = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (isBorderPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) match++;
    }
    return match / w >= BORDER_RATIO;
  };
  const colIsBorder = (x: number) => {
    let match = 0;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      if (isBorderPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) match++;
    }
    return match / h >= BORDER_RATIO;
  };

  let top = 0;
  while (top < h - 1 && rowIsBorder(top)) top++;
  let bottom = h - 1;
  while (bottom > top + 1 && rowIsBorder(bottom)) bottom--;
  let left = 0;
  while (left < w - 1 && colIsBorder(left)) left++;
  let right = w - 1;
  while (right > left + 1 && colIsBorder(right)) right--;

  const sw = right - left + 1;
  const sh = bottom - top + 1;
  // Skip the crop if nothing meaningful to trim (noisy content reaches the
  // edges) or if trimming would leave a tiny sliver.
  if (sw < w * 0.4 || sh < h * 0.4) return { base64, mime };
  if (left === 0 && top === 0 && sw === w && sh === h) return { base64, mime };

  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  const octx = out.getContext("2d");
  if (!octx) return { base64, mime };
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(img, left, top, sw, sh, 0, 0, sw, sh);

  const dataUrl = out.toDataURL("image/webp", 0.95);
  return { base64: dataUrl.split(",")[1], mime: "image/webp" };
}

// Composites an illustration into the fixed frame overlay and returns a
// WebP base64. The illustration is cover-fit (cropped, never letterboxed) so
// the frame always shows artwork flush against its inner stroke.
export async function composeCardBack(
  illustrationBase64: string,
  illustrationMime: string,
  frame: CardBackFrameDef,
): Promise<{ base64: string; mime: string }> {
  const [illustration, frameImg] = await Promise.all([
    loadImage(`data:${illustrationMime};base64,${illustrationBase64}`),
    loadImage(frame.svgPath),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = frame.outputWidth;
  canvas.height = frame.outputHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context indisponible");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Solid backdrop so transparent pixels outside the frame don't bleed
  // through to whatever renders the image later.
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const iX = frame.innerAreaPct.x * frame.outputWidth;
  const iY = frame.innerAreaPct.y * frame.outputHeight;
  const iW = frame.innerAreaPct.w * frame.outputWidth;
  const iH = frame.innerAreaPct.h * frame.outputHeight;

  // Cover-fit illustration into the inner window.
  const srcRatio = illustration.width / illustration.height;
  const dstRatio = iW / iH;
  let sx: number, sy: number, sw: number, sh: number;
  if (srcRatio > dstRatio) {
    // source wider than target → crop horizontally
    sh = illustration.height;
    sw = sh * dstRatio;
    sx = (illustration.width - sw) / 2;
    sy = 0;
  } else {
    // source taller than target → crop vertically
    sw = illustration.width;
    sh = sw / dstRatio;
    sx = 0;
    sy = (illustration.height - sh) / 2;
  }
  ctx.drawImage(illustration, sx, sy, sw, sh, iX, iY, iW, iH);

  // Overlay the frame SVG on top — SVG scales cleanly to any output size.
  ctx.drawImage(frameImg, 0, 0, frame.outputWidth, frame.outputHeight);

  const dataUrl = canvas.toDataURL("image/webp", 0.95);
  return { base64: dataUrl.split(",")[1], mime: "image/webp" };
}
