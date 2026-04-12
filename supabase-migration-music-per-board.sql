-- Migration: Associate tense/victory/defeat music per board
-- Run this in Supabase SQL Editor

ALTER TABLE game_boards
  ADD COLUMN IF NOT EXISTS tense_track_id INTEGER REFERENCES music_tracks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS victory_track_id INTEGER REFERENCES music_tracks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS defeat_track_id INTEGER REFERENCES music_tracks(id) ON DELETE SET NULL;
