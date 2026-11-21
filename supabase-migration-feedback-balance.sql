-- Retours joueurs : quatrième type « équilibrage » (carte jugée trop forte ou
-- trop faible), et type de sujet correspondant. Purement additif : on élargit
-- trois contraintes CHECK, aucune ligne existante n'est touchée.

ALTER TABLE public.feedback_threads DROP CONSTRAINT IF EXISTS feedback_threads_kind_declared_check;
ALTER TABLE public.feedback_threads ADD CONSTRAINT feedback_threads_kind_declared_check
  CHECK (kind_declared IN ('bug', 'idea', 'question', 'balance'));

ALTER TABLE public.feedback_threads DROP CONSTRAINT IF EXISTS feedback_threads_kind_check;
ALTER TABLE public.feedback_threads ADD CONSTRAINT feedback_threads_kind_check
  CHECK (kind IN ('bug', 'idea', 'question', 'balance', 'other'));

ALTER TABLE public.feedback_topics DROP CONSTRAINT IF EXISTS feedback_topics_kind_check;
ALTER TABLE public.feedback_topics ADD CONSTRAINT feedback_topics_kind_check
  CHECK (kind IN ('bug', 'improvement', 'balance'));
