-- ============================================
-- Armies & Magic — Modèle d'IA de l'illustration
-- Execute this in Supabase SQL Editor
-- ============================================

-- Identifiant du modèle qui a produit l'image ACTUELLE de la carte
-- (ex. `gemini-3.1-flash-image-preview`). Écrit par /api/cards/save à chaque
-- nouvelle image : le modèle renvoyé par /api/cards/generate-image, ou NULL
-- pour une image importée à la main. NULL aussi pour toutes les images
-- antérieures au 2026-10-12 : le modèle n'était consigné nulle part.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS image_model TEXT;
