// Races d'une carte. Une unité peut porter jusqu'à DEUX races (`race` +
// `race2`, ex. un Dragon zombie, un Elfe chevauchant un Aigle Géant) : elle
// compte alors comme membre de CHACUNE d'elles pour toutes les mécaniques de
// race (Loyauté, Totem, filtres de pool…).
// La première race reste la race « principale » (voix, portrait, token).

type WithRaces = { race?: string | null; race2?: string | null } | null | undefined;

/** Races distinctes de la carte, principale en tête (0, 1 ou 2 éléments). */
export function cardRaces(card: WithRaces): string[] {
  if (!card) return [];
  const out: string[] = [];
  if (card.race) out.push(card.race);
  if (card.race2 && card.race2 !== card.race) out.push(card.race2);
  return out;
}

/** La carte appartient-elle à cette race (principale ou seconde) ? */
export function hasRace(card: WithRaces, race: string | null | undefined): boolean {
  if (!race || !card) return false;
  return card.race === race || card.race2 === race;
}

/** Les deux cartes partagent-elles au moins une race ? (« même race ») */
export function sharesRace(a: WithRaces, b: WithRaces): boolean {
  const ra = cardRaces(a);
  return ra.length > 0 && cardRaces(b).some((r) => ra.includes(r));
}

/** Libellé d'affichage : « Elfes / Aigles Géants ». */
export function formatRaces(card: WithRaces, label: (race: string) => string = (r) => r): string {
  return cardRaces(card).map(label).join(" / ");
}
