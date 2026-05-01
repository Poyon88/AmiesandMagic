-- Game Boards — Faction, Race & Clan
--
-- Adds cultural identity columns to game_boards so the AI board generator can
-- weave race/clan-themed props, architecture and decorative motifs into the
-- rendered scene, and so the admin UI can later filter / display boards by
-- faction.
--
-- Validation lives in the API routes (against FACTIONS / clan lists in
-- src/lib/card-engine/constants.ts). All three columns stay nullable so
-- existing boards remain valid until they're re-saved through the forge.
--
-- Apply via Supabase dashboard SQL editor or
-- `mcp__claude_ai_Supabase__apply_migration`. Safe to re-run.

alter table public.game_boards
  add column if not exists faction text,
  add column if not exists race text,
  add column if not exists clan text;

create index if not exists game_boards_faction_idx on public.game_boards (faction);
