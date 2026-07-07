# À faire — différés post-audit (au 2026-07-07)

Reliquat de l'audit nocturne (voir `AUDIT-NUIT.md`). Tout le reste (sécurité,
moteur, perf GameBoard, rate-limit IA, egress, ciblage composé, lint sûr, tests
logique argent) est **mergé en prod sur `main`**. Aucun de ces points n'est urgent.

## Actions (hors code)
- [ ] **Vérifier `CRON_SECRET` en prod Netlify.** Le code fail-close déjà si le
      secret est absent, mais il est nécessaire pour que le settle **cron**
      automatique des enchères fonctionne. → variable d'env Netlify.

## Décisions produit
- [ ] **`raceHint`** (`src/app/api/cards/generate-text/route.ts`) : la variable
      est calculée mais jamais injectée dans le prompt (indice de race pour la
      génération IA). `eslint-disable` posé en attendant. → soit la brancher dans
      le prompt, soit la supprimer.
- [ ] **Policies `SELECT USING(true)`** sur `profiles` / `card_prints` (lecture
      cross-utilisateur, IDOR-lecture **LOW**). À resserrer seulement si on veut
      masquer ces lectures ; documenté comme acceptable pour le jeu aujourd'hui.

## Dette technique (cosmétique / non bloquant)
- [ ] **`<img>` → `next/image`** : 26 warnings ESLint (`no-img-element`).
      Risqué à faire en masse (dimensions/layout), warnings seulement.
- [ ] **2 lints React « moins faux positifs »** (les ~50 autres React Compiler
      sont laissés à dessein, cf. audit) :
  - `src/components/game/MatchmakingQueue.tsx` — `schedulePoll` accédé avant sa
    déclaration (récursion dans un `useCallback`).
  - `src/components/cards/GameCard.tsx` — `react-hooks/immutability` sur
    `detailTimer.current` modifié dans un handler.

## Chantier moteur (déjà noté ailleurs)
- [ ] **Egress bis** : projeter `deck_cards → cards(*)` imbriqué (complément de
      l'optim egress déjà faite sur le pool de cartes ; plus petit gain).
