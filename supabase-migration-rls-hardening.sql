-- ============================================================
-- Armies & Magic — DURCISSEMENT RLS (audit nocturne, révisé 2026-07-07)
-- ============================================================
-- MISE À JOUR après diagnostic sur la base de PROD (supabase-rls-diagnostic.sql) :
-- contrairement à ce que laissait craindre l'audit statique (qui ne voit que le
-- repo), la RLS est en réalité ACTIVÉE SUR TOUTES les tables du schéma public,
-- avec des policies globalement correctes (owner-scoped + participant-aware pour
-- la lecture du deck adverse). Les policies avaient été créées dans le dashboard,
-- d'où leur absence des fichiers SQL du repo.
--
-- => Il ne restait donc PAS de table sans RLS. Le diagnostic a en revanche
--    révélé UNE vraie faille (invisible côté code) : une escalade de privilège
--    via les privilèges de COLONNE sur `profiles`. C'est l'objet de ce fichier.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════════════
-- 🔴 CRITICAL — Escalade de privilège via profiles.role
-- ═══════════════════════════════════════════════════════════════════════
-- Constat (vérifié en prod) :
--   • RLS policy UPDATE de `profiles` = USING/WITH CHECK (auth.uid() = id)
--     → autorise un user à modifier SA PROPRE ligne, mais la RLS est
--       par LIGNE, pas par COLONNE.
--   • Le rôle `authenticated` possède le privilège UPDATE sur la colonne `role`.
--   • Aucun trigger n'interdit le changement de `role`.
-- Conséquence : tout compte connecté pouvait s'auto-promouvoir admin via
--   supabase.from('profiles').update({ role: 'admin' }).eq('id', myId)
-- et obtenir l'accès à toutes les routes admin (wallet, octroi de cartes, ban…).
--
-- Correctif : retirer aux clients le droit d'écrire sur `profiles`. AUCUN code
-- client ne met à jour profiles (vérifié : toutes les écritures — role & username
-- — passent par des routes service_role : /api/admin/players, /api/collections/role),
-- donc ce REVOKE ne casse rien. service_role bypasse les grants.

REVOKE UPDATE ON public.profiles FROM authenticated, anon;

-- Vérification (doit renvoyer 0 ligne) :
--   SELECT grantee, column_name FROM information_schema.column_privileges
--   WHERE table_schema='public' AND table_name='profiles'
--     AND privilege_type='UPDATE' AND grantee IN ('authenticated','anon');
--
-- Si un jour l'app doit permettre l'édition self-service du username côté client,
-- ré-accorder UNIQUEMENT cette colonne (jamais `role`) :
--   GRANT UPDATE (username) ON public.profiles TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- 🟢 LOW — Expositions en LECTURE (optionnel, à arbitrer)
-- ═══════════════════════════════════════════════════════════════════════
-- Ces policies exposent des données peu sensibles à tout compte connecté.
-- Décommenter si l'on veut resserrer (vérifier au préalable qu'aucune UI ne
-- dépend de la lecture cross-user concernée).

-- profiles : « Anyone can view profiles » (SELECT true) → tout authentifié lit
-- tous les profils (username, role). Acceptable dans un jeu (usernames semi-
-- publics) ; à resserrer seulement si `profiles` gagne des colonnes PII.
--   -- DROP POLICY "Anyone can view profiles" ON public.profiles;
--   -- CREATE POLICY "Users read own profile" ON public.profiles
--   --   FOR SELECT USING (auth.uid() = id);

-- card_prints : « Authenticated users can read card_prints » (SELECT true) →
-- tout authentifié voit tous les exemplaires (IDOR lecture, comme le GET
-- /api/collections). Sans impact écriture. Laisser si le jeu en a besoin.


-- ═══════════════════════════════════════════════════════════════════════
-- ✅ VÉRIFIÉ SAIN au diagnostic (aucune action) :
--   • RLS activée sur les 25 tables public.
--   • user_collections : SELECT self-only, AUCUNE policy d'écriture → écriture
--     anon directe impossible (le trou résiduel du CRITICAL collections est
--     bien fermé côté DB, en plus du fix API requireAdmin).
--   • wallets / wallet_transactions : SELECT self-only, écriture service_role.
--   • decks / deck_cards : CRUD owner-scoped + policy participant-aware pour
--     lire le deck de l'adversaire en partie (design correct).
--   • matches / matchmaking_queue : create/update/delete scoped auth.uid().
--   • match_results / match_deck_snapshots / sfx_tracks / token_templates :
--     RLS on + 0 policy = deny total pour l'anon, accès service_role only.
-- ═══════════════════════════════════════════════════════════════════════
