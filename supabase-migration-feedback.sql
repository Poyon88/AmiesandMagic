-- ============================================================
-- Armies of Legends — Retours des joueurs (bugs, idées, questions)
-- ============================================================
-- Un joueur connecté ouvre un FIL (feedback_threads) : son message, ses
-- captures, puis les réponses de l'agent ou d'un admin. L'agent de tri
-- rattache bugs et idées à un SUJET (feedback_topics) : la synthèse que
-- l'admin accepte, refuse ou reporte, et que la commande /retours code.
--
-- Convention du projet : RLS activée, AUCUNE policy. Rien n'est lisible par
-- anon / authenticated ; tout passe par les routes service_role.
-- Les captures vont dans un bucket PRIVÉ, lues par URL signée seulement.
--
-- À exécuter dans le SQL Editor. Idempotent.
-- ============================================================

-- 1. Sujets (synthèse pour la revue) -------------------------------------------
CREATE TABLE IF NOT EXISTS public.feedback_topics (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL CHECK (kind IN ('bug', 'improvement')),
  title         text NOT NULL,
  summary       text NOT NULL DEFAULT '',
  repro         text NOT NULL DEFAULT '',
  severity      text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  area          text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'proposed'
                CHECK (status IN ('proposed', 'accepted', 'rejected', 'deferred', 'fixed', 'shipped')),
  decision_note text NOT NULL DEFAULT '',
  commit_sha    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_feedback_topics_status ON public.feedback_topics (status, updated_at DESC);

-- 2. Fils -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feedback_threads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Ce que le joueur a coché, puis ce que l'agent a réellement reconnu.
  kind_declared   text NOT NULL CHECK (kind_declared IN ('bug', 'idea', 'question')),
  kind            text NOT NULL CHECK (kind IN ('bug', 'idea', 'question', 'other')),
  status          text NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'triaged', 'awaiting_admin', 'awaiting_player', 'answered', 'closed')),
  locale          text NOT NULL DEFAULT 'fr',
  title_fr        text NOT NULL DEFAULT '',
  summary_fr      text NOT NULL DEFAULT '',
  severity        text CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  area            text NOT NULL DEFAULT '',
  category        text NOT NULL DEFAULT '',
  context         jsonb NOT NULL DEFAULT '{}'::jsonb,
  topic_id        uuid REFERENCES public.feedback_topics(id) ON DELETE SET NULL,
  -- Vrai tant que le dernier message du joueur n'a pas été trié : c'est ce que
  -- relit le cron de rattrapage quand le tri immédiat a échoué.
  needs_triage    boolean NOT NULL DEFAULT true,
  triage_attempts integer NOT NULL DEFAULT 0,
  triage_error    text,
  player_unread   boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_threads_user ON public.feedback_threads (user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_threads_status ON public.feedback_threads (status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_threads_topic ON public.feedback_threads (topic_id);
CREATE INDEX IF NOT EXISTS idx_feedback_threads_triage ON public.feedback_threads (needs_triage) WHERE needs_triage;

-- 3. Messages -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feedback_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  uuid NOT NULL REFERENCES public.feedback_threads(id) ON DELETE CASCADE,
  author     text NOT NULL CHECK (author IN ('player', 'agent', 'admin')),
  author_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body       text NOT NULL,
  -- 'draft' : réponse de l'agent en attente de validation, invisible du joueur.
  state      text NOT NULL DEFAULT 'sent' CHECK (state IN ('sent', 'draft')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_messages_thread ON public.feedback_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_messages_draft ON public.feedback_messages (state) WHERE state = 'draft';

-- 4. Pièces jointes -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feedback_attachments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  uuid NOT NULL REFERENCES public.feedback_threads(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.feedback_messages(id) ON DELETE CASCADE,
  path       text NOT NULL UNIQUE,
  mime       text NOT NULL,
  size       integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_attachments_thread ON public.feedback_attachments (thread_id);

-- 5. Droits ---------------------------------------------------------------------
ALTER TABLE public.feedback_topics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_threads     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_attachments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.feedback_topics, public.feedback_threads,
              public.feedback_messages, public.feedback_attachments
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.feedback_topics, public.feedback_threads,
             public.feedback_messages, public.feedback_attachments
  TO service_role;

-- 6. Bucket privé des captures --------------------------------------------------
-- Aucune policy sur storage.objects pour ce bucket : ni lecture ni écriture
-- directe. L'envoi passe par une URL signée délivrée par /api/feedback/upload-url,
-- la lecture par une URL signée de courte durée.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('feedback-attachments', 'feedback-attachments', false, 5242880,
        ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 7. Notifications --------------------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'auction_outbid', 'auction_won', 'auction_sold', 'auction_ended_unsold',
  'auction_cancelled', 'credits_expiring',
  'feedback_reply', 'feedback_shipped'));
