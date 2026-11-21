// Version ULTRA-LARGE (21:9) d'une illustration de plateau dessinée en 16:9.
//
// Règle du jeu : le centre de la version large est IDENTIQUE à l'illustration
// d'origine. Un joueur sur écran 16:9, qui ne voit que ce centre, ne doit voir
// aucune différence — et le décor reste en face des zones de jeu.
//
// On ne fait donc PAS confiance au générateur d'images pour préserver le
// centre. On lui demande seulement d'inventer les deux marges, puis on recolle
// l'image d'origine par-dessus, avec un fondu aux deux raccords :
//   1. `preparerCanevas` pose l'original au centre d'un canevas 21:9 dont les
//      marges sont remplies par son propre reflet flouté — une amorce de
//      couleurs et de formes que le modèle n'a plus qu'à préciser ;
//   2. le modèle redessine ce canevas en prolongeant le décor dans les marges ;
//   3. `recomposer` remet l'original au centre du résultat.
import sharp from "sharp";

/** Rapport de la version large. C'est le plus large que sait rendre le
 *  générateur d'images ; le terrain accepte un peu plus (cf. board-fit.ts). */
export const RATIO_LARGE = 21 / 9;
/** Largeur du fondu à chaque raccord, en fraction de la hauteur de l'image. */
const FONDU = 0.06;
/** Largeur maximale d'une illustration enregistrée. Le générateur rend jusqu'à
 *  6336 px de large en « 4K », mais aucun écran n'en affiche autant : au-delà de
 *  3840 px, on ne ferait que servir des fichiers plus lourds. */
export const LARGEUR_MAX = 3840;
const WEBP = { quality: 88, effort: 4 } as const;

export interface Gabarit {
  /** Largeur et hauteur de la version large. */
  largeur: number;
  hauteur: number;
  /** Largeur de l'illustration d'origine dans la version large, et son bord gauche. */
  centre: number;
  marge: number;
}

/** Dimensions de la version large d'une illustration `w × h`. La hauteur est
 *  conservée : l'original n'est jamais rééchantillonné. */
export function gabaritLarge(w: number, h: number): Gabarit {
  const largeur = Math.round(h * RATIO_LARGE);
  // Marges entières et égales : une marge à demi-pixel décalerait le centre.
  const marge = Math.max(0, Math.floor((largeur - w) / 2));
  return { largeur: w + 2 * marge, hauteur: h, centre: w, marge };
}

/** L'illustration est-elle assez proche du 16:9 pour être étendue ? Une image
 *  déjà large, ou verticale, n'a pas de marges à inventer. */
export function estEtendable(w: number, h: number): boolean {
  if (!(w > 0) || !(h > 0)) return false;
  const ratio = w / h;
  return ratio > 1.6 && ratio < 1.95;
}

async function dimensions(image: Buffer): Promise<{ w: number; h: number }> {
  const meta = await sharp(image).rotate().metadata();
  if (!meta.width || !meta.height) throw new Error("image illisible");
  return { w: meta.width, h: meta.height };
}

/** Canevas 21:9 à soumettre au générateur : l'original au centre, ses reflets
 *  floutés dans les marges. En JPEG : c'est un modèle à lire, pas l'image
 *  finale (le centre est recollé depuis l'original), et un PNG de plateau en
 *  haute définition pèserait une dizaine de Mo. */
