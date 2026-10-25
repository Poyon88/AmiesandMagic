-- ============================================================================
-- Armies & Magic — ADVISORS SUPABASE, 2e LOT (2026-10-25)
-- ============================================================================
--
-- Aucun changement de comportement : ce lot ne fait que figer et optimiser.
--
-- 1. search_path figé (public, pg_temp) sur les 24 fonctions signalées
--    « Function Search Path Mutable » — dont toutes celles qui touchent à l'or
--    (adjust_wallet_balance, purchase_faction*, apply_checkout_*, tickets…).
--    Vérifié avant écriture : aucune n'appelle d'objet hors public/pg_catalog
--    sans le qualifier (auth.uid() est qualifié, pas d'extension utilisée).
--
-- 2. RLS « Auth RLS Initialization Plan » : auth.uid() / auth.role() réécrits
--    en (select auth.uid()) / (select auth.role()) dans les 21 policies
--    concernées, pour un seul calcul par requête au lieu d'un par ligne
--    (match_state, match_actions, deck_cards, user_collections, wallets…).
--    Réécriture faite depuis la définition en place (pg_policies) pour ne pas
--    recopier les expressions à la main ; le bloc échoue si le nombre de
--    policies trouvées n'est pas celui attendu.
--
-- Tout se joue dans une seule transaction : en cas d'erreur, rien n'est appliqué.
-- ============================================================================

BEGIN;

ALTER FUNCTION public.adjust_wallet_balance(uuid, integer, text, text, jsonb, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.apply_charge_refunded(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.apply_checkout_completed(text, text, integer, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.apply_checkout_expired(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.available_tickets(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.credit_gold_absorbing_debt(uuid, integer, text, text, jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.enter_tournament_with_ticket(uuid, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.gold_spendable(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.grant_default_heroes_on_profile() SET search_path = public, pg_temp;
ALTER FUNCTION public.grant_tournament_tickets(uuid, integer, uuid, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.place_bid(uuid, uuid, integer, boolean) SET search_path = public, pg_temp;
ALTER FUNCTION public.purchase_faction_bundle(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.purchase_faction(uuid, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.return_ticket_for_entry(uuid, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.revoke_faction_unlocks_for_debt(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.revoke_tickets_for_payment(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.set_card_briefs_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_cards_status_changed_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_cards_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_style_guides_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_starter_faction_unlock() SET search_path = public, pg_temp;
ALTER FUNCTION public.tg_capture_match_result() SET search_path = public, pg_temp;
ALTER FUNCTION public.tournament_requires_ticket(tournament_kind) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_wallet_timestamp() SET search_path = public, pg_temp;

DO $$
DECLARE
  r record;
  v_q text;
  v_w text;
  v_n int := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(?<!SELECT )auth\.(uid|role)\(\)'
  LOOP
    v_q := regexp_replace(r.qual, '(?<!SELECT )auth\.(uid|role)\(\)', '(select auth.\1())', 'g');
    v_w := regexp_replace(r.with_check, '(?<!SELECT )auth\.(uid|role)\(\)', '(select auth.\1())', 'g');
    EXECUTE format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename)
      || coalesce(' USING (' || v_q || ')', '')
      || coalesce(' WITH CHECK (' || v_w || ')', '');
    v_n := v_n + 1;
  END LOOP;

  -- Rejoué après coup, le bloc ne trouve plus rien : c'est attendu.
  IF v_n NOT IN (0, 21) THEN
    RAISE EXCEPTION 'RLS initplan : % policies trouvées, 21 attendues — rien appliqué', v_n;
  END IF;
  RAISE NOTICE 'RLS initplan : % policies réécrites', v_n;
END $$;

COMMIT;
