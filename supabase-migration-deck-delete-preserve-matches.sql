-- Supprimer un deck ne doit plus détruire les parties qui l'ont utilisé.
--
-- Avant : `matches.player1_deck_id` / `player2_deck_id` étaient NOT NULL avec
-- une clé étrangère vers `decks` SANS clause ON DELETE. Pour pouvoir supprimer
-- un deck déjà joué, DELETE /api/decks effaçait donc toutes les parties qui le
-- référençaient — y compris une partie en cours, et les défaites du joueur —
-- et la suppression cascadait sur match_actions, match_setups, match_state et
-- match_results.
--
-- Après : la partie survit, sa référence au deck passe à NULL. Rien d'utile
-- n'est perdu sur une partie terminée : la composition jouée est figée dans
-- `match_setups` (rejeu serveur) et dans `match_deck_snapshots` (équilibrage),
-- qui recopient les cartes au lieu de pointer le deck.
--
-- La route refuse par ailleurs la suppression tant qu'une partie `waiting` ou
-- `active` référence le deck : un NULL n'apparaît donc que sur une partie
-- `finished` ou `abandoned`.
--
-- `matchmaking_queue.deck_id` passe en CASCADE : une inscription en file
-- d'attente n'a aucun sens sans son deck.
--
-- Rejouable. Les clés étrangères existantes sont retrouvées par COLONNE et non
-- par nom : leur nom d'origine n'est écrit dans aucun fichier du dépôt.

ALTER TABLE public.matches ALTER COLUMN player1_deck_id DROP NOT NULL;
ALTER TABLE public.matches ALTER COLUMN player2_deck_id DROP NOT NULL;

DO $$
DECLARE
  cible record;
  ancienne record;
BEGIN
  FOR cible IN
    SELECT * FROM (VALUES
      ('matches',           'player1_deck_id', 'matches_player1_deck_id_fkey',   'SET NULL'),
      ('matches',           'player2_deck_id', 'matches_player2_deck_id_fkey',   'SET NULL'),
      ('matchmaking_queue', 'deck_id',         'matchmaking_queue_deck_id_fkey', 'CASCADE')
    ) AS v(nom_table, colonne, nom_contrainte, action)
  LOOP
    -- Toute clé étrangère mono-colonne de cette colonne vers `decks`, quel que
    -- soit son nom (y compris celle que pose cette migration : d'où le rejeu).
    FOR ancienne IN
      SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       WHERE c.contype = 'f'
         AND c.conrelid = format('public.%I', cible.nom_table)::regclass
         AND c.confrelid = 'public.decks'::regclass
         AND array_length(c.conkey, 1) = 1
         AND a.attname = cible.colonne
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', cible.nom_table, ancienne.conname);
    END LOOP;

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.decks(id) ON DELETE %s',
      cible.nom_table, cible.nom_contrainte, cible.colonne, cible.action
    );
  END LOOP;
END $$;
