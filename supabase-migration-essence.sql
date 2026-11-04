-- ============================================================================
-- Armies & Magic — ESSENCE : forge de cartes limitées au hasard
-- ============================================================================
--
-- 2000 essence = une carte limitée tirée au hasard parmi les exemplaires
-- encore LIBRES (card_prints.owner_id IS NULL), ou très rarement un héros
-- Légendaire (hero_prints, créés ici).
--
-- Tirage en cascade, révélé dans le même ordre côté client :
--   rareté → faction → clan → carte.
--   * rareté : bandes cumulées (héros L 1/10 000, L 1/1 000, É 1/100,
--     R 1/10, sinon Peu Commune) ;
--   * faction puis clan : UNIFORMES parmi ceux qui ont encore au moins un
--     exemplaire libre dans la rareté tirée — jamais de branche vide ;
--   * rareté épuisée → on descend d'un cran (repli), jusqu'à Peu Commune ;
--     tout épuisé → refus SANS débit.
--
-- Pool tirable : cartes `playable`, hors sets « special » (leurs cartes ne
-- sont pas distribuables). Héros : `is_active` et rareté Légendaire.
--
-- Idempotente : rejouable sans effet de bord.
-- ============================================================================

-- 1. Solde ------------------------------------------------------------------
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS essence INTEGER NOT NULL DEFAULT 0;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_essence_nonneg') THEN
    ALTER TABLE wallets ADD CONSTRAINT wallets_essence_nonneg CHECK (essence >= 0);
  END IF;
END $$;

-- 2. Journal ----------------------------------------------------------------
-- Séparé de wallet_transactions : son `balance_after` désigne l'or.
CREATE TABLE IF NOT EXISTS essence_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN (
                  'admin_credit', 'admin_debit', 'craft', 'reward_tournament')),
  amount        INTEGER NOT NULL,
  essence_after INTEGER NOT NULL,
  description   TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_essence_tx_user ON essence_transactions(user_id, created_at DESC);

ALTER TABLE essence_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS essence_tx_select_own ON essence_transactions;
CREATE POLICY essence_tx_select_own ON essence_transactions
  FOR SELECT USING (user_id = (SELECT auth.uid()));

/** Mouvement atomique d'essence + ligne de journal. Un débit qui ferait passer
 *  le solde sous zéro est refusé par le CHECK. Le CHECK étant évalué sur la
 *  ligne PROPOSÉE avant ON CONFLICT, un débit passe par UPDATE (et échoue si
 *  le wallet n'existe pas) ; seul un crédit peut créer le wallet. */
CREATE OR REPLACE FUNCTION adjust_essence(
  p_user_id     UUID,
  p_amount      INTEGER,
  p_type        TEXT,
  p_description TEXT DEFAULT NULL,
  p_metadata    JSONB DEFAULT '{}',
  p_created_by  UUID DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  v_new INTEGER;
BEGIN
  IF p_amount >= 0 THEN
    INSERT INTO wallets (user_id, essence) VALUES (p_user_id, p_amount)
    ON CONFLICT (user_id) DO UPDATE SET essence = wallets.essence + p_amount
    RETURNING essence INTO v_new;
  ELSE
    UPDATE wallets SET essence = essence + p_amount WHERE user_id = p_user_id
    RETURNING essence INTO v_new;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'insufficient_essence' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO essence_transactions (user_id, type, amount, essence_after, description, metadata, created_by)
  VALUES (p_user_id, p_type, p_amount, v_new, p_description, COALESCE(p_metadata, '{}'), p_created_by);

  RETURN v_new;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- 3. Exemplaires numérotés de héros ----------------------------------------
-- `user_hero_prints` reste la source de POSSESSION lue partout ; hero_prints
-- porte la RARETÉ (qui a quel numéro, combien restent libres).
CREATE TABLE IF NOT EXISTS hero_prints (
  id           BIGSERIAL PRIMARY KEY,
  hero_id      INTEGER NOT NULL REFERENCES heroes(id) ON DELETE CASCADE,
  print_number INTEGER NOT NULL,
  max_prints   INTEGER NOT NULL,
  owner_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hero_id, print_number)
);
CREATE INDEX IF NOT EXISTS idx_hero_prints_free ON hero_prints(hero_id) WHERE owner_id IS NULL;

ALTER TABLE hero_prints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hero_prints_select_all ON hero_prints;
CREATE POLICY hero_prints_select_all ON hero_prints FOR SELECT USING (true);

/** Crée les exemplaires manquants d'un héros non Commun (1..max_prints).
 *  N'en supprime jamais : baisser max_prints ne reprend rien à personne. */
