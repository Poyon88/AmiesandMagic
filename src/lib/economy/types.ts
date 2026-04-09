export type TransactionType =
  | 'admin_credit'
  | 'admin_debit'
  | 'purchase'
  | 'reward_victory'
  | 'reward_quest'
  | 'shop_booster'
  | 'shop_card'
  | 'shop_cosmetic'
  | 'refund';

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
