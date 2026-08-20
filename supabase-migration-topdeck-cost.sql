-- Cinquième coût additionnel : REPLI — replacer N cartes de sa MAIN sur le
-- dessus de son propre deck pour jouer la carte.
--
-- Même famille que `life_cost`, `discard_cost`, `sacrifice_cost` et
-- `exile_cost` : cumulatif avec le coût en mana, et NON réductible
-- (Canalisation et Entraide ne touchent que `mana_cost`).
--
-- Ce que « repli » veut dire ici, et ce qui le distingue de la défausse : la
-- carte ne va PAS au cimetière, elle retourne sur le deck. Rien n'est perdu —
-- on la repiochera. Ce qu'on paie, c'est du TEMPO : la main rétrécit tout de
-- suite, et la prochaine pioche est déjà connue, donc dépensée d'avance. Là où
-- la défausse coûte une carte et l'exil rapproche la fatigue, le repli ne coûte
-- qu'un tour d'avance — c'est le plus doux des cinq, et le seul que le joueur
-- puisse tourner à son profit en y replaçant une carte qu'il veut repiocher.
--
-- La carte repliée n'est JAMAIS révélée à l'adversaire : il voit qu'une carte
-- a rejoint la pile, pas laquelle. Sans quoi le coût donnerait gratuitement à
-- l'adversaire la connaissance de la prochaine pioche.
--
-- Colonne NULLABLE : null ou 0 = coût inactif, donc toutes les cartes
-- existantes restent valides sans reprise de données.

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS topdeck_cost integer;

COMMENT ON COLUMN cards.topdeck_cost IS
  'Coût additionnel (REPLI) : nombre de cartes de la main replacées sur le dessus du deck du joueur pour jouer la carte. Null/0 = inactif. Non réductible. La carte repliée n''est pas révélée à l''adversaire.';
