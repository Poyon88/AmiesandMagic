-- Modèle « une faction offerte » + déblocage global des communes (2026-07-21)
-- ---------------------------------------------------------------------------
-- ⚠️ À APPLIQUER APRÈS supabase-migration-signup-username.sql, qui ajoute
--    username_confirmed / cgu_accepted_at et réécrit handle_new_user.
--
-- Changement de modèle économique. Jusqu'ici toute carte rattachée à un set
-- (`set_id != null`) était gratuite pour tout le monde, TOUTES RARETÉS
-- CONFONDUES — jusqu'aux Légendaires. Désormais :
--
--   • un nouveau joueur choisit UNE faction et en reçoit les communes ;
--   • une option payante ouvre les communes de TOUTES les factions,
--     définitivement (le prix varie dans le temps, pas le droit acquis) ;
--   • les cartes neutres (Mercenaires) restent offertes à tous : elles
--     échappent déjà à la règle mono-faction du deck builder et servent de
--     liant à tous les decks ;
--   • les raretés supérieures ne s'obtiennent plus que par la collection
--     personnelle (enchères, dons admin, futurs boosters).
--
-- Les comptes EXISTANTS conservent l'accès qu'ils avaient. Sans cette
-- précaution, des decks construits de bonne foi deviendraient injouables du
-- jour au lendemain — la pire chose qu'on puisse faire à un joueur installé.
--
-- Idempotente (add column if not exists + update conditionnel).
-- ---------------------------------------------------------------------------

begin;

-- Faction choisie à l'inscription. NULL = pas encore choisie ⇒ l'application
-- envoie le joueur sur /onboarding/faction. Volontairement du texte libre et
-- non une FK : les factions vivent dans le code (`FACTIONS` de
-- src/lib/card-engine/constants.ts), pas en base, et `cards.faction` est déjà
-- une colonne texte. Une FK ici créerait une source de vérité concurrente.
alter table public.profiles
  add column if not exists starter_faction text;

-- L'option payante. Booléen et non date d'expiration : le droit est ACQUIS
-- définitivement, seul le tarif de l'offre change avec le temps.
alter table public.profiles
  add column if not exists all_commons_unlocked boolean not null default false;

-- Grand-père : ce compte garde la règle d'avant (toute carte de set est à lui).
-- Drapeau explicite plutôt qu'un test sur created_at — auditable, et il
-- survit à un changement de date de bascule.
alter table public.profiles
  add column if not exists legacy_full_access boolean not null default false;

-- Bascule : tout ce qui existe AU MOMENT de la migration est grand-père.
-- Les comptes créés ensuite prennent le défaut `false`, donc le nouveau modèle.
-- Le `where` rend l'opération rejouable sans écraser un retrait manuel.
update public.profiles
   set legacy_full_access = true
 where legacy_full_access = false
   and created_at <= now();

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- Vérifications après application
-- ═══════════════════════════════════════════════════════════════════════
-- Tous les comptes actuels sont bien grand-père (le nouveau modèle ne doit
-- toucher personne rétroactivement) :
--   select legacy_full_access, count(*) from public.profiles group by 1;
--
-- Personne n'a de faction ni de déblocage à ce stade :
--   select count(*) from public.profiles
--    where starter_faction is not null or all_commons_unlocked;   -- 0
--
-- ═══════════════════════════════════════════════════════════════════════
-- Faisabilité du modèle — À LIRE AVANT D'OUVRIR LES INSCRIPTIONS
-- ═══════════════════════════════════════════════════════════════════════
-- Le deck builder impose mono-faction ET mono-clan, et limite une Commune à
-- 3 exemplaires (src/components/deck/DeckBuilder.tsx). Un deck légal de 50
-- cartes réclame donc AU MOINS 17 communes distinctes dans un même clan,
-- Mercenaires en appoint. Si un clan n'y arrive pas, un nouveau joueur ayant
-- choisi cette faction ne peut construire AUCUN deck.
--
--   select faction, clan, count(*) filter (where rarity = 'Commune') as communes
--     from public.cards
--    where card_type in ('creature','spell')
--    group by faction, clan
--    order by communes;
--
--   select rarity, count(*) from public.cards
--    where faction = 'Mercenaires' group by rarity;
--
-- Si des clans sont trop pauvres : forger des communes pour les combler, ou
-- élargir le socle gratuit (les communes de toute la faction sont déjà
-- offertes — c'est le clan qui contraint, pas la faction).
