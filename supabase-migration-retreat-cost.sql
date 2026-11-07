-- Sixième coût additionnel : RETRAITE — remonter N de ses créatures du plateau
-- vers la main pour jouer la carte.
--
-- Même famille que `life_cost`, `discard_cost`, `sacrifice_cost`, `exile_cost`
-- et `topdeck_cost` : cumulatif avec le coût en mana, et NON réductible.
--
-- Ce qui le distingue du sacrifice : la créature n'est pas perdue, elle revient
-- en main avec ses bonus permanents et ses PV restaurés, et ses effets « au
-- retour en main » se déclenchent. Ce qu'on paie, c'est du TEMPO : la présence
-- sur le plateau et le mana à redépenser pour la rejouer.
--
-- Colonne NULLABLE : null ou 0 = coût inactif, donc toutes les cartes
-- existantes restent valides sans reprise de données.
--
-- À appliquer AVANT le déploiement : les listes de SELECT réclament la colonne.

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS retreat_cost integer;

COMMENT ON COLUMN cards.retreat_cost IS
  'Coût additionnel (RETRAITE) : nombre de créatures du plateau remontées en main pour jouer la carte. Null/0 = inactif. Non réductible. Effets de retour déclenchés.';

-- Un seul coût additionnel par carte : la règle compte désormais six colonnes.
ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_un_seul_cout_additionnel;

ALTER TABLE cards
  ADD CONSTRAINT cards_un_seul_cout_additionnel
  CHECK (
    (coalesce(life_cost, 0) > 0)::int + (coalesce(discard_cost, 0) > 0)::int
    + (coalesce(sacrifice_cost, 0) > 0)::int + (coalesce(exile_cost, 0) > 0)::int
    + (coalesce(topdeck_cost, 0) > 0)::int + (coalesce(retreat_cost, 0) > 0)::int <= 1
  );
