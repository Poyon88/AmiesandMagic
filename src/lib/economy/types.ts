export type TransactionType =
  | 'admin_credit'
  | 'admin_debit'
  | 'purchase'
  | 'reward_victory'
  | 'reward_quest'
  | 'shop_booster'
  | 'shop_card'
  | 'shop_cosmetic'
  | 'refund'
  | 'auction_escrow'
  | 'auction_refund'
  | 'auction_sale'
  | 'auction_commission';

export interface Wallet {
  user_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  balance_after: number;
  description: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface AdjustBalanceResult {
  new_balance: number;
  transaction_id: string;
}

// ─── Essence ──────────────────────────────────────────────────────────────────
export type EssenceTransactionType = 'admin_credit' | 'admin_debit' | 'craft' | 'reward_tournament';

export interface EssenceTransaction {
  id: string;
  type: EssenceTransactionType;
  amount: number;
  essence_after: number;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Résultat de `craft_with_essence`, enrichi par la route de l'objet tiré. */
export interface CraftResult {
  kind: 'card' | 'hero';
  rarity: string;
  faction: string | null;
  clan: string | null;
  id: number;
  print_number: number;
  max_prints: number;
  /** Vrai si la rareté tirée était épuisée et qu'on est descendu d'un cran. */
  fallback: boolean;
  /** Solde d'essence après la forge. */
  essence: number;
  /** Ligne `cards` complète (kind = 'card') ou héros (kind = 'hero'). */
  card?: Record<string, unknown>;
  hero?: { id: number; name: string; thumbnail_url: string | null; race: string | null };
}
