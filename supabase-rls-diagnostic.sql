-- ============================================================
-- Armies & Magic — DIAGNOSTIC RLS (LECTURE SEULE)
-- ============================================================
-- À exécuter dans le SQL Editor du dashboard Supabase (projet
-- hndskftqdudknsvdunjc). N'écrit RIEN. Objectif : connaître l'état
-- RÉEL des tables (RLS activée ? quelles policies ?) AVANT d'appliquer
-- la migration de durcissement supabase-migration-rls-hardening.sql.
--
-- Remplace `get_advisors(security)` (inaccessible via le connecteur MCP
-- actuel, rattaché à une autre organisation).
-- ============================================================

-- 1) RLS activée ou non, pour toutes les tables du schéma public.
--    Une ligne `rls_enabled = false` sur une table sensible = trou :
--    lisible/écrivable en direct via l'anon key (publique) en
--    contournant les routes API.
SELECT
  c.relname                              AS table_name,
  c.relrowsecurity                       AS rls_enabled,
  c.relforcerowsecurity                  AS rls_forced,
  COALESCE(p.nb_policies, 0)             AS nb_policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN (
  SELECT schemaname, tablename, COUNT(*) AS nb_policies
  FROM pg_policies
  WHERE schemaname = 'public'
  GROUP BY schemaname, tablename
) p ON p.tablename = c.relname AND p.schemaname = n.nspname
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relrowsecurity ASC, c.relname;   -- les tables SANS RLS remontent en premier

-- 2) Détail de toutes les policies existantes (nom, commande, USING, WITH CHECK).
SELECT
  tablename,
  policyname,
  cmd,
  roles,
  qual        AS using_expr,
  with_check  AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;

-- 3) Focus sur les tables sensibles ciblées par l'audit : présence de RLS ?
SELECT unnest(ARRAY[
  'user_collections','card_prints','profiles',      -- Tier A (server-only / self)
  'decks','deck_cards','matches','matchmaking_queue',-- Tier B (accès navigateur)
  'cards','game_boards','card_backs','sets',         -- Tier B (contenu lu côté client)
  'token_templates','board_prints','card_back_prints',
  'user_board_prints','user_card_back_prints',
  'keyword_icon_assets','sfx_tracks'
]) AS table_name
EXCEPT
SELECT c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity = true;
-- ^ Cette requête liste les tables sensibles qui n'ont PAS la RLS activée.
--   Idéalement, le résultat doit être VIDE après la migration.
