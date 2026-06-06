-- Deck Formats — Matrice 2×2 (Mode × Étendue)
--
-- Remplace les 4 anciens formats set-based (standard / etendu / variable /
-- basique) par les 4 combinaisons de la matrice :
--   Mode    : classique (Communes uniquement) | expert (toutes raretés)
--   Étendue : standard (rotation ~2 ans par carte) | etendu (toutes éditions)
--
-- Les 4 lignes existantes (ids 1–4) sont réutilisées en place pour préserver la
-- FK decks.format_id. Le mapping a été choisi pour que les decks déjà
-- enregistrés restent légaux (etendu -> expert-etendu, le plus permissif).
-- La légalité est désormais dérivée de la rareté + date de la carte
-- (src/lib/game/format-legality.ts), la table format_sets n'est plus utilisée.
--
-- Appliquer via l'éditeur SQL Supabase ou
-- `mcp__claude_ai_Supabase__apply_migration`. Idempotent (UPDATE par id).

update public.formats set
  code = case id
    when 1 then 'expert-standard'
    when 2 then 'expert-etendu'
    when 3 then 'classique-etendu'
    when 4 then 'classique-standard'
  end,
  name = case id
    when 1 then 'Expert · Standard'
    when 2 then 'Expert · Étendu'
    when 3 then 'Classique · Étendu'
    when 4 then 'Classique · Standard'
  end,
  description = case id
    when 1 then 'Toutes raretés (plafonnées par les slots), cartes éditées il y a moins de ~2 ans.'
    when 2 then 'Toutes raretés (plafonnées par les slots), toutes éditions depuis le début du jeu.'
    when 3 then 'Uniquement les cartes Communes, toutes éditions depuis le début du jeu.'
    when 4 then 'Uniquement les cartes Communes, cartes éditées il y a moins de ~2 ans.'
  end,
  is_active = true
where id in (1, 2, 3, 4);
