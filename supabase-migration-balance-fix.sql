-- Fix Balance Analytics : hero_id et deck_id sont des bigint, pas des uuid.
-- Safe to re-run.

-- 1. Corriger les colonnes (table vide)
drop index if exists public.match_deck_snapshots_hero_idx;
alter table public.match_deck_snapshots
  alter column hero_id type bigint using null::bigint,
  alter column deck_id type bigint using null::bigint;
create index if not exists match_deck_snapshots_hero_idx
  on public.match_deck_snapshots (hero_id);

-- 2. Recreer la fonction avec les bons types (p1_hero/p2_hero en bigint)
create or replace function public.capture_match_result_for(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  p1_hero bigint;
  p2_hero bigint;
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

-- 3. Backfill des parties deja terminees
select public.capture_match_result_for(id)
from public.matches
where status = 'finished' and winner_id is not null;
