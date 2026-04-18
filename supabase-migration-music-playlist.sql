-- Migration: Multiple board music tracks per game_board (playlist support)
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS game_board_music_tracks (
  board_id INTEGER REFERENCES game_boards(id) ON DELETE CASCADE,
  track_id INTEGER REFERENCES music_tracks(id) ON DELETE CASCADE,
  PRIMARY KEY (board_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_gbmt_board ON game_board_music_tracks(board_id);

-- Backfill: copy each existing single music_track_id into the join table.
INSERT INTO game_board_music_tracks (board_id, track_id)
SELECT id, music_track_id FROM game_boards
WHERE music_track_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- RLS: allow authenticated users to read the playlist (writes go through service role API).
ALTER TABLE game_board_music_tracks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read game_board_music_tracks" ON game_board_music_tracks;
CREATE POLICY "Authenticated read game_board_music_tracks"
  ON game_board_music_tracks FOR SELECT
  TO authenticated
  USING (true);
