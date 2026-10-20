/** Géométrie de l'ORBITE du héros : où poser emblèmes et compteurs autour du
 *  portrait. Calcul pur (aucun DOM), d'où un test dédié.
 *
 *  Tout se range sur le demi-cercle tourné vers le PLATEAU — mon héros est
 *  collé au bord droit de l'écran, celui de l'adversaire au bord gauche : un
 *  élément côté bord sortirait de l'écran. Un SEUL arc, partagé : emblèmes
 *  au-dessus de l'horizontale, compteurs en dessous, le premier de chaque
 *  groupe au plus près de l'horizontale. Quand un groupe déborde de sa moitié,
 *  l'ensemble glisse et prend la place laissée libre par l'autre. */

export type OrbitSide = "mine" | "theirs";

export interface OrbitSlot {
  /** Décalage depuis le CENTRE du portrait, en px CSS (y vers le bas). */
  x: number;
  y: number;
}

export interface OrbitGroupLayout {
  slots: OrbitSlot[];
  /** Éléments sans place. > 0 ⇒ le DERNIER slot est le « +N » et ne porte pas
   *  d'élément (slots.length − 1 éléments affichés). */
  overflow: number;
}

/** Bornes de l'arc, en degrés depuis l'horizontale côté plateau (positif = vers
 *  le haut). En haut, l'arc va jusqu'au-dessus du portrait ; en bas, il
 *  s'arrête avant l'écu des PV qui pend sous le médaillon. */
export const ORBIT_TOP_DEG = 90;
export const ORBIT_BOTTOM_DEG = -66;
/** Jour confortable entre deux éléments, et jour minimal avant le « +N ». */
export const ORBIT_GAP_PX = 10;
export const ORBIT_MIN_GAP_PX = 2;

/** Disposition des deux groupes sur l'arc de rayon `radius`. */
export function orbitLayout(
  nEmblems: number,
  nCounters: number,
  opts: { side: OrbitSide; radius: number; itemSize: number },
): { emblems: OrbitGroupLayout; counters: OrbitGroupLayout } {
  const { side, radius, itemSize } = opts;
  const vide = { slots: [], overflow: 0 };
  if (radius <= 0 || nEmblems + nCounters <= 0) return { emblems: vide, counters: vide };

  const deg = (px: number) => (px / radius) * (180 / Math.PI);
  const pasIdeal = deg(itemSize + ORBIT_GAP_PX);
  const pasMin = deg(itemSize + ORBIT_MIN_GAP_PX);
  const etendue = ORBIT_TOP_DEG - ORBIT_BOTTOM_DEG;
  const capacite = Math.max(1, Math.floor(etendue / pasMin) + 1);

  // Débordement : les COMPTEURS d'abord (cliquables), en laissant au moins un
  // slot aux emblèmes s'il y en a ; le reste va aux emblèmes.
  const cSlots = Math.min(nCounters, capacite - (nEmblems > 0 ? 1 : 0));
  const eSlots = Math.min(nEmblems, capacite - cSlots);
  const total = eSlots + cSlots;
  const pas = total <= 1 ? pasIdeal : Math.max(pasMin, Math.min(pasIdeal, etendue / (total - 1)));

  // Angles depuis l'horizontale, groupes de part et d'autre…
  const aE = Array.from({ length: eSlots }, (_, i) => (i + 0.5) * pas);
  const aC = Array.from({ length: cSlots }, (_, j) => -(j + 0.5) * pas);
  // …puis glissement si un groupe dépasse sa borne (l'étendue totale tient,
  // un seul glissement suffit).
  const haut = aE.length ? aE[aE.length - 1] : aC[0];
  const bas = aC.length ? aC[aC.length - 1] : aE[0];
  let decalage = 0;
  if (haut > ORBIT_TOP_DEG) decalage = ORBIT_TOP_DEG - haut;
  else if (bas < ORBIT_BOTTOM_DEG) decalage = ORBIT_BOTTOM_DEG - bas;

  // Mon héros : plateau à gauche (180°), « vers le haut » = vers 90°.
  // Adversaire : plateau à droite (0°), « vers le haut » = vers 90° aussi.
  const slot = (a: number): OrbitSlot => {
    const theta = ((side === "mine" ? 180 - (a + decalage) : a + decalage) * Math.PI) / 180;
    return { x: radius * Math.cos(theta), y: -radius * Math.sin(theta) };
  };
  return {
    emblems: { slots: aE.map(slot), overflow: nEmblems - eSlots > 0 ? nEmblems - eSlots + 1 : 0 },
    counters: { slots: aC.map(slot), overflow: nCounters - cSlots > 0 ? nCounters - cSlots + 1 : 0 },
  };
}

/** Nombre de segments ALLUMÉS d'un anneau-jauge : la valeur, bornée à [0, n]. */
export function segmentsAllumes(valeur: number | null | undefined, n: number): number {
  return Math.max(0, Math.min(n, Math.floor(valeur ?? 0)));
}

/** Règle d'apparition des compteurs : visibles seulement au-dessus de 0
 *  (`null` = jamais alimenté). */
export function compteurVisible(valeur: number | null | undefined): boolean {
  return (valeur ?? 0) > 0;
}
