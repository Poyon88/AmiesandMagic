-- Multilinguisme : traductions par carte (nom + ambiance).
-- Additif : la table `cards` reste la source FR (aucune colonne modifiée).
-- FR n'est JAMAIS stocké ici — le fallback d'affichage = la ligne `cards`.
-- effect_text N'EST PAS traduit par le pipeline (reconstruit à l'affichage à
-- partir des descriptions de mots-clés déjà traduites) ; la colonne existe
-- uniquement pour les rares cartes à prose libre, éditables à la main.

create table if not exists public.card_translations (
  card_id     bigint      not null references public.cards(id) on delete cascade,
  locale      text        not null check (locale in ('en','es','de','it','pt')),
  name        text,
  flavor_text text,
  effect_text text,
  source      text        not null default 'ai' check (source in ('ai','manual')),
  updated_at  timestamptz not null default now(),
  primary key (card_id, locale)
);

create index if not exists card_translations_locale_idx
  on public.card_translations (locale);

-- RLS : lecture publique (l'affichage des cartes est public), écritures via
-- routes service_role uniquement (règle CLAUDE.md : toutes les mutations
-- passent par des routes service_role qui contournent RLS).
alter table public.card_translations enable row level security;

drop policy if exists card_translations_public_read on public.card_translations;
create policy card_translations_public_read
  on public.card_translations
  for select
  using (true);
