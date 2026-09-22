-- Un seul coût additionnel par carte (BRIEF-COMPTEURS-BLASONS.md §7).
--
-- Le modèle porte CINQ colonnes indépendantes (life_cost, discard_cost,
-- sacrifice_cost, exile_cost, topdeck_cost) ; la règle « une carte ne porte
-- qu'un seul coût additionnel » n'était appliquée qu'à la sauvegarde (API) et
-- l'affichage ne rendait que le premier en silence. Cette migration l'inscrit
-- dans la base :
--   1. elle ÉCHOUE, avec la liste des cartes fautives, si une carte en déclare
--      deux — corriger les données d'abord, jamais les tronquer ici ;
--   2. elle pose la contrainte CHECK qui interdit tout retour en arrière.
-- Appliquée en prod le 2026-09-22 (seule fautive : « Mammouth de guerre »,
-- id 267, vie 3 + défausse 1 → défausse remise à 0 avant la pose).

DO $$
DECLARE
  fautives text;
BEGIN
  SELECT string_agg(
           format('« %s » (id %s : %s)', coalesce(nullif(name, ''), 'sans nom'), id,
             concat_ws(', ',
               CASE WHEN coalesce(life_cost, 0)      > 0 THEN 'vie '       || life_cost      END,
               CASE WHEN coalesce(discard_cost, 0)   > 0 THEN 'défausse '  || discard_cost   END,
               CASE WHEN coalesce(sacrifice_cost, 0) > 0 THEN 'sacrifice ' || sacrifice_cost END,
               CASE WHEN coalesce(exile_cost, 0)     > 0 THEN 'exil '      || exile_cost     END,
               CASE WHEN coalesce(topdeck_cost, 0)   > 0 THEN 'repli '     || topdeck_cost   END)),
           ' ; ' ORDER BY id)
    INTO fautives
    FROM cards
   WHERE (coalesce(life_cost, 0) > 0)::int + (coalesce(discard_cost, 0) > 0)::int
       + (coalesce(sacrifice_cost, 0) > 0)::int + (coalesce(exile_cost, 0) > 0)::int
       + (coalesce(topdeck_cost, 0) > 0)::int >= 2;

  IF fautives IS NOT NULL THEN
    RAISE EXCEPTION 'Une carte ne porte qu''un seul coût additionnel — corriger ces cartes avant de poser la contrainte : %', fautives;
  END IF;
END $$;

ALTER TABLE cards
  ADD CONSTRAINT cards_un_seul_cout_additionnel
  CHECK (
    (coalesce(life_cost, 0) > 0)::int + (coalesce(discard_cost, 0) > 0)::int
    + (coalesce(sacrifice_cost, 0) > 0)::int + (coalesce(exile_cost, 0) > 0)::int
    + (coalesce(topdeck_cost, 0) > 0)::int <= 1
  );
