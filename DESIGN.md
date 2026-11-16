---
name: "Armies of Legends — vitrine publique"
description: "Le Mur des cartes : un mur d'affiches façon plateforme de streaming, fond neutre, un seul accent vermillon réservé à ce qui se clique."
colors:
  fond: "#101114"
  fond-2: "#17181c"
  fond-3: "#1f2126"
  fond-coulisse: "#0b0c0e"
  encre: "#f3f2ee"
  encre-2: "#cfcdc6"
  encre-3: "#a3a5ad"
  trait: "#2a2c31"
  trait-fort: "#3a3d44"
  vermillon: "#d4351a"
  vermillon-vif: "#b92d15"
  sur-vermillon: "#ffffff"
  alerte: "#ff8a70"
typography:
  display:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "clamp(2.4rem, 4.5vw, 5.4rem)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "clamp(2rem, 3.9vw, 4.2rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.032em"
  title:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "clamp(1.25rem, 1.8vw, 1.75rem)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  lede:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "clamp(1.05rem, 1.4vw, 1.4rem)"
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "clamp(1.02rem, 1.25vw, 1.25rem)"
    fontWeight: 400
    lineHeight: 1.5
  prose:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "1.08rem"
    fontWeight: 400
    lineHeight: 1.65
  button:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 800
    lineHeight: 1
  nav:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 600
  caption:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "0.88rem"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 600
    letterSpacing: "0.14em"
rounded:
  focus: "4px"
  affiche: "6px"
  champ: "10px"
  panneau: "12px"
  pilule: "100px"
spacing:
  gouttiere: "clamp(16px, 2.6vw, 44px)"
  rail: "clamp(8px, 0.9vw, 14px)"
  section-haut: "clamp(72px, 11vh, 128px)"
  section-bas: "clamp(40px, 6vh, 72px)"
  barre: "68px"
  cible: "44px"
components:
  button-primary:
    backgroundColor: "{colors.vermillon}"
    textColor: "{colors.sur-vermillon}"
    typography: "{typography.button}"
    rounded: "{rounded.pilule}"
    padding: "0.85em 1.5em"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.vermillon-vif}"
    textColor: "{colors.sur-vermillon}"
  button-primary-lg:
    backgroundColor: "{colors.vermillon}"
    textColor: "{colors.sur-vermillon}"
    rounded: "{rounded.pilule}"
    padding: "1.05em 1.75em"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.encre}"
    rounded: "{rounded.pilule}"
    padding: "0.85em 1.5em"
    height: "48px"
  button-ghost-hover:
    backgroundColor: "{colors.encre}"
    textColor: "{colors.fond}"
  link:
    textColor: "{colors.encre}"
    height: "44px"
  nav-bar:
    backgroundColor: "transparent"
    textColor: "{colors.encre-2}"
    typography: "{typography.nav}"
    height: "{spacing.barre}"
    padding: "0 {spacing.gouttiere}"
  affiche:
    backgroundColor: "{colors.fond-3}"
    rounded: "{rounded.affiche}"
    width: "clamp(92px, 10.4vw, 190px)"
  affiche-visee:
    backgroundColor: "{colors.fond-2}"
    textColor: "{colors.encre}"
    rounded: "{rounded.panneau}"
    width: "clamp(240px, 20.5vw, 380px)"
  puce:
    backgroundColor: "{colors.encre}"
    textColor: "{colors.fond}"
    rounded: "{rounded.pilule}"
    padding: "0.32em 0.72em"
  affiche-faction:
    backgroundColor: "{colors.fond-3}"
    textColor: "{colors.encre}"
    rounded: "{rounded.panneau}"
    height: "clamp(380px, 56vh, 620px)"
  bouton-pause:
    backgroundColor: "{colors.fond}"
    textColor: "{colors.encre-2}"
    rounded: "{rounded.pilule}"
    padding: "0 14px"
    height: "44px"
  champ:
    backgroundColor: "{colors.fond-2}"
    textColor: "{colors.encre}"
    rounded: "{rounded.champ}"
    padding: "12px 16px"
---

# Design System: Armies of Legends — vitrine publique

