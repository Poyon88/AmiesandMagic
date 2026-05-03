-- Migration: Persist match actions for desync recovery
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
--
-- Background:
--   The game uses Supabase Realtime broadcasts to sync actions between
--   the two players. Realtime is best-effort — a dropped packet, a
--   browser tab throttle, or a brief reconnection causes the receiving
--   client to miss an action permanently, producing visible desyncs
--   (e.g. hero HP differing between the two screens).
--
--   This table stores every action with a per-match monotonic sequence
--   number. The client tags each broadcast with its seq, the receiver
--   detects gaps, and on a gap it fetches the missing rows from this
--   table and replays them in order before applying the new action.

CREATE TABLE IF NOT EXISTS match_actions (
  id BIGSERIAL PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  action JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_match_actions_match_seq
  ON match_actions (match_id, seq);

-- RLS: a player participating in the match can read and insert their own
-- actions. Both players need read access to fetch missing actions on gap
-- detection. Inserts are open to authenticated users; we rely on the
-- unique (match_id, seq) constraint to prevent duplicates and on the
-- match-membership filter to scope visibility.
ALTER TABLE match_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Match participants can read actions"
  ON match_actions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_actions.match_id
        AND (m.player1_id = auth.uid() OR m.player2_id = auth.uid())
    )
  );

CREATE POLICY "Match participants can insert actions"
  ON match_actions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_actions.match_id
        AND (m.player1_id = auth.uid() OR m.player2_id = auth.uid())
    )
  );
