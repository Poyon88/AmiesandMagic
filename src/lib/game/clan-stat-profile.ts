// Le PROFIL DE JEU d'un clan : penche-t-il vers l'attaque ou vers la défense ?
//
// Il se lisait dans `statWeights`, deux multiplicateurs déclarés dans le
// moteur. Deux défauts, relevés en comparant à la base :
//
//  1. C'était l'INTENTION du générateur, pas le contenu du clan. L'écart avec
//     les cartes réelles atteint 11,6 points (Les Fils du Volcan : 59,5 %
//     annoncé, 47,9 % mesuré), et il est systématiquement dans le même sens —
//     le réel est plus proche de l'équilibre que l'intention. Arrondis, variance
//     du partage, plancher à 1, clamp de dispersion, et surtout les cartes
//     écrites à la main : tout ramène vers 50 %.
//
//  2. Les deux poids étaient affichés en ABSOLU, alors que le générateur n'en
//     utilise que le RAPPORT (`baseAtk = statTotal * atk/(atk+def)`). La Forêt
//     d'Émeraude, `{atk: 0.21, def: 0.21}`, montrait donc deux barres presque
//     vides — « faible partout » — quand son partage est 50/50 et ses cartes
//     réelles à 51,6 % d'attaque.
//
// On mesure donc sur les cartes, et on rend un PARTAGE dont les deux parts
// somment à 1 — c'est ce que le moteur modélise vraiment.

/** Forme minimale attendue : les deux statistiques d'une créature. */
export interface CarteAvecStats {
  card_type?: string | null;
  attack?: number | null;
  health?: number | null;
}

export interface StatProfile {
  /** Part de l'attaque dans le total ATK+PV du clan, dans [0, 1]. */
  offensif: number;
  /** Son complément — les deux somment à 1. */
  defensif: number;
  /** Créatures mesurées, pour savoir sur quoi le partage repose. */
  creatures: number;
}

/** En dessous, le rapport tient à une ou deux cartes et ne veut rien dire :
 *  le profil n'est pas affiché du tout. */
export const MIN_CREATURES_PROFIL = 3;

/** Fenêtre d'affichage des jauges.
 *
 *  Les partages réels de tous les clans tiennent entre 39,6 % et 55,8 % : des
 *  barres proportionnelles se ressembleraient toutes. On étire donc cette
 *  fourchette — élargie pour garder de la marge — sur toute la largeur. Le
 *  POURCENTAGE EXACT reste affiché à côté : c'est lui qui empêche la barre
 *  dilatée de mentir. */
export const FENETRE_MIN = 0.35;
export const FENETRE_MAX = 0.65;

/** Longueur de barre pour une part donnée. Écrêtée : une valeur hors fenêtre
 *  colle au bord plutôt que de déborder. */
export function jaugeDilatee(part: number): number {
  return Math.min(1, Math.max(0, (part - FENETRE_MIN) / (FENETRE_MAX - FENETRE_MIN)));
}

/** Le partage attaque / défense mesuré sur les créatures fournies.
 *
 *  On somme avant de diviser plutôt que de moyenner des rapports par carte :
 *  une 1/1 et une 8/8 ne pèsent pas pareil dans l'identité d'un clan, et une
 *  moyenne de rapports leur donnerait le même poids.
 *
 *  `null` quand il n'y a pas assez de créatures — l'appelant n'affiche alors
 *  rien, plutôt qu'un partage tiré d'une seule carte. */
export function statProfileFromCards(
  cartes: CarteAvecStats[],
  minCreatures: number = MIN_CREATURES_PROFIL,
): StatProfile | null {
  let atk = 0;
  let pv = 0;
  let creatures = 0;

  for (const c of cartes) {
    // Un sort n'a ni attaque ni PV : il ne dit rien du penchant du clan.
    if (c.card_type !== "creature") continue;
    if (typeof c.attack !== "number" || typeof c.health !== "number") continue;
    atk += c.attack;
    pv += c.health;
    creatures += 1;
  }

  if (creatures < minCreatures) return null;
  const total = atk + pv;
  if (total <= 0) return null;

  const offensif = atk / total;
  return { offensif, defensif: 1 - offensif, creatures };
}
