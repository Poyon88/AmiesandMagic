-- Cards — Entraide (race-targeted hand cost reduction keyword)
--
-- Adds a column on `cards` that stores the race targeted by the new
-- "Entraide" creature keyword. When a creature with `Entraide` is in hand,
-- its mana cost is reduced by 1 per allied creature whose `race` matches
-- this column, recomputed dynamically every time the board changes.
--
-- The column stays nullable so existing cards remain valid; only cards that
-- actually carry the `entraide` keyword need it populated. The API layer
-- enforces the pairing (keyword present ⇒ race required).
--
-- Apply via Supabase dashboard SQL editor or
-- `mcp__claude_ai_Supabase__apply_migration`. Safe to re-run.

alter table public.cards
  add column if not exists entraide_race text;
