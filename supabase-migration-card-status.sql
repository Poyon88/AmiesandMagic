-- ============================================================================
-- Statut de cycle de vie des cartes : draft / playable / retired / excluded
-- ============================================================================
--
--   draft     brouillon : invisible aux joueurs (RLS), deck-able et jouable
--             par les seuls comptes admin/testeur, entre eux.
--   playable  carte publiée, active.
--   retired   retirée PROVISOIREMENT : visible (grisée), injouable.
--   excluded  exclue DÉFINITIVEMENT : même effet que retired, état final.
--
-- Retirée/Exclue rendent INVALIDE tout deck qui les contient (les lignes
-- deck_cards restent : le deck redevient valide si la carte revient).
-- Indépendant de `discoverable` (qui ne touche que les tirages).
--
-- Verrous en base (l'enregistrement d'un deck se fait depuis le navigateur) :
--   * RLS de `cards` — un Draft n'est lisible que par admin/testeur ;
--   * déclencheur sur `deck_cards` — refuse l'ajout d'une carte indisponible ;
--   * `find_match_or_enqueue` — refuse un deck invalide, et n'apparie un deck
--     contenant un Draft qu'entre comptes admin/testeur.
-- Les parties déjà en cours vont à leur terme.

-- 1. Colonnes ---------------------------------------------------------------
-- DEFAULT 'playable' : l'existant reste jouable (rien ne change pour les
-- joueurs le jour J). Le défaut reste 'playable' VOLONTAIREMENT : c'est la
-- route /api/cards/save qui écrit 'draft' à la création. Un défaut 'draft' en
-- base aurait rendu invisibles les cartes forgées par le code déjà déployé,
-- qui ne sait pas encore les publier — migration et code se déploient séparément.
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'playable'
    CONSTRAINT cards_status_check
    CHECK (status IN ('draft', 'playable', 'retired', 'excluded')),
  ADD COLUMN IF NOT EXISTS status_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_cards_status_not_playable
  ON public.cards (status) WHERE status <> 'playable';

-- 2. Horodatage du dernier changement de statut ------------------------------
CREATE OR REPLACE FUNCTION public.set_cards_status_changed_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cards_set_status_changed_at ON public.cards;
CREATE TRIGGER cards_set_status_changed_at
  BEFORE INSERT OR UPDATE OF status ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.set_cards_status_changed_at();

