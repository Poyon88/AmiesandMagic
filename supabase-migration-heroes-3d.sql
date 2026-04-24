-- Heroes 3D — Phase 1
--
-- Extends the existing `heroes` table (already FK-linked to decks.hero_id) to
-- carry the 3D skin + economic metadata, mirroring the game_boards /
-- card_backs pattern. Gameplay power columns (power_name/type/cost/effect/
-- description) remain as-is — this migration only adds the skin layer.
--
-- Apply via Supabase dashboard SQL editor or `mcp__claude_ai_Supabase__
-- apply_migration`. Safe to re-run (IF NOT EXISTS guards everywhere).

-- ─── Columns ──────────────────────────────────────────────────────────────

alter table public.heroes
  add column if not exists glb_url text,
  add column if not exists thumbnail_url text,
  add column if not exists is_active boolean not null default true,
  add column if not exists rarity text not null default 'Commune',
  add column if not exists max_prints integer,
  add column if not exists is_default boolean not null default false;

-- Enforce single default per race (only one hero per race can be the auto-pick
-- when a deck leaves hero_id null).
create unique index if not exists heroes_one_default_per_race
  on public.heroes (race) where is_default = true;

-- ─── Storage bucket ───────────────────────────────────────────────────────
--
-- Bucket for hero 3D models (.glb / .gltf). Public read, writes via service
-- role only (same policy as board-images).

insert into storage.buckets (id, name, public)
values ('hero-models', 'hero-models', true)
on conflict (id) do nothing;

-- Public read (the game fetches GLBs client-side)
drop policy if exists "hero-models public read" on storage.objects;
create policy "hero-models public read"
  on storage.objects for select
  using (bucket_id = 'hero-models');

-- ─── RLS on heroes ────────────────────────────────────────────────────────

alter table public.heroes enable row level security;

drop policy if exists "heroes readable by authenticated" on public.heroes;
create policy "heroes readable by authenticated"
  on public.heroes for select
  using (auth.role() = 'authenticated');

-- Mutations restricted to service role (handled by API routes).
