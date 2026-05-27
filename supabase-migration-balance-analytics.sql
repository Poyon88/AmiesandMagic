-- Migration: Balance Analytics — track winrate per faction / race / clan / card / hero / ability
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
--
-- Background:
--   Aucun tracking de résultats de parties n'existe aujourd'hui. Cette migration
--   ajoute deux tables alimentées automatiquement à la fin de chaque partie
--   (trigger sur matches), à partir desquelles le module admin /admin/analytics
--   calcule un winrate pondéré pour chaque entité du jeu.
--
--   Formule du winrate pondéré : pour chaque entité E apparaissant dans un deck
--   en c copies, on compte +c au compteur wins (resp. losses) si le deck a
--   gagné (resp. perdu). winrate = wins / (wins + losses).
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. match_results : 1 ligne par partie terminée (1:1 avec matches)
-- ---------------------------------------------------------------------------
create table if not exists public.match_results (
  match_id uuid primary key references public.matches(id) on delete cascade,
  winner_id uuid not null,
  loser_id uuid not null,
  duration_seconds int,
  finished_at timestamptz not null default now()
);

create index if not exists match_results_finished_idx
  on public.match_results (finished_at desc);

-- ---------------------------------------------------------------------------
-- 2. match_deck_snapshots : 2 lignes par partie (un par joueur), composition
--    initiale du deck au moment où la partie s'est terminée.
-- ---------------------------------------------------------------------------
create table if not exists public.match_deck_snapshots (
  id bigserial primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null,
  deck_id uuid,
  hero_id uuid,
  is_winner boolean not null,
  cards jsonb not null default '[]'::jsonb,
  primary_faction text,
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create index if not exists match_deck_snapshots_match_idx
  on public.match_deck_snapshots (match_id);
create index if not exists match_deck_snapshots_created_idx
  on public.match_deck_snapshots (created_at desc);
create index if not exists match_deck_snapshots_hero_idx
  on public.match_deck_snapshots (hero_id);
create index if not exists match_deck_snapshots_primary_faction_idx
  on public.match_deck_snapshots (primary_faction);

-- ---------------------------------------------------------------------------
-- 3. Fonction de capture : appelée par le trigger ci-dessous quand une partie
--    bascule en 'finished'. Idempotente grâce aux ON CONFLICT DO NOTHING.
--    Peut aussi être appelée manuellement pour backfill : SELECT capture_match_result_for(match_id).
-- ---------------------------------------------------------------------------
create or replace function public.capture_match_result_for(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  p1_hero uuid;
  p2_hero uuid;
  p1_cards jsonb;
  p2_cards jsonb;
  p1_faction text;
  p2_faction text;
begin
  select * into m from public.matches where id = p_match_id;
  if m.id is null or m.status <> 'finished' or m.winner_id is null then
    return;
  end if;

  select hero_id into p1_hero from public.decks where id = m.player1_deck_id;
  select hero_id into p2_hero from public.decks where id = m.player2_deck_id;

  select coalesce(jsonb_agg(jsonb_build_object('card_id', card_id, 'copies', quantity)), '[]'::jsonb)
    into p1_cards
    from public.deck_cards where deck_id = m.player1_deck_id;
  select coalesce(jsonb_agg(jsonb_build_object('card_id', card_id, 'copies', quantity)), '[]'::jsonb)
    into p2_cards
    from public.deck_cards where deck_id = m.player2_deck_id;

  select c.faction into p1_faction
    from public.deck_cards dc
    join public.cards c on c.id = dc.card_id
    where dc.deck_id = m.player1_deck_id and c.faction is not null
    group by c.faction
    order by sum(dc.quantity) desc
    limit 1;
  select c.faction into p2_faction
    from public.deck_cards dc
    join public.cards c on c.id = dc.card_id
    where dc.deck_id = m.player2_deck_id and c.faction is not null
    group by c.faction
    order by sum(dc.quantity) desc
    limit 1;

  insert into public.match_results (match_id, winner_id, loser_id, duration_seconds, finished_at)
  values (
    m.id,
    m.winner_id,
    case when m.winner_id = m.player1_id then m.player2_id else m.player1_id end,
    case when m.finished_at is not null and m.created_at is not null
      then extract(epoch from (m.finished_at - m.created_at))::int
      else null end,
    coalesce(m.finished_at, now())
  )
  on conflict (match_id) do nothing;

  insert into public.match_deck_snapshots (match_id, player_id, deck_id, hero_id, is_winner, cards, primary_faction)
  values
    (m.id, m.player1_id, m.player1_deck_id, p1_hero, m.winner_id = m.player1_id, p1_cards, p1_faction),
    (m.id, m.player2_id, m.player2_deck_id, p2_hero, m.winner_id = m.player2_id, p2_cards, p2_faction)
  on conflict (match_id, player_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Trigger : à la transition status -> 'finished', capture automatique
-- ---------------------------------------------------------------------------
create or replace function public.tg_capture_match_result()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'finished' and (old.status is distinct from 'finished') and new.winner_id is not null then
    perform public.capture_match_result_for(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_capture_match_result on public.matches;
create trigger trg_capture_match_result
  after update on public.matches
  for each row execute function public.tg_capture_match_result();

-- ---------------------------------------------------------------------------
-- 5. RLS — seul service_role lit (les API admin passent par la service key)
-- ---------------------------------------------------------------------------
alter table public.match_results enable row level security;
alter table public.match_deck_snapshots enable row level security;
-- Aucune policy SELECT publique : par défaut RLS bloque tout sauf service_role.
