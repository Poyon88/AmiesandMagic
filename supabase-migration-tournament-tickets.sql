-- ============================================================================
-- Armies & Magic — TICKETS DE TOURNOI (bien numérique détenu)
-- ============================================================================
--
-- Change de modèle par rapport au lot précédent : on n'achète plus une place
-- dans UN tournoi, on achète des TICKETS qu'on garde et qu'on dépense ensuite
-- dans le tournoi de son choix. L'inscription ne touche donc plus jamais
-- Stripe — et avec elle disparaissent le cas « tournoi rempli pendant le
-- paiement » et son remboursement automatique.
--
-- ⚠️ CONFORMITÉ — le circuit reste FERMÉ. Un ticket n'est ni revendable, ni
-- transférable, ni convertible en euros ; il n'est remboursable que par le
-- remboursement Stripe de son achat d'origine. Voir l'en-tête de
-- supabase-migration-stripe-payments.sql avant toute évolution.
--
-- ---------------------------------------------------------------------------
-- DÉCISIONS, arbitrées avec l'auteur
--
-- 1. UN TICKET = UNE LIGNE, et non un compteur. Chaque ticket porte sa propre
--    date de péremption : un compteur ne saurait pas dire lequel périme en
--    premier. La consommation prend donc toujours celui qui expire le plus tôt.
--
-- 2. AUCUNE COLONNE `status`. L'état se DÉDUIT des trois dates (dépensé,
--    révoqué, périmé). Une colonne de statut aurait exigé une tâche planifiée
--    pour marquer les périmés, et aurait fini par diverger des dates.
--
-- 3. REMBOURSEMENT : on annule d'abord les tickets encore en main, puis, s'il
--    en manque, on retire les inscriptions aux tournois NON COMMENCÉS — la
--    place n'a pas été consommée, elle repart au pot. Ce qui a réellement été
--    joué reste acquis, et le reliquat devient une DETTE qui bloque tout usage
--    de ticket jusqu'à résorption.
--
-- 4. PÉREMPTION à 365 jours. Attention à l'affichage : un ticket acheté le
--    16 août 2026 porte `expires_at = 2027-08-16`, et se présente au joueur
--    comme « valable jusqu'au 15 août 2027 » — la borne stockée est exclusive,
--    la borne affichée est le dernier jour utilisable.
-- ============================================================================

-- ─── Nature d'un tournoi ────────────────────────────────────────────────────
-- Le ticket dit « un tournoi », pas « un mercredi » : un tournoi mensuel créé
-- demain acceptera les mêmes tickets sans migration.

DO $$ BEGIN
  CREATE TYPE tournament_kind AS ENUM ('weekly', 'free', 'special');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS kind tournament_kind NOT NULL DEFAULT 'weekly';

/** Un tournoi coûte-t-il un ticket ? SOURCE UNIQUE de la règle : l'API la
 *  renvoie aux écrans plutôt que de les laisser la recopier, et le moteur
 *  d'inscription l'appelle aussi. Une règle « kind <> 'free' » dupliquée en
 *  TypeScript aurait dérivé au premier type ajouté. */
CREATE OR REPLACE FUNCTION tournament_requires_ticket(p_kind tournament_kind)
RETURNS BOOLEAN AS $$
  SELECT p_kind <> 'free';
$$ LANGUAGE sql IMMUTABLE;

-- ─── Tickets ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tournament_tickets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Paiement d'origine. NULL = octroi administratif (dédommagement, cadeau) :
  -- un tel ticket n'est rattaché à aucun encaissement, et un remboursement
  -- Stripe ne peut donc jamais le reprendre.
  payment_id   UUID REFERENCES payments(id) ON DELETE SET NULL,
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Borne EXCLUSIVE : le ticket est utilisable tant que now() < expires_at.
  expires_at   TIMESTAMPTZ NOT NULL,
  -- Les trois dates qui portent l'état. Aucune n'est redondante avec une autre.
  spent_at     TIMESTAMPTZ,
  spent_on     UUID REFERENCES tournaments(id) ON DELETE SET NULL,
  revoked_at   TIMESTAMPTZ,
  CONSTRAINT ticket_spent_coherent CHECK ((spent_at IS NULL) = (spent_on IS NULL)),
  -- Un ticket ne peut pas être à la fois dépensé et révoqué : le remboursement
  -- rend d'abord l'inscription, ce qui remet le ticket en main, avant de le
  -- révoquer.
  CONSTRAINT ticket_not_both CHECK (NOT (spent_at IS NOT NULL AND revoked_at IS NOT NULL))
);

