-- ============================================================================
-- Briefs de la Création assistée (forge)
-- ============================================================================
--
-- Un brief = ce que l'auteur a décrit dans le chat de la forge (périmètre du
-- lot, capacités privilégiées, déclencheurs, coûts additionnels, genre,
-- précisions), sous forme structurée (`brief`, cf. src/lib/card-engine/brief.ts)
-- + la conversation qui l'a produit (`chat`). Réutilisable : on relance un
-- brief sans refaire le chat.
--
-- `card_brief_items` trace les cartes créées par chaque lancement (une ligne
-- par carte planifiée : créée, en erreur, ou restante après un arrêt).
--
-- Accès par /api/forge/briefs (service_role, admin) : RLS activée SANS policy.

CREATE TABLE IF NOT EXISTS public.card_briefs (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '',
  brief       JSONB NOT NULL,
  chat        JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.card_brief_items (
  id          BIGSERIAL PRIMARY KEY,
  brief_id    BIGINT NOT NULL REFERENCES public.card_briefs(id) ON DELETE CASCADE,
  run_id      TEXT NOT NULL,
  position    INT NOT NULL,
  card_id     BIGINT NULL REFERENCES public.cards(id) ON DELETE SET NULL,
  status      TEXT NOT NULL CHECK (status IN ('created', 'error', 'pending')),
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS card_brief_items_brief_idx ON public.card_brief_items (brief_id, run_id);

CREATE OR REPLACE FUNCTION public.set_card_briefs_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS card_briefs_set_updated_at ON public.card_briefs;
CREATE TRIGGER card_briefs_set_updated_at
  BEFORE UPDATE ON public.card_briefs
  FOR EACH ROW EXECUTE FUNCTION public.set_card_briefs_updated_at();

ALTER TABLE public.card_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_brief_items ENABLE ROW LEVEL SECURITY;
