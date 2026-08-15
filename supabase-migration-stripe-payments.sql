-- ============================================================================
-- Armies & Magic — Paiements Stripe en CIRCUIT FERMÉ
-- ============================================================================
--
-- ⚠️ CONFORMITÉ — à lire avant toute évolution de ce fichier.
--
-- L'argent réel ENTRE dans la plateforme (inscriptions aux tournois payants,
-- achats de packs de pièces d'or) et n'en RESSORT JAMAIS vers les joueurs.
-- Les pièces d'or sont une monnaie virtuelle interne : non convertibles en
-- euros, non remboursables, non transférables entre joueurs. Le seul argent qui
-- repart est le remboursement Stripe du paiement d'origine, vers le moyen de
-- paiement d'origine.
--
-- N'introduisez AUCUN mécanisme de sortie d'argent (payout, retrait, revente
-- contre euros, transfert entre joueurs) sans revalidation juridique préalable :
-- cela ferait basculer la plateforme sous agrément PSD2 et/ou sous la
-- qualification de jeu d'argent. La TVA sur services numériques (guichet OSS)
-- fera l'objet d'un chantier distinct — c'est la seule raison d'être de
-- `payments.customer_country`, renseigné depuis Stripe et jamais depuis le
-- client.
--
-- ---------------------------------------------------------------------------
-- CHOIX D'ARCHITECTURE, arbitrés avec l'auteur avant écriture
--
-- 1. PAS de table `gold_ledger`. Le grand livre de pièces d'or existe DÉJÀ et
--    tourne en production : `wallets` + `wallet_transactions` +
--    `adjust_wallet_balance()`, dont dépendent les enchères (place_bid,
--    settle_auction). En créer un second aurait donné deux soldes concurrents
--    pour la même monnaie — un joueur aurait acheté de l'or sans pouvoir
--    enchérir avec. Les achats créditent donc le portefeuille existant, avec le
--    type `purchase` qui y était déjà prévu.
--
-- 2. La DETTE plutôt que le solde négatif. Un remboursement doit pouvoir
--    reprendre de l'or déjà dépensé. `wallets.balance` porte un
--    CHECK (balance >= 0) qui l'interdit — et ce CHECK est la SEULE chose qui
--    empêche d'enchérir à découvert, `place_bid` n'ayant aucune garde en
--    propre. Plutôt que de l'assouplir et d'ouvrir un trou dans les enchères,
--    le remboursement débite ce qu'il peut et inscrit le reste dans
--    `wallets.gold_debt`. Enchères bloquées tant que la dette n'est pas
--    résorbée, et tout crédit ultérieur l'éponge en priorité.
--
-- 3. La logique du webhook vit ICI, en PL/pgSQL, pas dans le handler Node. Ces
--    fonctions sont atomiques par construction (une transaction par appel) et
--    rejouables sans effet : c'est ce que Stripe exige, puisqu'il redélivre ses
--    événements. Elles sont éprouvées sous PGlite par la suite de tests, sans
--    aucun bouchon.
-- ============================================================================

