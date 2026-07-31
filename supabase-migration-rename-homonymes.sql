-- Lève les 9 homonymies de la table `cards`.
--
-- DÉJÀ APPLIQUÉ EN PROD le 2026-07-31 (via script service-role). Ce fichier est
-- le trait de traçabilité : rejouable tel quel sur une base restaurée.
--
-- Contexte : la forge ne vidait pas son formulaire après sauvegarde, donc une
-- seconde sauvegarde réinsérait la carte précédente à l'identique sous un
-- nouvel id (corrigé dans CardForge.tsx, cf. resetCardForm). Sur 590 cartes,
-- 9 paires partageaient un nom :
--   · 1 doublon STRICT             — Douche de météores (49/62)
--   · 4 paires ne différant que par l'alignement — Archidémon, Dîme de sang,
--     Festin Infernal, Foudre du Marteau Runique
--   · 4 vraies cartes différentes  — Garde-Foyer Dévoué (augure ≠ loyauté),
--     Zéphyr Foudroyant, Œil de la Tempête, Fée Sylvestre (créature ≠ sort)
--
-- Choix : RENOMMER plutôt que supprimer. Supprimer aurait fait tomber 4 decks
-- sous les 50 cartes exigées, et les cartes en double sont Communes (plafond
-- 3 exemplaires) donc leurs quantités ne pouvaient pas être fusionnées sans
-- dépasser la limite. Aucune ligne `deck_cards` n'est touchée : les 5 decks
-- concernés restent à 50/50.
--
-- Dans chaque paire, le nom d'origine reste sur la carte la plus ancienne ou la
-- plus utilisée ; c'est l'autre qui est renommée. Exception : « Foudre du
-- Marteau Runique », où l'on renomme la 94 — elle n'est dans aucun deck, donc
-- c'est le renommage le moins visible.
--
-- Idempotent : chaque UPDATE est gardé par le nom attendu. Rejouer ce script
-- ne fait rien si les renommages sont déjà en place.

UPDATE cards SET name = 'Pluie de Cendres'        WHERE id = 62  AND btrim(name) = 'Douche de météores';
UPDATE cards SET name = 'Seigneur des Cauchemars' WHERE id = 400 AND btrim(name) = 'Archidémon';
UPDATE cards SET name = 'Tribut de Sang'          WHERE id = 403 AND btrim(name) = 'Dîme de sang';
UPDATE cards SET name = 'Curée Infernale'         WHERE id = 398 AND btrim(name) = 'Festin Infernal';
UPDATE cards SET name = 'Sceau des Runes'         WHERE id = 94  AND btrim(name) = 'Foudre du Marteau Runique';
UPDATE cards SET name = 'Vigie de la Combe'       WHERE id = 104 AND btrim(name) = 'Garde-Foyer Dévoué';
UPDATE cards SET name = 'Zéphyr Décisif'          WHERE id = 350 AND btrim(name) = 'Zéphyr Foudroyant';
UPDATE cards SET name = 'Bourrasque Fugace'       WHERE id = 348 AND btrim(name) = 'Œil de la Tempête';
UPDATE cards SET name = 'Murmure des Sous-Bois'   WHERE id = 222 AND btrim(name) = 'Fée Sylvestre';

-- Les noms de cartes sont traduits en 7 langues (`card_translations`). Un
-- renommage rend la traduction périmée : on la supprime pour que le backfill
-- la régénère. Il ne remplit que les paires (carte, locale) manquantes, donc
-- il ne retouchera aucune autre carte.
--
--   node scripts/backfill-card-translations.mjs
--
-- Entre la suppression et le backfill, l'affichage retombe proprement sur le
-- français (localizeCard.ts : `name_display ?? name`).
DELETE FROM card_translations
 WHERE card_id IN (62, 400, 403, 398, 94, 104, 350, 348, 222);

-- Contrôle : doit renvoyer 0 ligne.
-- SELECT btrim(lower(name)) AS n, count(*), array_agg(id)
--   FROM cards GROUP BY 1 HAVING count(*) > 1;
