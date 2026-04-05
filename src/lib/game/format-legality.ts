import type { Card, CardSet, GameFormat, FormatSet } from './types';

const BASE_SET_CODE = 'BASE';

function isWithinTwoYears(cardYear?: number | null, cardMonth?: number | null): boolean {
  if (!cardYear) return false;
  const now = new Date();
  const cardDate = new Date(cardYear, (cardMonth ?? 1) - 1);
  const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth());
  return cardDate >= twoYearsAgo;
}

function getStandardLegalSetIds(allSets: CardSet[]): Set<number> {
  const legalIds = new Set<number>();

  // Set de base toujours légal
  const baseSet = allSets.find(s => s.code === BASE_SET_CODE);
  if (baseSet) legalIds.add(baseSet.id);

  // 2 dernières extensions (par released_at, hors BASE)
  const extensions = allSets
    .filter(s => s.code !== BASE_SET_CODE && s.released_at)
    .sort((a, b) => new Date(b.released_at!).getTime() - new Date(a.released_at!).getTime())
    .slice(0, 2);

  for (const ext of extensions) {
    legalIds.add(ext.id);
  }

  return legalIds;
}

function getVariableLegalSetIds(allSets: CardSet[], formatSets: FormatSet[], formatId: number): Set<number> {
  const legalIds = new Set<number>();

  // Set de base toujours légal
  const baseSet = allSets.find(s => s.code === BASE_SET_CODE);
  if (baseSet) legalIds.add(baseSet.id);

  // Extensions sélectionnées par l'admin
  for (const fs of formatSets) {
    if (fs.format_id === formatId) {
      legalIds.add(fs.set_id);
    }
  }

  return legalIds;
}

export function getFormatFilter(
  format: GameFormat,
  allSets: CardSet[],
  formatSets: FormatSet[]
): (card: Card) => boolean {
  switch (format.code) {
    case 'etendu':
      return () => true;

    case 'standard': {
      const legalSetIds = getStandardLegalSetIds(allSets);
      return (card: Card) => {
        if (card.set_id != null) return legalSetIds.has(card.set_id);
        return isWithinTwoYears(card.card_year, card.card_month);
      };
    }

    case 'basique': {
      const legalSetIds = getStandardLegalSetIds(allSets);
      return (card: Card) => {
        if (card.rarity !== 'Commune') return false;
        if (card.set_id != null) return legalSetIds.has(card.set_id);
        return isWithinTwoYears(card.card_year, card.card_month);
      };
    }

    case 'variable': {
      const legalSetIds = getVariableLegalSetIds(allSets, formatSets, format.id);
      return (card: Card) => {
        if (card.set_id != null) return legalSetIds.has(card.set_id);
        return isWithinTwoYears(card.card_year, card.card_month);
      };
    }

    default:
      return () => true;
  }
}
