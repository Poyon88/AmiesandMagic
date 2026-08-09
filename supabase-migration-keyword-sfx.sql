-- Bruitages par CAPACITÉ, et par pouvoir de HÉROS.
--
-- Le jeu avait deux registres sonores et un trou entre les deux : des sons
-- globaux par évènement (`sfx_tracks`) et des sons par carte
-- (`cards.sfx_play_url` / `sfx_death_url`). Rien ne sonnait quand une capacité
-- se déclenchait — une Tempête, une Dévoration, un râle d'agonie passaient en
-- silence ou empruntaient le son générique de leur conséquence.
--
-- Miroir exact de `keyword_icons` (une icône active par capacité) : une ligne
-- par capacité, la clé est l'id du registre ABILITIES.
--
-- Idempotent : réexécutable sans risque.

create table if not exists public.keyword_sfx (
  keyword    text primary key,
  file_url   text not null,
  updated_at timestamptz not null default now()
);

comment on table public.keyword_sfx is
  'Bruitage joué quand la capacité se déclenche. `keyword` = id du registre ABILITIES (côté créature) ou id de mot-clé de sort. Vaut pour TOUTES les cartes qui portent la capacité.';

alter table public.keyword_sfx enable row level security;

-- Lecture publique : le client charge la table au démarrage pour précharger les
-- fichiers, comme il le fait déjà pour `sfx_tracks` et `keyword_icons`.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'keyword_sfx' and policyname = 'keyword_sfx_read_all'
  ) then
    create policy keyword_sfx_read_all on public.keyword_sfx for select using (true);
  end if;
end $$;

-- Écriture réservée au service_role : toutes les mutations passent par les
-- routes admin (cf. requireAdmin), jamais par le client.

-- Son du pouvoir de héros. `null` ⇒ repli sur le son global `hero_power`.
alter table public.heroes
  add column if not exists power_sfx_url text;

comment on column public.heroes.power_sfx_url is
  'Bruitage du pouvoir de ce héros. null ⇒ repli sur le son global `hero_power` de sfx_tracks.';
