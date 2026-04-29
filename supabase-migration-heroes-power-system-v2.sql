-- Heroes — Power system V2
--
-- The hero power model is being redesigned to align with the unified
-- ABILITIES registry (creature + spell keywords). A hero power is now a
-- combination of (mode, keywordId, params) where mode is one of:
--   - "grant_keyword"  : grant the keyword to a targeted creature
--   - "spell_trigger"  : fire the keyword's spell-side effect once
--   - "aura"           : activate a persistent aura (stackable)
--
-- The `power_effect` JSONB column keeps the same name but the inner shape
-- changes. Existing rows with the legacy shape (gain_armor / deal_damage /
-- heal / summon_token / buff_on_friendly_death) become invalid at load time
-- and have to be recreated by the admin via HeroManager.
--
-- This migration only adds the per-game usage limit column. All other
-- changes are application-level.

alter table public.heroes
  add column if not exists power_usage_limit integer;

comment on column public.heroes.power_usage_limit is
  'Max activations per game; null means unlimited.';
