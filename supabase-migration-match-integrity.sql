-- ============================================================================
-- Armies & Magic — INTÉGRITÉ DES PARTIES (lot 0 des tournois)
-- ============================================================================
--
-- Avant : le NAVIGATEUR écrivait le vainqueur dans `matches`, chaque
-- participant pouvait modifier toute la ligne de partie, et écrire n'importe
-- quelle action au journal — y compris un abandon au nom de l'adversaire.
-- Les mulligans n'étaient journalisés nulle part.
--
-- Après :
--   * chaque action porte son AUTEUR (auth.uid(), imposé par la RLS) ;
--   * les mulligans sont journalisés (match_mulligans) ;
--   * la configuration de la partie est FIGÉE au lancement (match_setups,
--     écrite par le serveur) ;
--   * le résultat n'est écrit QUE par le serveur (route finalize, service
--     role), après rejeu, avec sa provenance (result_source).
--
-- EN DEUX TEMPS :
--   * CE fichier (partie A) est purement ADDITIF et compatible avec l'ancien
--     code client (l'auteur des actions est rempli par défaut) : applicable à
--     tout moment ;
--   * supabase-migration-match-integrity-lock.sql (partie B) retire aux
--     clients le droit d'écrire le résultat : à appliquer APRÈS le déploiement
--     du code qui passe par la route finalize.
--
-- Idempotente.
-- ============================================================================

-- 1. Auteur des actions -------------------------------------------------------
ALTER TABLE match_actions ADD COLUMN IF NOT EXISTS author_id UUID DEFAULT auth.uid();

DROP POLICY IF EXISTS "Match participants can insert actions" ON match_actions;
CREATE POLICY "Match participants can insert actions" ON match_actions
  FOR INSERT WITH CHECK (
    author_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM matches m
       WHERE m.id = match_actions.match_id
         AND (m.player1_id = (SELECT auth.uid()) OR m.player2_id = (SELECT auth.uid()))
    )
  );

-- 2. Mulligans ----------------------------------------------------------------
-- Hors de la voie `seq` (les deux joueurs les émettent en même temps) : une
-- ligne par joueur, idempotente.
CREATE TABLE IF NOT EXISTS match_mulligans (
  match_id   UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL DEFAULT auth.uid(),
  action     JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, player_id)
);
ALTER TABLE match_mulligans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Match players insert own mulligan" ON match_mulligans;
CREATE POLICY "Match players insert own mulligan" ON match_mulligans
  FOR INSERT WITH CHECK (
    player_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM matches m
       WHERE m.id = match_mulligans.match_id
         AND (m.player1_id = (SELECT auth.uid()) OR m.player2_id = (SELECT auth.uid()))
    )
  );
DROP POLICY IF EXISTS "Match players read mulligans" ON match_mulligans;
CREATE POLICY "Match players read mulligans" ON match_mulligans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM matches m
       WHERE m.id = match_mulligans.match_id
         AND (m.player1_id = (SELECT auth.uid()) OR m.player2_id = (SELECT auth.uid()))
    )
  );

-- 3. Configuration figée ------------------------------------------------------
-- Écrite et lue par le serveur uniquement : aucune politique = aucun accès client.
CREATE TABLE IF NOT EXISTS match_setups (
  match_id    UUID PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
  setup       JSONB NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE match_setups ENABLE ROW LEVEL SECURITY;

-- 4. Provenance du résultat ----------------------------------------------------
ALTER TABLE matches ADD COLUMN IF NOT EXISTS result_source TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS result_notes JSONB;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_result_source_check') THEN
    ALTER TABLE matches ADD CONSTRAINT matches_result_source_check
      CHECK (result_source IS NULL OR result_source IN ('server', 'review', 'client'));
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON match_mulligans, match_setups TO service_role;
    GRANT SELECT, INSERT ON match_mulligans TO authenticated;
  END IF;
END $$;
