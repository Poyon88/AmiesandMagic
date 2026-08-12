-- ============================================
-- Armies & Magic — News : bouton d'action vers une section du jeu
-- Execute this in Supabase SQL Editor
-- ============================================

-- On persiste la CLÉ de la section (cf. GAME_SECTIONS dans
-- src/lib/game-sections.ts), pas une URL ni un libellé :
--   * la route peut être renommée sans invalider les news déjà publiées ;
--   * le libellé du bouton vient de `labelKey` + messages/<locale>.json, donc il
--     est déjà traduit dans les 8 langues — aucune passe de /api/news/translate
--     n'est nécessaire, et rien à retraduire quand on change le texte du menu.
-- NULL = pas de bouton (le défaut : les news existantes n'en gagnent aucun).
ALTER TABLE news ADD COLUMN cta_section TEXT;

-- Pas de contrainte CHECK sur les valeurs possibles : la liste des sections vit
-- dans le code et bouge avec lui, une énumération figée en base se serait
-- désynchronisée au premier ajout. La validation est faite par /api/news contre
-- GAME_SECTIONS, et l'affichage ignore silencieusement une clé devenue orpheline
-- (cf. findGameSection).
