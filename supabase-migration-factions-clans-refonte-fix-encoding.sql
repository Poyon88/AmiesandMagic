-- ============================================================================
-- Refonte factions & clans — CORRECTIF d'encodage (Phase B bis)
-- ============================================================================
-- La première migration a été COLLÉE avec un UTF-8 corrompu (mojibake) :
--   (a) les valeurs de clan accentuées ont été stockées corrompues
--       (« La For√™t Maudite » au lieu de « La Forêt Maudite »), et
--   (b) les UPDATE dont le WHERE contenait un accent (faction='Hommes-Bêtes',
--       clan='Émeraudes', race='Démons') n'ont RIEN matché → non migrés.
--
-- Ce script est 100 % ASCII : tous les accents sont produits via chr() côté
-- serveur, donc AUCUN octet non-ASCII ne transite par l'éditeur → immunisé au
-- mojibake. Idempotent (affectations par faction/race). Rejouable sans danger.
--
--   chr(233)=é   chr(232)=è   chr(234)=ê   chr(201)=É   chr(39)=' (apostrophe)
--
-- À exécuter dans le SQL Editor (bloc begin…commit), puis contrôle visuel.
-- ============================================================================

begin;

-- ── 1) Clans accentués MOJIBAKÉS → réécrits correctement (ciblés par race) ────
-- Elfes Noirs : « La Forêt Maudite » (Elfes Corrompus + Araignées Géantes)
update public.cards
   set clan = 'La For' || chr(234) || 't Maudite'
 where faction = 'Elfes Noirs'
   and race in ('Elfes Corrompus', 'Araign' || chr(233) || 'es G' || chr(233) || 'antes');

-- Morts-Vivants : « La Cour Écarlate » (Vampires)
update public.cards
   set clan = 'La Cour ' || chr(201) || 'carlate'
 where faction = 'Morts-Vivants' and race = 'Vampires';

-- Nains : « La Guilde des Ingénieurs » (Gnomes)
update public.cards
   set clan = 'La Guilde des Ing' || chr(233) || 'nieurs'
 where faction = 'Nains' and race = 'Gnomes';

-- Humains : « Les Guerrières du Vent » (ex-Amazones ; ciblé par préfixe ASCII)
update public.cards
   set clan = 'Les Guerri' || chr(232) || 'res du Vent'
 where faction = 'Humains' and clan like 'Les Guerri%';

-- ── 2) UPDATE non-matchés à cause d'un WHERE accentué → rejoués ───────────────
-- Elfes / Fées : clan « Émeraudes » → « La Forêt d'Émeraude »
update public.cards
   set clan = 'La For' || chr(234) || 't d' || chr(39) || chr(201) || 'meraude'
 where faction = 'Elfes' and clan = chr(201) || 'meraudes';

-- Elfes Noirs / Démons → « La Cour Infernale » (étaient restés sans clan)
update public.cards
   set clan = 'La Cour Infernale'
 where faction = 'Elfes Noirs' and race = 'D' || chr(233) || 'mons';

-- ── 3) Hommes-Bêtes : clan DÉRIVÉ DE LA RACE (rien n'avait migré) ─────────────
--    (faction 'Hommes-Bêtes' construite en ASCII via chr(234))
update public.cards set clan = 'La Cour Pourpre'
 where faction = 'Hommes-B' || chr(234) || 'tes' and race = 'Hommes-F' || chr(233) || 'lins';

update public.cards set clan = 'Les Enfants de la Lune'
 where faction = 'Hommes-B' || chr(234) || 'tes' and race in ('Hommes-Ours', 'Hommes-Loups');

update public.cards set clan = 'La Harde Sauvage'
 where faction = 'Hommes-B' || chr(234) || 'tes' and race in ('Centaures', 'Hommes-Cerfs');

update public.cards set clan = 'Le Pacte des Griffes'
 where faction = 'Hommes-B' || chr(234) || 'tes' and race in ('Hommes-Chiens', 'Hommes-Renards');

-- Mimis : clan bonus « Les Mignons » inerte → clan vidé.
update public.cards set clan = null
 where faction = 'Hommes-B' || chr(234) || 'tes' and race = 'Mimis';

-- Anciens clans transversaux résiduels (race nulle/non mappée) → vidés.
update public.cards set clan = null
 where faction = 'Hommes-B' || chr(234) || 'tes'
   and clan in ('For' || chr(234) || 't', 'Toundra', 'Savane', 'Jungle', 'Mignons', 'Pacte des Griffes');

-- Contrôle visuel avant validation (toutes les valeurs doivent être « nouvelles »
-- et correctement accentuées) :
select faction, coalesce(clan, '(null)') as clan, count(*) as n
  from public.cards group by faction, clan order by faction, n desc;

-- ▶ Si correct : COMMIT;  ▶ sinon : ROLLBACK;
commit;
