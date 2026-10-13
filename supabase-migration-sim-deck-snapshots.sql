-- ============================================================================
-- Parties SIMULÉES pour le module d'Équilibrage (2026-10-13)
-- ============================================================================
--
-- Même forme que `match_deck_snapshots` (2 lignes par partie), dans une table
-- SÉPARÉE : des lignes simulées mêlées aux vraies fausseraient définitivement
-- les taux des joueurs humains. Le module lit l'une OU l'autre (`source`).
--
-- `match_id` / `player_id` sont des uuid générés (aucune ligne `matches`).
-- `went_first` remplace la dérivation par l'id de partie utilisée pour le réel.
-- `run_id` regroupe un lancement : un lot douteux s'efface d'un DELETE.
-- Écrit par scripts/sim/run-batch.ts (service_role) ; RLS sans policy.

CREATE TABLE IF NOT EXISTS public.sim_deck_snapshots (
  id              BIGSERIAL PRIMARY KEY,
  run_id          TEXT NOT NULL,
  match_id        UUID NOT NULL,
  player_id       UUID NOT NULL,
  deck_id         BIGINT,
  hero_id         BIGINT,
  is_winner       BOOLEAN NOT NULL,
  went_first      BOOLEAN NOT NULL,
  cards           JSONB NOT NULL DEFAULT '[]'::jsonb,
  primary_faction TEXT,
  clan            TEXT,
  policy          TEXT NOT NULL,
  turns           INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sim_deck_snapshots_run_idx ON public.sim_deck_snapshots (run_id);
CREATE INDEX IF NOT EXISTS sim_deck_snapshots_match_idx ON public.sim_deck_snapshots (match_id);
CREATE INDEX IF NOT EXISTS sim_deck_snapshots_created_idx ON public.sim_deck_snapshots (created_at DESC);

ALTER TABLE public.sim_deck_snapshots ENABLE ROW LEVEL SECURITY;
