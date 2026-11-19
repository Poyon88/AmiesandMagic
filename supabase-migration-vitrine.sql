-- ============================================
-- Armies of Legends — Vitrine pilotée depuis l'admin
-- Execute this in Supabase SQL Editor
-- ============================================
--
-- Deux tables, purement ADDITIVES. Vides, la page d'accueil se comporte comme
-- avant : sélection automatique des cartes, textes de messages/*.json.

-- Cartes choisies à la main pour les visuels de la page d'accueil.
--   mur     : les trois rangées du premier écran (l'alignement vient de la
--             faction de la carte) ;
--   faction : l'affiche de chaque faction (la faction vient de la carte) ;
--   tirages : les cartes en tirage limité montrées en vrai (decks Expert) ;
--   frise   : la rangée qui défile en bas de page.
CREATE TABLE vitrine_cards (
  id SERIAL PRIMARY KEY,
  section TEXT NOT NULL CHECK (section IN ('mur', 'faction', 'tirages', 'frise')),
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_vitrine_cards_unique ON vitrine_cards(section, card_id);
CREATE INDEX idx_vitrine_cards_sort ON vitrine_cards(section, sort_order);

-- Textes de la page d'accueil réécrits depuis l'admin. Le FRANÇAIS est la
-- source ; `translations` reçoit les sept autres langues, produites
-- automatiquement à l'enregistrement : {"en": "...", "es": "...", ...}.
-- Une ligne absente = le texte par défaut de messages/*.json.
CREATE TABLE vitrine_textes (
  key TEXT PRIMARY KEY,
  fr TEXT NOT NULL,
  translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS : lecture publique (la page d'accueil est lue sans session), mutations
-- via service_role uniquement — aucune policy d'écriture.
ALTER TABLE vitrine_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitrine_textes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read vitrine cards" ON vitrine_cards
  FOR SELECT USING (true);
CREATE POLICY "Public read vitrine textes" ON vitrine_textes
  FOR SELECT USING (true);
