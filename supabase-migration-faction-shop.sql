-- ============================================================================
-- Armies & Magic — BOUTIQUE DE FACTIONS
-- ============================================================================
--
-- Modèle : à l'inscription le joueur choisit UNE faction et en reçoit les
-- communes. Il peut ensuite débloquer d'autres factions contre des pièces d'or,
-- à l'unité ou par forfait « toutes les factions ».
--
-- ---------------------------------------------------------------------------
-- DÉCISIONS, arbitrées avec l'auteur
--
-- 1. LES COMMUNES SEULEMENT. Un déblocage ne donne jamais de rare, d'épique ni
--    de légendaire : celles-ci restent l'affaire exclusive de l'hôtel des
--    ventes. Sans cette limite, l'or achèterait d'un côté ce qu'il rend rare de
--    l'autre.
--
-- 2. UNE TABLE, pas des colonnes. `profiles.starter_faction` est SINGULIER et
--    ne peut pas dire « les trois factions que j'ai débloquées ». Ajouter
--    `faction_2`, `faction_3`… aurait recréé le défaut récurrent de ce dépôt :
--    des listes parallèles qui divergent. La faction offerte devient donc une
--    simple ligne de cette table, `source = 'starter'`.
--
-- 3. LE FORFAIT RESTE UN BOOLÉEN (`profiles.all_commons_unlocked`, déjà en
--    place). Ce n'est PAS une incohérence avec le point 2 : le forfait couvre
--    aussi les factions qui n'existent pas encore. Le décliner en lignes
--    obligerait à repasser sur tous les acheteurs à chaque faction éditée.
--
-- 4. PRIX ADMINISTRABLES, pas des constantes. L'auteur veut un prix de
--    lancement pour le forfait, révisable sans redéploiement. Chaque achat
--    enregistre en outre le prix RÉELLEMENT payé : sans lui, l'historique
--    mentirait dès la première hausse.
--
-- 5. RÉVOCATION au remboursement. Voir `revoke_faction_unlocks_for_debt` : le
--    raisonnement y est détaillé, parce que « l'or est fongible » rend la règle
--    moins évidente qu'elle n'en a l'air.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE faction_unlock_source AS ENUM ('starter', 'purchase', 'bundle', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS user_faction_unlocks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  faction     TEXT NOT NULL,
  source      faction_unlock_source NOT NULL,
  -- Prix RÉELLEMENT payé, en or. 0 pour la faction offerte et les octrois
  -- administratifs. Sert à rembourser le bon montant lors d'une révocation,
  -- même si le tarif a changé depuis.
  price_paid  INTEGER NOT NULL DEFAULT 0 CHECK (price_paid >= 0),
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Une faction ne se débloque qu'une fois par joueur. C'est aussi ce qui rend
  -- un double clic inoffensif.
  UNIQUE (user_id, faction)
);

CREATE INDEX IF NOT EXISTS idx_faction_unlocks_user ON user_faction_unlocks (user_id);

-- ─── Reprise de l'existant ──────────────────────────────────────────────────
-- La faction offerte vivait dans `profiles.starter_faction`. On la recopie ici
-- pour que la table soit la source unique dès le premier jour. La colonne reste
-- en place — elle est encore lue par l'onboarding — mais elle n'est plus
-- l'autorité.

INSERT INTO user_faction_unlocks (user_id, faction, source, price_paid)
SELECT id, starter_faction, 'starter', 0
FROM profiles
WHERE starter_faction IS NOT NULL AND starter_faction <> ''
ON CONFLICT (user_id, faction) DO NOTHING;

-- Le backfill ci-dessus ne règle que le PASSÉ. L'onboarding continue d'écrire
-- `profiles.starter_faction` sans rien savoir de cette table : sans le trigger
-- qui suit, chaque nouvel inscrit créerait une divergence, et son unique
-- faction n'existerait que dans l'ancienne colonne.
--
-- Le trigger plutôt que la route : la colonne est écrite depuis l'onboarding,
-- depuis l'écran d'administration des joueurs, et à la main en cas de
-- réparation. Un seul de ces chemins oublié suffirait à rouvrir la divergence.

