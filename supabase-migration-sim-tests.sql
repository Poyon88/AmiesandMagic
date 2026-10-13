-- ============================================================================
-- Simulateur sur decks existants (2026-10-13)
-- ============================================================================
--
-- `sim_tests` : UNE ligne par test (ciblé : un deck contre des adversaires ;
-- lot : tous contre tous). On n'y stocke pas les parties une à une : decks
-- figés, résultats agrégés, et pour chaque partie sa graine et son issue
-- (`games`, compact) — une partie se RECALCULE à l'identique depuis sa graine
-- et les decks figés tant que le catalogue n'a pas changé (`catalogue_hash`).
-- Purge applicative : les 300 derniers tests ciblés sont conservés.
--
-- `sim_deck_snapshots.sim_test_id` : un lot sur decks existants y écrit ses
-- parties en référençant le deck figé (`deck_id`) au lieu de recopier ses
-- cartes (`cards` = []), que le module d'Équilibrage recompose depuis
-- `sim_tests.decks`.
--
-- Accès service_role seulement (routes /api/admin/sim/*) : RLS sans policy.

CREATE TABLE IF NOT EXISTS public.sim_tests (
  id             BIGSERIAL PRIMARY KEY,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID,
  kind           TEXT NOT NULL CHECK (kind IN ('cible', 'lot')),
  label          TEXT,
  policy         TEXT NOT NULL,
  catalogue_hash TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'en_cours' CHECK (status IN ('en_cours', 'fini', 'interrompu')),
  config         JSONB NOT NULL DEFAULT '{}'::jsonb,
  decks          JSONB NOT NULL DEFAULT '[]'::jsonb,
  results        JSONB,
  games          JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS sim_tests_kind_created_idx ON public.sim_tests (kind, created_at DESC);
ALTER TABLE public.sim_tests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sim_deck_snapshots ADD COLUMN IF NOT EXISTS sim_test_id BIGINT;
CREATE INDEX IF NOT EXISTS sim_deck_snapshots_test_idx ON public.sim_deck_snapshots (sim_test_id);
