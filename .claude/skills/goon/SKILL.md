---
name: goon
description: Développer en autonomie une liste de chantiers pendant l'absence de l'utilisateur — questions groupées AVANT de coder, puis exécution un par un sans validation intermédiaire, commits sur main sans push.
---

# goon — travailler pendant son absence

L'utilisateur part. Il laisse une liste de chantiers à mener **un par un**, sur
`main`, **sans lui demander de validation en cours de route**.

Tout le prix de cette commande tient dans une inversion : puisqu'il ne pourra
pas répondre pendant l'exécution, **toutes les questions se posent avant**. Une
question non posée maintenant devient une hypothèse silencieuse pendant des
heures de travail — et c'est ainsi qu'on lui rend un chantier à refaire.

La liste arrive en argument de la commande, ou dans le message qui la précède.

---

## Phase 1 — Interroger, avant la moindre ligne de code

**N'écris rien tant que cette phase n'est pas close.** Pas un fichier, pas une
migration, pas un test.

### Explorer d'abord

Lis le code concerné par chaque chantier avant de questionner. Une question dont
la réponse est dans le dépôt fait perdre du temps à tout le monde et signale que
tu n'as pas cherché. Les questions qui restent sont celles que le code ne peut
pas trancher : intentions, arbitrages, priorités, formulations.

### Une question à la fois

Utilise `AskUserQuestion` avec **une seule question par appel**, et enchaîne.
L'utilisateur l'a demandé explicitement : il veut lire, réfléchir, répondre,
puis passer à la suivante. Un lot de quatre questions d'un coup obtient trois
réponses réfléchies et une expédiée.

Interroge tant qu'il reste une inconnue qui **changerait ce que tu construis**.
Ne demande pas ce qui a une réponse évidente ou un défaut raisonnable : décide,
et annonce ta décision dans le compte rendu.

Pour chaque chantier, passe en revue :

- **Le périmètre** — jusqu'où va la demande, et où s'arrête-t-elle ?
- **Les arbitrages visibles** — mise en page, formulation, comportement au
  survol, cas limites. Propose des options concrètes plutôt qu'une question
  ouverte ; utilise les aperçus quand le choix est visuel.
- **Les données** — faut-il une migration ? Des valeurs à créer, à corriger ?
  Y a-t-il des lignes existantes dans un état qui contredit la demande ?
- **Les textes** — tout libellé visible se traduit dans les 8 langues. Si le
  français n'est pas fixé, demande-le : tu ne veux pas retraduire huit fois.
- **L'ordre** — un chantier dépend-il d'un autre ? Lequel compte le plus, si le
  temps manque ?

### Annoncer les accès nécessaires — dans cette même phase

C'est le seul moment où il peut encore te les accorder. Avant de clore la
phase 1, **dis-lui explicitement** ce dont tu auras besoin et qu'il doit
autoriser avant de partir :

- **Mode de permission** — s'il faut écrire, lancer des commandes ou installer
  quoi que ce soit sans confirmation, dis-le. Sans mode adapté, chaque appel
  d'outil attendra une réponse qui ne viendra pas, et le travail s'arrêtera dès
  le premier.
- **Écritures en base** — une migration ou une correction de données via le MCP
  Supabase. Nomme le projet et ce que tu comptes écrire.
- **Serveur de dev** — s'il doit rester allumé pour que tu puisses vérifier le
  rendu réel des pages.
- **Réseau** — accès web ou API tierce, s'il y en a besoin.

Termine la phase par un récapitulatif court : la liste des chantiers dans
l'ordre retenu, les décisions prises, les accès demandés. Puis attends son feu
vert avant de commencer.

---

## Phase 2 — Exécuter, un chantier à la fois

Une fois lancé, **plus aucune question**. Tu décides, tu documentes, tu avances.

### Le cycle, pour chaque chantier

1. **Construire** — en suivant les habitudes du dépôt : commentaires en
   français qui expliquent le POURQUOI, un seul inventaire par notion (les
   listes parallèles dérivent, c'est le défaut récurrent de ce code), les
   décisions extraites en fonctions pures quand elles doivent être testables.
2. **Garder** — un test qui échouerait si le correctif disparaissait. Vérifie-le
   en le retirant vraiment : un test qui passe avec ET sans le correctif ne
   garde rien.
3. **Vérifier** — `npx tsc --noEmit`, la suite complète `npx vitest run`, et
   `npx eslint` sur les fichiers touchés. Les avertissements préexistants ne
   comptent pas ; une erreur nouvelle, si.
4. **Commiter sur `main`** — un commit par chantier, message en français
   expliquant le problème avant la solution. **Ne pousse pas.** Il relèvera
   l'historique à son retour et poussera lui-même.

### Quand un chantier bloque

**Passe au suivant.** Ne t'acharne pas, ne bricole pas un contournement qu'il
faudra défaire.

Note précisément, pour le compte rendu : ce que tu as tenté, où ça coince, et
ce qu'il faudrait pour débloquer — une décision de sa part, un accès, une
donnée manquante. Si une partie du chantier était livrable isolément et qu'elle
tient debout seule, commite-la en disant dans le message ce qui manque.

### Ce que l'auto-mode ne couvre pas

L'absence de validation intermédiaire porte sur les **choix de conception**, pas
sur les gestes irréversibles. Quoi qu'il arrive, ne fais pas sans lui :

- supprimer ou écraser des données, en base comme sur disque ;
- `git push --force`, réécrire l'historique, supprimer une branche ;
- pousser quoi que ce soit vers un service externe (le déploiement en fait
  partie : cette commande commite mais ne pousse jamais) ;
- toucher aux secrets, clés ou paramètres de sécurité ;
- une migration destructive — `drop`, `rename`, une contrainte qui rejetterait
  des lignes existantes. Les ajouts idempotents sont autorisés s'il les a
  validés en phase 1.

Devant un de ces cas : arrête ce chantier, note-le, passe au suivant.

---

## Phase 3 — Le compte rendu

Il revient et lit une seule chose. Qu'elle soit exacte.

Pour chaque chantier : **fait**, **partiel** ou **bloqué**, avec le hash du
commit. Pour les partiels et les bloqués, dis ce qui manque et pourquoi.

Puis, séparément et sans les mélanger :

- **Ce qui est vérifié** — tests, typage, lint, et ce que tu as réellement
  constaté (une page servie, une requête relue en base).
- **Ce qui ne l'est pas** — au premier rang, tout ce qui touche au rendu : tu ne
  vois pas l'écran. Ne dis jamais qu'une interface est correcte parce que le
  code semble juste.
- **Les décisions prises seul** — celles qu'il aurait pu trancher autrement.
  C'est la partie qu'il relira le plus attentivement.
- **Ce qui reste à faire** — la suite naturelle, et ce qui attend son arbitrage.

Rappelle-lui que **rien n'est poussé** : `main` est en avance sur `origin`, et
c'est à lui de pousser.