CREATE OR REPLACE FUNCTION sync_starter_faction_unlock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.starter_faction IS NOT NULL AND NEW.starter_faction <> '' THEN
    INSERT INTO user_faction_unlocks (user_id, faction, source, price_paid)
    VALUES (NEW.id, NEW.starter_faction, 'starter', 0)
    ON CONFLICT (user_id, faction) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_starter_faction ON profiles;
CREATE TRIGGER trg_sync_starter_faction
  AFTER INSERT OR UPDATE OF starter_faction ON profiles
  FOR EACH ROW EXECUTE FUNCTION sync_starter_faction_unlock();

-- ─── Tarifs ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS faction_shop_settings (
  id            INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  faction_price INTEGER NOT NULL DEFAULT 1200 CHECK (faction_price >= 0),
  -- Prix de LANCEMENT du forfait. Volontairement inférieur à deux factions
  -- (2400) : le forfait devient avantageux dès qu'on en veut deux.
  bundle_price  INTEGER NOT NULL DEFAULT 2300 CHECK (bundle_price >= 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID REFERENCES auth.users(id)
);

INSERT INTO faction_shop_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- ACHATS
-- ============================================================================

/** Achat d'UNE faction. Atomique : le débit et le déblocage vivent dans la même
 *  transaction, donc jamais l'un sans l'autre.
 *
 *  Refuse si le joueur porte une DETTE d'or : le solde affiché serait trompeur,
 *  et laisser dépenser un joueur endetté annulerait le sens de la dette. */
CREATE OR REPLACE FUNCTION purchase_faction(p_user_id UUID, p_faction TEXT)
RETURNS JSONB AS $$
DECLARE
  v_price   INTEGER;
  v_balance INTEGER;
  v_debt    INTEGER;
  v_bundle  BOOLEAN;
BEGIN
  IF p_faction IS NULL OR p_faction = '' THEN
    RETURN jsonb_build_object('error', 'faction_missing');
  END IF;

  SELECT faction_price INTO v_price FROM faction_shop_settings WHERE id = 1;
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('error', 'shop_unconfigured');
  END IF;

  SELECT all_commons_unlocked INTO v_bundle FROM profiles WHERE id = p_user_id;
  IF COALESCE(v_bundle, false) THEN
    -- Rien à vendre : le forfait couvre déjà tout, y compris les factions à
    -- venir. Lui facturer une faction serait lui vendre ce qu'il possède.
    RETURN jsonb_build_object('error', 'already_owns_bundle');
  END IF;

  IF EXISTS (SELECT 1 FROM user_faction_unlocks WHERE user_id = p_user_id AND faction = p_faction) THEN
    RETURN jsonb_build_object('error', 'already_unlocked');
  END IF;

  SELECT balance, COALESCE(gold_debt, 0) INTO v_balance, v_debt
    FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  v_balance := COALESCE(v_balance, 0);
  v_debt := COALESCE(v_debt, 0);

  IF v_debt > 0 THEN
    RETURN jsonb_build_object('error', 'gold_debt', 'debt', v_debt);
  END IF;
  IF v_balance < v_price THEN
    RETURN jsonb_build_object('error', 'insufficient_gold', 'price', v_price, 'balance', v_balance);
  END IF;

  PERFORM adjust_wallet_balance(
    p_user_id, -v_price, 'shop_card',
    'Déblocage de faction',
    jsonb_build_object('faction', p_faction), NULL
  );

  INSERT INTO user_faction_unlocks (user_id, faction, source, price_paid)
  VALUES (p_user_id, p_faction, 'purchase', v_price);

  RETURN jsonb_build_object('unlocked', p_faction, 'price', v_price,
                            'balance', v_balance - v_price);
END;
$$ LANGUAGE plpgsql;

/** Achat du FORFAIT. Bascule le booléen plutôt que d'insérer dix lignes : il
 *  doit couvrir les factions à venir (cf. décision 3). */
CREATE OR REPLACE FUNCTION purchase_faction_bundle(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_price   INTEGER;
  v_balance INTEGER;
  v_debt    INTEGER;
  v_bundle  BOOLEAN;
BEGIN
  SELECT bundle_price INTO v_price FROM faction_shop_settings WHERE id = 1;
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('error', 'shop_unconfigured');
  END IF;

  SELECT all_commons_unlocked INTO v_bundle FROM profiles WHERE id = p_user_id;
  IF COALESCE(v_bundle, false) THEN
    RETURN jsonb_build_object('error', 'already_unlocked');
  END IF;

  SELECT balance, COALESCE(gold_debt, 0) INTO v_balance, v_debt
    FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  v_balance := COALESCE(v_balance, 0);
  v_debt := COALESCE(v_debt, 0);

  IF v_debt > 0 THEN
    RETURN jsonb_build_object('error', 'gold_debt', 'debt', v_debt);
  END IF;
  IF v_balance < v_price THEN
    RETURN jsonb_build_object('error', 'insufficient_gold', 'price', v_price, 'balance', v_balance);
  END IF;

  PERFORM adjust_wallet_balance(
    p_user_id, -v_price, 'shop_card',
    'Déblocage de toutes les factions',
    jsonb_build_object('bundle', true), NULL
  );

  UPDATE profiles SET all_commons_unlocked = true WHERE id = p_user_id;

  -- Trace du montant payé, pour la révocation. `faction = '*'` désigne le
  -- forfait : la contrainte d'unicité empêche de l'acheter deux fois.
  INSERT INTO user_faction_unlocks (user_id, faction, source, price_paid)
  VALUES (p_user_id, '*', 'bundle', v_price)
  ON CONFLICT (user_id, faction) DO NOTHING;

  RETURN jsonb_build_object('unlocked', '*', 'price', v_price,
                            'balance', v_balance - v_price);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RÉVOCATION AU REMBOURSEMENT
-- ============================================================================

/** Reprend des déblocages pour éponger une dette d'or.
 *
 *  ⚠️ Pourquoi ce n'est pas évident. L'or est FONGIBLE : rien ne dit quelle
 *  pièce a payé quelle faction, et on ne peut donc pas « annuler l'achat
 *  financé par le paiement remboursé ». La règle retenue est la seule
 *  implémentable et elle se défend : un joueur remboursé qui a converti son or
 *  en factions doit rendre ce que cet or a acheté.
 *
 *  On reprend du PLUS RÉCENT au plus ancien, et on crédite le prix payé — celui
 *  inscrit sur la ligne, pas le tarif du jour — contre la dette. La faction
 *  OFFERTE (`source = 'starter'`) n'est jamais reprise : elle n'a rien coûté,
 *  et la retirer laisserait le joueur sans aucune carte.
 *
 *  Ce qui reste après épuisement des déblocages demeure en dette.
 */
CREATE OR REPLACE FUNCTION revoke_faction_unlocks_for_debt(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_debt    INTEGER;
  v_revoked TEXT[] := '{}';
  r         RECORD;
BEGIN
  SELECT COALESCE(gold_debt, 0) INTO v_debt FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  IF COALESCE(v_debt, 0) <= 0 THEN
    RETURN jsonb_build_object('revoked', v_revoked, 'debt_remaining', COALESCE(v_debt, 0));
  END IF;

  FOR r IN
    SELECT id, faction, price_paid, source
    FROM user_faction_unlocks
    WHERE user_id = p_user_id AND source IN ('purchase', 'bundle')
    ORDER BY unlocked_at DESC
  LOOP
    EXIT WHEN v_debt <= 0;

    DELETE FROM user_faction_unlocks WHERE id = r.id;
    IF r.source = 'bundle' THEN
      UPDATE profiles SET all_commons_unlocked = false WHERE id = p_user_id;
    END IF;

    -- Le prix payé s'impute sur la dette. Reprendre une faction payée 1200 pour
    -- n'effacer que 300 de dette punirait deux fois ; l'excédent est donc rendu
    -- (la dette ne descend jamais sous zéro, cf. LEAST plus bas).
    v_debt := v_debt - r.price_paid;
    v_revoked := array_append(v_revoked, r.faction);
  END LOOP;

  UPDATE wallets SET gold_debt = GREATEST(v_debt, 0) WHERE user_id = p_user_id;

  RETURN jsonb_build_object('revoked', v_revoked, 'debt_remaining', GREATEST(v_debt, 0));
END;
$$ LANGUAGE plpgsql;

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE user_faction_unlocks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE faction_shop_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users read own faction unlocks" ON user_faction_unlocks
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- Les tarifs sont publics : la boutique doit pouvoir les afficher.
  CREATE POLICY "Anyone reads faction shop prices" ON faction_shop_settings
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- BRANCHEMENT SUR LE REMBOURSEMENT
-- ============================================================================
--
-- `apply_charge_refunded` REDÉFINIE — corps repris de
-- supabase-migration-tournament-tickets.sql, avec un seul ajout : après avoir
-- constitué la dette d'or, on reprend les déblocages de factions qu'elle
-- couvre. Redéfinie en entier plutôt que complétée ailleurs, comme les fois
-- précédentes : une fonction qui déplace de l'argent doit se lire d'un bloc.

CREATE OR REPLACE FUNCTION apply_charge_refunded(p_payment_intent_id TEXT)
RETURNS JSONB AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_balance INTEGER;
  v_debited INTEGER;
  v_debt    INTEGER;
  v_status  tournament_status;
  v_removed BOOLEAN := false;
  v_tickets JSONB;
  v_factions JSONB := NULL;
BEGIN
  UPDATE payments SET status = 'refunded', updated_at = now()
  WHERE stripe_payment_intent_id = p_payment_intent_id
    AND status = 'completed'
  RETURNING * INTO v_payment;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  IF v_payment.type = 'gold_pack' AND v_payment.gold_amount > 0 THEN
    SELECT balance INTO v_balance FROM wallets WHERE user_id = v_payment.user_id FOR UPDATE;
    v_balance := COALESCE(v_balance, 0);
    v_debited := LEAST(v_balance, v_payment.gold_amount);
    v_debt    := v_payment.gold_amount - v_debited;

    IF v_debited > 0 THEN
      PERFORM adjust_wallet_balance(
        v_payment.user_id, -v_debited, 'refund',
        'Reprise après remboursement Stripe',
        jsonb_build_object('payment_id', v_payment.id), NULL
      );
    END IF;
    IF v_debt > 0 THEN
      UPDATE wallets SET gold_debt = gold_debt + v_debt WHERE user_id = v_payment.user_id;
      -- L'or manquant a pu être converti en factions : on reprend ce qu'il a
      -- acheté, au prix payé (cf. revoke_faction_unlocks_for_debt).
      v_factions := revoke_faction_unlocks_for_debt(v_payment.user_id);
    END IF;
    UPDATE payments SET gold_clawed_back = v_debited WHERE id = v_payment.id;

    RETURN jsonb_build_object('status', 'refunded', 'payment_id', v_payment.id,
                              'gold_debited', v_debited, 'gold_debt_added', v_debt,
                              'factions', v_factions);
  END IF;

  IF v_payment.type = 'ticket_pack' THEN
    v_tickets := revoke_tickets_for_payment(v_payment.id);
    RETURN jsonb_build_object('status', 'refunded', 'payment_id', v_payment.id, 'tickets', v_tickets);
  END IF;

  IF v_payment.type = 'tournament_entry' THEN
    SELECT status INTO v_status FROM tournaments WHERE id = v_payment.reference::uuid;
    IF v_status IS NULL OR v_status IN ('draft', 'open', 'cancelled') THEN
      DELETE FROM tournament_entries WHERE payment_id = v_payment.id;
      v_removed := true;
    END IF;
    RETURN jsonb_build_object('status', 'refunded', 'payment_id', v_payment.id,
                              'entry_removed', v_removed);
  END IF;

  RETURN jsonb_build_object('status', 'refunded', 'payment_id', v_payment.id);
END;
$$ LANGUAGE plpgsql;
