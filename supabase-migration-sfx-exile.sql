-- Bruitage du coût d'EXIL, par carte.
--
-- Troisième son par carte, à côté de `sfx_play_url` (pose) et `sfx_death_url`
-- (mort). Le coût d'exil déchire X cartes du dessus du deck : l'animation
-- existe (ExileCostOverlay), il lui manquait sa bande-son.
--
-- Une colonne par carte plutôt qu'un son global : le geste est le même pour
-- toutes, mais son ampleur ne l'est pas — exiler une carte pour un sort mineur
-- et en exiler cinq pour un rituel n'appellent pas la même matière sonore.
-- `null` ⇒ pas de son propre (repli sur le son générique s'il en existe un).
--
-- Idempotent : réexécutable sans risque.

alter table public.cards
  add column if not exists sfx_exile_url text;

comment on column public.cards.sfx_exile_url is
  'Bruitage joué quand le coût d''exil de cette carte est payé (cartes déchirées au deck). null => aucun son propre.';
