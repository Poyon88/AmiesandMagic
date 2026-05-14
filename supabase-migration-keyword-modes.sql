-- Adds the sidecar `keyword_instances` JSONB column used to attach
-- trigger-mode metadata (on-death rattle, tap-activated) and per-instance
-- X values to a creature's keywords. The existing `keywords text[]` column
-- stays untouched — it still drives icon/label rendering for any keyword
-- that hasn't opted into a non-default mode.
--
-- Each row in `keyword_instances` matches an entry in `keywords`:
--   { "id": "<keyword-id>", "mode": "death" | "tap", "x": <int> }
-- A missing `mode` (or a keyword present in `keywords` but absent here)
-- means on-play (legacy behaviour). The engine helper hasKwInMode reads
-- this column when it's populated and falls back to the legacy
-- `keywords` array + effect_text bracket notation otherwise, so old
-- cards keep working without a forced data migration.

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS keyword_instances jsonb;

COMMENT ON COLUMN cards.keyword_instances IS
  'Per-keyword metadata sidecar: array of { id, mode?, x? }. Drives on-death rattle and tap-activated triggers. Null/empty = every keyword fires on-play (legacy behaviour).';
