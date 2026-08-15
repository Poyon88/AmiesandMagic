-- Héros par défaut : deux niveaux de plus que la race.
--
-- `heroes.is_default` existait déjà et désigne le héros par défaut de sa RACE
-- (index partiel `heroes_one_default_per_race`). Il reste tel quel.
--
-- On ajoute les deux niveaux au-dessus : le héros qui représente son CLAN, et
-- celui qui représente sa FACTION. Trois drapeaux indépendants — un même héros
-- peut porter les trois, ou aucun.
--
-- Pourquoi trois colonnes plutôt qu'une colonne « portée » : un héros peut être
-- à la fois le visage de sa race ET celui de sa faction, ce qu'une valeur
-- unique interdirait. Le cas existe (Durgrim chez les Nains).
--
-- Idempotent : réexécutable sans risque.

alter table public.heroes
  add column if not exists is_default_clan    boolean not null default false,
  add column if not exists is_default_faction boolean not null default false;

comment on column public.heroes.is_default_clan is
  'Héros représentant son clan. Un seul par valeur de `clan` (index partiel).';
comment on column public.heroes.is_default_faction is
  'Héros représentant sa faction. Un seul par valeur de `faction` (index partiel).';

-- Unicité, sur le modèle exact de `heroes_one_default_per_race`. Les lignes
-- sans clan / sans faction sont hors index : `null` n'entre pas dans un index
-- partiel `where = true` de toute façon, mais on l'exclut explicitement pour
-- que l'intention se lise.
create unique index if not exists heroes_one_default_per_clan
  on public.heroes (clan) where (is_default_clan = true and clan is not null);

create unique index if not exists heroes_one_default_per_faction
  on public.heroes (faction) where (is_default_faction = true and faction is not null);

-- Amorçage : les factions dont UN SEUL héros porte déjà le défaut de race
-- reçoivent ce héros comme visage de faction. Ni arbitraire ni destructeur —
-- là où plusieurs candidats existent, on ne choisit pas, et l'admin tranche.
with candidats as (
  select faction, min(id) as id, count(*) as n
  from public.heroes
  where is_default = true and faction is not null and is_active = true
  group by faction
)
update public.heroes h
set is_default_faction = true
from candidats c
where h.id = c.id and c.n = 1
  and not exists (
    select 1 from public.heroes x
    where x.faction = c.faction and x.is_default_faction = true
  );