export async function preparerCanevas(original: Buffer): Promise<{ canevas: Buffer; gabarit: Gabarit }> {
  const { w, h } = await dimensions(original);
  if (!estEtendable(w, h)) throw new Error(`illustration ${w}×${h} : seul un format proche du 16:9 peut être étendu`);
  const g = gabaritLarge(w, h);
  const net = await sharp(original).rotate().toBuffer();

  // Reflet de chaque bord : la marge gauche prolonge ce qui touche le bord
  // gauche, en miroir, pour que les couleurs se raccordent sans rupture.
  const bande = async (gauche: boolean) =>
    sharp(net)
      .extract({ left: gauche ? 0 : w - g.marge, top: 0, width: g.marge, height: h })
      .flop()
      .blur(Math.max(8, Math.round(h * 0.03)))
      .toBuffer();

  const canevas = await sharp({
    create: { width: g.largeur, height: g.hauteur, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([
      ...(g.marge > 0
        ? [
            { input: await bande(true), left: 0, top: 0 },
            { input: await bande(false), left: g.marge + w, top: 0 },
          ]
        : []),
      { input: net, left: g.marge, top: 0 },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
  return { canevas, gabarit: g };
}

/** Masque de l'original : opaque au centre, fondu vers la transparence sur
 *  `fondu` pixels à gauche et à droite. */
function masque(w: number, h: number, fondu: number): Buffer {
  const f = Math.max(1, Math.min(fondu, Math.floor(w / 4)));
  const pct = ((f / w) * 100).toFixed(4);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#fff" stop-opacity="0"/>
      <stop offset="${pct}%" stop-color="#fff" stop-opacity="1"/>
      <stop offset="${(100 - Number(pct)).toFixed(4)}%" stop-color="#fff" stop-opacity="1"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
  </svg>`;
  return Buffer.from(svg);
}

/**
 * Version large définitive : l'image rendue par le générateur, ramenée au
 * gabarit, avec l'illustration d'origine recollée au centre. Hors des deux
 * zones de fondu, le centre est celui de l'original, au pixel près (à la
 * compression webp près).
 */
export async function recomposer(original: Buffer, genere: Buffer): Promise<{ image: Buffer; gabarit: Gabarit }> {
  const { w, h } = await dimensions(original);
  const g = gabaritLarge(w, h);
  const net = await sharp(original).rotate().ensureAlpha().toBuffer();
  const fond = await sharp(genere).rotate().resize(g.largeur, g.hauteur, { fit: "fill" }).removeAlpha().toBuffer();

  const centre = await sharp(net)
    .composite([{ input: masque(w, h, Math.round(h * FONDU)), blend: "dest-in" }])
    .png()
    .toBuffer();

  const colle = await sharp(fond).composite([{ input: centre, left: g.marge, top: 0 }]).png().toBuffer();
  return enregistrable(colle);
}

/** Ramène une illustration à LARGEUR_MAX au plus et l'encode en WebP. */
async function enregistrable(image: Buffer): Promise<{ image: Buffer; gabarit: Gabarit }> {
  const { w, h } = await dimensions(image);
  const echelle = Math.min(1, LARGEUR_MAX / w);
  const largeur = Math.round(w * echelle);
  const hauteur = Math.round(h * echelle);
  const sortie = await sharp(image).rotate().resize(largeur, hauteur, { fit: "fill" }).webp(WEBP).toBuffer();
  const centre = Math.min(largeur, Math.round((hauteur * 16) / 9));
  return { image: sortie, gabarit: { largeur, hauteur, centre, marge: Math.floor((largeur - centre) / 2) } };
}

/**
 * Version large REDESSINÉE : l'image rendue par le générateur est gardée telle
 * quelle, centre compris. À la différence de `recomposer`, le centre n'est plus
 * l'original au pixel près — il est redessiné fidèlement, en haute définition.
 * C'est le seul moyen de gagner en netteté sur un plateau dont l'original est
 * petit ; à valider à l'œil, le modèle pouvant s'écarter du dessin d'origine.
 */
export async function redessiner(genere: Buffer): Promise<{ image: Buffer; gabarit: Gabarit }> {
  return enregistrable(genere);
}

/** Une illustration est-elle déjà au format large (générée en 21:9) ? */
export function estLarge(w: number, h: number): boolean {
  return w > 0 && h > 0 && w / h > 2.1;
}

/**
 * Plateau généré directement en large : on en tire l'illustration 16:9 (le
 * centre, à la même hauteur) pour les écrans ordinaires, les vignettes et la
 * collection. Rend les deux images prêtes à enregistrer.
 */
export async function deplierLarge(genere: Buffer): Promise<{ large: Buffer; centre: Buffer; gabarit: Gabarit }> {
  const { image: large, gabarit } = await enregistrable(genere);
  const centre = await sharp(large)
    .extract({ left: gabarit.marge, top: 0, width: gabarit.centre, height: gabarit.hauteur })
    .webp(WEBP)
    .toBuffer();
  return { large, centre, gabarit };
}

/** Consigne donnée au générateur avec le canevas préparé. */
export const CONSIGNE_EXTENSION = `This is a game board illustration for a fantasy card game, placed in the CENTER of a wider 21:9 canvas. The left and right margins of the canvas currently contain only a blurred, mirrored placeholder.
Redraw the whole canvas at 21:9 so that the two blurred margins become a sharp, natural, seamless CONTINUATION of the central scene: same environment, same lighting, same colour palette, same painting style, same level of detail. Extend the ground, walls, sky, vegetation and decorative borders outward as they would naturally continue.
Keep the central part of the image exactly as it is: do not move, redraw, recolour or crop it.
The margins are background scenery only: no characters, no creatures, no cards, no frames, no interface elements, no logos, no new focal point, no symmetry line or visible seam where the margins meet the centre.`;

/** Consigne du mode « redessiner » : même canevas, mais tout est repeint en
 *  haute définition, centre compris. */
export const CONSIGNE_REDESSIN = `This is a game board illustration for a fantasy card game, placed in the CENTER of a wider 21:9 canvas. The left and right margins of the canvas currently contain only a blurred, mirrored placeholder.
Repaint the whole canvas at 21:9 in very high resolution.
The central part must stay the SAME picture: same composition, same objects in the same positions, same shapes, same colours, same lighting, same painting style — only sharper and more finely detailed, as if the original had been painted at a much larger size. Do not add, remove, move or redesign anything in it.
The two blurred margins become a sharp, natural, seamless CONTINUATION of the central scene: extend the ground, walls, sky, vegetation and decorative borders outward as they would naturally continue.
The margins are background scenery only: no characters, no creatures, no cards, no frames, no interface elements, no logos, no new focal point, no symmetry line or visible seam where the margins meet the centre.`;
