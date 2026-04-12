-- Migration: Add SFX system
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)

-- 1. Create sfx_tracks table for standard SFX
CREATE TABLE IF NOT EXISTS sfx_tracks (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add per-card SFX columns
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS sfx_play_url TEXT,
  ADD COLUMN IF NOT EXISTS sfx_death_url TEXT;

-- 3. Create storage bucket for SFX (run via Dashboard > Storage > New Bucket)
-- Bucket name: sfx-tracks
-- Public: true
-- Allowed MIME types: audio/mpeg, audio/ogg, audio/wav, audio/webm
-- File size limit: 5MB
