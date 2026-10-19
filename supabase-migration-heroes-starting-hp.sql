-- Heroes — PV de départ par héros
--
-- Levier d'équilibrage : un pouvoir héroïque plus fort se paie de PV en moins,
-- un pouvoir plus faible se compense de PV en plus. Les PV de départ sont aussi
-- le MAXIMUM du héros : tous ses soins y sont plafonnés (moteur, soignerHeros).
--
-- Additive : tous les héros existants restent à 30, la valeur historique
-- (HERO_MAX_HP). Bornes 20–40, également contrôlées par l'API.

alter table public.heroes
  add column if not exists starting_hp integer not null default 30;

alter table public.heroes
  drop constraint if exists heroes_starting_hp_range;
alter table public.heroes
  add constraint heroes_starting_hp_range check (starting_hp between 20 and 40);

comment on column public.heroes.starting_hp is
  'PV de départ (et maximum) du héros, entre 20 et 40 ; 30 par défaut.';