-- 3. Rôles admin/testeur -----------------------------------------------------
-- SECURITY DEFINER : lue depuis la RLS de `cards`, elle ne doit pas dépendre
-- de la RLS de `profiles`.
CREATE OR REPLACE FUNCTION public.user_is_admin_or_tester(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND role IN ('admin', 'testeur')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_tester()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.user_is_admin_or_tester(auth.uid());
$$;

-- 4. RLS : les brouillons sont invisibles aux joueurs ------------------------
DROP POLICY IF EXISTS "Anon can view cards" ON public.cards;
CREATE POLICY "Anon can view cards" ON public.cards
  FOR SELECT TO anon
  USING (status <> 'draft');

DROP POLICY IF EXISTS "Anyone can view cards" ON public.cards;
CREATE POLICY "Anyone can view cards" ON public.cards
  FOR SELECT TO authenticated
  -- (SELECT …) : évalué une fois par requête (initPlan), pas par ligne.
  USING (status <> 'draft' OR (SELECT public.is_admin_or_tester()));

-- 5. Contenu d'un deck -------------------------------------------------------
-- SECURITY DEFINER : un joueur doit pouvoir savoir que le deck ADVERSE en
-- file contient un brouillon qu'il n'a pas le droit de lire.
CREATE OR REPLACE FUNCTION public.deck_has_card_status(p_deck_id integer, p_statuses text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deck_cards dc
    JOIN public.cards c ON c.id = dc.card_id
    WHERE dc.deck_id = p_deck_id AND c.status = ANY (p_statuses)
  );
$$;

-- 6. Déclencheur deck_cards : pas d'ajout d'une carte indisponible -----------
-- Ne vérifie que les lignes AJOUTÉES ou dont la carte CHANGE : un deck qui
-- contenait la carte avant son retrait reste modifiable (quantité d'une autre
-- ligne, suppression de la carte fautive).
CREATE OR REPLACE FUNCTION public.deck_cards_refuse_indisponibles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
  v_owner uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.card_id = OLD.card_id THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_status FROM public.cards WHERE id = NEW.card_id;

  IF v_status IN ('retired', 'excluded') THEN
    RAISE EXCEPTION 'Carte indisponible (retirée ou exclue) : %', NEW.card_id
      USING errcode = 'check_violation';
  END IF;

  IF v_status = 'draft' THEN
    SELECT user_id INTO v_owner FROM public.decks WHERE id = NEW.deck_id;
    IF NOT public.user_is_admin_or_tester(v_owner) THEN
      RAISE EXCEPTION 'Carte en brouillon : %', NEW.card_id
        USING errcode = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deck_cards_refuse_indisponibles ON public.deck_cards;
CREATE TRIGGER deck_cards_refuse_indisponibles
  BEFORE INSERT OR UPDATE ON public.deck_cards
  FOR EACH ROW EXECUTE FUNCTION public.deck_cards_refuse_indisponibles();

-- 7. Matchmaking -------------------------------------------------------------
-- Reprise à l'identique de la définition en base (2026-10-11), plus :
--   * refus d'un deck contenant une carte retirée/exclue ;
--   * refus d'un deck contenant un brouillon si l'appelant n'est pas
--     admin/testeur ;
--   * un deck avec brouillon n'est apparié qu'entre comptes admin/testeur, et
--     on ignore un adversaire en file dont le deck est devenu invalide.
CREATE OR REPLACE FUNCTION public.find_match_or_enqueue(p_user_id uuid, p_deck_id integer, p_format_id integer DEFAULT NULL::integer, p_stale_seconds integer DEFAULT 45)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_opponent_user_id uuid;
  v_opponent_deck_id integer;
  v_match_id uuid;
  v_existing uuid;
  v_cutoff timestamptz := now() - make_interval(secs => p_stale_seconds);
  v_me_tester boolean;
  v_my_draft boolean;
BEGIN
  -- Guard: a caller can only enqueue themselves.
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'cannot operate on another user';
  END IF;

  -- 1. Reconnection path: if we're already in a recent active match, return
  --    that immediately (covers the case where the other client paired us
  --    while our last poll was in flight).
  SELECT id INTO v_existing
  FROM matches
  WHERE status = 'active'
    AND (player1_id = p_user_id OR player2_id = p_user_id)
    AND created_at >= now() - interval '2 minutes'
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    DELETE FROM matchmaking_queue WHERE user_id = p_user_id;
    RETURN v_existing;
  END IF;

  -- 1b. Statut des cartes du deck.
  IF public.deck_has_card_status(p_deck_id, ARRAY['retired', 'excluded']) THEN
    DELETE FROM matchmaking_queue WHERE user_id = p_user_id;
    RAISE EXCEPTION 'deck contains an unavailable card'
      USING errcode = 'check_violation';
  END IF;
  v_me_tester := public.user_is_admin_or_tester(p_user_id);
  v_my_draft := public.deck_has_card_status(p_deck_id, ARRAY['draft']);
  IF v_my_draft AND NOT v_me_tester THEN
    DELETE FROM matchmaking_queue WHERE user_id = p_user_id;
    RAISE EXCEPTION 'deck contains a draft card'
      USING errcode = 'check_violation';
  END IF;

  -- 2. Sniff for a fresh opponent (no lock yet, just to know who to try).
  SELECT q.user_id, q.deck_id INTO v_opponent_user_id, v_opponent_deck_id
  FROM matchmaking_queue q
  WHERE q.user_id <> p_user_id
    AND q.last_seen_at >= v_cutoff
    AND q.format_id IS NOT DISTINCT FROM p_format_id
    AND NOT public.deck_has_card_status(q.deck_id, ARRAY['retired', 'excluded'])
    AND (
      (NOT v_my_draft AND NOT public.deck_has_card_status(q.deck_id, ARRAY['draft']))
      OR (v_me_tester AND public.user_is_admin_or_tester(q.user_id))
    )
  ORDER BY q.joined_at
  LIMIT 1;

  IF v_opponent_user_id IS NOT NULL THEN
    -- Lock both candidate rows in user_id order so two concurrent calls
    -- that found each other queue up instead of deadlocking. p_user_id may
    -- not be in the queue yet (first call) — IN handles that gracefully.
    PERFORM 1 FROM matchmaking_queue
    WHERE user_id IN (p_user_id, v_opponent_user_id)
    ORDER BY user_id
    FOR UPDATE;

    -- Re-check opponent freshness now that we hold the lock. Another tx
    -- may have claimed them or their entry may have expired between the
    -- sniff and the lock acquisition.
    PERFORM 1 FROM matchmaking_queue
    WHERE user_id = v_opponent_user_id
      AND last_seen_at >= v_cutoff;

    IF FOUND THEN
      INSERT INTO matches (player1_id, player2_id, player1_deck_id, player2_deck_id, status)
      VALUES (p_user_id, v_opponent_user_id, p_deck_id, v_opponent_deck_id, 'active')
      RETURNING id INTO v_match_id;

      DELETE FROM matchmaking_queue
      WHERE user_id IN (p_user_id, v_opponent_user_id);

      RETURN v_match_id;
    END IF;
    -- Opponent claimed by another tx between sniff and lock — fall through
    -- to enqueue self.
  END IF;

  -- 3. No match: upsert me into the queue. joined_at stays stable so FIFO
  --    ordering is preserved across reconnections; last_seen_at refreshes.
  INSERT INTO matchmaking_queue (user_id, deck_id, format_id, last_seen_at)
  VALUES (p_user_id, p_deck_id, p_format_id, now())
  ON CONFLICT (user_id) DO UPDATE
    SET deck_id = EXCLUDED.deck_id,
        format_id = EXCLUDED.format_id,
        last_seen_at = now();

  RETURN NULL;
END;
$function$;
