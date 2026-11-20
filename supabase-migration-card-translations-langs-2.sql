-- Étend la contrainte de locale de `card_translations` au russe (ru), à
-- l'arabe (ar), au coréen (ko), au chinois traditionnel (zh-TW), au turc (tr)
-- et au polonais (pl), en plus des langues existantes.
--
-- Changement additif et sûr : on remplace la contrainte CHECK par une version
-- élargie, aucune ligne existante n'est touchée. À exécuter dans le SQL Editor
-- Supabase (prod).
--
-- Idempotent : le DROP ... IF EXISTS permet de relancer sans erreur.

alter table public.card_translations
  drop constraint if exists card_translations_locale_check;

alter table public.card_translations
  add constraint card_translations_locale_check
  check (locale in ('en', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ru', 'ar', 'ko', 'zh-TW', 'tr', 'pl'));
