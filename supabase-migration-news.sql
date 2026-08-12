-- ============================================
-- Armies & Magic — News (bandeau joueur + page détail + admin forge)
-- Execute this in Supabase SQL Editor
-- ============================================

CREATE TABLE news (
  id SERIAL PRIMARY KEY,
  -- Identité publique de la news (URL /news/<slug>). Unique, format [a-z0-9-].
  slug TEXT NOT NULL UNIQUE,
  -- Contenu FRANÇAIS = source de vérité (même doctrine que messages/fr.json).
  title TEXT NOT NULL,
  teaser TEXT NOT NULL DEFAULT '',
  body_md TEXT NOT NULL DEFAULT '',
  -- Visuel du bandeau : URL publique Supabase Storage (bucket news-images).
  image_url TEXT,
  -- Paramètres de génération conservés pour pouvoir RÉGÉNÉRER le visuel :
  -- id du preset de style choisi dans la forge + prompt libre saisi.
  image_style TEXT,
  image_prompt TEXT,
  -- Traductions par locale, produites automatiquement à la publication :
  -- {"en": {"title":..., "teaser":..., "body_md":...}, "es": {...}, ...}
  -- Une seule table + JSONB (et pas une table news_translations) : volume
  -- minuscule, contenu toujours lu/écrit d'un bloc — card_translations se
  -- justifie pour des milliers de cartes requêtées par lot, pas ici.
  translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Diffusion dans le bandeau : interrupteur + ordre manuel (pas de dates).
  active BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_news_active_sort ON news(active, sort_order);

-- RLS : lecture publique, mutations via service_role uniquement (aucune
-- policy d'écriture — doctrine CLAUDE.md « All mutations go through
-- service_role API routes »).
-- Lecture USING (true) et PAS (active = true) : une news désactivée reste
-- lisible par lien partagé /news/<slug> ; seul le bandeau filtre sur active.
ALTER TABLE news ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read news" ON news
  FOR SELECT USING (true);

-- ============================================
-- Storage : créer le bucket PUBLIC `news-images` dans le Dashboard
-- (Storage → New bucket → name: news-images → Public bucket: ON).
-- Les visuels de bandeau y sont uploadés par /api/news (service_role) et
-- servis par URL publique — même modèle que card-images / board-images.
-- ============================================
