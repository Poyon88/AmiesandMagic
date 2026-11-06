-- ============================================================================
-- Armies & Magic — CRÉDITS MARCHÉ
-- ============================================================================
--
-- Monnaie d'enchère gagnée en tournoi :
--   * chaque gain est un LOT (credit_grants) qui EXPIRE 30 jours après son
--     émission ; le solde n'est jamais stocké, c'est la somme des lots actifs ;
--   * la dépense consomme d'abord les lots qui expirent le plus tôt, sous
--     verrou ; solde insuffisant ⇒ erreur, aucun débit partiel ;
--   * acceptés UNIQUEMENT sur les enchères de la plateforme (seller_type =
--     'admin') : sur une vente de joueur, la mise reste 100 % en or (sinon des
--     crédits qui expirent deviendraient de l'or versé au vendeur) ;
--   * aux enchères admin, les crédits partent d'abord, l'or complète ;
--   * un surenchéri récupère EXACTEMENT ce qu'il a payé : l'or, et les crédits
--     sur LEUR lot d'origine — échéance d'origine stricte (un lot expiré pendant
--     l'enchère reste expiré).
--
-- Additive et idempotente. place_bid garde sa signature : compatible avec le
-- code déployé.
-- ============================================================================

-- 1. Lots ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_grants (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount             INTEGER NOT NULL CHECK (amount > 0),
  spent              INTEGER NOT NULL DEFAULT 0,
  expires_at         TIMESTAMPTZ NOT NULL,
  source             TEXT NOT NULL,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expiry_notified_at TIMESTAMPTZ,
  CONSTRAINT credit_grants_spent_check CHECK (spent >= 0 AND spent <= amount)
);
CREATE INDEX IF NOT EXISTS idx_credit_grants_open
  ON credit_grants (user_id, expires_at) WHERE spent < amount;
CREATE INDEX IF NOT EXISTS idx_credit_grants_user ON credit_grants (user_id, created_at DESC);

-- 2. Journal ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount        INTEGER NOT NULL CHECK (amount <> 0),
  balance_after INTEGER NOT NULL,
  type          TEXT NOT NULL CHECK (type IN (
                  'admin_credit', 'admin_debit', 'reward_tournament',
                  'auction_escrow', 'auction_refund')),
  allocations   JSONB NOT NULL DEFAULT '[]'::jsonb,
  description   TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions (user_id, created_at DESC);

-- 3. Répartition des mises ----------------------------------------------------
ALTER TABLE auction_bids ADD COLUMN IF NOT EXISTS credits_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE auction_bids ADD COLUMN IF NOT EXISTS gold_amount INTEGER;          -- NULL : mise antérieure (tout en or)
ALTER TABLE auction_bids ADD COLUMN IF NOT EXISTS credit_allocations JSONB;
ALTER TABLE auction_bids ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

-- 4. Notification d'expiration -------------------------------------------------
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'auction_outbid', 'auction_won', 'auction_sold', 'auction_ended_unsold',
  'auction_cancelled', 'credits_expiring'));

-- 5. Fonctions ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION credit_balance(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(SUM(amount - spent), 0)::int
    FROM credit_grants
   WHERE user_id = p_user_id AND expires_at > now() AND spent < amount;
$$;

-- Émet un lot. Renvoie le nouveau solde.
CREATE OR REPLACE FUNCTION grant_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_type TEXT,
  p_source TEXT,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_created_by UUID DEFAULT NULL,
  p_lifetime_days INTEGER DEFAULT 30
) RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_grant UUID;
  v_balance INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Montant de crédits invalide : %', p_amount;
  END IF;
  INSERT INTO credit_grants (user_id, amount, expires_at, source, metadata, created_by)
  VALUES (p_user_id, p_amount, now() + make_interval(days => p_lifetime_days), p_source,
          COALESCE(p_metadata, '{}'::jsonb), p_created_by)
  RETURNING id INTO v_grant;

  v_balance := credit_balance(p_user_id);
  INSERT INTO credit_transactions (user_id, amount, balance_after, type, allocations, description, metadata, created_by)
  VALUES (p_user_id, p_amount, v_balance, p_type,
          jsonb_build_array(jsonb_build_object('grant_id', v_grant, 'amount', p_amount)),
          p_description, COALESCE(p_metadata, '{}'::jsonb), p_created_by);
  RETURN v_balance;
END;
$$;

