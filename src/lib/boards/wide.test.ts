// La version large d'un plateau doit laisser son centre INTACT : c'est ce que
// voit un joueur sur écran 16:9, et ce qui garde le décor en face des zones de
// jeu. Ces tests fabriquent des images de synthèse et vérifient le recollage,
// quelle que soit l'image rendue par le générateur.
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { deplierLarge, estEtendable, estLarge, gabaritLarge, LARGEUR_MAX, preparerCanevas, recomposer, redessiner } from "./wide";

/** Image unie w × h. */
const unie = (w: number, h: number, c: { r: number; g: number; b: number }) =>
  sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer();

/** Couleur d'un pixel d'une image. */
async function pixel(image: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data } = await sharp(image).extract({ left: x, top: y, width: 1, height: 1 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return [data[0], data[1], data[2]];
}

const proche = (a: number[], b: number[], tol = 6) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

describe("gabarit de la version large", () => {
  it("21:9 à la même hauteur, original au centre", () => {
    const g = gabaritLarge(1920, 1080);
    expect(g).toEqual({ largeur: 2520, hauteur: 1080, centre: 1920, marge: 300 });
  });

  it("marges entières et égales, même sur des dimensions impaires", () => {
    const g = gabaritLarge(1365, 768);
    expect(g.largeur).toBe(g.centre + 2 * g.marge);
    expect(Number.isInteger(g.marge)).toBe(true);
    expect(g.largeur / g.hauteur).toBeCloseTo(21 / 9, 1);
  });

  it("seul un format proche du 16:9 s'étend", () => {
    expect(estEtendable(1920, 1080)).toBe(true);
    expect(estEtendable(1376, 768)).toBe(true);
    expect(estEtendable(2520, 1080)).toBe(false); // déjà large
    expect(estEtendable(1080, 1080)).toBe(false);
    expect(estEtendable(0, 0)).toBe(false);
  });
});

describe("canevas soumis au générateur", () => {
  it("porte l'original au centre, sans le rééchantillonner", async () => {
    const original = await unie(320, 180, { r: 200, g: 40, b: 40 });
    const { canevas, gabarit } = await preparerCanevas(original);
    const meta = await sharp(canevas).metadata();
    expect([meta.width, meta.height]).toEqual([gabarit.largeur, gabarit.hauteur]);
    expect(gabarit.hauteur).toBe(180);
    expect(proche(await pixel(canevas, gabarit.marge + 160, 90), [200, 40, 40], 3)).toBe(true);
    // Les marges sont amorcées avec les couleurs de l'original, pas laissées noires.
    expect(proche(await pixel(canevas, 5, 90), [200, 40, 40], 12)).toBe(true);
  });

  it("refuse une image qui n'est pas en 16:9", async () => {
    await expect(preparerCanevas(await unie(300, 300, { r: 0, g: 0, b: 0 }))).rejects.toThrow(/16:9/);
  });
});

describe("recollage de l'original", () => {
  it("le centre reste celui de l'original, quoi qu'ait rendu le générateur", async () => {
    const original = await unie(320, 180, { r: 200, g: 40, b: 40 });
    // Le générateur a tout repeint en vert, centre compris, et dans une autre taille.
    const genere = await unie(1344, 576, { r: 20, g: 180, b: 60 });
    const { image, gabarit } = await recomposer(original, genere);

    const meta = await sharp(image).metadata();
    expect([meta.width, meta.height]).toEqual([gabarit.largeur, gabarit.hauteur]);
    // Centre : l'original.
    expect(proche(await pixel(image, gabarit.marge + 160, 90), [200, 40, 40])).toBe(true);
    expect(proche(await pixel(image, gabarit.marge + 40, 20), [200, 40, 40])).toBe(true);
    // Marges : l'image générée.
    expect(proche(await pixel(image, 4, 90), [20, 180, 60])).toBe(true);
    expect(proche(await pixel(image, gabarit.largeur - 5, 90), [20, 180, 60])).toBe(true);
  });

  it("le raccord est un fondu, pas une arête", async () => {
    const original = await unie(320, 180, { r: 200, g: 40, b: 40 });
    const genere = await unie(420, 180, { r: 20, g: 180, b: 60 });
    const { image, gabarit } = await recomposer(original, genere);
    // À mi-fondu, le pixel n'est ni tout à fait l'un ni tout à fait l'autre.
    const [r, g] = await pixel(image, gabarit.marge + 5, 90);
    expect(r).toBeGreaterThan(40);
    expect(r).toBeLessThan(190);
    expect(g).toBeGreaterThan(50);
    expect(g).toBeLessThan(170);
  });
});

describe("haute définition", () => {
  it("un original en haute définition garde sa hauteur, côtés compris", async () => {
    const original = await unie(2816, 1536, { r: 200, g: 40, b: 40 });
    const genere = await unie(6336, 2688, { r: 20, g: 180, b: 60 });
    const { image, gabarit } = await recomposer(original, genere);
    const meta = await sharp(image).metadata();
    expect([meta.width, meta.height]).toEqual([gabarit.largeur, gabarit.hauteur]);
    expect(gabarit.hauteur).toBe(1536);
    expect(gabarit.largeur).toBeLessThanOrEqual(LARGEUR_MAX);
  });

  it("aucune illustration enregistrée ne dépasse la largeur maximale", async () => {
    const { image, gabarit } = await redessiner(await unie(6336, 2688, { r: 20, g: 180, b: 60 }));
    const meta = await sharp(image).metadata();
    expect(meta.width).toBe(LARGEUR_MAX);
    expect(meta.format).toBe("webp");
    expect(gabarit.largeur / gabarit.hauteur).toBeCloseTo(6336 / 2688, 2);
  });

  it("un plateau généré en large donne aussi son illustration 16:9, à la même hauteur", async () => {
    const { large, centre, gabarit } = await deplierLarge(await unie(6336, 2688, { r: 20, g: 180, b: 60 }));
    const l = await sharp(large).metadata();
    const c = await sharp(centre).metadata();
    expect(c.height).toBe(l.height);
    expect(c.width! / c.height!).toBeCloseTo(16 / 9, 2);
    // Le centre est bien pris au milieu : marges égales de part et d'autre.
    expect(gabarit.marge * 2 + gabarit.centre).toBeLessThanOrEqual(l.width!);
    expect(l.width! - (gabarit.marge * 2 + gabarit.centre)).toBeLessThanOrEqual(1);
  });

  it("reconnaît une illustration déjà large", () => {
    expect(estLarge(6336, 2688)).toBe(true);
    expect(estLarge(3840, 1629)).toBe(true);
    expect(estLarge(1920, 1080)).toBe(false);
    expect(estLarge(0, 0)).toBe(false);
  });
});
