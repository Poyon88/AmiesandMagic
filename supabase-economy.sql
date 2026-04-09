-- ============================================
-- Armies & Magic — Economy System (Phase 1)
-- Execute this in Supabase SQL Editor
-- ============================================

-- 1. Wallets table
CREATE TABLE wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_wallet_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wallet_updated
  BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION update_wallet_timestamp();

-- 2. Wallet transactions table
CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'admin_credit', 'admin_debit',
    'purchase',
    'reward_victory', 'reward_quest',
    'shop_booster', 'shop_card', 'shop_cosmetic',
    'refund'
  )),
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_tx_user ON wallet_transactions(user_id, created_at DESC);

-- 3. Atomic balance adjustment function
CREATE OR REPLACE FUNCTION adjust_wallet_balance(
  p_user_id UUID,
  p_amount INTEGER,
  p_type TEXT,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_created_by UUID DEFAULT NULL
) RETURNS TABLE(new_balance INTEGER, transaction_id UUID) AS $$
DECLARE
  v_new_balance INTEGER;
  v_tx_id UUID;
BEGIN
  -- Upsert wallet (creates on first transaction)
  INSERT INTO wallets (user_id, balance)
  VALUES (p_user_id, GREATEST(0, p_amount))
  ON CONFLICT (user_id) DO UPDATE
    SET balance = wallets.balance + p_amount
  RETURNING balance INTO v_new_balance;

  -- CHECK(balance >= 0) will raise if insufficient funds

  -- Insert audit row
  INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, metadata, created_by)
  VALUES (p_user_id, p_type, p_amount, v_new_balance, p_description, p_metadata, p_created_by)
  RETURNING id INTO v_tx_id;

  RETURN QUERY SELECT v_new_balance AS new_balance, v_tx_id AS transaction_id;
END;
$$ LANGUAGE plpgsql;

-- 4. RLS policies
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Users can read their own wallet
CREATE POLICY "Users read own wallet"
  ON wallets FOR SELECT
  USING (auth.uid() = user_id);

-- Users can read their own transactions
CREATE POLICY "Users read own transactions"
  ON wallet_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- All mutations go through service_role (API routes), bypassing RLS
