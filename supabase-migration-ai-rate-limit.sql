-- ============================================================
-- Armies & Magic — Rate-limit des générations IA payantes (audit ③)
-- ============================================================
-- Les routes /api/figurines/generate et /api/heroes/generate-* / compose-*
-- déclenchent des appels externes FACTURÉS (Meshy image-to-3D, Imagen/Gemini,
-- Anthropic) après un simple contrôle de session. Sans quota, un compte peut
-- scripter des milliers d'appels → abus de facturation.
--
-- Ce module ajoute un compteur d'événements + une fonction atomique de quota.
-- À exécuter dans le SQL Editor. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_generation_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Requête de quota = count par (user, kind) sur une fenêtre glissante.
CREATE INDEX IF NOT EXISTS idx_ai_gen_user_kind_time
  ON public.ai_generation_events (user_id, kind, created_at DESC);

-- RLS : activée, AUCUNE policy → deny total pour anon/authenticated. La table
-- n'est touchée que par les routes service_role (via la fonction ci-dessous).
ALTER TABLE public.ai_generation_events ENABLE ROW LEVEL SECURITY;

-- Fonction atomique : compte les générations de (user, kind) sur `p_window`.
-- Si le quota n'est pas atteint → enregistre l'événement et renvoie true
-- (autorisé). Sinon renvoie false (refusé) sans rien insérer.
CREATE OR REPLACE FUNCTION public.check_ai_quota(
  p_user_id uuid,
  p_kind    text,
  p_limit   integer,
  p_window  interval
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.ai_generation_events
  WHERE user_id = p_user_id
    AND kind = p_kind
    AND created_at > now() - p_window;

  IF v_count >= p_limit THEN
    RETURN false;
  END IF;

  INSERT INTO public.ai_generation_events (user_id, kind)
  VALUES (p_user_id, p_kind);

  RETURN true;
END;
$$;

-- Purge optionnelle (à planifier via pg_cron si souhaité) : les événements de
-- plus de 30 jours ne servent plus au calcul de quota.
--   DELETE FROM public.ai_generation_events WHERE created_at < now() - interval '30 days';
