-- ============================================
-- Armies & Magic — Auction System
-- Execute this in Supabase SQL Editor
-- ============================================

-- 0. Extend wallet_transactions type CHECK to include auction types
ALTER TABLE wallet_transactions DROP CONSTRAINT wallet_transactions_type_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN (
    'admin_credit', 'admin_debit',
    'purchase',
    'reward_victory', 'reward_quest',
    'shop_booster', 'shop_card', 'shop_cosmetic',
    'refund',
    'auction_escrow', 'auction_refund', 'auction_sale', 'auction_commission'
  ));

-- 1. Auction settings (singleton)
CREATE TABLE auction_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  min_bid_increment INTEGER NOT NULL DEFAULT 1,
  allowed_durations INTEGER[] NOT NULL DEFAULT '{60,360,720,1440}',
  max_items_per_lot INTEGER NOT NULL DEFAULT 10,
  is_marketplace_open BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

INSERT INTO auction_settings DEFAULT VALUES;

-- 2. Auctions table
CREATE TABLE auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_type TEXT NOT NULL DEFAULT 'player' CHECK (seller_type IN ('player', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended_sold', 'ended_unsold', 'cancelled')),
  starting_bid INTEGER NOT NULL CHECK (starting_bid > 0),
  buyout_price INTEGER CHECK (buyout_price IS NULL OR buyout_price > starting_bid),
  current_bid INTEGER,
  current_bidder_id UUID REFERENCES auth.users(id),
  bid_count INTEGER NOT NULL DEFAULT 0,
  commission_rate NUMERIC(5,2) NOT NULL,
  duration_minutes INTEGER NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auctions_status_ends ON auctions(status, ends_at);
CREATE INDEX idx_auctions_seller ON auctions(seller_id);
CREATE INDEX idx_auctions_current_bidder ON auctions(current_bidder_id);

-- 3. Auction items (supports lots)
CREATE TABLE auction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  card_id INTEGER NOT NULL REFERENCES cards(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('collection', 'print', 'admin')),
  source_id INTEGER,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auction_items_auction ON auction_items(auction_id);
CREATE INDEX idx_auction_items_card ON auction_items(card_id);

-- 4. Auction bids
CREATE TABLE auction_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  bidder_id UUID NOT NULL REFERENCES auth.users(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  is_buyout BOOLEAN NOT NULL DEFAULT false,
  wallet_tx_id UUID,
  refund_tx_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bids_auction ON auction_bids(auction_id, created_at DESC);
CREATE INDEX idx_bids_bidder ON auction_bids(bidder_id);

-- 5. Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'auction_outbid', 'auction_won', 'auction_sold',
    'auction_ended_unsold', 'auction_cancelled'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

-- ============================================
-- Postgres Functions
-- ============================================

-- 6. place_bid — atomic bid placement with escrow
CREATE OR REPLACE FUNCTION place_bid(
  p_auction_id UUID,
  p_bidder_id UUID,
  p_amount INTEGER,
  p_is_buyout BOOLEAN DEFAULT false
) RETURNS JSONB AS $$
DECLARE
  v_auction RECORD;
  v_settings RECORD;
  v_prev_bidder_id UUID;
  v_prev_bid INTEGER;
  v_prev_bid_id UUID;
  v_escrow_result RECORD;
  v_refund_result RECORD;
  v_bid_id UUID;
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

  -- Load settings for min increment
  SELECT * INTO v_settings FROM auction_settings WHERE id = 1;

  -- Validate bid amount
  IF v_auction.current_bid IS NULL THEN
    IF p_amount < v_auction.starting_bid THEN
      RETURN jsonb_build_object('error', 'Bid must be at least the starting bid');
    END IF;
  ELSE
    IF p_amount < v_auction.current_bid + v_settings.min_bid_increment THEN
      RETURN jsonb_build_object('error', 'Bid must be at least ' || (v_auction.current_bid + v_settings.min_bid_increment));
    END IF;
  END IF;

  -- Validate buyout
  IF p_is_buyout THEN
    IF v_auction.buyout_price IS NULL THEN
      RETURN jsonb_build_object('error', 'This auction has no buyout price');
    END IF;
    IF p_amount != v_auction.buyout_price THEN
      RETURN jsonb_build_object('error', 'Buyout amount must match the buyout price');
    END IF;
  END IF;

  -- Save previous bidder info for refund
  v_prev_bidder_id := v_auction.current_bidder_id;
  v_prev_bid := v_auction.current_bid;

  -- Escrow: debit bidder's gold
  SELECT * INTO v_escrow_result FROM adjust_wallet_balance(
    p_bidder_id, -p_amount, 'auction_escrow',
    'Bid escrow for auction',
    jsonb_build_object('auction_id', p_auction_id),
    NULL
  );

  -- Refund previous bidder if exists
  IF v_prev_bidder_id IS NOT NULL THEN
    SELECT * INTO v_refund_result FROM adjust_wallet_balance(
      v_prev_bidder_id, v_prev_bid, 'auction_refund',
      'Outbid refund',
      jsonb_build_object('auction_id', p_auction_id),
      NULL
    );

    -- Update previous bid's refund_tx_id
    SELECT id INTO v_prev_bid_id FROM auction_bids
      WHERE auction_id = p_auction_id AND bidder_id = v_prev_bidder_id AND refund_tx_id IS NULL
      ORDER BY created_at DESC LIMIT 1;

    IF v_prev_bid_id IS NOT NULL THEN
      UPDATE auction_bids SET refund_tx_id = v_refund_result.transaction_id
        WHERE id = v_prev_bid_id;
    END IF;

    -- Notify outbid player
    INSERT INTO notifications (user_id, type, title, message, metadata)
    VALUES (
      v_prev_bidder_id,
      'auction_outbid',
      'Surenchéri !',
      'Vous avez été surenchéri. Votre mise de ' || v_prev_bid || ' or a été remboursée.',
      jsonb_build_object('auction_id', p_auction_id, 'new_bid', p_amount)
    );
  END IF;

  -- Insert bid record
  INSERT INTO auction_bids (auction_id, bidder_id, amount, is_buyout, wallet_tx_id)
  VALUES (p_auction_id, p_bidder_id, p_amount, p_is_buyout, v_escrow_result.transaction_id)
  RETURNING id INTO v_bid_id;

  -- Update auction
  UPDATE auctions SET
    current_bid = p_amount,
    current_bidder_id = p_bidder_id,
    bid_count = bid_count + 1
  WHERE id = p_auction_id;

  -- If buyout, end auction immediately
  IF p_is_buyout THEN
    UPDATE auctions SET ends_at = now() WHERE id = p_auction_id;
    PERFORM settle_auction(p_auction_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'bid_id', v_bid_id,
    'amount', p_amount,
    'is_buyout', p_is_buyout
  );
END;
$$ LANGUAGE plpgsql;

-- 7. settle_auction — settle expired auctions
CREATE OR REPLACE FUNCTION settle_auction(p_auction_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_auction RECORD;
  v_commission INTEGER;
  v_seller_payout INTEGER;
  v_item RECORD;
BEGIN
  -- Lock auction row
  SELECT * INTO v_auction FROM auctions
    WHERE id = p_auction_id AND status = 'active'
    FOR UPDATE;

  IF v_auction IS NULL THEN
    RETURN jsonb_build_object('error', 'Auction not found or already settled');
  END IF;

  IF v_auction.current_bidder_id IS NOT NULL THEN
    -- === SOLD ===
    -- Commission: 1 or for sales 10-20, percentage-based above 20, 0 below 10
    IF v_auction.current_bid >= 10 AND v_auction.current_bid <= 20 THEN
      v_commission := 1;
    ELSE
      v_commission := FLOOR(v_auction.current_bid * v_auction.commission_rate / 100);
    END IF;
    v_seller_payout := v_auction.current_bid - v_commission;

    -- Pay seller (skip if admin seller)
    IF v_auction.seller_type = 'player' AND v_seller_payout > 0 THEN
      PERFORM adjust_wallet_balance(
        v_auction.seller_id, v_seller_payout,
        'auction_sale', 'Vente aux enchères',
        jsonb_build_object('auction_id', p_auction_id, 'commission', v_commission),
        NULL
      );
    END IF;

    -- Transfer items to winner
    FOR v_item IN SELECT * FROM auction_items WHERE auction_id = p_auction_id LOOP
      IF v_item.source_type = 'print' THEN
        UPDATE card_prints SET owner_id = v_auction.current_bidder_id,
          assigned_at = now() WHERE id = v_item.source_id;
      ELSIF v_item.source_type IN ('collection', 'admin') THEN
        INSERT INTO user_collections (user_id, card_id)
        VALUES (v_auction.current_bidder_id, v_item.card_id)
        ON CONFLICT (user_id, card_id) DO NOTHING;
      END IF;
    END LOOP;

    UPDATE auctions SET status = 'ended_sold', settled_at = now()
      WHERE id = p_auction_id;

    -- Notify winner
    INSERT INTO notifications (user_id, type, title, message, metadata)
    VALUES (
      v_auction.current_bidder_id,
      'auction_won',
      'Enchère remportée !',
      'Vous avez remporté une enchère pour ' || v_auction.current_bid || ' or.',
      jsonb_build_object('auction_id', p_auction_id)
    );

    -- Notify seller
    IF v_auction.seller_type = 'player' THEN
      INSERT INTO notifications (user_id, type, title, message, metadata)
      VALUES (
        v_auction.seller_id,
        'auction_sold',
        'Carte vendue !',
        'Votre enchère a été vendue pour ' || v_auction.current_bid || ' or (commission: ' || v_commission || ').',
        jsonb_build_object('auction_id', p_auction_id, 'amount', v_auction.current_bid, 'commission', v_commission)
      );
    END IF;
  ELSE
    -- === UNSOLD ===
    -- Return items to seller
    FOR v_item IN SELECT * FROM auction_items WHERE auction_id = p_auction_id LOOP
      IF v_item.source_type = 'print' THEN
        UPDATE card_prints SET owner_id = v_auction.seller_id,
          assigned_at = now() WHERE id = v_item.source_id;
      ELSIF v_item.source_type = 'collection' THEN
        INSERT INTO user_collections (user_id, card_id)
        VALUES (v_auction.seller_id, v_item.card_id)
        ON CONFLICT (user_id, card_id) DO NOTHING;
      END IF;
    END LOOP;

    UPDATE auctions SET status = 'ended_unsold', settled_at = now()
      WHERE id = p_auction_id;

    -- Notify seller
    IF v_auction.seller_type = 'player' THEN
      INSERT INTO notifications (user_id, type, title, message, metadata)
      VALUES (
        v_auction.seller_id,
        'auction_ended_unsold',
        'Enchère terminée sans acheteur',
        'Votre enchère est terminée sans enchérisseur. Vos cartes vous ont été restituées.',
        jsonb_build_object('auction_id', p_auction_id)
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'sold', v_auction.current_bidder_id IS NOT NULL);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE auction_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Auction settings: anyone can read
CREATE POLICY "Read auction settings" ON auction_settings
  FOR SELECT USING (true);

-- Auctions: anyone authed can read active + own auctions
CREATE POLICY "Read auctions" ON auctions
  FOR SELECT USING (
    status = 'active'
    OR seller_id = auth.uid()
    OR current_bidder_id = auth.uid()
  );

-- Auction items: readable if the parent auction is readable
CREATE POLICY "Read auction items" ON auction_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auctions
      WHERE auctions.id = auction_items.auction_id
        AND (auctions.status = 'active' OR auctions.seller_id = auth.uid() OR auctions.current_bidder_id = auth.uid())
    )
  );

-- Bids: users can read their own bids
CREATE POLICY "Read own bids" ON auction_bids
  FOR SELECT USING (bidder_id = auth.uid());

-- Bids: anyone can read bids for visible auctions (for bid history)
CREATE POLICY "Read auction bids" ON auction_bids
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auctions
      WHERE auctions.id = auction_bids.auction_id
        AND (auctions.status = 'active' OR auctions.seller_id = auth.uid() OR auctions.current_bidder_id = auth.uid())
    )
  );

-- Notifications: users read their own
CREATE POLICY "Read own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

-- All mutations go through service_role (API routes), bypassing RLS
