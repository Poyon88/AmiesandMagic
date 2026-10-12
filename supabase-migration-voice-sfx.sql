-- ============================================================================
-- Bibliothèque des voix d'entrée en jeu (voice_sfx)
-- ============================================================================
--
-- Réserve de répliques vocales rangées par RACE (id de race, ex. « Nains ») et
-- GENRE (M, F, N). Simple stockage : rien en jeu ne lit cette table, le son
-- d'une carte reste `cards.sfx_play_url` (qui peut pointer vers un fichier de
-- la bibliothèque).
--
-- Nom = « <race au singulier>_<fichier sans extension>_<genre> » (unique),
-- calculé par src/lib/audio/voice-sfx.ts. Les fichiers vivent dans le bucket
-- `sfx-tracks` sous voices/… ; les répliques déjà présentes y sont référencées
-- SANS être déplacées (des cartes les utilisent).
--
-- Accès par /api/voice-sfx (service_role, admin) : RLS activée SANS policy.

CREATE TABLE IF NOT EXISTS public.voice_sfx (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  race            TEXT NOT NULL,
  gender          CHAR(1) NOT NULL CHECK (gender IN ('M', 'F', 'N')),
  source_filename TEXT,
  file_path       TEXT NOT NULL UNIQUE,
  file_url        TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_sfx_race_gender_idx ON public.voice_sfx (race, gender);

ALTER TABLE public.voice_sfx ENABLE ROW LEVEL SECURITY;
