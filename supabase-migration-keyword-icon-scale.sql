-- Icônes des capacités : facteur d'échelle par mot-clé
-- ---------------------------------------------------------------------------
-- Ajoute une colonne `scale` à public.keyword_icons pour normaliser la taille
-- APPARENTE des icônes custom (les PNG ont des marges internes hétérogènes ;
-- rendus en objectFit:contain, ils paraissent plus petits/grands à boîte
-- égale). `scale` multiplie la taille de rendu de l'icône, ajustable dans
-- l'admin d'icônes. Défaut 1 = inchangé.
--
-- Additive et rétro-compatible : le code déployé ne lit pas encore `scale`,
-- donc cette migration peut être appliquée AVANT le déploiement sans risque.
-- ---------------------------------------------------------------------------

alter table public.keyword_icons
  add column if not exists scale numeric not null default 1;
