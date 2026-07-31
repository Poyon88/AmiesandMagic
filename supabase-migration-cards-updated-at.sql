-- Ajoute `updated_at` à la table `cards`, maintenu automatiquement par trigger.
--
-- Motivation : le 2026-07-31, deux « Archidémon » aux règles strictement
-- identiques (ids 395 et 400) ont été découverts en base. Le diagnostic a dû
-- se contenter de raisonner sur le code, car la table ne portait que
-- `created_at` : impossible de distinguer « la carte 395 a été modifiée après
-- coup » de « la carte 400 est née en double ». Cette colonne rend la question
-- tranchable en une requête.
--
-- La cause racine (la forge ne vidait pas son formulaire après sauvegarde,
-- donc la sauvegarde suivante réinsérait la carte précédente à l'identique)
-- est corrigée par ailleurs dans CardForge.tsx ; cette migration ne sert qu'à
-- l'observabilité future.

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Rétro-remplissage : sans historique de modification, la seule valeur
-- honnête pour les lignes existantes est leur date de création. On évite
-- ainsi de faire croire que 588 cartes ont été modifiées le jour de la
-- migration.
UPDATE cards
   SET updated_at = created_at
 WHERE updated_at > created_at;

CREATE OR REPLACE FUNCTION set_cards_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cards_set_updated_at ON cards;

CREATE TRIGGER cards_set_updated_at
  BEFORE UPDATE ON cards
  FOR EACH ROW
  EXECUTE FUNCTION set_cards_updated_at();

COMMENT ON COLUMN cards.updated_at IS
  'Date de dernière modification, maintenue par le trigger cards_set_updated_at. Égale à created_at pour les lignes jamais modifiées depuis la migration du 2026-07-31.';
