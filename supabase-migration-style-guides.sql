-- ============================================================================
-- Chartes graphiques par clan (style_guides)
-- ============================================================================
--
-- Une charte décrit l'UNIVERS visuel commun d'un clan — palette, lumière,
-- rendu, décors, matériaux, motifs, interdits — et sert à fabriquer les prompts
-- d'illustration (cartes, jetons, plateaux, héros). La RACE reste le sujet :
-- sa description visuelle est imposée ailleurs (generate-text), la charte vaut
-- pour toutes les races du clan.
--
-- Un clan peut avoir plusieurs chartes, dont UNE par défaut (index unique
-- partiel) : c'est elle que prennent la génération aléatoire et le lot.
--
-- Le clan est désigné par son NOM, comme `cards.clan` (les clans n'existent
-- qu'en code, FACTIONS[].clans). ⚠ Un renommage de clan doit aussi mettre à jour
-- `style_guides.clan` (cf. supabase-migration-clans-rename-*.sql).
--
-- Lecture et écriture passent par /api/style-guides (service_role, admin) :
-- RLS activée SANS policy, comme `balance_overrides`.

CREATE TABLE IF NOT EXISTS public.style_guides (
  id           BIGSERIAL PRIMARY KEY,
  clan         TEXT NOT NULL,
  name         TEXT NOT NULL,
  is_default   BOOLEAN NOT NULL DEFAULT false,
  palette      TEXT,
  lighting     TEXT,
  art_style    TEXT,
  environments TEXT,
  materials    TEXT,
  motifs       TEXT,
  avoid        TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS style_guides_clan_idx ON public.style_guides (clan);
CREATE UNIQUE INDEX IF NOT EXISTS style_guides_un_defaut_par_clan
  ON public.style_guides (clan) WHERE is_default;

CREATE OR REPLACE FUNCTION public.set_style_guides_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS style_guides_set_updated_at ON public.style_guides;
CREATE TRIGGER style_guides_set_updated_at
  BEFORE UPDATE ON public.style_guides
  FOR EACH ROW EXECUTE FUNCTION public.set_style_guides_updated_at();

ALTER TABLE public.style_guides ENABLE ROW LEVEL SECURITY;

-- Charte utilisée pour générer le prompt d'une carte (traçabilité).
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS style_guide_id BIGINT NULL
    REFERENCES public.style_guides(id) ON DELETE SET NULL;
