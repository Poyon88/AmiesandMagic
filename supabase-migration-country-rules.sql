-- =============================================================================
-- Regles par pays et declaration de majorite
-- =============================================================================
-- Principe : JOUER PARTOUT, VENDRE SUR LISTE BLANCHE. Le jeu gratuit reste
-- ouvert au monde entier ; chaque fonction a enjeu (achats d'or, tickets de
-- tournoi, encheres, gains en euros) s'ouvre ou se ferme pays par pays depuis
-- /admin/pays.
--
--   * country_rules : une ligne par pays REGLE. La ligne 'ZZ' vaut pour tous
--     les pays qui n'ont pas la leur (et pour un pays inconnu).
--   * profiles.adult_declared_* : declaration de majorite, recueillie une fois
--     avant le premier achat (case a cocher), datee, avec l'age minimum et le
--     pays du moment.
--   * payments.request_country : pays de CONNEXION au moment de l'achat, a
--     cote de customer_country (pays de facturation rapporte par Stripe).
--
-- Aucune fonction de paiement n'est redefinie ici. Idempotent.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS country_rules (
  country_code   TEXT PRIMARY KEY CHECK (country_code ~ '^[A-Z]{2}$'),
  gold_purchases BOOLEAN NOT NULL DEFAULT false,
  tickets        BOOLEAN NOT NULL DEFAULT false,
  auctions       BOOLEAN NOT NULL DEFAULT true,
  cash_prizes    BOOLEAN NOT NULL DEFAULT false,
  min_age        INTEGER NOT NULL DEFAULT 18 CHECK (min_age BETWEEN 13 AND 25),
  note           TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     UUID REFERENCES auth.users(id)
);

-- Lecture et ecriture par service_role uniquement (routes serveur) : RLS
-- activee, aucune policy.
ALTER TABLE country_rules ENABLE ROW LEVEL SECURITY;

-- Regle par defaut : tout ce qui touche a l'argent reel est ferme ; les
-- encheres (or du jeu uniquement) restent ouvertes.
INSERT INTO country_rules (country_code, gold_purchases, tickets, auctions, cash_prizes, note)
VALUES ('ZZ', false, false, true, false, 'Tous les autres pays')
ON CONFLICT (country_code) DO NOTHING;

-- Liste blanche de depart : Union europeenne, Royaume-Uni, Suisse.
INSERT INTO country_rules (country_code, gold_purchases, tickets, auctions, cash_prizes)
SELECT c, true, true, true, true
FROM unnest(ARRAY[
  'AT','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE','IT',
  'LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK','GB','CH'
]) AS c
ON CONFLICT (country_code) DO NOTHING;

-- Belgique : achats d'or et encheres ouverts, tickets et gains en euros fermes.
INSERT INTO country_rules (country_code, gold_purchases, tickets, auctions, cash_prizes, note)
VALUES ('BE', true, false, true, false, 'Tickets et gains fermes (jeux de hasard)')
ON CONFLICT (country_code) DO NOTHING;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS adult_declared_at      TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS adult_declared_min_age INTEGER;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS adult_declared_country TEXT;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS request_country TEXT;

COMMIT;
