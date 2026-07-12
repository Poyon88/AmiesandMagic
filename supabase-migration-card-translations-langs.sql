-- Étend la contrainte de locale de `card_translations` pour inclure le japonais
-- (ja) et le chinois simplifié (zh), en plus des langues existantes.
--
-- La table conserve le FR dans `cards` (jamais dupliqué ici) ; cette table ne
-- porte que les traductions name / flavor_text / effect_text par (card_id, locale).
-- Changement additif et sûr : on remplace simplement la contrainte CHECK par une
-- version élargie. À exécuter dans le SQL Editor Supabase (prod).
--
-- Idempotent : le DROP ... IF EXISTS permet de relancer sans erreur.

alter table public.card_translations
  drop constraint if exists card_translations_locale_check;

alter table public.card_translations
  add constraint card_translations_locale_check
  check (locale in ('en', 'es', 'de', 'it', 'pt', 'ja', 'zh'));
