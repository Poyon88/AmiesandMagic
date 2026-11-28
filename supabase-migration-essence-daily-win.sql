-- ============================================================================
-- Armies of Legends — ESSENCE : récompense de la première victoire du jour
-- ============================================================================
--
-- Un joueur qui remporte une partie reçoit de l'essence, UNE fois par jour
-- (jour UTC). Le montant est passé par le serveur (ESSENCE_DAILY_WIN dans
-- src/lib/economy/constants.ts) ; cette migration ne porte que la règle.
--
-- Trois gardes, toutes ici plutôt que dans la route :
--   * la partie doit être terminée, gagnée par ce joueur, et son résultat
--     établi par le REJEU SERVEUR (`result_source = 'server'`). Un vainqueur
--     seulement déclaré par un navigateur (« client », « review ») ne rapporte
--     rien : l'essence donne des cartes limitées, on ne la crée pas sur parole ;
--   * une fois par joueur et par jour : index unique partiel sur le journal —
--     deux clôtures simultanées (les deux joueurs appellent la route) ne
--     peuvent pas créditer deux fois ;
--   * crédit et ligne de journal dans la même transaction (adjust_essence).
--
-- Idempotente : rejouable sans effet de bord. Dépend de
-- supabase-migration-essence.sql et supabase-migration-match-integrity.sql.
-- ============================================================================

-- 1. Nouveau type de mouvement ---------------------------------------------
ALTER TABLE essence_transactions DROP CONSTRAINT IF EXISTS essence_transactions_type_check;
ALTER TABLE essence_transactions ADD CONSTRAINT essence_transactions_type_check
  CHECK (type IN ('admin_credit', 'admin_debit', 'craft', 'reward_tournament', 'reward_daily_win'));

-- 2. Une récompense par joueur et par jour UTC -----------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_essence_daily_win
  ON essence_transactions (user_id, ((created_at AT TIME ZONE 'UTC')::date))
  WHERE type = 'reward_daily_win';

-- 3. Attribution -----------------------------------------------------------
/** Crédite la première victoire du jour. Renvoie le nouveau solde, ou NULL si
 *  rien n'est dû (partie non concluante, ou récompense déjà reçue aujourd'hui). */
CREATE OR REPLACE FUNCTION grant_daily_win_essence(
  p_user_id  UUID,
  p_match_id UUID,
  p_amount   INTEGER
) RETURNS INTEGER AS $$
DECLARE
  v_new INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM matches
     WHERE id = p_match_id
       AND status = 'finished'
       AND winner_id = p_user_id
       AND result_source = 'server'
       AND player1_id <> player2_id
  ) THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_new := adjust_essence(
      p_user_id, p_amount, 'reward_daily_win',
      'Première victoire du jour',
      jsonb_build_object('match_id', p_match_id));
  EXCEPTION WHEN unique_violation THEN
    -- Déjà récompensé aujourd'hui : le bloc annule aussi le crédit du solde.
    RETURN NULL;
  END;

  RETURN v_new;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- 4. Droits : service_role uniquement --------------------------------------
REVOKE EXECUTE ON FUNCTION grant_daily_win_essence(UUID, UUID, INTEGER) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION grant_daily_win_essence(UUID, UUID, INTEGER) FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION grant_daily_win_essence(UUID, UUID, INTEGER) TO service_role;
  END IF;
END $$;
