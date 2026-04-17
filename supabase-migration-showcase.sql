-- ============================================
-- Armies & Magic — Showcase Cards for Landing Page
-- Execute this in Supabase SQL Editor
-- ============================================

CREATE TABLE showcase_cards (
  id SERIAL PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_showcase_card_unique ON showcase_cards(card_id);
CREATE INDEX idx_showcase_sort ON showcase_cards(sort_order);

-- RLS: public read, mutations via service_role
ALTER TABLE showcase_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read showcase" ON showcase_cards
  FOR SELECT USING (true);
