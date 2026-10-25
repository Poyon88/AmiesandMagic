-- ============================================================================
-- Armies & Magic — DURCISSEMENT SUITE AUX ADVISORS SUPABASE (2026-10-25)
-- ============================================================================
--
-- 1. game_boards : la policy « Authenticated users can manage boards » (FOR ALL,
--    auth.role() = 'authenticated') laissait n'importe quel joueur connecté
--    créer / modifier / supprimer les plateaux en direct via PostgREST. Les
--    écritures légitimes passent toutes par /api/boards (requireAdmin + clé
--    service, qui contourne le RLS) : la policy est supprimée.
--
-- 2. heroes : policy de lecture en doublon (la publique `true` l'englobe).
--
-- 3. settle_auction : SECURITY DEFINER exécutable par anon/authenticated et
--    sans garde d'échéance ⇒ n'importe qui pouvait clore une enchère active
--    avant `ends_at`. On ajoute la garde `ends_at <= now()` (le rachat
--    immédiat de place_bid pose `ends_at = now()` avant d'appeler, il reste
--    compatible) et on fige le search_path.
--
-- 4. EXECUTE retiré à anon/authenticated sur les SECURITY DEFINER que seul le
--    serveur (clé service) appelle : settle_auction, check_ai_quota,
--    capture_match_result_for, user_is_admin_or_tester.
--    ⚠️ NE PAS révoquer is_admin_or_tester() : la policy « Anyone can view
--    cards » s'en sert. find_match_or_enqueue / heartbeat_matchmaking restent
--    appelables (client direct, garde p_user_id = auth.uid() en place).
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can manage boards" ON public.game_boards;
DROP POLICY IF EXISTS "heroes readable by authenticated" ON public.heroes;

-- Garde d'échéance : patch de la définition en place plutôt qu'une recopie
-- intégrale du corps (évite de diverger de la version de prod).
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.settle_auction(uuid)'::regprocedure);
  v_new text;
BEGIN
  IF v_def LIKE '%AND ends_at <= now()%' THEN
    RETURN;
  END IF;
  v_new := replace(
    v_def,
    E'WHERE id = p_auction_id AND status = ''active''\n    FOR UPDATE',
    E'WHERE id = p_auction_id AND status = ''active'' AND ends_at <= now()\n    FOR UPDATE'
  );
  IF v_new = v_def THEN
    RAISE EXCEPTION 'settle_auction : clause WHERE introuvable, patch non appliqué';
  END IF;
  EXECUTE v_new;
END $$;

ALTER FUNCTION public.settle_auction(uuid) SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION
  public.settle_auction(uuid),
  public.check_ai_quota(uuid, text, integer, interval),
  public.capture_match_result_for(uuid),
  public.user_is_admin_or_tester(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.settle_auction(uuid),
  public.check_ai_quota(uuid, text, integer, interval),
  public.capture_match_result_for(uuid),
  public.user_is_admin_or_tester(uuid)
TO service_role;
