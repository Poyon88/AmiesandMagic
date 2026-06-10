-- Migration: Authoritative per-match GameState snapshot for desync reconciliation
-- Run in Supabase SQL Editor (Dashboard > SQL Editor) — already applied to the
-- A&M project via MCP (migration name: match_state_snapshot).
--
-- Background:
--   match_actions lets a client recover MISSED actions by replaying the log,
--   but that only works if the log is complete AND replay is deterministic.
--   This table adds a server-side source of truth: the acting client upserts
--   the full GameState (minus the heavy static card pools, which each client
--   already holds in memory) after its actions, tagged with the per-match
--   monotonic seq. On wake/reconnect or a detected gap, a client refetches this
--   row, adopts it (restoring the exact RNG position via state.rngState), then
--   replays only match_actions with seq > snapshot.seq. One row per match.

CREATE TABLE IF NOT EXISTS match_state (
  match_id UUID PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE match_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Match participants can read state"
  ON match_state FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_state.match_id
        AND (m.player1_id = auth.uid() OR m.player2_id = auth.uid())
    )
  );

CREATE POLICY "Match participants can insert state"
  ON match_state FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_state.match_id
        AND (m.player1_id = auth.uid() OR m.player2_id = auth.uid())
    )
  );

CREATE POLICY "Match participants can update state"
  ON match_state FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_state.match_id
        AND (m.player1_id = auth.uid() OR m.player2_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_state.match_id
        AND (m.player1_id = auth.uid() OR m.player2_id = auth.uid())
    )
  );