-- L'index qui porte la consommation : « les tickets utilisables de ce joueur,
-- celui qui périme le plus tôt d'abord ».
CREATE INDEX IF NOT EXISTS idx_tickets_available
  ON tournament_tickets (user_id, expires_at)
  WHERE spent_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_payment ON tournament_tickets (payment_id);

-- ─── Dette de tickets ───────────────────────────────────────────────────────
-- Miroir de `gold_debt`. La table `wallets` porte désormais l'état ÉCONOMIQUE
-- du joueur — solde d'or, dette d'or, dette de tickets — et non plus seulement
-- sa bourse ; son nom est historique.

ALTER TABLE wallets ADD COLUMN IF NOT EXISTS ticket_debt INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE wallets ADD CONSTRAINT wallets_ticket_debt_positive CHECK (ticket_debt >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- FONCTIONS
-- ============================================================================

/** Tickets utilisables d'un joueur, à cet instant. Ni dépensés, ni révoqués,
 *  ni périmés. Source unique : l'écran, l'API et le moteur comptent pareil. */
CREATE OR REPLACE FUNCTION available_tickets(p_user_id UUID)
RETURNS INTEGER AS $$
  SELECT count(*)::int FROM tournament_tickets
  WHERE user_id = p_user_id
    AND spent_at IS NULL AND revoked_at IS NULL AND expires_at > now();
$$ LANGUAGE sql STABLE;

/** Octroi de N tickets. Appelée par le webhook à l'encaissement, et par
 *  l'administration pour un dédommagement (`p_payment_id` NULL).
 *
 *  La dette est ÉPONGÉE D'ABORD, comme pour les pièces d'or : un joueur endetté
 *  ne se libère pas en rachetant, il rembourse. */
CREATE OR REPLACE FUNCTION grant_tournament_tickets(
  p_user_id    UUID,
  p_count      INTEGER,
  p_payment_id UUID DEFAULT NULL,
  p_valid_days INTEGER DEFAULT 365
) RETURNS JSONB AS $$
DECLARE
  v_debt     INTEGER;
  v_absorbed INTEGER;
  v_granted  INTEGER;
BEGIN
  IF p_count <= 0 THEN
    RETURN jsonb_build_object('granted', 0, 'debt_absorbed', 0);
  END IF;

  SELECT ticket_debt INTO v_debt FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  v_debt := COALESCE(v_debt, 0);

  v_absorbed := LEAST(v_debt, p_count);
  v_granted  := p_count - v_absorbed;

  IF v_absorbed > 0 THEN
    UPDATE wallets SET ticket_debt = ticket_debt - v_absorbed WHERE user_id = p_user_id;
  END IF;

  IF v_granted > 0 THEN
    INSERT INTO tournament_tickets (user_id, payment_id, expires_at)
    SELECT p_user_id, p_payment_id, now() + (p_valid_days || ' days')::interval
    FROM generate_series(1, v_granted);
  END IF;

  RETURN jsonb_build_object('granted', v_granted, 'debt_absorbed', v_absorbed);
END;
$$ LANGUAGE plpgsql;

/** Inscription à un tournoi PAR CONSOMMATION D'UN TICKET. Aucun argent réel
 *  n'entre en jeu ici — c'est tout l'intérêt du modèle.
 *
 *  Atomique : le ticket est verrouillé et l'inscription créée dans la même
 *  transaction. Deux onglets qui cliquent ensemble ne peuvent pas dépenser deux
 *  fois le même ticket, ni prendre deux fois la dernière place. */
CREATE OR REPLACE FUNCTION enter_tournament_with_ticket(
  p_user_id       UUID,
  p_tournament_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_tournament tournaments%ROWTYPE;
  v_taken      INTEGER;
  v_ticket_id  UUID;
  v_debt       INTEGER;
BEGIN
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'tournament_missing');
  END IF;

  IF v_tournament.status <> 'open' THEN
    RETURN jsonb_build_object('error', 'tournament_closed');
  END IF;

  IF EXISTS (SELECT 1 FROM tournament_entries
             WHERE tournament_id = p_tournament_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('error', 'already_entered');
  END IF;

  SELECT count(*) INTO v_taken FROM tournament_entries WHERE tournament_id = p_tournament_id;
  IF v_taken >= v_tournament.capacity THEN
    RETURN jsonb_build_object('error', 'tournament_full');
  END IF;

  -- Tournoi gratuit : pas de ticket à dépenser.
  IF NOT tournament_requires_ticket(v_tournament.kind) THEN
    INSERT INTO tournament_entries (tournament_id, user_id) VALUES (p_tournament_id, p_user_id);
    RETURN jsonb_build_object('entered', true, 'ticket_spent', false);
  END IF;

  -- Une dette de tickets bloque l'entrée : sinon un joueur remboursé
  -- continuerait de jouer sur des tickets qu'il ne possède plus.
  SELECT COALESCE(ticket_debt, 0) INTO v_debt FROM wallets WHERE user_id = p_user_id;
  IF COALESCE(v_debt, 0) > 0 THEN
    RETURN jsonb_build_object('error', 'ticket_debt', 'debt', v_debt);
  END IF;

  -- Le ticket qui périme LE PLUS TÔT. `FOR UPDATE SKIP LOCKED` : si une autre
  -- transaction tient déjà ce ticket, on prend le suivant plutôt que d'attendre.
  SELECT id INTO v_ticket_id FROM tournament_tickets
  WHERE user_id = p_user_id
    AND spent_at IS NULL AND revoked_at IS NULL AND expires_at > now()
  ORDER BY expires_at ASC, acquired_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_ticket_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_ticket');
  END IF;

  UPDATE tournament_tickets
    SET spent_at = now(), spent_on = p_tournament_id
    WHERE id = v_ticket_id;

  INSERT INTO tournament_entries (tournament_id, user_id) VALUES (p_tournament_id, p_user_id);

  RETURN jsonb_build_object('entered', true, 'ticket_spent', true, 'ticket_id', v_ticket_id);
END;
$$ LANGUAGE plpgsql;

/** Rend son ticket à un joueur retiré d'un tournoi NON COMMENCÉ (annulation du
 *  tournoi, désinscription).
 *
 *  ⚠️ La péremption N'EST PAS repoussée. Sinon, s'inscrire puis se désinscrire
 *  deviendrait un moyen de rafraîchir indéfiniment un ticket. */
CREATE OR REPLACE FUNCTION return_ticket_for_entry(
  p_user_id       UUID,
  p_tournament_id UUID
) RETURNS BOOLEAN AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM tournament_tickets
  WHERE user_id = p_user_id AND spent_on = p_tournament_id AND spent_at IS NOT NULL
    AND revoked_at IS NULL
  ORDER BY spent_at DESC LIMIT 1;

  IF v_id IS NULL THEN RETURN false; END IF;

  UPDATE tournament_tickets SET spent_at = NULL, spent_on = NULL WHERE id = v_id;
  RETURN true;
END;
$$ LANGUAGE plpgsql;

/** Reprise des tickets après remboursement Stripe, dans l'ordre arbitré :
 *
 *    1. les tickets ENCORE EN MAIN issus de ce paiement ;
 *    2. s'il en manque, les inscriptions aux tournois NON COMMENCÉS — la place
 *       n'a pas été consommée, elle repart au pot ;
 *    3. s'il en manque encore, une DETTE, qui bloque tout usage de ticket.
 *
 *  Les tickets périmés comptent comme repris : leur valeur est déjà éteinte,
 *  les facturer une seconde fois au joueur serait le punir deux fois. */
CREATE OR REPLACE FUNCTION revoke_tickets_for_payment(p_payment_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user       UUID;
  v_total      INTEGER;
  v_revoked    INTEGER := 0;
  v_unentered  INTEGER := 0;
  v_debt       INTEGER;
  r            RECORD;
BEGIN
  SELECT user_id INTO v_user FROM payments WHERE id = p_payment_id;
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('revoked', 0, 'entries_removed', 0, 'debt_added', 0);
  END IF;

  SELECT count(*) INTO v_total FROM tournament_tickets WHERE payment_id = p_payment_id;
  IF v_total = 0 THEN
    RETURN jsonb_build_object('revoked', 0, 'entries_removed', 0, 'debt_added', 0);
  END IF;

  -- 1. En main (y compris périmés : leur valeur est déjà éteinte).
  FOR r IN
    SELECT id FROM tournament_tickets
    WHERE payment_id = p_payment_id AND spent_at IS NULL AND revoked_at IS NULL
    FOR UPDATE
  LOOP
    UPDATE tournament_tickets SET revoked_at = now() WHERE id = r.id;
    v_revoked := v_revoked + 1;
  END LOOP;

  -- 2. Inscriptions à des tournois non commencés : on libère la place et on
  --    révoque le ticket qui l'avait payée.
  FOR r IN
    SELECT tk.id AS ticket_id, tk.spent_on
    FROM tournament_tickets tk
    JOIN tournaments t ON t.id = tk.spent_on
    WHERE tk.payment_id = p_payment_id
      AND tk.spent_at IS NOT NULL AND tk.revoked_at IS NULL
      AND t.status IN ('draft', 'open', 'cancelled')
    FOR UPDATE OF tk
  LOOP
    DELETE FROM tournament_entries
      WHERE tournament_id = r.spent_on AND user_id = v_user;
    UPDATE tournament_tickets
      SET spent_at = NULL, spent_on = NULL, revoked_at = now()
      WHERE id = r.ticket_id;
    v_unentered := v_unentered + 1;
    v_revoked := v_revoked + 1;
  END LOOP;

  -- 3. Le reste a été RÉELLEMENT joué : dette.
  v_debt := v_total - v_revoked;
  IF v_debt > 0 THEN
    INSERT INTO wallets (user_id, balance, ticket_debt)
    VALUES (v_user, 0, v_debt)
    ON CONFLICT (user_id) DO UPDATE SET ticket_debt = wallets.ticket_debt + v_debt;
  END IF;

  RETURN jsonb_build_object('revoked', v_revoked, 'entries_removed', v_unentered, 'debt_added', GREATEST(v_debt, 0));
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- BRANCHEMENT SUR LE WEBHOOK
-- ============================================================================

-- Nouveau type de paiement. `tournament_entry` reste dans l'énumération pour
-- les lignes historiques, mais plus aucun code ne l'émet : l'inscription ne
-- passe plus par Stripe.
DO $$ BEGIN
  ALTER TYPE payment_type ADD VALUE IF NOT EXISTS 'ticket_pack';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Nombre de tickets d'un paiement de type `ticket_pack`. Figé à la création de
-- la session Checkout depuis la configuration serveur, comme `gold_amount`.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS ticket_amount INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE payments ADD CONSTRAINT payments_ticket_amount_positive CHECK (ticket_amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE tournament_tickets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users read own tickets" ON tournament_tickets
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Webhook : achat de tickets ─────────────────────────────────────────────
-- `apply_checkout_completed` et `apply_charge_refunded` sont REDÉFINIES ici,
-- en reprenant intégralement le corps de la migration précédente et en y
-- ajoutant la branche `ticket_pack`. Volontairement redéfinies plutôt que
-- complétées ailleurs : une fonction d'argent doit se lire d'un bloc, et deux
-- moitiés dans deux fichiers finissent par diverger.

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
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  IF v_payment.type = 'gold_pack' THEN
    v_credit := credit_gold_absorbing_debt(
      v_payment.user_id, v_payment.gold_amount, 'purchase',
      'Achat de pièces d''or',
      jsonb_build_object('payment_id', v_payment.id, 'pack', v_payment.reference)
    );
    RETURN jsonb_build_object('status', 'credited', 'payment_id', v_payment.id, 'gold', v_credit);
  END IF;

  -- Achat de TICKETS : aucun tournoi visé, aucune place à réserver. C'est ce
  -- découplage qui fait disparaître le cas « rempli pendant le paiement ».
  IF v_payment.type = 'ticket_pack' THEN
    v_credit := grant_tournament_tickets(v_payment.user_id, v_payment.ticket_amount, v_payment.id);
    RETURN jsonb_build_object('status', 'credited', 'payment_id', v_payment.id, 'tickets', v_credit);
  END IF;

  -- Chemin HISTORIQUE : plus aucun code n'ouvre de session `tournament_entry`.
  -- Conservé pour qu'un webhook en retard, portant une session ouverte avant
  -- la bascule, trouve encore son traitement plutôt que de partir en erreur.
  IF v_payment.type = 'tournament_entry' THEN
    SELECT * INTO v_tournament FROM tournaments WHERE id = v_payment.reference::uuid FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'refund_needed', 'payment_id', v_payment.id,
                                'reason', 'tournament_missing');
    END IF;
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
    END IF;
    UPDATE payments SET gold_clawed_back = v_debited WHERE id = v_payment.id;

    RETURN jsonb_build_object('status', 'refunded', 'payment_id', v_payment.id,
                              'gold_debited', v_debited, 'gold_debt_added', v_debt);
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