-- Dépense FIFO par échéance. Renvoie les allocations [{grant_id, amount}].
-- Solde insuffisant ⇒ exception AVANT toute écriture.
CREATE OR REPLACE FUNCTION spend_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_type TEXT,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_created_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rest INTEGER := p_amount;
  v_take INTEGER;
  v_alloc JSONB := '[]'::jsonb;
  v_available INTEGER := 0;
  g RECORD;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Montant de crédits invalide : %', p_amount;
  END IF;

  -- Verrou sur TOUS les lots actifs d'abord, puis contrôle du solde : deux
  -- dépenses simultanées ne peuvent pas compter le même reliquat.
  FOR g IN
    SELECT id, amount - spent AS left_amount FROM credit_grants
     WHERE user_id = p_user_id AND expires_at > now() AND spent < amount
     ORDER BY expires_at, created_at
     FOR UPDATE
  LOOP
    v_available := v_available + g.left_amount;
  END LOOP;
  IF v_available < p_amount THEN
    RAISE EXCEPTION 'Crédits insuffisants (% disponibles, % demandés)', v_available, p_amount
      USING ERRCODE = 'check_violation';
  END IF;

  FOR g IN
    SELECT id, amount - spent AS left_amount FROM credit_grants
     WHERE user_id = p_user_id AND expires_at > now() AND spent < amount
     ORDER BY expires_at, created_at
  LOOP
    EXIT WHEN v_rest = 0;
    v_take := LEAST(v_rest, g.left_amount);
    UPDATE credit_grants SET spent = spent + v_take WHERE id = g.id;
    v_alloc := v_alloc || jsonb_build_object('grant_id', g.id, 'amount', v_take);
    v_rest := v_rest - v_take;
  END LOOP;

  INSERT INTO credit_transactions (user_id, amount, balance_after, type, allocations, description, metadata, created_by)
  VALUES (p_user_id, -p_amount, credit_balance(p_user_id), p_type, v_alloc, p_description,
          COALESCE(p_metadata, '{}'::jsonb), p_created_by);
  RETURN v_alloc;
END;
$$;

-- Rend des crédits à LEURS lots (échéance d'origine). Un lot expiré entre-temps
-- reste expiré : sa part est perdue. Renvoie {restored, expired}.
CREATE OR REPLACE FUNCTION restore_credits(
  p_user_id UUID,
  p_allocations JSONB,
  p_type TEXT,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  a JSONB;
  v_amt INTEGER;
  v_expires TIMESTAMPTZ;
  v_restored INTEGER := 0;
  v_expired INTEGER := 0;
BEGIN
  FOR a IN SELECT * FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb)) LOOP
    v_amt := (a->>'amount')::int;
    UPDATE credit_grants SET spent = spent - v_amt
     WHERE id = (a->>'grant_id')::uuid AND user_id = p_user_id
     RETURNING expires_at INTO v_expires;
    IF v_expires IS NULL THEN CONTINUE; END IF;
    IF v_expires > now() THEN v_restored := v_restored + v_amt; ELSE v_expired := v_expired + v_amt; END IF;
  END LOOP;

  IF v_restored > 0 THEN
    INSERT INTO credit_transactions (user_id, amount, balance_after, type, allocations, description, metadata)
    VALUES (p_user_id, v_restored, credit_balance(p_user_id), p_type, p_allocations, p_description,
            COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('expired', v_expired));
  END IF;
  RETURN jsonb_build_object('restored', v_restored, 'expired', v_expired);
END;
$$;

-- Rembourse une mise (surenchère ou annulation) : l'or et les crédits
-- effectivement payés. Idempotente. Renvoie {gold, credits, credits_expired}
-- ou NULL si rien à rembourser.
CREATE OR REPLACE FUNCTION refund_bid(p_bid_id UUID, p_description TEXT DEFAULT 'Remboursement de mise')
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  b RECORD;
  v_gold INTEGER;
  v_gold_tx UUID;
  v_credits JSONB := jsonb_build_object('restored', 0, 'expired', 0);
