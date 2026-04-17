-- ============================================
-- Armies & Magic — Custom Keyword Icons
-- Execute this in Supabase SQL Editor
-- ============================================

CREATE TABLE keyword_icons (
  keyword TEXT PRIMARY KEY,
  icon_url TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE keyword_icons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read keyword icons" ON keyword_icons
  FOR SELECT USING (true);
