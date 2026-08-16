// PLANCHER DE MISE DE DÉPART, par rareté.
//
// L'hôtel des ventes n'accepte que des cartes de rareté Peu Commune ou
// au-dessus : les COMMUNES n'y sont jamais mises en vente, décision de
// l'auteur. Elles n'ont donc pas de plancher — elles ont une INTERDICTION,
// ce que `MIN_STARTING_BID` exprime par son absence et `isAuctionableRarity`
// par un refus explicite.
//
// Ces montants sont en pièces d'or, la monnaie interne. Ils vivent ici, dans
// une source unique, parce que trois surfaces les consultent : la validation
// serveur (qui fait foi), le formulaire d'administration (qui pré-remplit et
// borne la saisie), et les tests.

/** Plancher par rareté. L'ABSENCE d'une rareté vaut interdiction de vente. */
export const MIN_STARTING_BID: Readonly<Record<string, number>> = {
  "Peu Commune": 50,
  "Rare": 100,
  "Épique": 150,
  "Légendaire": 200,
};

/** Raretés vendables aux enchères, de la plus basse à la plus haute. */
export const AUCTIONABLE_RARITIES = Object.keys(MIN_STARTING_BID);

export function isAuctionableRarity(rarity: string | null | undefined): boolean {
  return !!rarity && rarity in MIN_STARTING_BID;
}

/** Plancher d'un lot : le PLUS ÉLEVÉ de ses cartes (arbitré avec l'auteur).
 *
 *  Un lot vaut au moins sa meilleure carte. La somme aurait rendu certains lots
 *  invendables — dix légendaires auraient démarré à 2 000 or, au-dessus de ce
 *  que détient n'importe quel joueur aujourd'hui — et le but d'un lot est
 *  souvent d'écouler du dépareillé avec une belle pièce.
 *
 *  Contrepartie assumée : dix légendaires peuvent partir à 200, soit 20 l'unité.
 *
 *  Renvoie `null` si le lot est vide ou contient une rareté non vendable :
 *  l'appelant doit alors REFUSER, pas retomber sur une valeur par défaut. Un
 *  plancher inventé pour une carte interdite ouvrirait la vente qu'on ferme.
 */
export function minStartingBidForLot(rarities: Array<string | null | undefined>): number | null {
  if (rarities.length === 0) return null;
  let max = 0;
  for (const r of rarities) {
    if (!isAuctionableRarity(r)) return null;
    max = Math.max(max, MIN_STARTING_BID[r as string]);
  }
  return max;
}

/** Raretés du lot qui ne sont pas vendables — pour nommer le refus plutôt que
 *  d'opposer un « invalide » sans explication. */
export function forbiddenRarities(rarities: Array<string | null | undefined>): string[] {
  return [...new Set(rarities.filter((r) => !isAuctionableRarity(r)).map((r) => r ?? "inconnue"))];
}
