-- Refonte des capacités — colonne unifiée `capabilities` (modèle Capability).
--
-- Remplace à terme keywords[] / keyword_instances[] / spell_keywords[] (gardées
-- en lecture-fallback déprécié pendant le déploiement phasé). Nullable : une
-- carte non backfillée est dérivée à la volée par l'adaptateur
-- (deriveCapabilities) côté moteur. Source de vérité à partir de la phase D.

alter table public.cards
  add column if not exists capabilities jsonb;

comment on column public.cards.capabilities is
  'Modèle de capacité unifié : tableau de Capability {uid,trigger,effectKind,abilityId,params,race,clan,tokenId,tokens,grantScope,targets}. Supersede keywords/keyword_instances/spell_keywords. NULL = non backfillée (le moteur dérive via deriveCapabilities).';
