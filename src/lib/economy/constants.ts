export const GOLD_PER_EUR = 2;
export const CURRENCY_NAME = 'Pièce d\'or';
/** @deprecated pour l'AFFICHAGE. L'emoji est rendu par la police du système et
 *  sort ARGENTÉ sur macOS, ce qui contredit le nom de la monnaie. Toute
 *  interface doit utiliser <GoldCoin /> (src/components/shared/GoldCoin.tsx),
 *  qui dessine la pièce et ne dépend d'aucune police. Un test le vérifie
 *  (gold-coin-consistency.test.ts). Conservé pour les contextes purement
 *  textuels — journaux, messages sans JSX. */
export const CURRENCY_SYMBOL = '🪙';
export const MIN_PURCHASE_EUR = 1;
export const MAX_BALANCE = 999_999;

// In-game rewards
export const REWARD_VICTORY = 5;
export const REWARD_QUEST_SMALL = 10;
export const REWARD_QUEST_MEDIUM = 25;
export const REWARD_QUEST_LARGE = 50;
