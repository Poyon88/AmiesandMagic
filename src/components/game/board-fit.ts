// Ajustement du plateau à la fenêtre.
//
// Le plateau est un canevas de taille fixe (16:9), mis à l'échelle d'un seul
// tenant pour tenir dans la fenêtre : cartes, portraits et textes rétrécissent
// ensemble. Une fenêtre qui n'est pas en 16:9 laisse donc des bandes autour de
// lui — sur les côtés (écran ultra-large) ou en haut et en bas (tablette).
export const DESIGN_W = 1920;
export const DESIGN_H = 1080;

/** Échelle du canevas pour tenir dans la zone disponible. */
export function echellePlateau(availW: number, availH: number): number {
  return Math.min(availW / DESIGN_W, availH / DESIGN_H);
}

/** Des bandes entourent-elles le canevas ? Vrai dès que la fenêtre s'écarte du
 *  16:9 de plus de deux pixels — en deçà, c'est un arrondi, pas une bande. */
export function aDesBandes(availW: number, availH: number): boolean {
  if (!(availW > 0) || !(availH > 0)) return false;
  const s = echellePlateau(availW, availH);
  return availW - DESIGN_W * s > 2 || availH - DESIGN_H * s > 2;
}
