-- Cards — Alternative / additional costs
--
-- Adds three cumulative cost fields to the `cards` table so a card can require
-- the player to pay extra resources beyond mana when played:
--   - life_cost      : hero HP paid (blocks the play if it would reduce HP ≤ 0)
--   - discard_cost   : number of cards the player must discard from hand
--   - sacrifice_cost : number of allied creatures the player must sacrifice
--
-- All three are nullable (treated as 0 when null) so existing cards keep their
-- current behaviour and the column add is non-breaking. Channelisation /
-- Entraide reductions still apply only to `mana_cost` — these new costs are
-- not reducible by design.
--
-- Apply via Supabase dashboard SQL editor or
-- `mcp__claude_ai_Supabase__apply_migration`. Safe to re-run.

alter table public.cards
  add column if not exists life_cost int,
  add column if not exists discard_cost int,
  add column if not exists sacrifice_cost int;
