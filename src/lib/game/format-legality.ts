import type { Card, GameFormat, FormatCode, DeckMode, DeckExtent } from './types';

/**
 * Rotation Standard, à la précision du mois : une carte éditée au mois M de
 * l'année A reste légale jusqu'à la fin du mois M de l'année A+2.
 * Ex. avril 2026 → jouable jusqu'au 30 avril 2028 inclus, illégale en mai 2028.
 * La comparaison se fait au niveau du mois (pas du jour) pour coller à cette règle.
 */
export function isWithinTwoYears(cardYear?: number | null, cardMonth?: number | null): boolean {
  if (!cardYear) return false;
  const now = new Date();
  const cardDate = new Date(cardYear, (cardMonth ?? 1) - 1);
  const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth());
  return cardDate >= twoYearsAgo;
}

/** Décompose un code de format en ses deux axes (mode + étendue). */
export function parseFormatCode(code: FormatCode): { mode: DeckMode; extent: DeckExtent } {
  const [mode, extent] = code.split('-') as [DeckMode, DeckExtent];
  return { mode, extent };
}

/**
 * Prédicat de légalité d'une carte pour un format donné.
 * La légalité ne dépend plus des sets : uniquement de la rareté (mode) et de la
 * date d'édition de la carte (étendue).
 */
export function getFormatFilter(format: GameFormat): (card: Card) => boolean {
  const { mode, extent } = parseFormatCode(format.code);

  return (card: Card) => {
    // Mode : en Classique, seules les cartes Communes sont autorisées.
    if (mode === 'classique' && (card.rarity ?? 'Commune') !== 'Commune') return false;

    // Étendue : en Standard, rotation ~2 ans. Les cartes non datées
    // (set de base) sont toujours légales. En Étendu, aucune restriction.
    if (extent === 'standard') {
      if (card.card_year == null) return true;
      return isWithinTwoYears(card.card_year, card.card_month);
    }

    return true;
  };
}
