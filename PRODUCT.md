# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Visiteur prioritaire de la vitrine (confirmé le 2026-11-16) : le **joueur de TCG aguerri**, qui vient de Magic, Hearthstone ou Runeterra. Il juge en quelques secondes la profondeur du jeu, la qualité des cartes et le modèle économique, et il a déjà été déçu par des jeux qui font payer la collection.

Publics secondaires, non prioritaires : joueurs compétitifs (tournois dotés), collectionneurs (tirages limités, hôtel des ventes), curieux de fantasy.

## Product Purpose

Armies of Legends (ex-Armies & Magic, renommé le 2026-11-13) est un jeu de cartes à collectionner fantasy, tour par tour, jouable dans le navigateur (Chrome en priorité, Safari et iPad pris en charge). Chaque joueur incarne un héros doté d'un pouvoir et affronte un adversaire avec un deck de 50 cartes (créatures, actions, objets).

La vitrine publique (`/landing`, `/login`, `/news`, `/factions`) réussit quand un joueur de TCG crée un compte et lance sa première partie.

## Positioning

Deux arguments qu'un concurrent ne peut pas reprendre (confirmés le 2026-11-16) :

1. **La générosité** : l'ensemble des cartes classiques d'une faction est offert à l'inscription (plus de 300 cartes) ; toutes les factions s'obtiennent pour une fraction du coût d'un TCG classique.
2. **Les cartes en édition limitée** : les tirages limités rendent chaque deck Expert différent ; aucun duel n'est le même. Le quota commun garantit que la stratégie décide, pas le portefeuille.

## Operating Context

- Neuf factions jouables (plus les Mercenaires, vivier partagé), chacune avec ses clans et ses races ; référence : `UNIVERS-ARMIES-AND-MAGIC.md`.
- Raretés : Commune, Rare, …, **Unique** (id interne `Légendaire`, jamais affiché tel quel).
- Parcours : inscription → pseudo → choix de la faction offerte → collection → deck → partie.
- Autour du jeu : collection, decks, héros, boutique de factions, hôtel des ventes, tournois, actualités.

## Capabilities and Constraints

- Next.js 16 (App Router, `src/proxy.ts` et non `middleware.ts`), React 19, Tailwind v4, framer-motion, three / react-three-fiber, next-intl (FR source + 7 langues), Supabase, Stripe, hébergé sur Vercel.
- Toute page publique doit figurer dans `PUBLIC_PATH_PREFIXES` de `src/proxy.ts`.
- Le plateau de jeu et le combat dépendent des jetons CSS hérités (`--background`, `--primary`, …) : ne pas les modifier.
- Tout texte visible passe par `messages/*.json` ; le français est la source.
- Les illustrations de cartes et de héros sont servies par Supabase Storage.
- Doit rester fluide sur mobile et iPad.

## Brand Commitments

- Nom : **Armies of Legends**, monogramme « AoL ». Domaine : `armiesoflegends.com`.
- Ton : tutoiement, phrases courtes, registre épique sans emphase creuse.
- À éviter (confirmé le 2026-11-16) : l'esthétique de jeu mobile racoleur (effets criards, gacha), le site d'entreprise trop sage, et tout ce qui est lourd ou lent.

## Evidence on Hand

- Catalogue de cartes illustrées et héros en base (tables `cards`, `heroes`, `showcase_cards`).
- Captures et visuels : `public/images/landing/`, `public/images/home/`, `public/images/battlefield.jpg`.
- Barème réel des tournois affiché par `TournamentStandings` ; les joueurs du tableau sont fictifs et la page le dit.
- Bande-annonce de 24 s, muette, rendue par le projet Remotion `video/`.
- Absent, à ne pas inventer : témoignages de joueurs, nombre de joueurs inscrits, citations de presse.

## Product Principles

1. Montrer les cartes : l'illustration et la lisibilité sont la preuve, pas un décor.
2. Dire le modèle économique sans détour ; c'est l'argument, pas une note de bas de page.
3. La stratégie décide : rien dans la présentation ne doit suggérer un jeu où l'on paie pour gagner.
4. Rapide partout : une page qui rame contredit la promesse d'un jeu soigné.
