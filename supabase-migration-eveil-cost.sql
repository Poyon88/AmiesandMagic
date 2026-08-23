-- ÉVEIL — le premier coût ALTERNATIF général du jeu.
--
-- Les cinq colonnes déjà en place (`life_cost`, `discard_cost`,
-- `sacrifice_cost`, `exile_cost`, `topdeck_cost`) sont des coûts ADDITIONNELS :
-- elles s'ajoutent au mana. `eveil_cost` fait l'inverse — il le REMPLACE.
--
-- Jouer une carte pour son coût d'éveil, c'est la retirer du jeu avec autant de
-- points que ce coût, puis y verser 1 mana à la fois, tour après tour. Au
-- dernier point, la carte entre en jeu exactement comme si elle venait de la
-- main : effets d'invocation, coûts additionnels, ciblage, mal d'invocation.
--
-- Ce n'est donc pas une remise, c'est un ÉCHANGE : du temps contre du mana
-- immédiat. Une carte à 8 mana devient posable dès le tour 2 — mais elle
-- n'arrivera pas avant plusieurs tours, et l'adversaire la voit venir tout du
-- long (la zone d'éveil est publique, face visible et compteur compris). C'est
-- la contrepartie qui rend le mécanisme jouable des deux côtés.
--
-- Incompressible, comme les cinq coûts additionnels : ni Canalisation, ni
-- Entraide, ni Concentration, ni Chant n'y touchent. Seul `mana_cost` est
-- réductible, et c'est précisément le coût que l'éveil n'emprunte pas.
--
-- Aucune contrainte sur la valeur, par choix de l'auteur : l'équilibrage entre
-- coût normal et coût d'éveil lui appartient carte par carte.
--
-- Colonne NULLABLE : null ou 0 = pas d'éveil, la carte ne se joue que
-- normalement. Toutes les cartes existantes restent donc valides sans reprise
-- de données.

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS eveil_cost integer;

COMMENT ON COLUMN cards.eveil_cost IS
  'Coût ALTERNATIF (ÉVEIL) : la carte peut être mise en éveil au lieu d''être jouée, avec ce nombre de points. Le joueur en paie 1 par mana à chacun de ses tours ; au dernier point elle entre en jeu comme depuis la main. Null/0 = inactif. Incompressible. Remplace le coût en mana, ne s''y ajoute pas.';
