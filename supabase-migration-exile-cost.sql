-- Quatrième coût additionnel : EXIL — retirer N cartes du dessus de son propre
-- deck pour jouer la carte.
--
-- Même famille que `life_cost`, `discard_cost` et `sacrifice_cost` : cumulatif
-- avec le coût en mana, et NON réductible (Canalisation et Entraide ne touchent
-- que `mana_cost`).
--
-- Ce que « exil » veut dire ici : les cartes quittent le deck sans rejoindre le
-- cimetière. Elles sont hors de portée d'Exhumation, de Résurrection, de Rappel
-- et de toute autre récupération — c'est ce qui distingue ce coût d'une simple
-- défausse. Il rapproche aussi mécaniquement la fatigue, ce qui en fait sa
-- vraie contrepartie.
--
-- Colonne NULLABLE : null ou 0 = coût inactif, donc toutes les cartes
-- existantes restent valides sans reprise de données.

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS exile_cost integer;

COMMENT ON COLUMN cards.exile_cost IS
  'Coût additionnel : nombre de cartes retirées du dessus du deck du joueur (exilées, PAS au cimetière) pour jouer la carte. Null/0 = inactif. Non réductible.';