CREATE OR REPLACE FUNCTION sync_hero_prints(p_hero_id INTEGER) RETURNS VOID AS $$
  INSERT INTO hero_prints (hero_id, print_number, max_prints)
  SELECT h.id, n, h.max_prints
    FROM heroes h, generate_series(1, COALESCE(h.max_prints, 0)) AS n
   WHERE h.id = p_hero_id AND h.rarity <> 'Commune'
  ON CONFLICT (hero_id, print_number) DO NOTHING;
  UPDATE hero_prints p SET max_prints = h.max_prints
    FROM heroes h
   WHERE p.hero_id = h.id AND h.id = p_hero_id AND h.max_prints IS NOT NULL
     AND p.max_prints <> h.max_prints;
$$ LANGUAGE sql SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION trg_heroes_sync_prints() RETURNS TRIGGER AS $$
BEGIN
  PERFORM sync_hero_prints(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_heroes_sync_prints ON heroes;
CREATE TRIGGER trg_heroes_sync_prints
  AFTER INSERT OR UPDATE OF rarity, max_prints ON heroes
  FOR EACH ROW EXECUTE FUNCTION trg_heroes_sync_prints();

-- Génération initiale + rattrapage des propriétaires actuels (premiers numéros,
-- par ordre d'acquisition).
SELECT sync_hero_prints(id) FROM heroes WHERE rarity <> 'Commune';

WITH owners AS (
  SELECT u.user_id, u.hero_id, u.acquired_at,
         row_number() OVER (PARTITION BY u.hero_id ORDER BY u.acquired_at, u.id) AS rn
    FROM user_hero_prints u
    JOIN heroes h ON h.id = u.hero_id AND h.rarity <> 'Commune'
   WHERE NOT EXISTS (SELECT 1 FROM hero_prints p WHERE p.hero_id = u.hero_id AND p.owner_id = u.user_id)
)
UPDATE hero_prints p SET owner_id = o.user_id, assigned_at = o.acquired_at
  FROM owners o
 WHERE p.hero_id = o.hero_id AND p.print_number = o.rn AND p.owner_id IS NULL;

-- 4. Forge -----------------------------------------------------------------
/** Forge une carte (ou un héros) au hasard contre ESSENCE_CRAFT_COST.
 *
 *  Atomique : le débit et l'attribution vivent dans la même transaction. Les
 *  refus sont des RETURN (pas de RAISE) et ne débitent rien.
 *
 *  `p_roll` force le tirage de rareté — réservé aux tests ; la route API ne le
 *  transmet jamais (et la fonction n'est exécutable que par service_role). */
CREATE OR REPLACE FUNCTION craft_with_essence(p_user_id UUID, p_roll DOUBLE PRECISION DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  c_cost    CONSTANT INTEGER := 2000;
  v_tiers   TEXT[] := ARRAY['hero', 'Légendaire', 'Épique', 'Rare', 'Peu Commune'];
  v_essence INTEGER;
  v_roll    DOUBLE PRECISION;
  v_start   INTEGER;
  v_i       INTEGER;
  v_tier    TEXT;
  v_faction TEXT;
  v_clan    TEXT;
  v_item    INTEGER;
  v_print   BIGINT;
  v_num     INTEGER;
  v_max     INTEGER;
  v_new     INTEGER;
  v_found   BOOLEAN := false;
  v_fallback BOOLEAN := false;
BEGIN
  SELECT essence INTO v_essence FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  v_essence := COALESCE(v_essence, 0);
  IF v_essence < c_cost THEN
    RETURN jsonb_build_object('error', 'insufficient_essence', 'cost', c_cost, 'essence', v_essence);
  END IF;

  v_roll := COALESCE(p_roll, random());
  v_start := CASE
    WHEN v_roll < 0.0001 THEN 1
    WHEN v_roll < 0.0011 THEN 2
    WHEN v_roll < 0.0111 THEN 3
    WHEN v_roll < 0.1111 THEN 4
    ELSE 5 END;

  FOR v_i IN v_start..5 LOOP
    v_tier := v_tiers[v_i];

    IF v_tier = 'hero' THEN
      -- faction
      SELECT f INTO v_faction FROM (
        SELECT DISTINCT h.faction AS f
          FROM hero_prints p JOIN heroes h ON h.id = p.hero_id
         WHERE p.owner_id IS NULL AND h.rarity = 'Légendaire' AND h.is_active
      ) s ORDER BY random() LIMIT 1;
      CONTINUE WHEN NOT FOUND;
      -- clan
      SELECT c INTO v_clan FROM (
        SELECT DISTINCT h.clan AS c
          FROM hero_prints p JOIN heroes h ON h.id = p.hero_id
         WHERE p.owner_id IS NULL AND h.rarity = 'Légendaire' AND h.is_active
           AND h.faction IS NOT DISTINCT FROM v_faction
      ) s ORDER BY random() LIMIT 1;
      -- héros
      SELECT i INTO v_item FROM (
        SELECT DISTINCT h.id AS i
          FROM hero_prints p JOIN heroes h ON h.id = p.hero_id
         WHERE p.owner_id IS NULL AND h.rarity = 'Légendaire' AND h.is_active
           AND h.faction IS NOT DISTINCT FROM v_faction
           AND h.clan IS NOT DISTINCT FROM v_clan
      ) s ORDER BY random() LIMIT 1;
      -- exemplaire
      SELECT id, print_number, max_prints INTO v_print, v_num, v_max
        FROM hero_prints WHERE hero_id = v_item AND owner_id IS NULL
       ORDER BY print_number LIMIT 1 FOR UPDATE SKIP LOCKED;
      CONTINUE WHEN NOT FOUND;
    ELSE
      SELECT f INTO v_faction FROM (
        SELECT DISTINCT c.faction AS f
          FROM card_prints p JOIN cards c ON c.id = p.card_id
          LEFT JOIN sets s ON s.id = c.set_id
         WHERE p.owner_id IS NULL AND c.rarity = v_tier AND c.status = 'playable'
           AND (s.type IS NULL OR s.type <> 'special')
      ) s ORDER BY random() LIMIT 1;
      CONTINUE WHEN NOT FOUND;
      SELECT cl INTO v_clan FROM (
        SELECT DISTINCT c.clan AS cl
          FROM card_prints p JOIN cards c ON c.id = p.card_id
          LEFT JOIN sets s ON s.id = c.set_id
         WHERE p.owner_id IS NULL AND c.rarity = v_tier AND c.status = 'playable'
           AND (s.type IS NULL OR s.type <> 'special')
           AND c.faction IS NOT DISTINCT FROM v_faction
      ) s ORDER BY random() LIMIT 1;
      SELECT i INTO v_item FROM (
        SELECT DISTINCT c.id AS i
          FROM card_prints p JOIN cards c ON c.id = p.card_id
          LEFT JOIN sets s ON s.id = c.set_id
         WHERE p.owner_id IS NULL AND c.rarity = v_tier AND c.status = 'playable'
           AND (s.type IS NULL OR s.type <> 'special')
           AND c.faction IS NOT DISTINCT FROM v_faction
           AND c.clan IS NOT DISTINCT FROM v_clan
      ) s ORDER BY random() LIMIT 1;
      SELECT id, print_number, max_prints INTO v_print, v_num, v_max
        FROM card_prints WHERE card_id = v_item AND owner_id IS NULL
       ORDER BY print_number LIMIT 1 FOR UPDATE SKIP LOCKED;
      CONTINUE WHEN NOT FOUND;
    END IF;

    v_found := true;
    v_fallback := v_i > v_start;  -- v_i n'existe plus après la boucle
    EXIT;
  END LOOP;

  IF NOT v_found THEN
    RETURN jsonb_build_object('error', 'pool_empty');
  END IF;

  v_new := adjust_essence(
    p_user_id, -c_cost, 'craft', 'Forge d''essence',
    jsonb_build_object(
      'kind', CASE WHEN v_tier = 'hero' THEN 'hero' ELSE 'card' END,
      'rarity', CASE WHEN v_tier = 'hero' THEN 'Légendaire' ELSE v_tier END,
      'faction', v_faction, 'clan', v_clan, 'id', v_item,
      'print_number', v_num, 'max_prints', v_max,
      'fallback', v_fallback),
    NULL);

  IF v_tier = 'hero' THEN
    UPDATE hero_prints SET owner_id = p_user_id, assigned_at = now() WHERE id = v_print;
    INSERT INTO user_hero_prints (user_id, hero_id) VALUES (p_user_id, v_item)
    ON CONFLICT (user_id, hero_id) DO NOTHING;
  ELSE
    UPDATE card_prints SET owner_id = p_user_id, assigned_at = now() WHERE id = v_print;
  END IF;

  RETURN jsonb_build_object(
    'kind', CASE WHEN v_tier = 'hero' THEN 'hero' ELSE 'card' END,
    'rarity', CASE WHEN v_tier = 'hero' THEN 'Légendaire' ELSE v_tier END,
    'faction', v_faction,
    'clan', v_clan,
    'id', v_item,
    'print_number', v_num,
    'max_prints', v_max,
    'fallback', v_fallback,
    'essence', v_new);
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- 5. Droits : service_role uniquement (les routes API passent par lui) ------
REVOKE EXECUTE ON FUNCTION
  adjust_essence(UUID, INTEGER, TEXT, TEXT, JSONB, UUID),
  craft_with_essence(UUID, DOUBLE PRECISION),
  sync_hero_prints(INTEGER)
FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION
      adjust_essence(UUID, INTEGER, TEXT, TEXT, JSONB, UUID),
      craft_with_essence(UUID, DOUBLE PRECISION),
      sync_hero_prints(INTEGER)
    FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION
      adjust_essence(UUID, INTEGER, TEXT, TEXT, JSONB, UUID),
      craft_with_essence(UUID, DOUBLE PRECISION),
      sync_hero_prints(INTEGER)
    TO service_role;
    GRANT SELECT ON essence_transactions, hero_prints TO authenticated;
    GRANT ALL ON essence_transactions, hero_prints TO service_role;
    GRANT USAGE, SELECT ON SEQUENCE hero_prints_id_seq TO service_role;
  END IF;
END $$;
