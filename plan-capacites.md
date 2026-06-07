# Plan — Refonte du système de capacités (modèle unifié)

## Contexte

Le système de capacités d'Armies & Magic est aujourd'hui éclaté sur **trois structures
parallèles** par carte (`keywords[]`, `keyword_instances[]`, `spell_keywords[]`), plus des
colonnes scalaires et un arbre `SpellComposableEffects` typé mais inutilisé. Le moteur
(`engine.ts`, ~4300 lignes) est piloté par ~150 `card.keywords.includes(id)`. Cette
dispersion rend la taxonomie conceptuelle de l'utilisateur invisible dans le code et
incohérente entre unités et sorts.

L'utilisateur veut formaliser une taxonomie à 4 niveaux et l'implanter dans le jeu **et** la
forge, puis adapter les 98 capacités existantes :

1. **Contenant** : unité / sort / mixte (implicite via `card_type`).
2. **Déclencheur** (unités) : `entrée` (défaut) · `mort` · `remontée en main` · `activation` ·
   `automatique/conditionnel` (augure, commandement…). Sorts : toujours `à la résolution`.
3. **Type d'effet** : `immédiat` (ex. infliger X dégâts) · `conférer une capacité` (ex. donner Berserk).
4. **Cible(s)** : 0, 1 ou N sélections.

### Décisions validées avec l'utilisateur
- **Schéma unifié composable** : une seule structure `capabilities[]` par carte remplace les
  trois structures actuelles. *(NB : choix assumé de privilégier la propreté long-terme plutôt
  que la préférence habituelle « moindre risque d'abord » — d'où le rollout phasé + adaptateur
  ci-dessous pour réintroduire de la sécurité.)*
- **Automatique = set curé** : les passifs/réactifs (augure, commandement, berserk, fureur,
  terreur, regeneration…) restent **câblés en dur** dans le moteur, juste **référencés par id**
  et **catégorisés** sous le déclencheur `automatic`. Pas de moteur de conditions générique.
- **Conférer généralisé** : « conférer une capacité » devient un type d'effet de 1ʳᵉ classe
  pour **tous** les contenants et déclencheurs (une unité peut conférer Berserk à un allié).
- **Iso-comportement** : les 98 capacités existantes doivent se comporter **à l'identique**.
  C'est une re-catégorisation + changement de représentation, pas un rééquilibrage.
- **Rollout phasé + adaptateur** : nouvelle colonne, adaptateur ancien→nouveau, backfill, le
  moteur ne lit que le nouveau modèle ; anciennes colonnes dépréciées puis supprimées. Réversible.
- **Forge reconstruite** en flux guidé par capacité (Déclencheur → Type d'effet → Effet/capacité
  conférée → Cible(s)), filtré par le Contenant.
