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

// ─── Essence ──────────────────────────────────────────────────────────────────
// Le tirage RÉEL vit dans `craft_with_essence` (supabase-migration-essence.sql) ;
// ces valeurs ne servent qu'à l'AFFICHAGE. Toute modification doit être
// reportée dans le SQL, faute de quoi la boutique annoncerait d'autres chances
// que celles appliquées.
// `label` et `odds` sont le texte FRANÇAIS (livret de règles) ; l'interface
// traduite se sert de `rarity` et de `oneIn`.
export const ESSENCE_NAME = 'Essence';
export const ESSENCE_CRAFT_COST = 2000;
/** Essence créditée pour la PREMIÈRE victoire de chaque jour (jour UTC). La
 *  règle — une fois par jour, résultat établi par le rejeu serveur — vit dans
 *  `grant_daily_win_essence` (supabase-migration-essence-daily-win.sql) ; seul
 *  le montant est ici, passé par le serveur à la fonction. */
export const ESSENCE_DAILY_WIN = 100;
export const ESSENCE_CRAFT_ODDS: ReadonlyArray<{ key: string; label: string; odds: string; rarity: string; oneIn: number | null }> = [
  { key: 'hero', label: 'Héros unique', odds: '1 sur 10 000', rarity: 'Légendaire', oneIn: 10000 },
  { key: 'Légendaire', label: 'Unique', odds: '1 sur 1 000', rarity: 'Légendaire', oneIn: 1000 },
  { key: 'Épique', label: 'Épique', odds: '1 sur 100', rarity: 'Épique', oneIn: 100 },
  { key: 'Rare', label: 'Rare', odds: '1 sur 10', rarity: 'Rare', oneIn: 10 },
  { key: 'Peu Commune', label: 'Peu Commune', odds: 'le reste', rarity: 'Peu Commune', oneIn: null },
];

// ─── Crédits marché ──────────────────────────────────────────────────────────
// La durée de vie (30 jours) vit dans le barème des tournois
// (src/lib/tournaments/config.ts, CREDIT_LIFETIME_DAYS), source unique.
export const CREDIT_NAME = 'Crédit marché';
/** Alerte quand un lot expire dans moins de N jours. */
export const CREDIT_EXPIRY_ALERT_DAYS = 3;
