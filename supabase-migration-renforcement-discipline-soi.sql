-- ============================================================================
-- Armies & Magic — RENFORCEMENT / DISCIPLINE : « elle-même » explicite
-- (2026-10-25)
-- ============================================================================
--
-- Le bénéficiaire du bonus d'une créature devient réglable
-- (keyword_instances[i].recipient) et son DÉFAUT change : absent ⇒ une AUTRE
-- unité alliée désignée, comme la forme sort. Jusqu'ici, une créature se
-- donnait toujours le bonus à elle-même.
--
-- Pour que les cartes existantes ne changent PAS de comportement, on écrit
-- `"recipient": "self"` sur chacune de leurs instances de Renforcement et de
-- Discipline (créatures seulement ; ni portée « toutes », ni réglage déjà posé).
-- Elles portent dès lors le marqueur « S » sur leur icône.
--
-- ORDRE DE DÉPLOIEMENT : appliquer AVANT le code. L'ancien code ignore le
-- champ, donc rien ne bouge entre les deux ; l'inverse ferait viser une autre
-- unité aux 27 créatures concernées (17 Renforcement, 10 Discipline) jusqu'à la migration.
--
-- Rejouable : une instance déjà réglée n'est plus sélectionnée.
-- ============================================================================

BEGIN;

UPDATE public.cards c
SET keyword_instances = (
  SELECT jsonb_agg(
           CASE
             WHEN k->>'id' IN ('renforcement', 'discipline')
                  AND NOT (k ? 'recipient') AND NOT (k ? 'targetScope')
             THEN k || '{"recipient": "self"}'::jsonb
             ELSE k
           END
           ORDER BY ord)
  FROM jsonb_array_elements(c.keyword_instances) WITH ORDINALITY AS t(k, ord)
)
WHERE c.card_type = 'creature'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(c.keyword_instances) k
    WHERE k->>'id' IN ('renforcement', 'discipline')
      AND NOT (k ? 'recipient') AND NOT (k ? 'targetScope')
  );

COMMIT;