- **Héros inclus** (vue d'adaptation en v1, pas de migration de table tout de suite).
- **Multi-cibles dès v1** (slots de cibles 0/1/N).

## Pièges connus (zones de risque iso-comportement)
La taxonomie a 5 déclencheurs unité, mais le moteur dispatche en plus :
- **Triggers de combat** (augure, fureur, riposte, persecution, drain_de_vie, bravoure,
  souffle_de_feu, pietinement, liaison_de_vie) → classés `automatic`, handlers conservés dans `attack()`.
- **Auras continues** (terreur, commandement, fierte_du_clan, berserk, sang_mele, totem,
  regeneration, canalisation, entraide) → `automatic`, conservées dans `recalculateAuras`/`startTurn`.
- **Capacités à la fois passives et on-play** (fierte_du_clan, necrophagie) → classées par leur
  **nature** (`automatic`) ; le moteur découvre les `automatic` ids **quel que soit** le trigger.
- **Multi-mode** (Convocation on-play *et* on-tap) → deux capacités distinctes.
- **Shadowing polymorphe** (sort portant `keywords:["remontee"]` *et* `spell_keywords:[{remontee}]`)
  → réutiliser `isCreatureKwShadowedBySpell` pour ne pas émettre de grant fantôme.
- **douleur** : sur unité = auto-dégâts on-play (immédiat, **pas** automatic).

## Modèle cible (TypeScript) — `src/lib/game/types.ts`
Nouveau type `Capability` (supersede l'arbre `AtomicEffect`/`SpellComposableEffects`, gardé
`@deprecated` puis supprimé — on ne construit pas le moteur de conditions générique) :

```ts
type CapabilityTrigger =
  | "on_play" | "on_death" | "on_return" | "on_activation" | "automatic" | "spell_resolution";
type CapabilityEffectKind = "immediate" | "grant";
interface CapabilityTargetSlot { type: SpellTargetType; label?: string; }
interface Capability {
  uid: string;                       // unique dans la carte ; remplace instanceIdx/PendingTrigger.kw
  trigger: CapabilityTrigger;
  effectKind: CapabilityEffectKind;
  abilityId: string;                 // id ABILITIES (immédiat/auto) ou capacité conférée (grant)
  params?: { x?: number; attack?: number; health?: number };
  race?: string; clan?: string;
  tokenId?: number | null; tokens?: ConvocationTokenDef[];
  grantScope?: "target" | "all_allies";
  targets?: CapabilityTargetSlot[];  // 0/1/N
}
```
Sur `Card` : `capabilities?: Capability[] | null` (colonne JSONB). Les 3 anciennes structures
restent `@deprecated`, lecture-fallback jusqu'à la Phase F.

## Registre — `src/lib/game/abilities.ts`
Ajout **additif** d'un descripteur `triggers?: AbilityTriggerMeta` à chaque `AbilityDef` :
`creatureTriggers[]`, `spellTriggers[]`, `effectKinds[]`, `automatic?: boolean`, `grantable?: boolean`.
Le moteur dérive `AUTOMATIC_ABILITY_IDS` ; la forge dérive ses listes déroulantes. Les vues
`KEYWORDS`/`SPELL_KEYWORDS` restent inchangées (rien ne casse en Phase A).

## Adaptateur — `src/lib/game/capability-adapter.ts` (nouveau)
`deriveCapabilities(card): Capability[]`, pur et iso-comportement :
- **Sort** : un cap `spell_resolution/immediate` par `spell_keywords[i]` (slots `kw_<i>`, ordre
  préservé) ; pour `keywords[]` non-shadowés → cap `grant` avec `grantScope`.
- **Unité** : liste d'instances effective (`keyword_instances` + synthèse des `keywords[]` sans
  instance, comme le fallback de `hasKwInMode`). X = `inst.x ?? parseXValuesFromEffectText` (uniquement
  si `mode===undefined`). Mapping `undefined→on_play`, `death→on_death`, `tap→on_activation`,
  `return→on_return` ; **forcé `automatic`** si `triggers.automatic`. Émettre **une capacité par
  (id, trigger) que le moteur legacy aurait déclenché**, jamais moins.
- Scalaires (`life/discard/sacrifice_cost`, `entraide_race`, token ids) restent des colonnes.
- Réversible : `legacyFromCapabilities` (optionnel) pour garder les anciennes colonnes peuplées
  pendant le rendu non encore migré (Phase C–D).