> **Périmètre.** Ce document décrit le monde visuel des **pages publiques** seulement (`/landing`, `/login` et pages d'authentification, `/news/[slug]`, `/factions/[slug]`, `/legal/*`). Tout y vit sous la classe `.vt` (`src/components/vitrine/vitrine.css`, jetons `--vt-*`). **Le jeu lui-même** (plateau, collection, decks, boutique, admin) garde son ancien système doré `--am-*` défini dans `src/app/globals.css` : il est **hors périmètre**, ce document ne le décrit pas et ne l'autorise pas à être modifié. Les clés du frontmatter sont des noms descriptifs ; la correspondance avec les propriétés CSS est donnée dans chaque section.

## Overview

**Creative North Star: "Le Mur des cartes"**

La vitrine ne présente pas le catalogue, elle **est** le catalogue : un mur d'illustrations de cartes au format affiche (2:3), rangées par alignement, qui dérivent lentement comme la page d'accueil d'une plateforme de streaming. Une carte s'en détache, s'agrandit, se nomme. Le visiteur visé est un joueur de TCG aguerri qui juge en quelques secondes : la preuve passe par les illustrations elles-mêmes et par de vraies cartes rendues par le composant du jeu, pas par un discours.

Le système est volontairement pauvre en moyens. Le fond est un neutre profond presque noir, le texte une encre claire légèrement chaude, et **la seule couleur vient des illustrations**. Un unique accent, le vermillon, n'apparaît que sur ce qui se clique. Une seule famille typographique, Bricolage Grotesque, en deux registres : graisse 800 très serrée pour les titres, graisse normale pour le texte. Pas de dorure, pas de verre dépoli, pas de texte en dégradé, pas d'ornement : les pages secondaires écrites avec les utilitaires dorés du jeu sont « déshabillées » par un pont de jetons dès qu'elles sont rendues sous `.vt`.

Le mouvement suit une grammaire à deux temps : une dérive linéaire lente pour les rangées, et une réponse nette à courbe exponentielle (`cubic-bezier(0.16, 1, 0.3, 1)`) pour tout ce qui réagit au visiteur. Rien d'autre ne bouge. Avec `prefers-reduced-motion`, tout repose et rien ne reste caché.

**Key Characteristics:**
- Fond neutre profond, encre claire, traits discrets ; la couleur appartient aux illustrations.
- Un seul accent, vermillon, réservé aux actions.
- Affiches 2:3 à coins de 6 px, assombries au repos, à pleine lumière quand on les vise.
- Bricolage Grotesque partout ; titres en 800, interlettrage négatif, interlignage proche de 1.
- Profondeur par la luminosité et le voile dégradé, pas par les ombres.
- Tout ce qui se clique est une pilule ; tout ce qui contient est un rectangle à 12 px.
- Cibles tactiles de 44 px minimum, 48 px pour les boutons.

## Colors

Une palette de neutres froids presque noirs, une encre claire un peu chaude, et un seul accent rouge-orangé.

### Primary
- **Vermillon** (`vermillon`, `--vt-accent`) : fond du bouton d'action principal (« Choisir ma faction offerte », envoi de formulaire, appel à l'action d'un article). Texte blanc pur (`sur-vermillon`).
- **Vermillon vif** (`vermillon-vif`, `--vt-accent-hi`) : état survolé du même bouton, et seulement cela.

### Neutral
- **Fond profond** (`fond`, `--vt-bg`) : fond de toutes les pages ; sert aussi de couleur de texte sur les surfaces inversées (pastille, bouton fantôme survolé, sélection de texte).
- **Fond relevé** (`fond-2`, `--vt-bg-2`) : fiche de l'affiche visée, champs de formulaire, panneaux des écrans pontés, liste déroulante des langues.
- **Fond d'attente** (`fond-3`, `--vt-bg-3`) : couleur d'une affiche avant que son image n'arrive.
- **Fond de coulisse** (`fond-coulisse`) : uniquement le panneau d'affiches à gauche du formulaire de connexion, un cran plus sombre que le fond.
- **Encre** (`encre`, `--vt-ink`) : titres, texte fort, liens, anneau de focus, filet de l'affiche visée, fond de la pastille.
- **Encre atténuée** (`encre-2`, `--vt-ink-2`) : paragraphes, liens de navigation au repos, accroches.
- **Encre discrète** (`encre-3`, `--vt-ink-3`) : dates, légendes, pied de page, nom de rangée, texte d'ambiance.
- **Trait** (`trait`, `--vt-line`) : filets de 1 px (sous l'en-tête, au-dessus du pied, contour des panneaux pontés), couleur de la barre de défilement.
- **Trait fort** (`trait-fort`) : contour des champs de formulaire, par le pont (`--am-line-strong`).

### Tertiary
- **Alerte** (`alerte`, `--am-ember` redéfini sous `.vt`) : messages d'erreur des formulaires et encadré « contenu à rédiger » des pages légales. C'est une couleur d'état, pas un second accent.

### Named Rules
**La règle du Vermillon cliquable.** Le vermillon n'apparaît QUE sur ce qui se clique, et en pratique que sur le bouton d'action principal. Jamais sur un titre, un filet, une icône décorative ou un fond de section. S'il y a deux boutons côte à côte, un seul est vermillon ; l'autre est fantôme ou un lien souligné.

**La règle de la Couleur prêtée.** Le décor n'a pas de couleur à lui. Toute teinte visible à l'écran, hors vermillon et alerte, vient d'une illustration de carte. Aucun dégradé coloré, aucune lueur teintée, aucun fond de section coloré.

**La règle de l'Inversion.** Pour distinguer un petit élément sans couleur (pastille de rareté, badge « possédée », bouton fantôme survolé), on inverse : fond encre, texte fond.

## Typography

**Display Font:** Bricolage Grotesque (repli `system-ui, sans-serif`)
**Body Font:** Bricolage Grotesque (même famille)

Chargée par `next/font/google` dans `src/components/vitrine/font.ts` (sous-ensembles `latin` et `latin-ext`, `display: swap`, variable `--font-bricolage`), et non dans le layout racine : seules les pages de la vitrine la téléchargent. `font-optical-sizing: auto` est actif sur `.vt`.

**Character:** Une grotesque à caractère, employée seule. Le contraste vient de la graisse et de la taille, pas d'un second caractère : titres massifs et serrés, texte courant calme et aéré.

### Hierarchy
- **Display** (800, `clamp(2.4rem, 4.5vw, 5.4rem)`, 0.98, −0.035em) : le h1 du mur, sur deux lignes (une par `span`). La page de faction monte à `clamp(2.4rem, 6vw, 5.4rem)`.
- **Headline** (800, `clamp(2rem, 3.9vw, 4.2rem)`, 1, −0.032em) : titres de section, largeur limitée à 16em. Le titre de clôture grossit à `clamp(2.6rem, 6.4vw, 6rem)` / −0.04em ; le titre des pages de lecture vaut `clamp(2rem, 4.4vw, 3.6rem)` / 1.02 ; celui de la connexion `clamp(1.9rem, 3vw, 2.8rem)` / 1.02 / −0.03em.
- **Title** (800, `clamp(1.25rem, 1.8vw, 1.75rem)`, 1.1, −0.02em) : sous-titres, nom d'une faction, nom de l'affiche visée (`clamp(1.05rem, 1.5vw, 1.45rem)`, −0.015em), marque dans la barre.
- **Lede** (400, `clamp(1.05rem, 1.4vw, 1.4rem)`, 1.45) : phrase d'appui sous le h1, chapô d'article.
- **Body** (400, `clamp(1.02rem, 1.25vw, 1.25rem)`, 1.5, encre atténuée) : texte de section, 38em au plus. En lecture longue : `prose`, 1.08rem / 1.65 dans une colonne de 46rem.
- **Button / Nav** (800, 1rem pour les boutons ; 600, 0.95rem pour la navigation et le sélecteur de langue) : jamais en capitales, interlettrage nul.
- **Caption** (400, 0.82 à 0.9rem, encre discrète) : dates, légendes, pied de page, ligne « race · clan ».
- **Label** (600, 0.72rem, 0.14em, capitales) : **uniquement** le nom d'alignement posé au-dessus d'une rangée du mur.

### Named Rules
**La règle des Deux graisses.** 800 pour ce qui titre ou agit, 400 pour ce qui se lit, 600 pour la navigation et les petites lignes d'information. Pas d'italique, pas de seconde famille : sous `.vt`, `--font-cinzel` et `--font-crimson` pointent vers Bricolage.

**La règle du Titre serré.** Tout titre en 800 porte un interlettrage négatif (de −0.015em pour les petits à −0.04em pour le plus grand) et un interlignage entre 0.98 et 1.12. `text-wrap: balance` sur les titres, `pretty` sur les paragraphes.

**La règle de l'Étiquette unique.** Le petit libellé en capitales espacées n'existe que comme titre de rangée du mur, à la manière d'une rangée de catalogue. Il ne sert jamais de surtitre au-dessus d'un titre de section.

## Layout

Pleine largeur, sans conteneur centré : chaque section s'étend d'un bord à l'autre et ne garde qu'une gouttière latérale fluide (`gouttiere`, `--vt-gutter`). Les rangées d'affiches et les rails de cartes débordent volontairement dans la gouttière (marge négative égale à la gouttière) pour toucher les bords de l'écran. Seules les pages de lecture ont une colonne centrée (46rem ; 78rem pour la tête d'une page de faction ; 27rem pour le formulaire de connexion).

- **Premier écran.** Le mur occupe `100svh` (620 px au moins, 1200 px au plus) : trois rangées qui dérivent en sens alternés, le propos à gauche sur un voile dégradé (largeur `min(46vw, 760px)`), l'affiche visée à droite. Le texte précède le mur dans le HTML pour que le clavier atteigne le bouton principal sans traverser les affiches.
- **Sections.** Colonne simple, alignée à gauche : `section-haut` au-dessus, `section-bas` en dessous. Titre, puis texte à 14–22 px, puis le contenu à `clamp(28px, 5vh, 56px)`.
- **Deux colonnes.** Grilles asymétriques `1.15fr / 0.85fr` (titre + aparté, alignés en bas) et `0.9fr / 1.1fr` (texte + preuve), écart `clamp(24px, 5vw, 90px)` ; une seule colonne sous 1100 px.
- **Rythme serré dans les rangées** : `rail` entre deux affiches, `clamp(6px, 0.7vw, 12px)` entre deux factions, `clamp(12px, 1.4vw, 22px)` entre deux vraies cartes.
- **Barre.** Fixe, 68 px, transparente sur le mur ; après 40 px de défilement elle prend le fond à 94 % et un filet bas de 1 px. Les pages secondaires ont un en-tête statique de même hauteur, avec filet.
- **Connexion.** Deux moitiés `1.05fr / 0.95fr` sur `100svh` : trois affiches à gauche (celle du milieu plus large, à pleine lumière, avec le filet), le formulaire à droite.

**Points de rupture.** Sous 900 px : la troisième rangée du mur disparaît, les affiches passent à `clamp(96px, 27vw, 170px)`, le propos descend en bas de l'écran sur un voile vertical, l'affiche visée devient une vignette en haut à droite (`min(33vw, 160px)`), les boutons d'action prennent toute la largeur, les liens d'ancre de la barre sont masqués, la rangée de factions devient un défilement horizontal à accroche (`72vw`, 320 px au plus, 2:3), le panneau d'affiches de la connexion est retiré. Sous 1100 px : grilles sur une colonne. Sous 600 px : le tableau des tournois garde 520 px de large et défile de côté.

## Elevation & Depth

Le système est plat. La profondeur se lit par la **luminosité** : une affiche au repos est assombrie (`brightness(0.52) saturate(0.9)`), celles de la rangée active remontent à `0.82`, celle qu'on vise est à pleine lumière et grossit de 4 %. Entre le mur et le texte, un **voile dégradé** de la couleur du fond (de 98 % d'opacité à gauche à 0 % vers 60 %) fait le travail qu'un panneau ferait ailleurs. Les surfaces pontées perdent leur verre dépoli et leurs ombres.

### Shadow Vocabulary
- **Filet de visée** (`box-shadow: 0 0 0 2px #f3f2ee`) : contour de l'affiche visée dans le mur.
- **Détachement** (`box-shadow: 0 0 0 2px #f3f2ee, 0 28px 70px rgba(0, 0, 0, 0.7)`) : la grande affiche visée et l'affiche centrale de la connexion. C'est la seule ombre portée du système.
- **Contour intérieur** (`box-shadow: inset 0 0 0 1.5px …`) : bouton fantôme ; `inset 0 0 0 1px` pour le bouton de pause.
- **Filet de barre** (`box-shadow: 0 1px 0 #2a2c31`) : sous la barre de navigation une fois la page défilée.

### Named Rules
**La règle de l'Ombre unique.** Une seule ombre portée existe, et elle appartient à l'affiche qui s'est détachée du mur. Aucun bouton, panneau, carte de contenu ou menu n'en reçoit.

**La règle de la Lumière.** Pour mettre en avant, on éclaire ; pour mettre en retrait, on assombrit. On ne floute pas, on ne teinte pas.

## Shapes

Deux familles de formes, et le rôle décide. **Ce qui se clique est une pilule** (`pilule`) : boutons, sélecteur de langue, pastille, bouton de pause. **Ce qui contient est un rectangle à coins doux** : 6 px (`affiche`, `--vt-r`) pour les petites affiches du mur, 12 px (`panneau`, `--vt-r-lg`) pour l'affiche visée, les affiches de faction, la vidéo et l'image d'en-tête d'un article, 10 px (`champ`) pour les champs et encadrés des formulaires pontés. L'anneau de focus a un coin de 4 px.

Les affiches sont au format **2:3**, l'image recadrée en `cover` et ancrée vers le haut (`50% 18–20%`) pour garder le visage. La vidéo est en 16:9, l'image d'article en 16:7. Les filets font 1 px, les contours 1,5 à 2 px. Pas de coupe en biais, pas de losange, pas de cadre ornemental : la règle à losange du jeu devient un simple filet sous `.vt`.

## Components

### Buttons
Francs et pleins : une pilule, un mot d'action en graisse 800.
- **Shape:** pilule (100 px), hauteur minimale 48 px (44 px dans la barre), texte sur une ligne.
- **Primary:** fond vermillon, texte blanc, `0.85em 1.5em`. Variante large (`clamp(1rem, 1.25vw, 1.2rem)`, `1.05em 1.75em`) pour l'action du premier écran et de la clôture.
- **Hover / Focus:** fond vermillon vif et montée de 1 px (0.18 s, courbe de sortie) ; à l'appui, descente de 1 px et échelle 0.985. Focus : anneau encre de 2 px, décalé de 3 px.
- **Ghost:** fond transparent, texte encre, contour intérieur encre de 1,5 px ; survolé, il s'inverse (fond encre, texte fond). Dans les formulaires pontés, le fantôme a un contour couleur trait qui passe à l'encre au survol, sans inversion.
- **Lien d'action** : texte encre en 600, souligné à 1,5 px avec un soulignement à 45 % d'opacité qui passe à 100 % au survol ; hauteur de cible 44 px.

### Chips
- **Style:** pastille inversée (fond encre, texte fond, 800, 0.78rem, `0.32em 0.72em`, pilule). Porte la rareté sur l'affiche visée, et « possédée / offerte » sur une affiche de faction quand on le sait.
- **State:** informative, sans état interactif.

### Cards / Containers
- **Affiche du mur :** bouton 2:3, coins 6 px, sans bordure ni texte ; assombrie au repos, pleine lumière + échelle 1.04 + filet de visée quand elle est survolée, focalisée ou visée (0.35 s).
- **Affiche visée :** rectangle 12 px, fond relevé, filet encre et ombre de détachement. Image (ratio 2 / 2.55) qui se dévoile de haut en bas (`clip-path`, 0.7 s, courbe de sortie) puis avance lentement (échelle 1 → 1.07, linéaire) ; en dessous, une fiche (`14px 16px 16px`) : nom, pastille de rareté, « race · clan », deux lignes d'ambiance au plus. Toute l'affiche est un lien vers la faction.
- **Affiche de faction :** panneau 12 px dans une rangée de neuf ; celle qu'on vise s'élargit (`flex-grow` 1 → 3.6, 0.55 s), s'éclaire, et déplie nom, accroche et « voir » ; repliée, son nom se lit à la verticale comme une tranche. Dégradé du fond en bas pour la lisibilité du texte.
- **Vraies cartes :** rail horizontal à accroche de cartes rendues par `GameCard`, à l'échelle 0.9 (0.78 sur mobile). Leur habillage appartient au jeu, pas à ce système.
- **Panneaux pontés :** fond relevé, bordure trait de 1 px, aucune ombre, aucun flou.

### Inputs / Fields
- **Style:** fond relevé, texte encre, bordure trait fort de 1 px, coins 10 px, `12px 16px`, texte 1rem ; libellé au-dessus en 0.875rem / 600 / encre atténuée.
- **Focus:** la bordure passe à l'encre.
- **Error / Disabled:** message en couleur alerte ; désactivé à 50 % d'opacité. Le remplissage automatique du navigateur est forcé aux couleurs du système.
- **Sélecteur de langue :** liste native sans habillage, texte 600 / 0.95rem encre atténuée, chevron tracé en SVG, cible de 44 px.

### Navigation
Barre fixe de 68 px : la marque en texte (800) à gauche ; à droite, trois liens d'ancre (600, encre atténuée → encre au survol, visibles à partir de 900 px), le sélecteur de langue et un bouton fantôme « Jouer ». Transparente sur le mur, opaque à 94 % avec filet après défilement. Pied de page : une ligne, filet haut, texte discret, liens légaux à cible de 44 px.

### Le mur (composant signature)
Trois rangées (deux sous 900 px), chacune précédée de son nom d'alignement. Chaque rail contient deux lots identiques et glisse de −50 % en boucle, linéaire ; la durée est propre à chaque rangée (`nombre d'affiches × 7 s + rang × 9 s`) et les rangées paires vont à rebours, pour que le mur ne ressemble pas à un tapis roulant. À l'arrivée, les rangées montent l'une après l'autre (0.9 s, décalage de 0.08 s). Sans intervention, la visée change toutes les 4,6 s ; viser une affiche (survol à la souris, focus clavier, toucher) met le mur en pause jusqu'à ce qu'on le quitte. Un bouton « pause » discret reste en bas à droite. Le second lot est masqué aux lecteurs d'écran et retiré de l'ordre de tabulation. En clôture de page, une **frise** reprend une rangée, purement décorative, à luminosité 0.8, fondue aux deux bords par un masque.

### Le pont `--am-*`
Les écrans de connexion, de faction, d'actualité et les pages légales sont écrits avec les utilitaires dorés du jeu. Sous `.vt` seulement, les jetons qu'ils lisent sont redéfinis : fonds et encres vers les neutres du mur, l'or vers l'encre, le bouton doré vers le vermillon en pilule, les polices Cinzel et Crimson vers Bricolage ; le texte en feuille d'or, le verre dépoli, la bordure dorée, le reflet des boutons et le losange des filets sont neutralisés. Le même code garde son habit doré partout ailleurs. Un nouvel écran de la vitrine s'écrit directement en `vt-*` ; le pont sert à ne pas réécrire l'existant, pas à en produire.

## Do's and Don'ts

### Do:
- **Do** envelopper toute page publique dans `.vt` avec la variable de police (`bricolage.variable`) et importer `vitrine.css` ; les jetons `--vt-*` n'existent pas en dehors.
- **Do** laisser les illustrations porter la couleur : fond `#101114`, texte encre, et rien d'autre de coloré que le bouton d'action.
- **Do** donner aux titres la graisse 800, un interlettrage négatif et un interlignage proche de 1.
- **Do** montrer les cartes au format 2:3, recadrées vers le haut, assombries au repos et éclairées quand on les vise.
- **Do** utiliser la courbe `cubic-bezier(0.16, 1, 0.3, 1)` pour toute réponse à un geste, et le linéaire seulement pour la dérive.
- **Do** garder 44 px de cible au moins, 48 px pour les boutons, et l'anneau de focus encre de 2 px.
- **Do** prévoir l'état « mouvement réduit » : animations coupées, contenu entièrement visible, bouton de pause retiré.
- **Do** faire passer tout texte visible par `messages/*.json`.

### Don't:
- **Don't** toucher aux jetons `--am-*`, `--background`, `--primary` de `globals.css` ni appliquer ce système au jeu : le plateau en dépend.
- **Don't** employer le vermillon sur autre chose qu'un élément cliquable, ni en poser deux côte à côte.
- **Don't** réintroduire l'or, le verre dépoli, le texte en dégradé, les lueurs colorées ou les cadres ornementaux sur une page publique.
- **Don't** ajouter une seconde famille de caractères, de l'italique, ou des capitales espacées ailleurs que sur le nom d'une rangée du mur.
- **Don't** donner une ombre portée à autre chose qu'une affiche détachée.
- **Don't** arrondir un conteneur en pilule ni donner des coins vifs à un bouton.
- **Don't** faire bouger autre chose que les rangées et ce que le visiteur vient de viser.
- **Don't** glisser vers l'esthétique de jeu mobile racoleur (effets criards, gacha) ni vers le site d'entreprise trop sage ; rien de lourd ni de lent.
