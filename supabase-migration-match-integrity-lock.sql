-- ============================================================================
-- Armies & Magic — INTÉGRITÉ DES PARTIES, partie B : VERROUILLAGE
-- ============================================================================
--
-- À appliquer APRÈS le déploiement du code qui clôt les parties par la route
-- serveur /api/matches/[id]/finalize (et APRÈS la partie A,
-- supabase-migration-match-integrity.sql). Appliquée plus tôt, elle empêcherait
-- les clients encore sur l'ancien code de terminer leurs parties.
--
-- Idempotente.
-- ============================================================================

-- Le client n'écrit plus le résultat ---------------------------------------
-- Plus aucune mise à jour de `matches` côté client : statut, vainqueur et
-- provenance passent par la route finalize (service role).
DROP POLICY IF EXISTS "Users can update own matches" ON matches;
-- Les parties naissent de `find_match_or_enqueue` (SECURITY DEFINER) : la
-- création directe par un client ne servait plus qu'à fabriquer une partie
-- contre l'adversaire de son choix.
DROP POLICY IF EXISTS "Users can create matches" ON matches;


-- Rollback (si besoin) :
--   CREATE POLICY "Users can update own matches" ON matches FOR UPDATE
--     USING ((SELECT auth.uid()) = player1_id OR (SELECT auth.uid()) = player2_id);
--   CREATE POLICY "Users can create matches" ON matches FOR INSERT
--     WITH CHECK ((SELECT auth.uid()) = player1_id);
