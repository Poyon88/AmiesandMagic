-- Refonte des clans de la faction `Nains` (affichée « Les Armées des Montagnes »)
-- et rattachement de la race Géants, qui quitte les Mercenaires.
--
-- Structure cible — un clan par race « peuple » :
--   La Forge Ardente ......... Nains
--   La Guilde des Ingénieurs . Gnomes
--   Clan des Mille Tunnels ... Kobolds   (nouveau)
--   Clan des Premiers Géants . Géants    (nouveau)
-- Golems et Machines n'ont pas de clan propre : déclarés `freeRaces` côté code,
-- ils sont accueillis par les quatre clans.
--
-- Deux clans disparaissent : « Les Gardiens de la Montagne » et
-- « Les Sentinelles d'Airain ». Sans cette migration, les 11 cartes qui les
-- portent deviendraient invalides (validateFactionClan rejette un clan inconnu
-- pour la faction).
--
-- Idempotent : chaque UPDATE est gardé par la valeur attendue. Rejouer ce
-- script est sans effet une fois appliqué.

-- 1. Les 7 cartes naines des Gardiens de la Montagne rejoignent la Forge
--    Ardente, seul clan nain conservé.
--    ids 9, 85, 152, 153, 154, 155, 160
UPDATE cards
   SET clan = 'La Forge Ardente'
 WHERE faction = 'Nains'
   AND clan = 'Les Gardiens de la Montagne';

-- 2. Les 4 cartes Golems des Sentinelles d'Airain passent SANS CLAN. Les Golems
--    étant désormais une race libre, elles restent jouables dans n'importe quel
--    deck de la faction.
--    ids 42, 159, 170, 171
UPDATE cards
   SET clan = NULL
 WHERE faction = 'Nains'
   AND clan = 'Les Sentinelles d''Airain';

-- 3. La race Géants quitte les Mercenaires pour les Armées des Montagnes. Une
--    seule carte est concernée (id 79, « Géant des Fondations »), et elle prend
--    le clan créé pour elle — sans quoi ce clan resterait vide.
UPDATE cards
   SET faction = 'Nains',
       clan = 'Clan des Premiers Géants'
 WHERE race = 'Géants'
   AND faction = 'Mercenaires';

-- Contrôles — doivent tous renvoyer 0 ligne :
--   -- plus aucune carte sur un clan supprimé
--   SELECT id, name, clan FROM cards
--    WHERE clan IN ('Les Gardiens de la Montagne', 'Les Sentinelles d''Airain');
--   -- plus aucun Géant hors des Armées des Montagnes
--   SELECT id, name, faction FROM cards
--    WHERE race = 'Géants' AND faction <> 'Nains';