## Moteur — `src/lib/game/engine.ts`
Stratégie : **couche d'accès aux capacités, puis bascule des lectures sous elle — corps des
handlers inchangés** (clé de l'iso-comportement).
- Nouveaux helpers : `caps(ci)` (= `ci.card.capabilities ?? deriveCapabilities`, mémoïsé),
  `capsByTrigger`, `hasCapability` (toutes triggers — remplace `hasKw`), `hasCapTriggered`, `capX`.
- `hasKw→hasCapability`, `hasKwOnPlay/onDeath/onTap→capsByTrigger`. Les chaînes `if` on-play, le
  `switch` de `resolveSpellKeywords` (→ `resolveSpellResolutionCapabilities`), `recalculateAuras`,
  `processDeathTriggers`, `attack()`, `startTurn` restent **identiques** (seuls les gardes changent).
- **Grant unités** : extraire le bloc grant des sorts (engine.ts ~1593) en
  `applyGrantCapability(...)`, réutilisé par les handlers on_play/on_death/on_activation quand
  `effectKind==="grant"`. Seule surface gameplay réellement nouvelle (jamais utilisée par
  l'existant → pas de régression).
- `silence`/`totem`/`mimique`/`heritage_du_cimetiere` : adapter sur `capabilities` (vider/fusionner,
  dédup `abilityId+trigger`), et garder les colonnes legacy cohérentes jusqu'à Phase F.
- `CardInstance` (état runtime) **inchangé**.

## Héros
`heroPowerToCapability(effect): Capability` (vue d'adaptation) : `grant_keyword→on_activation/grant`,
`spell_trigger→on_activation/immediate`, `aura→automatic`. **`HeroPowerEffect` et `useHeroPower`
restent tels quels en v1** (bien isolés) ; migration de la table héros repoussée à une phase
ultérieure. HeroManager réutilise le flux guidé via cette vue.

## Forge — `src/components/card-forge/CardForge.tsx`
État `capabilities: ForgeCapability[]`. Assistant par capacité, filtré par `card_type` :
Déclencheur (depuis `triggers.creatureTriggers` / fixe `spell_resolution`) → Type d'effet
(`effectKinds`) → Effet ou capacité conférée (+ `grantScope`) → Cible(s) (réutilise
`getSpellTargetSlots`/`SpellTargetType`) → params/race/clan/token (réutilise le token picker
existant). Validation : trigger/effectKind légaux + params/tokens requis (généralise les contrôles
serveur existants). Sérialise vers `capabilities` ; en Phase C, émet **aussi** les colonnes legacy.
Génération de texte (`/api/cards/generate-text`) conservée ; `params.x` vient désormais de la
capacité (le texte devient affichage seul).

## DB — `supabase-migration-capabilities.sql`
`alter table public.cards add column if not exists capabilities jsonb;` (+ commentaire).
Maj `src/app/api/cards/save/route.ts` : ajouter `capabilities` au SELECT, à `allowed`, à
`cardData` ; généraliser les validateurs entraide/renforcement_multiple. Backfill via route
service_role idempotente `POST /api/admin/backfill-capabilities` (mutations via service_role,
cf. CLAUDE.md), avec mode dry-run (diff adaptateur vs colonnes).

## Phasage (chaque phase livrable indépendamment)
- **A — Modèle + registre + adaptateur + tests** (aucun changement de comportement). `tsc`/lint verts.
- **B — Moteur lit le nouveau modèle via adaptateur au chargement** ; colonnes legacy = source de
  vérité (`capabilities` null → fallback). Gate : équivalence golden-master.
- **C — Forge écrit `capabilities` (+ legacy)** ; ajout colonne migration.
- **D — Backfill + bascule source de vérité** ; migration des couches de rendu (GameCard/HandCard/
  KeywordIcon/overlay de ciblage/UI pending-trigger).
- **E — Héros (vue/UI)** + `capabilityUid` dans `TapActivateAction`/`PendingTrigger` (shim `instanceIdx`).
- **F — Suppression des colonnes dépréciées** (étagé : `spell_effects` → `keyword_instances`/
  `spell_keywords` → `keywords`). Seule étape irréversible, en dernier.

## Vérification (prouver l'iso-comportement)
1. **Test de fidélité adaptateur** (A) : sur **chaque** carte (pull Supabase MCP), assertion que
   `deriveCapabilities` couvre exactement l'ensemble (id, trigger) que le moteur legacy déclencherait.
2. **Golden-master moteur** (B, gate principale) : batterie de séquences `GameAction` à RNG semée,
   comparer `GameState` profond entre lecture legacy et lecture capabilities après chaque action.
3. **Playtests ciblés** (D) sur les hotspots : augure, fureur en chaîne, riposte/persecution, maths
   d'auras (commandement/terreur/berserk), fierte_du_clan, Convocation on-play+on-tap, remontée
   (pending-trigger), silence (effacement), totem/mimique (fusion), douleur (létalité),
   renforcement_multiple (clan>race), pickers selection*, pouvoir héros (3 modes).
4. Exécuter sur le dev server (flux de match semé) ; inspecter `capabilities` via Supabase MCP après sauvegardes forge.

### Parties les plus risquées
1. Bascule `hasKw→hasCapability` (~150 sites) — un id `automatic` non découvert désactive
   silencieusement un passif. Mitigation : golden-master + `AUTOMATIC_ABILITY_IDS` dérivé (non listé à la main).
2. Fidélité adaptateur sur le fallback implicite (`keywords[]` sans instance, X depuis effect_text).
3. silence/totem/mimique mutant la liste de capacités (nouveau + legacy jusqu'à F).
4. douleur (sémantique double on-play vs on-death/tap) → classer on_play immédiat.
5. Héros `spell_trigger` (spell synthétique) → construire une capacité synthétique équivalente.

## Fichiers principaux
- `src/lib/game/types.ts` · `src/lib/game/abilities.ts` · `src/lib/game/engine.ts`
- `src/components/card-forge/CardForge.tsx` · `src/components/admin/HeroManager.tsx`
- `src/app/api/cards/save/route.ts`
- Nouveaux : `src/lib/game/capability-adapter.ts` · `supabase-migration-capabilities.sql` ·
  route backfill `src/app/api/admin/backfill-capabilities/route.ts`