BEGIN
  SELECT * INTO b FROM auction_bids WHERE id = p_bid_id FOR UPDATE;
  IF b IS NULL OR b.refund_tx_id IS NOT NULL OR b.refunded_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  v_gold := COALESCE(b.gold_amount, b.amount - COALESCE(b.credits_amount, 0));
  IF v_gold > 0 THEN
    SELECT transaction_id INTO v_gold_tx FROM adjust_wallet_balance(
      b.bidder_id, v_gold, 'auction_refund', p_description,
      jsonb_build_object('auction_id', b.auction_id, 'bid_id', b.id), NULL);
  END IF;
  IF COALESCE(b.credits_amount, 0) > 0 THEN
    v_credits := restore_credits(b.bidder_id, b.credit_allocations, 'auction_refund', p_description,
      jsonb_build_object('auction_id', b.auction_id, 'bid_id', b.id));
  END IF;

  UPDATE auction_bids SET refund_tx_id = v_gold_tx, refunded_at = now() WHERE id = b.id;
  RETURN jsonb_build_object('gold', v_gold, 'credits', (v_credits->>'restored')::int,
                            'credits_expired', (v_credits->>'expired')::int);
END;
$$;

-- place_bid — corps repris de supabase-migration-auction-antisnipe.sql
-- (anti-sniping inclus). Changements : séquestre crédits + or aux ventes admin,
-- remboursement du surenchéri par refund_bid.
CREATE OR REPLACE FUNCTION place_bid(
  p_auction_id UUID,
  p_bidder_id UUID,
  p_amount INTEGER,
  p_is_buyout BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auction RECORD;
  v_settings RECORD;
  v_prev_bidder_id UUID;
  v_prev_bid_id UUID;
  v_wallet_tx UUID;
  v_refund JSONB;
  v_bid_id UUID;
  v_extended BOOLEAN := false;
  v_new_ends_at TIMESTAMPTZ;
  v_credits INTEGER := 0;
  v_gold INTEGER;
  v_alloc JSONB;
  v_msg TEXT;
BEGIN
  -- Lock auction row
  SELECT * INTO v_auction FROM auctions
    WHERE id = p_auction_id AND status = 'active'
    FOR UPDATE;

  IF v_auction IS NULL THEN
    RETURN jsonb_build_object('error', 'Auction not found or not active');
  END IF;

  IF v_auction.ends_at <= now() THEN
    RETURN jsonb_build_object('error', 'Auction has expired');
  END IF;

  IF v_auction.seller_id = p_bidder_id THEN
    RETURN jsonb_build_object('error', 'Cannot bid on your own auction');
  END IF;

  SELECT * INTO v_settings FROM auction_settings WHERE id = 1;

  IF v_auction.current_bid IS NULL THEN
    IF p_amount < v_auction.starting_bid THEN
      RETURN jsonb_build_object('error', 'Bid must be at least the starting bid');
    END IF;
  ELSE
    IF p_amount < v_auction.current_bid + v_settings.min_bid_increment THEN
      RETURN jsonb_build_object('error', 'Bid must be at least ' || (v_auction.current_bid + v_settings.min_bid_increment));
    END IF;
  END IF;

  IF p_is_buyout THEN
    IF v_auction.buyout_price IS NULL THEN
      RETURN jsonb_build_object('error', 'This auction has no buyout price');
    END IF;
    IF p_amount != v_auction.buyout_price THEN
      RETURN jsonb_build_object('error', 'Buyout amount must match the buyout price');
    END IF;
  END IF;

  v_prev_bidder_id := v_auction.current_bidder_id;

  -- Séquestre : crédits d'abord (ventes de la plateforme seulement), l'or
  -- complète. Une erreur sur l'or annule aussi la dépense de crédits (même
  -- transaction).
  IF v_auction.seller_type = 'admin' THEN
    v_credits := LEAST(credit_balance(p_bidder_id), p_amount);
  END IF;
  v_gold := p_amount - v_credits;

  IF v_credits > 0 THEN
    v_alloc := spend_credits(p_bidder_id, v_credits, 'auction_escrow', 'Mise aux enchères',
      jsonb_build_object('auction_id', p_auction_id), NULL);
  END IF;
  IF v_gold > 0 THEN
    -- (Un enregistrement non affecté ferait échouer la lecture plus bas quand
    -- tout est payé en crédits : on ne garde que l'identifiant.)
    SELECT transaction_id INTO v_wallet_tx FROM adjust_wallet_balance(
      p_bidder_id, -v_gold, 'auction_escrow',
      'Bid escrow for auction',
      jsonb_build_object('auction_id', p_auction_id),
      NULL
    );
  END IF;

  -- Remboursement du précédent enchérisseur : exactement ce qu'il a payé.
  IF v_prev_bidder_id IS NOT NULL THEN
    SELECT id INTO v_prev_bid_id FROM auction_bids
      WHERE auction_id = p_auction_id AND bidder_id = v_prev_bidder_id
        AND refund_tx_id IS NULL AND refunded_at IS NULL
      ORDER BY created_at DESC LIMIT 1;

    IF v_prev_bid_id IS NOT NULL THEN
      v_refund := refund_bid(v_prev_bid_id, 'Outbid refund');
    END IF;

    v_msg := 'Vous avez été surenchéri. Votre mise de ' || v_auction.current_bid || ' a été remboursée';
    IF COALESCE((v_refund->>'credits')::int, 0) > 0 OR COALESCE((v_refund->>'credits_expired')::int, 0) > 0 THEN
      v_msg := v_msg || ' (' || COALESCE((v_refund->>'gold')::int, 0) || ' or + '
        || COALESCE((v_refund->>'credits')::int, 0) || ' crédits'
        || CASE WHEN COALESCE((v_refund->>'credits_expired')::int, 0) > 0
                THEN ', ' || (v_refund->>'credits_expired') || ' crédits expirés entre-temps' ELSE '' END
        || ')';
    ELSE
      v_msg := v_msg || ' en or';
    END IF;

    INSERT INTO notifications (user_id, type, title, message, metadata)
    VALUES (
      v_prev_bidder_id,
      'auction_outbid',
      'Surenchéri !',
      v_msg || '.',
      jsonb_build_object('auction_id', p_auction_id, 'new_bid', p_amount, 'refund', v_refund)
    );
  END IF;

  INSERT INTO auction_bids (auction_id, bidder_id, amount, is_buyout, wallet_tx_id,
                            credits_amount, gold_amount, credit_allocations)
  VALUES (p_auction_id, p_bidder_id, p_amount, p_is_buyout, v_wallet_tx,
          v_credits, v_gold, v_alloc)
  RETURNING id INTO v_bid_id;

  UPDATE auctions SET
    current_bid = p_amount,
    current_bidder_id = p_bidder_id,
    bid_count = bid_count + 1
  WHERE id = p_auction_id;

  -- ─── PROLONGATION ANTI-SNIPING (inchangée) ──────────────────────────────
  IF NOT p_is_buyout
     AND COALESCE(v_settings.anti_snipe_seconds, 0) > 0
     AND v_auction.ends_at - now() < (v_settings.anti_snipe_seconds || ' seconds')::interval
  THEN
    v_new_ends_at := now() + (v_settings.anti_snipe_seconds || ' seconds')::interval;
    UPDATE auctions SET ends_at = v_new_ends_at WHERE id = p_auction_id;
    v_extended := true;
  END IF;

  IF p_is_buyout THEN
    UPDATE auctions SET ends_at = now() WHERE id = p_auction_id;
    PERFORM settle_auction(p_auction_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'bid_id', v_bid_id,
    'amount', p_amount,
    'is_buyout', p_is_buyout,
    'credits_used', v_credits,
    'gold_used', v_gold,
    'extended', v_extended,
    'ends_at', COALESCE(v_new_ends_at, v_auction.ends_at)
  );
END;
$$;

-- 6. Droits -------------------------------------------------------------------
ALTER TABLE credit_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own credit grants" ON credit_grants;
CREATE POLICY "Users read own credit grants" ON credit_grants
  FOR SELECT USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users read own credit transactions" ON credit_transactions;
CREATE POLICY "Users read own credit transactions" ON credit_transactions
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON credit_grants, credit_transactions TO service_role;
    GRANT SELECT ON credit_grants, credit_transactions TO authenticated;

    -- Toutes les fonctions monétaires : serveur seulement. place_bid n'est
    -- appelée que par la route /api/auctions/[id]/bid (clé service).
    REVOKE EXECUTE ON FUNCTION
      credit_balance(uuid),
      grant_credits(uuid, integer, text, text, text, jsonb, uuid, integer),
      spend_credits(uuid, integer, text, text, jsonb, uuid),
      restore_credits(uuid, jsonb, text, text, jsonb),
      refund_bid(uuid, text),
      place_bid(uuid, uuid, integer, boolean)
    FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION
      credit_balance(uuid),
      grant_credits(uuid, integer, text, text, text, jsonb, uuid, integer),
      spend_credits(uuid, integer, text, text, jsonb, uuid),
      restore_credits(uuid, jsonb, text, text, jsonb),
      refund_bid(uuid, text),
      place_bid(uuid, uuid, integer, boolean)
    TO service_role;
  END IF;
END $$;
