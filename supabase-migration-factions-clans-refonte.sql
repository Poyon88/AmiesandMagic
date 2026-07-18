-- ============================================================================
-- Refonte factions & clans — Phase B : migration des cartes existantes
-- ============================================================================
-- Réattribue faction / clan / race des cartes de public.cards selon la refonte
-- (cf. UNIVERS-ARMIES-AND-MAGIC.md et Phase A du code : constants.ts).
--
-- ⚠️ À APPLIQUER MANUELLEMENT dans le SQL Editor Supabase, EN 3 TEMPS :
--    1. Exécuter la PARTIE 0 (diagnostic) et vérifier les comptes.
--    2. Exécuter la PARTIE 1 (transaction) — inspecter, puis COMMIT ou ROLLBACK.
--    3. Exécuter la PARTIE 2 (post-check) : doit renvoyer 0 ligne partout.
--
-- Idempotent : chaque UPDATE est gardé par ses anciennes valeurs (faction/clan),
-- donc ré-exécuter le script est sans effet. Certaines cartes sont déjà
-- partiellement migrées (1 « Les Cohortes Sanglantes », 1 « La Guilde des
-- Ingénieurs », 1 race Gnomes) : les gardes gèrent ces cas.
--
-- Politique de RACE : on ne fait que REMPLIR les races nulles (COALESCE) par
-- bande de mana ; les races déjà saisies (dont Hommes-Arbres/Trolls conçus à la
-- main) sont PRÉSERVÉES. Bascule sur re-dérivation totale possible plus tard.
-- ============================================================================


-- ============================================================================
-- PARTIE 0 — DIAGNOSTIC (lecture seule ; exécuter et vérifier AVANT la Partie 1)
-- ============================================================================
select 'AVANT' as etat, faction, coalesce(clan,'(null)') as clan, count(*) as n
  from public.cards group by faction, clan order by faction, n desc;

select 'AVANT' as etat, faction, coalesce(race,'(null)') as race, count(*) as n
  from public.cards group by faction, race order by faction, n desc;


-- ============================================================================
-- PARTIE 1 — MIGRATION (transaction ; inspecter puis COMMIT ; sinon ROLLBACK)
-- ============================================================================
begin;

-- ── 1) Elfes — renommage des clans (scopé faction) ────────────────────────────
update public.cards set clan = 'Les Sylvains'         where faction = 'Elfes' and clan in ('Sylvains', 'Elfes des Mers');
update public.cards set clan = 'Les Hauts-Elfes'      where faction = 'Elfes' and clan = 'Hauts-Elfes';
update public.cards set clan = 'La Forêt d''Émeraude' where faction = 'Elfes' and clan = 'Émeraudes';
-- Cimes Éternelles dissous (Aigles Géants = race libre) : on vide le clan.
update public.cards set clan = null                   where faction = 'Elfes' and clan = 'Cimes Éternelles';

-- ── 2) Nains — clans (anciens noms + clans par race) ─────────────────────────
update public.cards set clan = 'Les Gardiens de la Montagne' where faction = 'Nains' and clan in ('Montagnes', 'Collines');
update public.cards set clan = 'La Forge Ardente'            where faction = 'Nains' and clan = 'Lave';
update public.cards set clan = 'Les Sentinelles d''Airain'   where faction = 'Nains' and race = 'Golems';
update public.cards set clan = 'La Guilde des Ingénieurs'    where faction = 'Nains' and race = 'Gnomes';

-- ── 3) Humains — split en 3 factions + clans ─────────────────────────────────
--    Restent Humains : Nordiques, Templiers, Amazones.
update public.cards set clan = 'Le Royaume du Nord'    where faction = 'Humains' and clan = 'Nordiques';
update public.cards set clan = 'L''Ordre de l''Aube'   where faction = 'Humains' and clan = 'Templiers';
update public.cards set clan = 'Les Guerrières du Vent' where faction = 'Humains' and clan = 'Amazones';
--    Migrent vers l'Empire du Milieu / les Royaumes du Soleil.
update public.cards set faction = 'EmpireDuMilieu',  clan = 'Les Lames de l''Ombre'  where faction = 'Humains' and clan = 'Orientaux';
update public.cards set faction = 'RoyaumesDuSoleil', clan = 'Les Enfants du Soleil'  where faction = 'Humains' and clan = 'Incas';
update public.cards set faction = 'RoyaumesDuSoleil', clan = 'Les Seigneurs des Dunes' where faction = 'Humains' and clan = 'Touaregs';

-- ── 4) Hobbits (faction absorbée) → Elfes, clan « Les Hobbits » ───────────────
--    Race nulle comblée par mana (>=6 → Hommes-Arbres) ; races existantes gardées.
update public.cards
   set race    = coalesce(race, case when mana_cost >= 6 then 'Hommes-Arbres' else 'Hobbits' end),
       faction = 'Elfes',
       clan    = 'Les Hobbits'
 where faction = 'Hobbits';

