-- ============================================================
-- Armies & Magic — DURCISSEMENT RLS (issu de l'audit nocturne)
-- ============================================================
-- Contexte : l'anon key est PUBLIQUE et PostgREST expose toutes les tables
-- du schéma public. Toute table sans RLS est lisible/écrivable en direct via
-- https://<ref>.supabase.co/rest/v1/<table>, EN CONTOURNANT les routes API.
-- Toutes les mutations « officielles » passent par des routes service_role
-- (qui bypassent la RLS) — donc activer la RLS ne les casse PAS.
--
-- ⚠️ AVANT D'EXÉCUTER : lancer supabase-rls-diagnostic.sql pour connaître
--    l'état réel (RLS déjà active ? policies existantes ?). Ce script est
--    idempotent (ENABLE RLS ne casse rien si déjà actif ; les policies sont
--    DROP-puis-CREATE).
-- ============================================================


-- ═══════════════════════════════════════════════════════════════════════
-- TIER A — SÛR À APPLIQUER MAINTENANT
-- Tables accédées EXCLUSIVEMENT via des routes service_role (jamais depuis
-- le navigateur — vérifié dans le code). Activer la RLS ici ne peut PAS
-- casser le client. Ferme le trou résiduel de la faille CRITICAL
-- « collections » (écriture anon directe dans user_collections).
-- ═══════════════════════════════════════════════════════════════════════

-- user_collections — la collection de cartes des joueurs (enjeu économique).
ALTER TABLE public.user_collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own collection" ON public.user_collections;
CREATE POLICY "Users read own collection"
  ON public.user_collections FOR SELECT
  USING (auth.uid() = user_id);
-- Aucune policy INSERT/UPDATE/DELETE => écritures possibles UNIQUEMENT via
-- service_role (route /api/collections, désormais admin-only). Un client anon
-- ne peut plus s'octroyer/supprimer des cartes en direct.

-- card_prints — exemplaires de séries limitées (owner_id), vendables => sensible.
ALTER TABLE public.card_prints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own prints" ON public.card_prints;
CREATE POLICY "Users read own prints"
  ON public.card_prints FOR SELECT
  USING (auth.uid() = owner_id);
-- Écritures (transfert de propriété, escrow d'enchère) via service_role only.

-- profiles — contient `role` (admin) + username/email potentiels. Sans RLS,
-- l'anon key permet d'énumérer TOUS les profils. Lecture self-only.
-- ⚠️ Vérifier au préalable qu'aucun composant NAVIGATEUR ne lit le profil
--    d'un AUTRE utilisateur (à ce jour : lectures self via `.eq('id', user.id)`,
--    usernames d'adversaires servis par des routes service_role => OK).
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);
-- Aucune policy UPDATE => le champ `role` n'est pas modifiable côté client
-- (changement de rôle uniquement via /api/collections/role, service_role+admin).


-- ═══════════════════════════════════════════════════════════════════════
-- TIER B — PROPOSÉ, À RELIRE + TESTER AVANT DE DÉ-COMMENTER
-- Ces tables sont lues/écrites DEPUIS LE NAVIGATEUR (anon key). Activer la
-- RLS sans les bonnes policies CASSERAIT le jeu. Point délicat confirmé :
-- la page de partie lit le deck de l'ADVERSAIRE côté client (decks/deck_cards/
-- matches en lecture CROSS-USER) — d'où des policies « participant du match »,
-- pas « propriétaire seul ». À valider en staging avant prod.
-- ═══════════════════════════════════════════════════════════════════════

/*  -- ⚠️ Décommenter bloc par bloc APRÈS test.

-- ---- decks : lu par soi ET par l'adversaire en partie ; écrit par soi ----
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner full access decks" ON public.decks;
CREATE POLICY "Owner full access decks" ON public.decks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- Lecture cross-user nécessaire en partie : autoriser la lecture du deck d'un
-- participant d'un match où je joue aussi.
DROP POLICY IF EXISTS "Match opponents read decks" ON public.decks;
CREATE POLICY "Match opponents read decks" ON public.decks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE (m.player1_id = auth.uid() OR m.player2_id = auth.uid())
        AND public.decks.user_id IN (m.player1_id, m.player2_id)
    )
  );

-- ---- deck_cards : idem, via l'appartenance du deck parent ----
ALTER TABLE public.deck_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Access deck_cards via deck" ON public.deck_cards;
CREATE POLICY "Access deck_cards via deck" ON public.deck_cards
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_cards.deck_id AND d.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_cards.deck_id AND d.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Match opponents read deck_cards" ON public.deck_cards;
CREATE POLICY "Match opponents read deck_cards" ON public.deck_cards
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.decks d
      JOIN public.matches m ON d.user_id IN (m.player1_id, m.player2_id)
      WHERE d.id = deck_cards.deck_id
        AND (m.player1_id = auth.uid() OR m.player2_id = auth.uid())
    )
  );

-- ---- matches : les deux participants peuvent lire ----
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants read match" ON public.matches;
CREATE POLICY "Participants read match" ON public.matches
  FOR SELECT USING (auth.uid() = player1_id OR auth.uid() = player2_id);
-- (création/mise à jour des matchs via service_role / RPC find_match_or_enqueue)

-- ---- matchmaking_queue : chacun gère sa propre ligne (+ RPC SECURITY DEFINER) --
ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own queue row" ON public.matchmaking_queue;
CREATE POLICY "Own queue row" ON public.matchmaking_queue
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---- Contenu de jeu public (lu côté client) : lecture ouverte, écriture admin ----
-- cards : lu en partie + importé par l'admin via le NAVIGATEUR (CardImporter).
-- => prévoir une policy INSERT/UPDATE admin, sinon l'import admin casse.
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read cards" ON public.cards;
CREATE POLICY "Public read cards" ON public.cards
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin write cards" ON public.cards;
CREATE POLICY "Admin write cards" ON public.cards
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );
-- NB : mieux encore, faire passer CardImporter par une route service_role et
-- retirer la policy d'écriture admin (surface d'attaque réduite).

-- game_boards / card_backs / sets : contenu lu côté client => lecture ouverte,
-- écriture via service_role (routes admin).
ALTER TABLE public.game_boards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read game_boards" ON public.game_boards;
CREATE POLICY "Public read game_boards" ON public.game_boards FOR SELECT USING (true);

ALTER TABLE public.card_backs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read card_backs" ON public.card_backs;
CREATE POLICY "Public read card_backs" ON public.card_backs FOR SELECT USING (true);

ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read sets" ON public.sets;
CREATE POLICY "Public read sets" ON public.sets FOR SELECT USING (true);

-- ---- sfx_tracks : prouvée sans RLS (supabase-migration-sfx.sql). Lue via /api/sfx
--      (service_role). Si jamais lue côté client, remplacer par USING (true). ----
ALTER TABLE public.sfx_tracks ENABLE ROW LEVEL SECURITY;
-- (aucune policy => service_role only ; ajouter un SELECT public si nécessaire)

*/  -- fin TIER B


-- ═══════════════════════════════════════════════════════════════════════
-- APRÈS APPLICATION : relancer supabase-rls-diagnostic.sql — la requête (3)
-- doit renvoir de moins en moins de tables sensibles sans RLS.
-- ═══════════════════════════════════════════════════════════════════════
