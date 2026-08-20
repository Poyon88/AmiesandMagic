// Les COÛTS ADDITIONNELS habituels d'un clan.
//
// Une carte peut demander autre chose que du mana : des points de vie, une
// défausse, le sacrifice d'une créature, l'exil de cartes du deck, le repli de
// cartes de la main sur le dessus du deck. Pris isolément c'est une
// particularité de carte ; répété sur une poignée de
// communes, ça devient une manière de jouer — Les Enfants du Soleil sacrifient,
// Les Fils du Volcan exilent.
//
// D'où un SEUIL : en dessous, la page n'a rien à dire et la section n'apparaît
// pas. Mieux vaut un blanc qu'une rubrique qui fait passer une carte isolée
// pour une identité de clan.
//
// Module pur : il reçoit des cartes, il rend un constat.

/** Les cinq coûts que le jeu sait demander en plus du mana. */
export type CoutKind = "life" | "discard" | "sacrifice" | "exile" | "topdeck";

export interface AdditionalCost {
  kind: CoutKind;
  /** Cartes du pool qui le demandent. */
  count: number;
  /** Amplitude du montant réclamé, pour dire « 1 » ou « de 1 à 3 ». */
  min: number;
  max: number;
}

/** Forme minimale attendue — les cinq colonnes de coût, rien d'autre. */
export interface CarteAvecCouts {
  life_cost?: number | null;
  discard_cost?: number | null;
  sacrifice_cost?: number | null;
  exile_cost?: number | null;
  topdeck_cost?: number | null;
}

/** En dessous, ce n'est pas une habitude de clan mais une carte qui dépasse. */
export const SEUIL_COUT_ADDITIONNEL = 5;

/** Ordre d'affichage : du plus fréquent au moins fréquent, puis alphabétique
 *  pour que deux rendus de la même page ne diffèrent jamais. */
const LECTEURS: ReadonlyArray<readonly [CoutKind, (c: CarteAvecCouts) => number]> = [
  ["life", (c) => c.life_cost ?? 0],
  ["discard", (c) => c.discard_cost ?? 0],
  ["sacrifice", (c) => c.sacrifice_cost ?? 0],
  ["exile", (c) => c.exile_cost ?? 0],
  ["topdeck", (c) => c.topdeck_cost ?? 0],
];

/** Les coûts additionnels REPRÉSENTATIFS du pool fourni.
 *
 *  On regroupe par NATURE de coût, pas par montant : « sacrifier une créature »
 *  et « en sacrifier deux » relèvent de la même habitude, et les séparer
 *  ferait passer les deux sous le seuil. L'amplitude est rendue à part. */
export function additionalCostsFromCards(
  cartes: CarteAvecCouts[],
  seuil: number = SEUIL_COUT_ADDITIONNEL,
): AdditionalCost[] {
  const out: AdditionalCost[] = [];

  for (const [kind, lire] of LECTEURS) {
    const montants = cartes.map(lire).filter((n) => typeof n === "number" && n > 0);
    if (montants.length < seuil) continue;
    out.push({
      kind,
      count: montants.length,
      min: Math.min(...montants),
      max: Math.max(...montants),
    });
  }

  return out.sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
}
