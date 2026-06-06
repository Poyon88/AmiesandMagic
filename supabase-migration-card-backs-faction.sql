-- Card Backs — Colonne faction + backfill par nom
--
-- L'écran de constitution de deck filtre les dos de cartes par faction. On ajoute
-- la colonne (nullable, comme heroes/game_boards) et on assigne une faction en
-- best-effort à partir du nom des dos existants. À revérifier / compléter via
-- l'admin (CardBackManager). Les dos sans correspondance restent nuls.
--
-- L'ordre des conditions est important : les motifs spécifiques (Elfes Noirs,
-- Dark Elf, Demon) doivent passer avant le motif générique « elfe ».
--
-- Appliquer via l'éditeur SQL Supabase ou
-- `mcp__claude_ai_Supabase__apply_migration`. Idempotent (if not exists / where null).

alter table public.card_backs
  add column if not exists faction text;

create index if not exists card_backs_faction_idx on public.card_backs (faction);

update public.card_backs set faction = case
    when name ilike '%elfes noirs%' or name ilike '%dark elf%' or name ilike '%demon%' then 'Elfes Noirs'
    when name ilike '%werewolf%' then 'Hommes-Bêtes'
    when name ilike '%vampire%' or name ilike '%undead%' or name ilike '%lich%' then 'Morts-Vivants'
    when name ilike '%elem%' then 'Élémentaires'
    when name ilike '%orcs%' then 'Orcs'
    when name ilike '%nain%' then 'Nains'
    when name ilike '%hobbit%' then 'Hobbits'
    when name ilike '%templier%' or name ilike '%orientaux%' or name ilike '%amazone%' then 'Humains'
    when name ilike '%elfe%' or name ilike '%elefe%' or name ilike '%sylvain%' or name ilike '%fées%' or name ilike '%fees%' then 'Elfes'
    else null
  end
where faction is null;
