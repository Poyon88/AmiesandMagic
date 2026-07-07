# Audit nocturne — Armies & Magic

**Date :** 2026-07-05 (nuit) · **Branche :** `audit/nuit-2026-07-05` · **Base :** `main` (b3c4ecb)
**Méthode :** fan-out de 5 sous-agents en lecture seule (sécurité API, sécurité infra, moteur de jeu, qualité/dette, perf/tests) + vérification et recoupement manuels. Tous les correctifs de cette branche ont été appliqués et vérifiés (`tsc`, `eslint`, `vitest`). **Aucun push, aucune modification de `main`, aucune migration appliquée en prod.**

---

## 1. État de santé de la base (avant audit)

| Contrôle | Résultat |
|---|---|
| `npx tsc --noEmit` | ✅ 0 erreur |
| `npm test` (vitest) | ✅ 231 tests / 26 fichiers, 0 échec |
| `npm run lint` | ⚠️ **69 erreurs + 70 warnings** (concentrées React-hooks + cosmétique) |
| Taille | 294 fichiers TS/TSX, ~66 800 LOC |

**Type-safety et gestion d'erreurs saines** : 0 `@ts-ignore`/`@ts-nocheck`, 0 `: any` explicite en code de prod (`as any` cantonné à 3 fichiers de test), 0 `catch {}` vide, 0 TODO/FIXME/HACK. La dette est concentrée dans le lint React-hooks et des warnings cosmétiques.

---

## 2. Synthèse par sévérité

| Sévérité | Finding | Statut |
|---|---|---|
| 🔴 **CRITICAL** | `collections` POST/DELETE : tout compte pouvait s'octroyer/supprimer des cartes arbitraires | ✅ **Corrigé (API + RLS DB)** |
| 🔴 **CRITICAL** | **`profiles.role` : escalade de privilège** — tout compte pouvait s'auto-promouvoir admin (privilège colonne + RLS par ligne) | ⚠️ **Correctif SQL prêt à appliquer** |
| 🟠 HIGH | `Hero3DViewer` : hook appelé conditionnellement (crash React possible) | ✅ **Corrigé** |
| ~~🟠 HIGH~~ | ~~RLS des tables publiques probablement absente~~ → **infondé** : RLS activée sur les 25 tables (vérifié en prod) | ✅ **Vérifié sain** |
| 🟠 HIGH | Perf : `GameBoard` s'abonne au store entier (jank combat/iPad) | 📋 À revoir |
| 🟠 HIGH | Perf/egress : `select('*')` de tout le pool de sorts/cartes à chaque match | 📋 À revoir |
| 🟡 MEDIUM | `auctions/settle` : fail-open si `CRON_SECRET` absent | ✅ **Corrigé** |
| 🟡 MEDIUM | Endpoints de génération IA payants sans rate-limit | 📋 À revoir (produit) |
| 🟡 MEDIUM | Aucun en-tête de sécurité HTTP | ✅ **Corrigé (hors CSP)** |
| 🟡 MEDIUM | Ciblage composé « both »+enemy : picker propose des cibles alliées (auto-dégâts) | 📋 À revoir (bug connu, différé) |
| 🟡 MEDIUM | Closure de polling figée (`MatchmakingQueue`) ; `EffectLog` piloté par `Date.now()` | 📋 À revoir |
| 🟢 LOW | Validation des montants argent (entier/borne) | ✅ **Corrigé** |
| 🟢 LOW | ~47 problèmes lint mécaniques + console.logs debug | ✅ **Corrigé (lot mécanique)** |
| 🟢 LOW | `collections` GET IDOR en lecture ; faux positif `useHeroPower` ; `Math.random` en rendu (FX) | 📋 Documenté |

---

## 3. Correctifs appliqués sur cette branche

### 3.1 Sécurité — commit `sécurité: fermer collections POST/DELETE …`

