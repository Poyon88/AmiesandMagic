import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { toWebp } from "./toWebp";

async function jpeg(w: number, h: number): Promise<Buffer> {
  // Image bruitée : un aplat se compresserait trop bien pour être représentatif.
  const px = Buffer.alloc(w * h * 3);
  for (let i = 0; i < px.length; i++) px[i] = (i * 7919) % 251;
  return sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
}

describe("toWebp", () => {
  it("convertit un JPEG en webp à la même résolution, plus léger", async () => {
    const src = await jpeg(424, 632);
    const r = await toWebp(src, "image/jpeg");
    expect(r.mimeType).toBe("image/webp");
    expect(r.ext).toBe("webp");
    expect(r.buffer.length).toBeLessThan(src.length);
    const m = await sharp(r.buffer).metadata();
    expect([m.format, m.width, m.height]).toEqual(["webp", 424, 632]);
  });

  it("laisse passer tel quel un fichier illisible", async () => {
    const src = Buffer.from("pas une image");
    const r = await toWebp(src, "image/jpeg");
    expect(r).toEqual({ buffer: src, mimeType: "image/jpeg", ext: "jpeg" });
  });
});
