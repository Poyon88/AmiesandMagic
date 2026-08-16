-- ============================================================================
-- Armies & Magic — PROLONGATION ANTI-SNIPING des enchères
-- ============================================================================
--
-- Le problème : une enchère qui se termine à heure fixe récompense celui qui
-- mise à la dernière seconde. Personne n'a le temps de répondre, et le prix
-- final reflète la latence du réseau plutôt que l'envie des joueurs.
--
-- La règle : toute mise déposée alors qu'il reste MOINS de `anti_snipe_seconds`
-- repousse la fin à `now() + anti_snipe_seconds`. Chaque enchérisseur retrouve
-- donc toujours le même délai de réaction, et l'enchère ne se ferme que sur un
-- silence de trente secondes.
--
-- ---------------------------------------------------------------------------
-- DÉCISIONS
--
-- 1. RÉGLABLE, pas codée en dur. Les trois autres paramètres du marché
--    (commission, incrément minimum, objets par lot) vivent déjà dans
--    `auction_settings` et se règlent depuis l'administration : un délai en dur
--    aurait été le seul qu'on ne puisse pas ajuster sans redéploiement. Mettre 0
--    désactive entièrement la prolongation.
--
-- 2. La prolongation N'A PAS DE PLAFOND. Une enchère disputée peut donc durer
--    bien au-delà de son terme annoncé — c'est le propre du procédé, et c'est
--    voulu : la fermer d'autorité au bout de N prolongations rendrait la
--    dernière mise imbattable, soit exactement ce qu'on cherche à empêcher.
--
-- 3. Elle ne s'applique QU'AU-DELÀ du seuil. Une mise déposée à cinq minutes de
--    la fin ne rallonge rien : sinon toute enchère durerait éternellement.
--
-- 4. Un ACHAT IMMÉDIAT ne prolonge rien. Il clôt l'enchère sur-le-champ ;
--    l'ordre des instructions plus bas est donc load-bearing.
-- ============================================================================

ALTER TABLE auction_settings
  ADD COLUMN IF NOT EXISTS anti_snipe_seconds INTEGER NOT NULL DEFAULT 30;

DO $$ BEGIN
  ALTER TABLE auction_settings
    ADD CONSTRAINT auction_settings_anti_snipe_positive CHECK (anti_snipe_seconds >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- `place_bid` REDÉFINIE — corps repris intégralement de
-- supabase-migration-auction.sql, avec la prolongation ajoutée à la fin.
--
-- Volontairement redéfinie en entier plutôt que complétée ailleurs : une
-- fonction qui déplace de l'argent doit se lire d'un seul tenant, et deux
-- moitiés dans deux fichiers finissent par diverger.
-- ---------------------------------------------------------------------------

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
  v_extended BOOLEAN := false;
  v_new_ends_at TIMESTAMPTZ;
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

  -- ─── PROLONGATION ANTI-SNIPING ───────────────────────────────────────────
  --
  -- Placée APRÈS l'enregistrement de la mise et AVANT l'achat immédiat :
  --   · après, parce qu'une mise refusée plus haut ne doit rien prolonger ;
  --   · avant, parce qu'un achat immédiat clôt l'enchère et écrase `ends_at`.
  --
  -- La comparaison porte sur l'échéance LUE SOUS VERROU (`v_auction.ends_at`) :
  -- deux mises simultanées voient donc le même « temps restant », et la seconde
  -- ne peut pas conclure à tort qu'il reste du temps parce que la première
  -- vient de prolonger.
  IF NOT p_is_buyout
     AND COALESCE(v_settings.anti_snipe_seconds, 0) > 0
     AND v_auction.ends_at - now() < (v_settings.anti_snipe_seconds || ' seconds')::interval
  THEN
    v_new_ends_at := now() + (v_settings.anti_snipe_seconds || ' seconds')::interval;
    UPDATE auctions SET ends_at = v_new_ends_at WHERE id = p_auction_id;
    v_extended := true;
  END IF;

  -- If buyout, end auction immediately
  IF p_is_buyout THEN
    UPDATE auctions SET ends_at = now() WHERE id = p_auction_id;
    PERFORM settle_auction(p_auction_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'bid_id', v_bid_id,
    'amount', p_amount,
    'is_buyout', p_is_buyout,
    -- Remonté pour que l'écran puisse annoncer « la fin a été repoussée » —
    -- sans quoi le compte à rebours semblerait repartir tout seul.
    'extended', v_extended,
    'ends_at', COALESCE(v_new_ends_at, v_auction.ends_at)
  );
END;
$$ LANGUAGE plpgsql;