-- ─── Types ──────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE payment_type AS ENUM ('tournament_entry', 'gold_pack');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'refunded', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tournament_status AS ENUM ('draft', 'open', 'running', 'finished', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Clients Stripe ─────────────────────────────────────────────────────────
-- Un client Stripe par joueur, créé au premier paiement et réutilisé ensuite :
-- l'historique reste groupé côté tableau de bord Stripe, et le joueur retrouve
-- ses moyens de paiement enregistrés.

CREATE TABLE IF NOT EXISTS stripe_customers (
  user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Tournois ───────────────────────────────────────────────────────────────
-- Strictement ce que le PAIEMENT exige de connaître. Le tournoi lui-même
-- (arbre, appariement, distribution des gains) est un chantier distinct et
-- volontairement hors de ce lot.

CREATE TABLE IF NOT EXISTS tournaments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  status            tournament_status NOT NULL DEFAULT 'draft',
  -- Prix indicatif, pour l'affichage. Le montant RÉELLEMENT facturé vient
  -- toujours du Price Stripe, jamais d'ici et jamais du client.
  entry_price_cents INTEGER NOT NULL DEFAULT 250 CHECK (entry_price_cents >= 0),
  capacity          INTEGER NOT NULL DEFAULT 32 CHECK (capacity > 0),
  starts_at         TIMESTAMPTZ,
  format_code       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Paiements ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Clé d'IDEMPOTENCE du webhook. Stripe redélivre ses événements ; c'est cette
  -- contrainte d'unicité, et la garde sur `status`, qui rendent un rejeu inerte.
  stripe_session_id        TEXT NOT NULL UNIQUE,
  stripe_payment_intent_id TEXT,
  type                     payment_type NOT NULL,
  -- Cible du paiement. TEXT et non UUID (écart assumé au cahier des charges) :
  -- un tournoi est un UUID, mais un pack de pièces d'or est un code de
  -- configuration serveur (`gold_pack_m`) et non une ligne de base. Deux
  -- colonnes pour une seule notion auraient dérivé l'une de l'autre.
  reference                TEXT,
  -- Montants COPIÉS depuis Stripe à la réception du webhook, jamais fournis par
  -- le client.
  amount_cents             INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency                 TEXT NOT NULL DEFAULT 'eur',
  status                   payment_status NOT NULL DEFAULT 'pending',
  -- Pièces d'or créditées par ce paiement (packs uniquement). Conservé pour
  -- savoir quoi reprendre en cas de remboursement.
  gold_amount              INTEGER NOT NULL DEFAULT 0 CHECK (gold_amount >= 0),
  gold_clawed_back         INTEGER NOT NULL DEFAULT 0 CHECK (gold_clawed_back >= 0),
  -- Pays du client tel que Stripe le rapporte (customer_details.address.country).
  -- Sert UNIQUEMENT au futur chantier TVA/OSS ; aucune règle métier ne s'y
  -- adosse aujourd'hui.
  customer_country         TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_intent ON payments(stripe_payment_intent_id);

-- ─── Inscriptions aux tournois ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tournament_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NULL = circuit GRATUIT (aucun paiement). Non-NULL = entrée payante.
  payment_id    UUID REFERENCES payments(id) ON DELETE SET NULL,
  deck_id       UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Une inscription par joueur et par tournoi. C'est aussi le filet qui rend
  -- inerte un webhook rejoué : la seconde insertion ne fait rien.
  UNIQUE (tournament_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_entries_tournament ON tournament_entries(tournament_id);

-- ─── Dette de pièces d'or ───────────────────────────────────────────────────
-- Voir le point 2 de l'en-tête. Additive, sur une colonne qu'aucun code
-- existant n'écrit : le portefeuille et les enchères continuent de fonctionner
-- à l'identique tant que la dette est nulle, ce qui est le cas de tous les
-- joueurs actuels.

ALTER TABLE wallets ADD COLUMN IF NOT EXISTS gold_debt INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE wallets ADD CONSTRAINT wallets_gold_debt_positive CHECK (gold_debt >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- FONCTIONS — la logique du webhook, atomique et rejouable
-- ============================================================================

-- Crédite des pièces d'or en ÉPONGEANT D'ABORD la dette du joueur.
--
-- Un joueur endetté (remboursement passé, or déjà dépensé) ne doit pas pouvoir
-- s'en libérer en jouant : tout crédit ultérieur va d'abord à la dette, et
-- seul l'excédent atterrit sur le solde.
CREATE OR REPLACE FUNCTION credit_gold_absorbing_debt(
  p_user_id     UUID,
  p_amount      INTEGER,
  p_type        TEXT,
  p_description TEXT DEFAULT NULL,
  p_metadata    JSONB DEFAULT '{}'
) RETURNS JSONB AS $$
DECLARE
  v_debt      INTEGER;
  v_absorbed  INTEGER;
  v_credited  INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('credited', 0, 'debt_absorbed', 0);
  END IF;

  -- Le portefeuille peut ne pas exister encore (adjust_wallet_balance fait
  -- l'upsert) : pas de dette dans ce cas.
  SELECT gold_debt INTO v_debt FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  v_debt := COALESCE(v_debt, 0);

  v_absorbed := LEAST(v_debt, p_amount);
  v_credited := p_amount - v_absorbed;

  IF v_absorbed > 0 THEN
    UPDATE wallets SET gold_debt = gold_debt - v_absorbed WHERE user_id = p_user_id;
  END IF;

  IF v_credited > 0 THEN
    PERFORM adjust_wallet_balance(
      p_user_id, v_credited, p_type, p_description,
      p_metadata || jsonb_build_object('debt_absorbed', v_absorbed), NULL
    );
  END IF;

  RETURN jsonb_build_object('credited', v_credited, 'debt_absorbed', v_absorbed);
END;
$$ LANGUAGE plpgsql;

-- ─── checkout.session.completed ─────────────────────────────────────────────
--
-- L'ÉVÉNEMENT QUI FAIT FOI. La redirection de succès ne crédite rien : elle
-- peut ne jamais arriver, et elle peut être forgée.
--
-- Rejeu : la mise à jour est gardée par `status = 'pending'`. Un second passage
-- ne touche aucune ligne et sort en 'duplicate', sans crédit ni inscription.
--
-- Renvoie l'action que le handler Node doit encore mener côté Stripe —
-- aujourd'hui uniquement `refund_needed`, quand un tournoi s'est rempli entre
-- l'ouverture de la session et le paiement.
CREATE OR REPLACE FUNCTION apply_checkout_completed(
  p_session_id        TEXT,
  p_payment_intent_id TEXT,
  p_amount_cents      INTEGER,
  p_currency          TEXT,
  p_country           TEXT
) RETURNS JSONB AS $$
DECLARE
  v_payment    payments%ROWTYPE;
  v_tournament tournaments%ROWTYPE;
  v_taken      INTEGER;
  v_credit     JSONB;
BEGIN
  -- Transition unique pending → completed. Tout est verrouillé ici.
  UPDATE payments SET
    status                   = 'completed',
    stripe_payment_intent_id = COALESCE(p_payment_intent_id, stripe_payment_intent_id),
    amount_cents             = COALESCE(p_amount_cents, amount_cents),
    currency                 = COALESCE(p_currency, currency),
    customer_country         = COALESCE(p_country, customer_country),
    updated_at               = now()
  WHERE stripe_session_id = p_session_id
    AND status = 'pending'
  RETURNING * INTO v_payment;

  IF NOT FOUND THEN
    -- Soit un rejeu (déjà 'completed'), soit une session inconnue. Dans les deux
    -- cas : aucun effet, et surtout pas d'erreur — répondre 500 ferait retenter
    -- Stripe indéfiniment sur un événement déjà traité.
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  IF v_payment.type = 'gold_pack' THEN
    v_credit := credit_gold_absorbing_debt(
      v_payment.user_id, v_payment.gold_amount, 'purchase',
      'Achat de pièces d''or',
      jsonb_build_object('payment_id', v_payment.id, 'pack', v_payment.reference)
    );
    RETURN jsonb_build_object(
      'status', 'credited',
      'payment_id', v_payment.id,
      'gold', v_credit
    );
  END IF;

  IF v_payment.type = 'tournament_entry' THEN
    SELECT * INTO v_tournament FROM tournaments
      WHERE id = v_payment.reference::uuid FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'refund_needed', 'payment_id', v_payment.id,
                                'reason', 'tournament_missing');
    END IF;

    -- Le tournoi a-t-il fermé ou s'est-il rempli PENDANT le paiement ? Le
    -- comptage est fait sous verrou du tournoi : deux paiements simultanés sur
    -- la dernière place ne peuvent pas passer tous les deux.
    SELECT count(*) INTO v_taken FROM tournament_entries WHERE tournament_id = v_tournament.id;

    IF v_tournament.status <> 'open' THEN
      RETURN jsonb_build_object('status', 'refund_needed', 'payment_id', v_payment.id,
                                'reason', 'tournament_closed');
    END IF;

    IF v_taken >= v_tournament.capacity THEN
      RETURN jsonb_build_object('status', 'refund_needed', 'payment_id', v_payment.id,
                                'reason', 'tournament_full');
    END IF;

    INSERT INTO tournament_entries (tournament_id, user_id, payment_id)
    VALUES (v_tournament.id, v_payment.user_id, v_payment.id)
    ON CONFLICT (tournament_id, user_id) DO NOTHING;

    RETURN jsonb_build_object('status', 'entered', 'payment_id', v_payment.id,
                              'tournament_id', v_tournament.id);
  END IF;

  RETURN jsonb_build_object('status', 'ignored', 'payment_id', v_payment.id);
END;
$$ LANGUAGE plpgsql;

-- ─── checkout.session.expired ───────────────────────────────────────────────
-- Session abandonnée ou périmée : le paiement en attente passe en échec. Gardé
-- sur 'pending' — un paiement abouti ne doit jamais retomber en 'failed', quel
-- que soit l'ordre d'arrivée des événements.
CREATE OR REPLACE FUNCTION apply_checkout_expired(p_session_id TEXT)
RETURNS JSONB AS $$
DECLARE v_id UUID;
BEGIN
  UPDATE payments SET status = 'failed', updated_at = now()
  WHERE stripe_session_id = p_session_id AND status = 'pending'
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;
  RETURN jsonb_build_object('status', 'failed', 'payment_id', v_id);
END;
$$ LANGUAGE plpgsql;

-- ─── charge.refunded ────────────────────────────────────────────────────────
--
-- Reprise de la contrepartie virtuelle. Voir le point 2 de l'en-tête pour le
-- choix « dette » plutôt que « solde négatif ».
--
-- Un tournoi DÉJÀ COMMENCÉ ne rend pas la place : le joueur a consommé la
-- prestation. L'inscription n'est retirée que si le tournoi n'a pas démarré.
CREATE OR REPLACE FUNCTION apply_charge_refunded(p_payment_intent_id TEXT)
RETURNS JSONB AS $$
DECLARE
  v_payment    payments%ROWTYPE;
  v_balance    INTEGER;
  v_debited    INTEGER;
  v_debt       INTEGER;
  v_status     tournament_status;
  v_removed    BOOLEAN := false;
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

    -- On reprend ce que le solde permet ; le reste devient une dette. Le CHECK
    -- (balance >= 0) du portefeuille reste donc toujours satisfait.
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
      -- Le portefeuille existe forcément : le paiement l'a créé au crédit.
      UPDATE wallets SET gold_debt = gold_debt + v_debt WHERE user_id = v_payment.user_id;
    END IF;

    UPDATE payments SET gold_clawed_back = v_debited WHERE id = v_payment.id;

    RETURN jsonb_build_object('status', 'refunded', 'payment_id', v_payment.id,
                              'gold_debited', v_debited, 'gold_debt_added', v_debt);
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

-- ─── Solde exploitable ──────────────────────────────────────────────────────
-- Un joueur endetté ne peut pas enchérir. Fonction unique, pour que l'API et
-- l'affichage disent la même chose que la règle.
CREATE OR REPLACE FUNCTION gold_spendable(p_user_id UUID)
RETURNS INTEGER AS $$
  SELECT CASE WHEN COALESCE(gold_debt, 0) > 0 THEN 0 ELSE COALESCE(balance, 0) END
  FROM wallets WHERE user_id = p_user_id;
$$ LANGUAGE sql STABLE;

-- ============================================================================
-- RLS — lecture de ses propres lignes ; toute écriture passe par le
-- service_role (routes API et webhook), qui contourne RLS.
-- ============================================================================

ALTER TABLE payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_customers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users read own payments" ON payments
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- Volontairement AUCUNE policy de lecture sur stripe_customers : l'identifiant
  -- client Stripe n'a aucune raison d'atteindre le navigateur.
  CREATE POLICY "Nobody reads stripe_customers" ON stripe_customers
    FOR SELECT USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- Les tournois publiables sont visibles de tous ; les brouillons non.
  CREATE POLICY "Anyone reads published tournaments" ON tournaments
    FOR SELECT USING (status <> 'draft');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Anyone reads tournament entries" ON tournament_entries
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
