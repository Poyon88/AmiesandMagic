-- ============================================================
-- Armies of Legends — Illustration ultra-large des plateaux
-- ============================================================
-- Le terrain s'élargit sur les écrans plus larges que 16:9. Chaque plateau
-- peut porter, en plus de son illustration 16:9 (`image_url`, inchangée), une
-- version 21:9 dont le centre est IDENTIQUE à l'illustration d'origine : seuls
-- les côtés sont ajoutés. Sur un écran 16:9, la version large recadrée retombe
-- donc exactement sur l'image d'origine.
--
-- Colonne nulle = pas de version large : le jeu garde l'image 16:9 centrée,
-- ses bords fondus dans un décor flouté.
--
-- Additif et idempotent. À exécuter dans le SQL Editor.
-- ============================================================

ALTER TABLE public.game_boards ADD COLUMN IF NOT EXISTS image_url_wide text;
