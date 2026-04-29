-- Heroes — Power image
--
-- Adds a per-hero illustration for the active power's cast overlay. Today the
-- HeroPowerCastOverlay falls back to /images/heroes/{race}.png so every
-- "beastmen" hero shares the same visual when their power triggers. With this
-- column populated, the overlay can render a hero-specific action shot
-- (uploaded directly or generated via Gemini multimodal using the hero's
-- portrait as a reference image).
--
-- Nullable so existing heroes stay valid; the overlay falls back to the
-- race-generic illustration when null.
--
-- Apply via Supabase dashboard SQL editor or
-- `mcp__claude_ai_Supabase__apply_migration`. Safe to re-run.

alter table public.heroes
  add column if not exists power_image_url text;
