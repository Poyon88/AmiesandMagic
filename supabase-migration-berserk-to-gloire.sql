-- Berserk → Gloire +X/+Y (2026-07-21)
-- ---------------------------------------------------------------------------
-- Renomme l'id moteur du mot-clé `berserk` en `gloire` ET lui donne ses
-- paramètres +X/+Y, suite au changement de règle :
--
--   AVANT — Berserk : « Double son ATK si ses PV actuels sont inférieurs à sa
--           valeur de PV originale. » Aura conditionnelle, non scalable,
--           recalculée en continu par recalculateAuras.
--   APRÈS — Gloire +X/+Y : « Chaque fois que cette unité survit à des dégâts de
--           COMBAT, elle gagne +X/+Y de façon permanente. » Déclencheur câblé
--           dans dealDamageToCreature, buff cumulatif cuit dans les stats.
--
-- Surfaces touchées (relevé sur la prod du 2026-07-21 — 459 cartes) :
--   public.cards.keywords            10 lignes  (9 créatures + 1 sort de don)
--   public.cards.capabilities        10 lignes  (modèle unifié, abilityId)
--   public.cards.keyword_instances    9 lignes  (créatures — porte le X/Y)
--   public.heroes.power_effect        1 ligne   (#44 Sigurd, grant_keyword)
--   public.keyword_icons              1 ligne   (icône PNG uploadée)
--
-- Les noms de cartes contenant « Berserker » (#13 Orc Berserker, #149 Berserker
-- Ursin, et leurs traductions dans card_translations) sont des NOMS PROPRES :
-- ils ne sont volontairement PAS touchés.
--
-- Valeur par défaut retenue : +1/+1. Aucune carte existante ne portait de X/Y
-- (Berserk n'était pas scalable), il faut donc bien injecter une valeur ; +1/+1
-- est le repli du moteur (cf. applyGloire) — la migration et le code disent donc
-- la même chose même si une ligne était oubliée. À ré-équilibrer carte par carte
-- depuis la forge ensuite.
--
-- Idempotent : chaque UPDATE est gardé par la présence de l'ancienne valeur.
-- Rejouer la migration ne touche plus aucune ligne.
-- ---------------------------------------------------------------------------

begin;

-- Aperçu AVANT (facultatif — décommenter pour inspecter)
-- select id, name, card_type, keywords, keyword_instances, capabilities
--   from public.cards
--  where 'berserk' = any(keywords)
--     or capabilities::text like '%"berserk"%'
--  order by id;

-- ─── 1. cards.keywords : tableau text[] ────────────────────────────────────
update public.cards
   set keywords = array_replace(keywords, 'berserk', 'gloire')
 where 'berserk' = any(keywords);

-- ─── 2. cards.keyword_instances : porte le +X/+Y côté créature ─────────────
-- Deux cas :
--   (a) la carte a déjà un tableau (ex. #321/#322 avec lycanthropie) → on y
--       ajoute l'entrée gloire ;
--   (b) la colonne est null (ex. #13, #23, #87…) → on crée le tableau.
-- Le sort de don (#195) est exclu : la Gloire conférée lit grantedKeywordX et
-- retombe sur le repli +1/+1 du moteur, elle n'a pas d'instance propre.
update public.cards
   set keyword_instances =
         coalesce(keyword_instances, '[]'::jsonb)
         || jsonb_build_array(jsonb_build_object('id', 'gloire', 'x', 1, 'y', 1))
 where card_type = 'creature'
   and 'gloire' = any(keywords)
   and not coalesce(keyword_instances, '[]'::jsonb) @> '[{"id":"gloire"}]'::jsonb;

-- ─── 3. cards.capabilities : modèle unifié (abilityId + params) ────────────
-- On remappe chaque élément du tableau : l'entrée dont abilityId = 'berserk'
-- devient 'gloire' et reçoit params {attack, health} (convention +X/+Y, la même
-- que renforcement_multiple — cf. deriveCreatureCapabilities). Les entrées de
-- don (effectKind = 'grant', côté sort) changent d'id sans prendre de params :
-- leur X/Y vient du porteur au moment du don.
update public.cards
   set capabilities = (
         select jsonb_agg(
                  case
                    when cap->>'abilityId' <> 'berserk' then cap
                    when cap->>'effectKind' = 'grant'
                      then jsonb_set(cap, '{abilityId}', '"gloire"'::jsonb)
                    else jsonb_set(cap, '{abilityId}', '"gloire"'::jsonb)
                         || jsonb_build_object('params', jsonb_build_object('attack', 1, 'health', 1))
                  end
                  order by ord
                )
           from jsonb_array_elements(capabilities) with ordinality as t(cap, ord)
       )
 where capabilities is not null
   and capabilities @> '[{"abilityId":"berserk"}]'::jsonb;

-- ─── 4. heroes : pouvoir de héros « conférer un mot-clé » ──────────────────
-- #44 Sigurd — {"mode":"grant_keyword","keywordId":"berserk"}, plus le libellé
-- et la description FR affichés au joueur (le FR de `heroes` est la source des
-- traductions statiques : voir l'étape post-migration ci-dessous).
update public.heroes
   set power_effect = jsonb_set(power_effect, '{keywordId}', '"gloire"'::jsonb)
 where power_effect->>'keywordId' = 'berserk';

update public.heroes
   set power_name = 'Gloire',
       power_description = 'Donne Gloire à une unité ciblée'
 where power_name = 'Berserk'
    or power_description like '%Berserk%';

-- ─── 5. keyword_icons : l'icône uploadée est keyée par id moteur ───────────
-- On conserve le PNG existant pour ne pas laisser le mot-clé sans visuel ; il
-- représente encore un berserker et devra être remplacé depuis l'admin.
update public.keyword_icons
   set keyword = 'gloire'
 where keyword = 'berserk'
   and not exists (select 1 from public.keyword_icons where keyword = 'gloire');

delete from public.keyword_icons where keyword = 'berserk';

-- ─── Contrôle APRÈS ────────────────────────────────────────────────────────
-- Doit renvoyer 0 sur les 4 lignes.
select 'cards.keywords'          as surface, count(*) as reste from public.cards  where 'berserk' = any(keywords)
union all
select 'cards.capabilities',     count(*) from public.cards   where capabilities::text like '%"berserk"%'
union all
select 'cards.keyword_instances',count(*) from public.cards   where keyword_instances::text like '%"berserk"%'
union all
select 'heroes.power_effect',    count(*) from public.heroes  where power_effect->>'keywordId' = 'berserk'
union all
select 'heroes.power_name',      count(*) from public.heroes  where power_name = 'Berserk' or power_description like '%Berserk%'
union all
select 'keyword_icons',          count(*) from public.keyword_icons where keyword = 'berserk';

commit;

-- ─── À FAIRE APRÈS avoir appliqué cette migration ──────────────────────────
--   node scripts/generate-hero-translations.mjs
-- `src/i18n/hero-translations.json` est généré depuis le FR de `heroes` : tant
-- que la migration n'est pas passée, il annonce encore « Berserk » en EN/ES/DE/
-- IT/PT pour le pouvoir de Sigurd. Le régénérer AVANT ne servirait à rien (il
-- relirait l'ancien libellé).
