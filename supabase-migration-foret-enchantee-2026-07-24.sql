-- Réactivation du clan des Mimis sous le nom « La Forêt Enchantée » (2026-07-24)
-- ---------------------------------------------------------------------------
-- Contexte : la refonte factions/clans (supabase-migration-factions-clans-
-- refonte.sql, §5) avait traité « Les Mignons » comme un clan bonus INERTE et
-- VIDÉ le clan de toutes les cartes Mimis :
--     update public.cards set clan = null
--      where faction = 'Hommes-Bêtes' and race = 'Mimis';
-- Le clan redevient un clan NORMAL, renommé « La Forêt Enchantée », déclaré
-- dans FACTIONS["Hommes-Bêtes"].clans avec appliesTo = 'Mimis'.
--
-- Cette migration fait deux choses, sur les 3 tables portant une colonne `clan`
-- (cards, heroes, game_boards) :
--   1. rattrape les lignes Mimis dont le clan avait été vidé (clan is null) ;
--   2. renomme les éventuels restes de l'ancien nom ('Mignons' pré-refonte ou
--      'Les Mignons') qui auraient échappé aux migrations précédentes.
--
-- ⚠️ Le pas 1 ne cible QUE les lignes `clan is null` : une carte Mimis à qui on
-- aurait entre-temps attribué « Le Pacte des Griffes » (clan transversal,
-- appliesTo = 'all') garde son clan. C'est voulu — on répare le NULL laissé par
-- la refonte, on n'écrase pas un choix explicite.
--
-- Idempotent : rejouer la migration ne touche plus aucune ligne.
-- ---------------------------------------------------------------------------

begin;

-- Aperçu AVANT (facultatif — décommenter pour inspecter)
-- select 'cards' tbl, race, clan, count(*) n from public.cards
--  where faction = 'Hommes-Bêtes' group by race, clan
-- union all select 'heroes', race, clan, count(*) from public.heroes
--  where faction = 'Hommes-Bêtes' group by race, clan
-- union all select 'boards', race, clan, count(*) from public.game_boards
--  where faction = 'Hommes-Bêtes' group by race, clan
-- order by tbl, race, clan;

do $$
declare
  t text;
begin
  foreach t in array array['cards', 'heroes', 'game_boards']
  loop
    -- 1) Rattrapage : Mimis laissés sans clan par la refonte.
    execute format(
      'update public.%I set clan = %L where faction = %L and race = %L and clan is null',
      t, 'La Forêt Enchantée', 'Hommes-Bêtes', 'Mimis');

    -- 2) Renommage des restes de l'ancien nom, sous les deux graphies connues.
    --    Garde sur la faction : 'Mignons' est un nom court, jamais toucher un
    --    homonyme hors Hommes-Bêtes.
    execute format(
      'update public.%I set clan = %L where faction = %L and clan in (%L, %L)',
      t, 'La Forêt Enchantée', 'Hommes-Bêtes', 'Les Mignons', 'Mignons');
  end loop;
end $$;

-- Garde-fou 1 : plus aucune ligne ne porte l'ancien nom.
do $$
declare
  n bigint;
begin
  select (select count(*) from public.cards       where clan in ('Les Mignons', 'Mignons'))
       + (select count(*) from public.heroes      where clan in ('Les Mignons', 'Mignons'))
       + (select count(*) from public.game_boards where clan in ('Les Mignons', 'Mignons'))
    into n;
  if n > 0 then
    raise exception 'Migration incomplète : % ligne(s) portent encore l''ancien nom de clan', n;
  end if;
end $$;

-- Garde-fou 2 : plus aucune carte Mimis sans clan.
do $$
declare
  n bigint;
begin
  select count(*) into n from public.cards
   where faction = 'Hommes-Bêtes' and race = 'Mimis' and clan is null;
  if n > 0 then
    raise exception 'Migration incomplète : % carte(s) Mimis restent sans clan', n;
  end if;
end $$;

-- Aperçu APRÈS (facultatif)
-- select 'cards' tbl, race, clan, count(*) n from public.cards
--  where faction = 'Hommes-Bêtes' group by race, clan
-- union all select 'heroes', race, clan, count(*) from public.heroes
--  where faction = 'Hommes-Bêtes' group by race, clan
-- union all select 'boards', race, clan, count(*) from public.game_boards
--  where faction = 'Hommes-Bêtes' group by race, clan
-- order by tbl, race, clan;

commit;
