-- Parties interrompues : nouveau statut `abandoned`, et solde de l'historique.
-- À appliquer AVANT le déploiement de la route /api/cron/close-stale-matches.
--
-- Parties sans configuration figée, inactives depuis plus d'1 heure :
--   * dernier état terminé avec un vainqueur joueur de la partie : `finished`,
--     source `client` (non rejouée). Le trigger alimente l'équilibrage.
--   * sinon : `abandoned`, sans vainqueur.
-- Une partie à configuration figée est laissée au cron, qui peut la rejouer.
--
-- Rejouable : ne porte que sur `status = 'active'`.

BEGIN;

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE matches ADD CONSTRAINT matches_status_check
  CHECK (status IN ('waiting', 'active', 'finished', 'abandoned'));

CREATE TEMP TABLE parties_a_solder ON COMMIT DROP AS
SELECT m.id, s.state->>'phase' AS phase,
       CASE WHEN s.state->>'winner' IN (m.player1_id::text, m.player2_id::text)
            THEN (s.state->>'winner')::uuid END AS gagnant,
       GREATEST(m.created_at, s.updated_at,
                (SELECT max(a.created_at) FROM match_actions a WHERE a.match_id = m.id)) AS dernier
FROM matches m
LEFT JOIN match_state s ON s.match_id = m.id
WHERE m.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM match_setups f WHERE f.match_id = m.id);

DELETE FROM parties_a_solder WHERE dernier > now() - interval '1 hour';

UPDATE matches m
   SET status = 'finished', winner_id = p.gagnant, finished_at = p.dernier,
       result_source = 'client', result_notes = '["solde historique"]'::jsonb
  FROM parties_a_solder p
 WHERE m.id = p.id AND p.phase = 'finished' AND p.gagnant IS NOT NULL;

UPDATE matches m
   SET status = 'abandoned', finished_at = p.dernier,
       result_notes = '["solde historique"]'::jsonb
  FROM parties_a_solder p
 WHERE m.id = p.id AND m.status = 'active';

COMMIT;
