-- BARÈME DU MODÈLE DE COÛT — persisté en base, partagé, unique.
--
-- Jusqu'ici les écarts au barème vivaient dans le `localStorage` du navigateur
-- (clé `am.balance.overrides.v1`). C'était un banc d'essai personnel, et ça se
-- payait : `localStorage` est cloisonné par ORIGINE, donc un coût réglé sur
-- localhost restait invisible sur le serveur dev, et réciproquement. Les
-- réglages n'étaient pas perdus, ils étaient injoignables.
--
-- Une LIGNE UNIQUE (`id = 1`) plutôt qu'une ligne par admin : un modèle de coût
-- est une référence d'équilibrage, pas une préférence. Deux barèmes concurrents
-- rendraient incomparables deux cartes créées le même jour.
--
-- Un JSONB plutôt qu'une table de valeurs : la forme stockée est exactement
-- l'objet `BalanceOverrides` que le client applique déjà (`applyBalanceOverrides`).
-- Une écriture remplace le barème ENTIER, ce qui rend « Rétablir l'origine »
-- atomique et évite qu'un réglage retiré reste collé à son ancienne valeur.
-- Corollaire assumé : deux admins qui règlent en même temps, le dernier gagne.
--
-- Ce barème ne sert qu'à CRÉER des cartes (jauge d'auteur, générateur). Le
-- moteur de jeu ne le lit jamais — les stats d'une carte sont figées à sa
-- création. Le changer ne peut donc pas faire diverger deux clients en partie.
--
-- Idempotent : réexécutable sans risque.

create table if not exists public.balance_overrides (
  id         smallint primary key default 1 check (id = 1),
  overrides  jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

comment on table public.balance_overrides is
  'Barème du modèle de coût de la forge : écarts aux constantes compilées (KEYWORDS, STAT_COST, ADDITIONAL_COST_POINTS, BUDGET, RARITIES). Ligne unique id=1, remplacée en bloc. Sert à créer des cartes, jamais à en jouer une.';

comment on column public.balance_overrides.overrides is
  'Objet BalanceOverrides : { keywords: { <libellé>: { cost, costPerX } }, stat, additional, budgetBase, rarityMultipliers }. Un barème vierge est {} — pas null.';

comment on column public.balance_overrides.updated_by is
  'Dernier admin ayant écrit. `on delete set null` : la suppression d''un compte ne doit pas emporter le barème du jeu.';

-- La ligne existe TOUJOURS : le code lit un barème, pas son absence.
insert into public.balance_overrides (id, overrides)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

alter table public.balance_overrides enable row level security;

-- AUCUNE policy, volontairement. Le client n'interroge jamais cette table en
-- direct : il passe par `/api/balance`, qui lit sous service_role après avoir
-- vérifié la session, et n'écrit qu'après `requireAdmin`. RLS active sans
-- policy = la table est muette pour les clés anon et authenticated, ce qui rend
-- l'oubli d'un contrôle côté route impossible à exploiter.
