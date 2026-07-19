-- Renommage de clans (2026-07-19)
-- ---------------------------------------------------------------------------
-- Met à jour les noms de clans (identifiants FR-canoniques, stockés dans la
-- colonne `clan` de public.cards / public.heroes / public.game_boards) suite au
-- second passage de renommage. Les ids de faction/race NE changent PAS.
--
-- Renommages :
--   La Cour Pourpre        → Les Seigneurs Fauves   (Hommes-Bêtes / Hommes-Félins)
--   La Cour Infernale      → Les Princes des Abîmes  (Elfes Noirs / Démons)
--   Le Conclave d'Ossements→ Le Cénacle Nécromant    (Morts-Vivants / Lich)
--   Les Hobbits            → La Combe Verte           (Elfes / Hobbits + Hommes-Arbres)
--   Feu                    → La Colère des Flammes    (Élémentaires)
--   Terre                  → Le Socle du Monde        (Élémentaires)
--   Eau                    → La Vague Sans Fin        (Élémentaires)
--   Air                    → Le Souffle des Cimes     (Élémentaires)
--
-- Idempotent : chaque UPDATE est gardé par l'ancienne valeur de `clan` (+ la
-- faction là où le nom court pourrait être ambigu). Rejouer la migration ne
-- touche plus aucune ligne.
-- ---------------------------------------------------------------------------

begin;

-- Aperçu AVANT (facultatif — décommenter pour inspecter)
-- select 'cards' tbl, faction, clan, count(*) n from public.cards group by faction, clan
-- union all select 'heroes', faction, clan, count(*) from public.heroes group by faction, clan
-- union all select 'boards', faction, clan, count(*) from public.boards group by faction, clan
-- order by tbl, faction, clan;

-- Boucle sur les 3 tables portant une colonne `clan`.
do $$
declare
  t text;
begin
  foreach t in array array['cards', 'heroes', 'game_boards']
  loop
    -- Clans à identifiant long et non ambigu (pas besoin de garde faction).
    execute format('update public.%I set clan = %L where clan = %L', t, 'Les Seigneurs Fauves',  'La Cour Pourpre');
    execute format('update public.%I set clan = %L where clan = %L', t, 'Les Princes des Abîmes', 'La Cour Infernale');
    execute format('update public.%I set clan = %L where clan = %L', t, 'Le Cénacle Nécromant',   'Le Conclave d''Ossements');
    execute format('update public.%I set clan = %L where clan = %L', t, 'La Combe Verte',          'Les Hobbits');

    -- Clans élémentaires : noms courts → garde supplémentaire sur la faction
    -- pour ne jamais toucher une éventuelle valeur homonyme hors Élémentaires.
    execute format('update public.%I set clan = %L where clan = %L and faction = %L', t, 'La Colère des Flammes', 'Feu',   'Élémentaires');
    execute format('update public.%I set clan = %L where clan = %L and faction = %L', t, 'Le Socle du Monde',     'Terre', 'Élémentaires');
    execute format('update public.%I set clan = %L where clan = %L and faction = %L', t, 'La Vague Sans Fin',     'Eau',   'Élémentaires');
    execute format('update public.%I set clan = %L where clan = %L and faction = %L', t, 'Le Souffle des Cimes',  'Air',   'Élémentaires');
  end loop;
end $$;

-- Garde-fou : plus aucune carte ne doit porter un ancien nom de clan.
do $$
declare
  n bigint;
begin
  select count(*) into n from public.cards
   where clan in ('La Cour Pourpre','La Cour Infernale','Le Conclave d''Ossements','Les Hobbits')
      or (faction = 'Élémentaires' and clan in ('Feu','Terre','Eau','Air'));
  if n > 0 then
    raise exception 'Migration incomplète : % carte(s) portent encore un ancien nom de clan', n;
  end if;
end $$;

-- Aperçu APRÈS (facultatif)
-- select 'cards' tbl, faction, clan, count(*) n from public.cards group by faction, clan
-- union all select 'heroes', faction, clan, count(*) from public.heroes group by faction, clan
-- union all select 'boards', faction, clan, count(*) from public.boards group by faction, clan
-- order by tbl, faction, clan;

commit;
