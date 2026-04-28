-- Heroes — Faction & Clan
--
-- Adds cultural identity columns to heroes so the AI portrait generator can
-- compose faction emblems / clan accents into the rendered art, and so the
-- in-game UI can later surface a hero's faction badge alongside their race.
--
-- Validation lives in the API routes (against FACTIONS / clan lists in
-- src/lib/card-engine/constants.ts). Both columns stay nullable so existing
-- heroes remain valid until they're re-saved through HeroManager.
--
-- Apply via Supabase dashboard SQL editor or
-- `mcp__claude_ai_Supabase__apply_migration`. Safe to re-run.

alter table public.heroes
  add column if not exists faction text,
  add column if not exists clan text;

create index if not exists heroes_faction_idx on public.heroes (faction);
