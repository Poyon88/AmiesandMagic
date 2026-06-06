-- Heroes — Backfill de la faction depuis la race
--
-- L'écran de constitution de deck filtre désormais strictement les héros par
-- faction (plus de héros neutres). Les héros plus anciens utilisaient des codes
-- de race anglais (elves, dwarves, …) sans faction renseignée : on la déduit ici
-- du code de race, de façon cohérente avec les héros déjà classés.
--
-- Note : 'giants' -> 'Mercenaires' (qui n'est pas une faction de deck), donc ce
-- héros restera masqué dans le builder ; à reclasser manuellement au besoin.
-- Les héros utilisant déjà des races françaises (Elfes, Hobbits, …) ou ayant
-- déjà une faction ne sont pas touchés.
--
-- Appliquer via l'éditeur SQL Supabase ou
-- `mcp__claude_ai_Supabase__apply_migration`. Idempotent (where faction is null).

update public.heroes set faction = case race
    when 'elves'        then 'Elfes'
    when 'dwarves'      then 'Nains'
    when 'halflings'    then 'Hobbits'
    when 'humans'       then 'Humains'
    when 'beastmen'     then 'Hommes-Bêtes'
    when 'dark_elves'   then 'Elfes Noirs'
    when 'orcs_goblins' then 'Orcs'
    when 'undead'       then 'Morts-Vivants'
    when 'giants'       then 'Mercenaires'
  end
where faction is null
  and race in ('elves','dwarves','halflings','humans','beastmen','dark_elves','orcs_goblins','undead','giants');