- **[CRITICAL] `src/app/api/collections/route.ts`** — POST et DELETE lisaient `userId` depuis le body et écrivaient dans `user_collections` via le client **service_role** (bypass RLS), avec pour seul contrôle « être authentifié ». N'importe quel compte pouvait donc **s'octroyer toutes les cartes du jeu** (contournement de l'économie, ces cartes étant vendables sur le marché) ou **vider la collection d'un autre joueur** (griefing/IDOR destructif). → Les deux handlers exigent désormais `requireAdmin()`. Le seul appelant légitime est le panneau admin `CollectionManager`, qui cible un `userId` arbitraire ; le flux admin est préservé. Le GET reste inchangé (cross-read intentionnel et documenté pour « Renfort Royal »).

- **[MEDIUM] `src/app/api/auctions/settle/route.ts`** — la garde `if (cronSecret && …)` désactivait toute vérification si `CRON_SECRET` n'était pas défini, ouvrant la route (transferts de fonds via `settle_auction`) en anonyme. → Réécrite en **fail-closed** : `isCron = !!cronSecret && header===Bearer` ; si non-cron, session **admin obligatoire**.

- **[LOW] `wallet/credit`, `wallet/admin`, `auctions/[id]/bid`** — montants validés uniquement par `<= 0`. → Ajout de `Number.isInteger(amount) && amount > 0 && amount <= 1_000_000_000` (anti-float / anti-overflow).

- **[MEDIUM] `next.config.ts`** — ajout des en-têtes `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy`. **CSP volontairement laissée hors périmètre** (nécessite des tests sur les origines Supabase/Three/framer).

### 3.2 Correctness — commit `fix(game): appeler useLongPress avant l'early-return …`

- **[HIGH] `src/components/game/Hero3DViewer.tsx`** — `useLongPress` était appelé **après** `if (!glbUrl) return null`. Quand la définition 3D d'un héros se charge (`glbUrl` null → défini), le nombre de hooks rendus changeait entre deux rendus → crash React « rendered fewer hooks than expected ». → Tous les hooks sont désormais appelés inconditionnellement en tête de composant.

### 3.3 Nettoyage mécanique — commit `chore: nettoyage lint mécanique …`

- Échappement des entités JSX (`react/no-unescaped-entities`, 11).
- Suppression des variables/imports inutilisés (`no-unused-vars`) — dont 2 fonctions mortes dans `engine.ts` (`hasKwOnDeath`, `hasKwOnTap`).
- Retrait des `console.log` de debug résiduels (`[engine]`, `[match]`, `[SFX]`, `[card-forge]`), en conservant les `console.error/warn` légitimes.
- **Zéro changement de logique.** Lint : **139 → 96 problèmes** (-12 erreurs, -31 warnings) ; `tsc` 0, 231 tests OK.
- Préservés à dessein (NON supprimés) : `RACES` (`HeroManager.tsx:13`, utilisé via `typeof` → faux positif) et `raceHint` (voir §4).

---

## 4. Findings à revoir (NON corrigés — décision ou refactor nécessaire)

### 🔴 CRITICAL — Escalade de privilège via `profiles.role` (découvert au diagnostic DB, 2026-07-07)
> **Mise à jour post-diagnostic.** L'alerte initiale « RLS absente sur les tables publiques » s'est révélée **infondée** : le diagnostic sur la prod (`supabase-rls-diagnostic.sql`) montre la **RLS activée sur les 25 tables** avec des policies globalement correctes — elles étaient juste créées dans le dashboard, invisibles depuis le repo. `user_collections` a une policy SELECT self-only et **aucune** policy d'écriture → le trou résiduel du CRITICAL collections était donc déjà fermé côté DB.

En creusant les policies, on a trouvé **bien pire** : la table `profiles` a une policy `UPDATE USING (auth.uid() = id)` **et** le rôle `authenticated` possède le privilège UPDATE sur la colonne `role`, sans trigger de protection. Or la RLS est **par ligne, pas par colonne**. Donc tout compte connecté pouvait s'auto-promouvoir admin :
```js
supabase.from('profiles').update({ role: 'admin' }).eq('id', monId)
```
→ accès à **toutes** les routes admin (créditer son wallet, s'octroyer des cartes, bannir…). Invisible à l'audit statique (policy dashboard). **Correctif** dans `supabase-migration-rls-hardening.sql` : `REVOKE UPDATE ON public.profiles FROM authenticated, anon;` (aucun code client n'écrit sur profiles → zéro casse). **À appliquer en prod.**

### 🟢 LOW — Expositions en lecture (RLS)
`profiles` et `card_prints` ont un `SELECT USING (true)` pour `authenticated` (tout compte lit tous les profils / prints). Peu sensible ; à resserrer seulement si `profiles` gagne des colonnes PII. Détail et SQL commenté dans `supabase-migration-rls-hardening.sql`.

### 🟠 HIGH — Performance rendu & egress
- **`GameBoard.tsx:106`** s'abonne au store Zustand **entier** (`= useGameStore()` sans sélecteur) → re-render complet du sous-arbre (2 boards × N créatures + main) à **chaque** event d'animation/hover/targeting. Aucun composant de `game/` n'utilise `React.memo`. Cause n°1 de jank en combat. → Sélecteurs atomiques + `memo` sur `BoardCreature`/`HandCard` + handlers stabilisés. **À tester en match réel (pièges iPad connus).**
- **`game/[matchId]/page.tsx:229`** charge `from("cards").select("*")` (tout le pool de sorts + cartes de faction, toutes colonnes dont `illustration_prompt`) **par match et par client**. → Projeter les colonnes utiles ; idéalement cacher le pool côté serveur (ISR).

### 🟡 MEDIUM
- **IA payante sans rate-limit** (`figurines/generate`, `heroes/generate-*`, `heroes/compose-*`) : ne vérifient que la session → abus de facturation possible. Décision produit : quota par utilisateur/jour.
- **Ciblage composé « both »+enemy** (`engine.ts:3446`, `5856`, `487`) : le picker interactif propose les cibles alliées pour un effet offensif → clic sur son propre héros = auto-dégâts (le path auto reste sûr). **Bug déjà connu et différé** (mémo `project_composed_side_targeting`). Correctif = `composedSlotType` side-aware + test.
- **`MatchmakingQueue.tsx:134`** : closure de polling récursive figée (risque d'état périmé). **`EffectLog.tsx:13`** : rendu piloté par `Date.now()` (entrées expirées restant affichées, mismatch d'hydratation possible).

### 🟢 LOW
- `collections` GET : IDOR en lecture (énumération de la collection d'autrui) — documenté comme intentionnel pour le gameplay, à borner au contexte match si souhaité.
- Faux positif `useHeroPower` (`engine.ts:4986/5316`) : fonction moteur pure prenant le préfixe `use` → renommer en `applyHeroPower` (aligné sur `applyMulligan`/`playCard`) pour éteindre la règle. **Zéro risque runtime.**
- `Math.random()`/`Date.now()` en rendu dans les overlays FX (`DamageOverlay`, `CycleEternelOverlay`…) : impureté purement visuelle → figer via `useMemo([])`.
- `set-state-in-effect` (23) / `refs` (8) : majoritairement pattern mount/`latest-ref` intentionnel, à neutraliser au cas par cas.
- **`raceHint` non branché** (`api/cards/generate-text/route.ts:92`) : la variable est calculée mais absente de la ligne `- Faction: …${clanHint}${subTypeHint}…` du prompt (l.118). **Décision produit, pas un fix mécanique** : l'info de race est déjà transmise massivement à l'IA via `creatureSubject` (sujet principal) et la section `illustrationPrompt` (`raceVisualDesc`, « NON NÉGOCIABLE ») — donc `raceHint` est aujourd'hui redondant. À trancher : soit l'injecter dans la ligne Faction (si un rappel supplémentaire est voulu), soit le supprimer. Laissé tel quel pour ne pas modifier un prompt IA sans intention explicite.

---

## 5. Lacunes de tests critiques

Le moteur est **bien couvert** (231 tests, centrés `lib/game/*`), mais la zone à plus fort risque financier — **l'argent** — n'a **aucun test** :
1. Logique monétaire en RPC Postgres (`place_bid`, `settle_auction`, `adjust_wallet_balance`) : solde insuffisant, surenchère, buyout, commission, remboursement, transfert de print, **double-settlement/idempotence** — invisibles aux tests JS. → Tests d'intégration sur Supabase local.
2. Validation de `POST /api/auctions` (propriété, bornes, flag `isPlayerSellingEnabled` de conformité).
3. Helpers d'auth (`requireAdmin`, fallback `CRON_SECRET`) : aucun test ne verrouille les 401/403.
4. `engine-regression.test.ts` : golden snapshot fragile (1 seul `expect`, « figé sur le moteur legacy ») → remplacer par des assertions d'invariants.

---

## 6. Points vérifiés SAINS (assurances)

- **Déterminisme multijoueur : solide.** Toute l'aléa moteur passe par un PRNG seedé (mulberry32) synchronisé sur `GameState.rngState` (chargé en entrée d'`applyAction`, réécrit en sortie, inclus dans le hash). Aucun `Math.random`/`Date.now` dans la logique moteur (les `Math.random` de `card-engine/generator.ts` = génération de cartes hors-partie ; `turnStartedAt` exclu du hash).
- **Pile d'effets LIFO : solide.** Garde de profondeur + télémétrie (pas de drop silencieux), re-localisation de la source par id à chaque frame (source morte non orpheline), `settleDeaths` + `recalculateAuras` après chaque frame, fizzle propre des choix non résolus.
- **Immutabilité / buffs : sains.** Chaque réducteur clone puis mute le clone ; buffs composés via nouveaux objets ; snapshots de buff figés.
- **Argent (routes correctes) :** `wallet/credit` & `wallet/admin` (admin-only), `auctions/[id]/bid` (bidder = user auth, pas le body), `auctions/[id]` DELETE (seller-only), `admin/*` (`requireAdmin`), `decks` DELETE (ownership). `adjust_wallet_balance` atomique (`CHECK(balance>=0)`). `place_bid`/`settle_auction` = RPC Postgres atomiques.
- **Secrets :** aucun secret en dur ; `SERVICE_ROLE_KEY` jamais en `NEXT_PUBLIC_` ni dans un bundle client ; `.env.local` gitignoré. Auth serveur via `auth.getUser()` (valide le JWT).

---

## 7. Priorités recommandées (post-réveil)

1. **Dashboard Supabase** : `get_advisors(security)` + activer RLS sur toutes les tables publiques. *(le plus important — hors périmètre code)*
2. **Vérifier `CRON_SECRET` en prod Netlify** (le correctif code est déjà en place ; le secret reste souhaitable pour le path cron).
3. **Merger cette branche** après revue du diff (correctifs sûrs).
4. Perf : sélecteurs `GameBoard` + `memo` (tester iPad) ; projeter les `select('*')` cartes (egress).
5. Rate-limit des endpoints IA payants.
6. Tests d'intégration argent (`place_bid`/`settle_auction`).
7. Ciblage composé side-aware (bug connu).

---

*Rapport généré pendant la nuit. Détail des findings et scénarios de déclenchement disponibles à la demande.*