-- ── 5) Hommes-Bêtes — clan DÉRIVÉ DE LA RACE (anciens clans dissous) ──────────
update public.cards set clan = 'La Cour Pourpre'      where faction = 'Hommes-Bêtes' and race = 'Hommes-Félins';
update public.cards set clan = 'Les Enfants de la Lune' where faction = 'Hommes-Bêtes' and race in ('Hommes-Ours', 'Hommes-Loups');
update public.cards set clan = 'La Harde Sauvage'     where faction = 'Hommes-Bêtes' and race in ('Centaures', 'Hommes-Cerfs');
update public.cards set clan = 'Le Pacte des Griffes' where faction = 'Hommes-Bêtes' and race in ('Hommes-Chiens', 'Hommes-Renards');
-- Mimis : « Les Mignons » est un clan bonus INERTE (hors refonte) → clan vidé
-- (les Mimis restent jouables sans clan jusqu'à l'activation ultérieure).
update public.cards set clan = null where faction = 'Hommes-Bêtes' and race = 'Mimis';
-- Restant (race nulle) portant un ANCIEN clan dissous → vidé.
update public.cards set clan = null
 where faction = 'Hommes-Bêtes'
   and clan in ('Forêt', 'Toundra', 'Savane', 'Jungle', 'Mignons', 'Pacte des Griffes');

-- ── 6) Morts-Vivants — clan DÉRIVÉ DE LA RACE (étaient tous null) ─────────────
update public.cards set clan = 'Les Rangs Silencieux'   where faction = 'Morts-Vivants' and race in ('Squelettes', 'Zombies');
update public.cards set clan = 'Le Voile Hurlant'       where faction = 'Morts-Vivants' and race in ('Spectres', 'Banshees');
update public.cards set clan = 'La Cour Écarlate'       where faction = 'Morts-Vivants' and race = 'Vampires';
update public.cards set clan = 'Le Conclave d''Ossements' where faction = 'Morts-Vivants' and race = 'Lich';

-- ── 7) Orcs (faction absorbée) → Elfes Noirs (clan posé à l'étape 8 par race) ─
--    Race nulle comblée par mana : <3 Gobelins, >=6 Trolls, sinon Orcs.
update public.cards
   set race    = coalesce(race, case when mana_cost < 3 then 'Gobelins'
                                     when mana_cost >= 6 then 'Trolls'
                                     else 'Orcs' end),
       faction = 'Elfes Noirs'
 where faction = 'Orcs';

-- ── 8) Elfes Noirs (Légions du Chaos) — clan DÉRIVÉ DE LA RACE ────────────────
--    Couvre les cartes natives ET les ex-Orcs (étape 7). Ancien clan « Abysses
--    souterrains » / « Cités de cendres » / « Forêt maudite » dissous.
update public.cards set clan = 'La Cour Infernale'      where faction = 'Elfes Noirs' and race = 'Démons';
update public.cards set clan = 'La Forêt Maudite'       where faction = 'Elfes Noirs' and race in ('Elfes Corrompus', 'Araignées Géantes');
update public.cards set clan = 'Les Cohortes Sanglantes' where faction = 'Elfes Noirs' and race in ('Orcs', 'Gobelins', 'Trolls', 'Wargs');
update public.cards set clan = 'La Garde Noire'         where faction = 'Elfes Noirs' and race = 'Guerriers du Chaos';
-- Cartes Elfes Noirs à race nulle portant encore un ancien clan transversal → vidé.
update public.cards set clan = null
 where faction = 'Elfes Noirs'
   and clan in ('Abysses souterrains', 'Forêt maudite', 'Cités de cendres');

-- ── (optionnel) Anomalie PRÉEXISTANTE, indépendante de la refonte ────────────
--    Carte #448 « Nécromancien » : faction Morts-Vivants mais race « Humains »
--    (jamais une race valide de cette faction). La migration NE la touche pas.
--    Décommentez pour la rendre valide (race vidée — un mort-vivant sans race) :
-- update public.cards set race = null where id = 448 and faction = 'Morts-Vivants' and race = 'Humains';

-- Inspecter le résultat AVANT de valider :
select 'APRES' as etat, faction, coalesce(clan,'(null)') as clan, count(*) as n
  from public.cards group by faction, clan order by faction, n desc;

-- ▶ Si tout est correct :  COMMIT;
-- ▶ Sinon               :  ROLLBACK;
commit;


-- ============================================================================
-- PARTIE 2 — POST-CHECK (lecture seule ; DOIT renvoyer 0 ligne à chaque bloc)
-- ============================================================================
-- 2a. Plus aucune faction absorbée :
select 'faction orpheline' as probleme, faction, count(*) n
  from public.cards where faction in ('Orcs', 'Hobbits') group by faction;

-- 2b. Plus aucun ancien nom de clan dissous/renommé :
select 'clan périmé' as probleme, faction, clan, count(*) n
  from public.cards
 where clan in ('Sylvains','Hauts-Elfes','Elfes des Mers','Émeraudes','Cimes Éternelles',
                'Montagnes','Collines','Lave',
                'Nordiques','Templiers','Amazones','Orientaux','Incas','Touaregs',
                'Plaines','Marais','Rivièrains','Landes',
                'Forêt','Toundra','Savane','Jungle','Mignons','Pacte des Griffes',
                'Abysses souterrains','Forêt maudite','Cités de cendres',
                'Les Mignons')
 group by faction, clan order by faction;

-- 2c. Vue finale (contrôle visuel : toutes les valeurs doivent être « nouvelles ») :
--     select faction, coalesce(clan,'(null)') clan, count(*) n
--       from public.cards group by faction, clan order by faction, n desc;
