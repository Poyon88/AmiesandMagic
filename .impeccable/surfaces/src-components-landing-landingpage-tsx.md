---
version: 1
slug: "src-components-landing-landingpage-tsx"
primary_target: "src/components/landing/LandingPage.tsx"
related_targets: ["src/app/landing/page.tsx"]
---

# Vitrine publique — page d'accueil (`/landing`)

Scope : `/landing` d'abord, puis `/login`, `/news/[slug]`, `/factions/[slug]`, pages légales. Mode : Persuade.
Visiteur : joueur de TCG aguerri. Action : créer un compte et choisir sa faction offerte. Preuves : le catalogue illustré lui-même, de vraies cartes rendues par `GameCard`, le barème réel des tournois. Intouchable : plateau de jeu, jetons CSS hérités, textes via `messages/*.json`.
Moment mémorable : le mur dérive, une carte s'en détache, s'agrandit et se nomme.
Non résolu : texte juridique des pages légales.

## Direction contract

THESIS: La générosité se voit avant de se lire : la page EST le catalogue, un mur d'illustrations rangées par alignement. Elle refuse le héros de jeu vidéo (logo centré sur une illustration sombre, bouton doré) et la grille de « features » à icônes.

OWN-WORLD: Fond neutre profond `#101114`, encre `#f3f2ee`, traits `#2a2c31`, un seul accent vermillon `#d4351a` réservé à ce qui se clique. La seule couleur vient des illustrations. Affiches au format 2:3, coins de 6 px, rangées horizontales titrées ; l'affiche visée gagne un filet clair et une fiche (nom, pastille de rareté, race · clan). Bricolage Grotesque partout, titres en graisse 800 très serrés.

STORY: Le visiteur voit des centaines de cartes, comprend qu'une faction entière lui est offerte, choisit laquelle, puis découvre que les tirages limités rendent son deck unique et que des tournois dotés existent.

FIRST VIEWPORT: Le mur occupe tout l'écran, trois rangées qui dérivent en sens alternés. À gauche, sur un voile dégradé, le h1 « Armies of Legends. Une faction entière, offerte. » (environ 5 vw), deux lignes de texte, le bouton vermillon « Choisir ma faction offerte » et un lien secondaire. À droite, l'affiche visée, grande (environ 20 vw), change toutes les quelques secondes. Barre de navigation transparente en haut.

FORM: Mur d'affiches des plateformes de streaming (challenger retenu par l'utilisateur, hors liste ordonnée). Interaction signature : viser une affiche (survol, focus clavier, toucher) la détache du mur et l'agrandit ; la rangée active s'éclaire, les autres s'assombrissent. Grammaire de mouvement : dérive linéaire lente pour les rangées, agrandissement net à courbe exponentielle pour l'affiche visée, rien d'autre ne bouge. seed:73cbc645c0e4c29e

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
