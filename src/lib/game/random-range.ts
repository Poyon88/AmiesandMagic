// Plage d'un coût « au hasard » — module sans dépendance, importé à la fois par
// keyword-labels et spell-keywords (qui s'importent déjà l'un l'autre).
/** Pastille d'une valeur « au hasard » : « 3? » (1 à 3), ou « 4–6 » quand un
 *  plancher A > 1 est posé. `rendu` est le plafond déjà mis en forme par
 *  l'appelant (chiffre romain ou non) ; le plancher reste en chiffres, sans
 *  quoi « IV–VI » ne se lirait plus comme une plage. */
export function badgeAleatoire(plafond: number, minX: number | null | undefined, rendu: string): string {
  const a = Math.min(Math.max(1, Math.floor(minX ?? 1)), plafond);
  return a > 1 ? `${a}–${plafond}` : `${rendu}?`;
}
