// Gabarit du plateau : sa taille de dessin et son échelle dans la fenêtre.
//
// Le plateau est un canevas de HAUTEUR fixe (1080), mis à l'échelle d'un seul
// tenant pour tenir dans la fenêtre : cartes, portraits et textes rétrécissent
// ensemble (c'est ce qui évite les chevauchements sur petit écran et iPad).
//
// Sa LARGEUR, elle, suit la fenêtre entre deux bornes :
//   - 16:9 (1920) au minimum — le gabarit d'origine, inchangé sur un écran
//     standard ou plus étroit ;
//   - 2,4:1 (2592) au maximum — de quoi couvrir un écran « ultra-large » du
//     commerce (3440×1440 et 2560×1080 font 2,39 et 2,37, un peu plus que le
//     21:9 de leur étiquette), que les illustrations de plateau en 21:9
//     couvrent en rognant à peine le haut et le bas.
// Entre les deux, le terrain occupe toute la largeur : les zones ancrées aux
// bords (héros, pioche, cimetière, fin de tour) s'écartent, les rangées et la
// main restent centrées. Avant (retour joueur du 2026-11-20), le canevas
// restait en 16:9 au milieu d'une fenêtre large, entre deux bandes.
//
// L'échelle reste la MÊME en largeur et en hauteur : les effets visuels
// comparent des rectangles d'écran à des tailles de dessin (cf. overlayRect,
// src/lib/fx/overlayMotion.ts) et supposent une échelle uniforme.
export const DESIGN_W = 1920;
export const DESIGN_H = 1080;
/** Rapport largeur/hauteur le plus large que le terrain accepte. */
export const RATIO_MAX = 2.4;
export const DESIGN_W_MAX = Math.round(DESIGN_H * RATIO_MAX);

export interface GabaritPlateau {
  /** Facteur d'échelle du canevas, identique en X et en Y. */
  echelle: number;
  /** Largeur du canevas en pixels de dessin, de DESIGN_W à DESIGN_W_MAX. */
  largeur: number;
  /** Des bandes entourent-elles encore le canevas ? (fenêtre plus large que
   *  RATIO_MAX, ou plus haute que 16:9) */
  bandes: boolean;
}

/** Échelle du canevas pour tenir dans la zone disponible. */
export function echellePlateau(availW: number, availH: number): number {
  return Math.min(availW / DESIGN_W, availH / DESIGN_H);
}

/** Gabarit pour une zone disponible donnée. Zone pas encore mesurée : le
 *  gabarit d'origine, sans bande. */
export function gabaritPlateau(availW: number, availH: number): GabaritPlateau {
  if (!(availW > 0) || !(availH > 0)) return { echelle: 1, largeur: DESIGN_W, bandes: false };
  const echelle = echellePlateau(availW, availH);
  // Arrondi à l'entier : une largeur fractionnaire décalerait d'un demi-pixel
  // tout ce qui est centré dans le canevas.
  const largeur = Math.min(DESIGN_W_MAX, Math.max(DESIGN_W, Math.floor(availW / echelle)));
  // Deux pixels d'écart sont un arrondi, pas une bande.
  const bandes = availW - largeur * echelle > 2 || availH - DESIGN_H * echelle > 2;
  return { echelle, largeur, bandes };
}
