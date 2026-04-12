-- Migration: Add music system
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)

-- 1. Create music_tracks table
CREATE TABLE IF NOT EXISTS music_tracks (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('menu', 'board', 'tense', 'victory', 'defeat')),
  file_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add music association to game_boards
ALTER TABLE game_boards
  ADD COLUMN IF NOT EXISTS music_track_id INTEGER REFERENCES music_tracks(id) ON DELETE SET NULL;

-- 3. Create storage bucket for music (run via Dashboard > Storage > New Bucket)
-- Bucket name: music-tracks
-- Public: true
-- Allowed MIME types: audio/mpeg, audio/ogg, audio/wav, audio/webm
-- File size limit: 10MB

-- 4. Storage policy for public read access
INSERT INTO storage.policies (name, bucket_id, operation, definition)
SELECT 'Public read music', 'music-tracks', 'SELECT', 'true'
WHERE NOT EXISTS (
  SELECT 1 FROM storage.policies WHERE name = 'Public read music' AND bucket_id = 'music-tracks'
);
