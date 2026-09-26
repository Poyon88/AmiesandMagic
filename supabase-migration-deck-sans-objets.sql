-- OBJETS HORS DES DECKS — un objet (cards.card_type = 'item') ne se met jamais
-- dans un deck construit : on le trouve EN JEU (Trésor, Compagnons, Tuteur,
-- Sélection, Faveur…).
--
-- L'enregistrement d'un deck se fait depuis le navigateur (RLS « CRUD owner-
-- scoped » sur deck_cards) : la règle de l'interface (DeckBuilder) est donc
-- contournable, d'où ce déclencheur.
--
-- Les lignes EXISTANTES ne sont pas touchées : les decks enregistrés avant la
-- règle restent intacts, l'interface les signale et bloque leur lancement
-- jusqu'à correction. Le déclencheur ne porte que sur INSERT / UPDATE.

create or replace function public.deck_cards_refuse_objets()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.cards c where c.id = new.card_id and c.card_type = 'item') then
    raise exception 'Les objets ne se mettent pas dans un deck (carte %)', new.card_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists deck_cards_refuse_objets on public.deck_cards;
create trigger deck_cards_refuse_objets
  before insert or update of card_id on public.deck_cards
  for each row execute function public.deck_cards_refuse_objets();
