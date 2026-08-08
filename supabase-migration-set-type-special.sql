-- Type de set : « base » (défaut, comportement historique) ou « spécial ».
--
-- Première particularité des sets spéciaux : leurs cartes sont EXCLUES des
-- tirages aléatoires et semi-aléatoires de la collection — Sélection, Sélection
-- magique, Sélection Royale, Invocation X, Invocations multiples, Déchainement,
-- Concentration, Épargne. Elles restent parfaitement jouables : on peut les
-- mettre en deck, elles se piochent et se jouent normalement. Ce qu'elles ne
-- font plus, c'est APPARAÎTRE dans une offre que le joueur n'a pas construite.
--
-- Une colonne `type` plutôt qu'un booléen `is_special` : d'autres
-- particularités viendront, et d'autres types éventuellement avec.
--
-- Cette migration ajoute AUSSI `icon_url` : une icône importée (image) à côté de
-- l'emoji. Les deux coexistent volontairement — quatre des six surfaces qui
-- affichent l'icône d'un set sont des <option> HTML, qui n'acceptent QUE du
-- texte. L'emoji y reste donc le repli, l'image sert là où c'est possible
-- (la carte en jeu, la liste d'administration).
--
-- Idempotent : réexécutable sans risque.

alter table public.sets
  add column if not exists type text not null default 'base';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sets_type_check'
  ) then
    alter table public.sets
      add constraint sets_type_check check (type in ('base', 'special'));
  end if;
end $$;

comment on column public.sets.type is
  'base = set standard ; special = ses cartes sont exclues des tirages aléatoires/semi-aléatoires de la collection (Sélection, Invocation, Déchainement, Concentration, Épargne).';

-- Les sets déjà en base gardent le comportement actuel.
update public.sets set type = 'base' where type is null;

-- Index : la requête de chargement de match ne lit que les ids des sets
-- spéciaux, et ils sont peu nombreux.
create index if not exists sets_type_idx on public.sets (type) where type <> 'base';

-- Icône IMPORTÉE (URL publique du bucket de stockage). `null` ⇒ on retombe sur
-- l'emoji de la colonne `icon`.
alter table public.sets
  add column if not exists icon_url text;

comment on column public.sets.icon_url is
  'URL publique d''une icône importée. Prioritaire sur `icon` (emoji) là où une image peut être rendue ; les <option> HTML continuent d''afficher l''emoji.';
