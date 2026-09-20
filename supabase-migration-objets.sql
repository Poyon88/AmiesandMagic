-- OBJETS — troisième type de carte (lot 1 : le socle).
--
-- Un objet est une carte d'équipement : elle se lance pour son coût en mana,
-- se pose sur la table où elle occupe une des places du plateau, et s'équipe
-- ensuite sur une créature alliée pour un second coût. Elle est INERTE tant
-- qu'elle n'équipe personne — ni attaquable, ni détruite par les effets qui
-- visent les unités, et aucune aura ni aucun comptage ne la voit.
--
-- Ce lot n'ouvre QUE le type et ses contraintes. Le coût d'équipement
-- (`equip_cost`), le lien porteur↔objet et les capacités portées arrivent avec
-- les lots suivants, chacun avec sa migration.
--
-- AUCUNE DONNÉE EXISTANTE N'EST TOUCHÉE : les 2 265 cartes en base restent
-- 'creature' ou 'spell', et les deux contraintes ci-dessous ne font que
-- s'élargir. Rien à revenir en arrière si le lot est abandonné, sinon les deux
-- CHECK d'origine (rappelés en bas de fichier).

begin;

-- ── 1. Le type lui-même ────────────────────────────────────────────────────
alter table cards drop constraint if exists cards_card_type_check;
alter table cards add constraint cards_card_type_check
  check (card_type = any (array['creature'::text, 'spell'::text, 'item'::text]));

-- ── 2. Les stats, et pourquoi l'objet y échappe ────────────────────────────
--
-- La contrainte d'origine disait : une créature A des stats, un sort n'en a
-- PAS. Elle énumérait les deux types, donc un objet la violait quoi qu'il
-- porte — c'est elle, et non le CHECK de type, qui aurait bloqué l'insertion.
--
-- L'objet réutilise `attack` / `health` pour porter le BONUS qu'il confère à
-- son porteur (+X/+Y), plutôt que deux colonnes neuves : la forge affiche déjà
-- ces deux champs, et le sens reste lisible — ce que l'objet ajoute au combat.
--
-- Ses deux stats restent NULLABLES, à dessein : un objet qui ne donne que des
-- capacités (Vol, Provocation…) sans toucher aux chiffres est une carte tout à
-- fait légitime, et lui imposer un 0/0 de façade n'apprendrait rien à personne.
-- Le moteur lit `?? 0`.
alter table cards drop constraint if exists creature_has_stats;
alter table cards add constraint creature_has_stats check (
  (card_type = 'creature' and attack is not null and health is not null)
  or (card_type = 'spell' and attack is null and health is null)
  or (card_type = 'item')
);

commit;

-- ── Retour en arrière ──────────────────────────────────────────────────────
-- À n'exécuter qu'après s'être assuré qu'aucune carte 'item' ne subsiste :
--   select count(*) from cards where card_type = 'item';
--
-- alter table cards drop constraint cards_card_type_check;
-- alter table cards add constraint cards_card_type_check
--   check (card_type = any (array['creature'::text, 'spell'::text]));
-- alter table cards drop constraint creature_has_stats;
-- alter table cards add constraint creature_has_stats check (
--   ((card_type = 'creature' and attack is not null and health is not null)
--    or (card_type = 'spell' and attack is null and health is null))
-- );

-- ═══════════════════════════════════════════════════════════════════════════
-- LOT 2 — le COÛT D'ÉQUIPEMENT.
-- Appliqué en prod le 2026-09-19 (migration `objets_equip_cost`).
--
-- Distinct de `mana_cost`, qui n'a servi qu'à poser l'objet sur la table. Se
-- paie à CHAQUE équipement, y compris pour déplacer l'objet d'une créature à
-- une autre : c'est le levier tactique de la mécanique, pas un second paiement
-- d'entrée.
--
-- NULLABLE : null ou 0 = équipement gratuit, un choix d'auteur légitime. Toutes
-- les cartes existantes restent donc valides sans backfill.
-- ═══════════════════════════════════════════════════════════════════════════

alter table cards add column if not exists equip_cost integer;

comment on column cards.equip_cost is
  'OBJETS : coût en mana pour équiper l''objet sur une créature alliée. Payé à chaque équipement, déplacement compris. Null/0 = gratuit.';

-- Retour en arrière : alter table cards drop column equip_cost;
