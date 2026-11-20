# Armies of Legends — Livret de règles

> **Fichier généré — ne pas le modifier à la main.** Source : `src/lib/regles/`
> (prose dans `chapitres/`, cas particuliers dans `precisions.ts`). Après toute
> modification : `npm run livret`. Les chiffres viennent des constantes du jeu,
> le lexique et les factions du registre.
>
> Ce livret est la référence des agents : l'agent de tri des retours joueurs
> répond aux questions de règles à partir de lui, et rien que de lui.

## Sommaire

1. [Le but du jeu et les cartes](#1-le-but-du-jeu-et-les-cartes)
2. [Mise en place et déroulement d'un tour](#2-mise-en-place-et-deroulement-dun-tour)
3. [Les unités et le combat](#3-les-unites-et-le-combat)
4. [Les actions, les objets et les emblèmes](#4-les-actions-les-objets-et-les-emblemes)
5. [Les capacités : quand elles agissent, comment les lire](#5-les-capacites-quand-elles-agissent-comment-les-lire)
6. [Les choix et l'ordre de résolution](#6-les-choix-et-lordre-de-resolution)
7. [Changer de zone : ce qu'une unité garde](#7-changer-de-zone-ce-quune-unite-garde)
8. [Le héros, son pouvoir et les compteurs](#8-le-heros-son-pouvoir-et-les-compteurs)
9. [Les coûts : mana, coûts additionnels, éveil, réductions](#9-les-couts-mana-couts-additionnels-eveil-reductions)
10. [Construire un deck, formats et Singulier](#10-construire-un-deck-formats-et-singulier)
11. [Lexique des capacités](#11-lexique-des-capacites)
12. [Précisions par capacité](#12-precisions-par-capacite)
13. [Factions, clans et races](#13-factions-clans-et-races)
14. [Le site et l'économie](#14-le-site-et-leconomie)

## 1. Le but du jeu et les cartes

**But.** Chaque joueur incarne un héros. On gagne en amenant les points de vie (PV) du héros adverse à 0. Pour cela, on invoque des unités et on joue des actions.

**Points de vie du héros.** Chaque héros démarre avec ses propres PV, de 20 à 40 (30 le plus souvent) : un pouvoir puissant se paie de quelques PV en moins. Ces PV de départ sont aussi son maximum : aucun soin ne le fait remonter au-delà.

**Trois types de cartes.**
- **Unité** (aussi appelée créature) : elle reste sur le terrain, attaque et défend. Elle a une attaque (ATK) et des points de vie (PV).
- **Action** (appelée « sort » dans d'anciennes versions) : elle produit son effet puis part au cimetière.
- **Objet** : il se pose sur le terrain puis s'équipe sur une unité alliée. Les objets ne se mettent pas dans un deck.

**Quatre zones par joueur.** Le deck (la pioche), la main, le terrain et le cimetière.

**Lire une carte.** Les chiffres ont une place fixe, en main comme sur le terrain :
- écu bleu en haut à gauche : le coût en mana (bleu clair = coût réduit) ;
- écus du bas à droite : l'ATK (rouge) et les PV (vert) d'une unité. Un chiffre vert signale un bonus, un chiffre rouge une valeur diminuée ;
- jetons en haut à droite : les coûts additionnels et l'éveil ;
- barre du bas : une icône par capacité, teintée selon le moment où elle agit.
Le texte exact des capacités d'une carte se lit dans sa bulle de détail (survol, ou appui long sur tablette).

**Appartenance.** Une carte appartient à une faction, souvent à un clan de cette faction, et une unité a une race. Les Mercenaires n'ont ni clan ni allégeance. Chaque faction a un alignement : bon, neutre ou maléfique.

**Rareté.** Commune, Peu Commune, Rare, Épique, Unique (appelée « Légendaire » dans d'anciennes versions).

## 2. Mise en place et déroulement d'un tour

**Qui commence.** Le premier joueur est désigné par le jeu. Commencer est un avantage, compensé de deux façons : le joueur qui commence en premier démarre avec une carte de moins, et celui qui commence en second reçoit une **Étincelle de mana** (+1 mana pour son premier tour).

**Main de départ et mulligan.** 4 cartes pour le joueur en second, 3 pour celui qui commence. Avant le premier tour, chacun peut remplacer autant de cartes de sa main qu'il le veut (mulligan), en 45 secondes ; passé ce délai, la sélection en cours est validée (tout garder si rien n'est sélectionné).

**Début de tour**, dans l'ordre :
1. le mana maximum du joueur augmente de 1 (plafond 10), puis son mana est entièrement rechargé. La partie commence à 0 mana ;
2. il pioche 1 carte — ou fait une découverte, voir plus bas ;
3. ses unités se « réveillent » : elles peuvent de nouveau attaquer et utiliser leur pouvoir activable.

**Pendant son tour**, le joueur joue autant de cartes que son mana le permet, attaque avec ses unités, utilise le pouvoir de son héros, dans l'ordre qu'il veut. Puis il passe la main (fin de tour).

**Chrono.** Un tour dure au plus 90 secondes ; à 0, le tour se termine.

**Découverte un tour sur deux.** À ses tours pairs (son 2e, son 4e, son 6e…), le joueur ne pioche pas : il fait une découverte, c'est-à-dire qu'il choisit 1 carte parmi 3. Selon le réglage en vigueur sur le site, l'offre est : soit 2 Communes de son clan et 1 Commune d'un autre clan de sa faction (celle-ci un cran plus chère) ; soit 1 Commune de son clan, 1 Commune d'un autre clan de sa faction, et 1 Commune d'une autre faction de même alignement ou neutre (celle-ci un cran plus chère ; jamais de Mercenaires). La carte choisie est créée pour lui : son deck n'est pas entamé. Le coût des cartes proposées est tiré au hasard à chaque rang de découverte, et il est le même pour les deux joueurs à la même découverte (la 2e découverte de l'un et la 2e de l'autre). Si une faction n'a qu'un seul clan, la case « autre clan » est remplacée par une 2e carte du clan.
- Sans choix dans le délai, le joueur reçoit une des trois cartes au hasard.
- Tous les coûts de 1 à 10 sont possibles : rien ne garantit que la carte offerte soit jouable dans le tour. À 10, la carte « un cran plus chère » coûte 10 aussi.
- Si le clan n'a aucune carte au coût tiré, c'est le coût valide le plus proche qui est retenu (le moins cher en cas d'égalité).
- La faction et le clan de référence sont ceux du héros ; à défaut, la faction puis le clan les plus représentés dans le deck, Mercenaires exclus.
- Si aucune carte ne peut être offerte, le joueur pioche normalement.

**Main pleine.** La main contient au plus 8 cartes. Une carte piochée au-delà est perdue.

**Deck vide : la fatigue.** Un joueur qui doit piocher alors que son deck est vide subit des dégâts de fatigue : 1 la première fois, 2 la suivante, puis 3, et ainsi de suite.

**Fin de partie.** Un héros à 0 PV a perdu. Un joueur peut aussi concéder depuis les réglages (⚙).

## 3. Les unités et le combat

**Invoquer.** On paie le coût en mana d'une unité pour la poser sur le terrain. Le terrain accueille au plus 8 emplacements par joueur ; les objets en occupent aussi.

**Mal d'invocation.** Une unité ne peut ni attaquer ni utiliser son pouvoir activable le tour où elle arrive. Deux capacités y dérogent : **Traque** (elle attaque et s'active dès son arrivée) et **Raid** (elle peut attaquer une unité ennemie dès son arrivée, jamais le héros).

**Attaquer.** Une unité attaque une fois par tour (deux fois avec Célérité). Elle vise une unité ennemie ou le héros adverse.
- Contre une unité : les deux s'infligent leur ATK en même temps.
- Contre le héros : elle lui inflige son ATK.
Une unité dont les PV tombent à 0 meurt et part au cimetière.

**Ce qui change un combat.**
- **Provocation** : l'adversaire doit attaquer d'abord les unités qui ont Provocation. Une unité avec **Vol** ignore cette obligation.
- **Bouclier** : absorbe la première blessure subie.
- **Première Frappe** : frappe avant ; l'adversaire ne riposte que s'il survit.
- **Résistance X** : réduit les dégâts reçus de X (1 dégât au minimum).
- **Armure** : divise par deux les dégâts de combat.
- **Esquive** : évite la première attaque du tour.
- **Précision** : ignore Résistance, Armure et Bouclier.
- **Ombre** : tant que l'unité n'a pas agi, un effet qui choisit sa cible ne peut pas la désigner. Un effet au hasard ou qui touche toutes les unités l'atteint normalement.
Le chapitre « Lexique des capacités » donne l'effet de chaque capacité, et « Précisions par capacité » leurs cas particuliers.

## 4. Les actions, les objets et les emblèmes

**Actions.** Une action produit un effet immédiat puis part au cimetière. Certaines demandent une cible (une unité, un héros, une carte d'une main ou d'un cimetière). Une action peut aussi **conférer une capacité d'unité** : à l'unité ciblée, ou à toutes les unités alliées (icône marquée d'un « A »).

**Objets.** Troisième type de carte, hors deck : on les trouve en cours de partie (Trésor, Compagnons, Tuteur, Sélection, Faveur…).
- Un objet occupe un emplacement du terrain mais reste inerte : il n'est pas attaquable et ne compte pas comme une unité.
- On paie son coût pour le poser, puis son **coût d'équipement** (le cartouche sous le mana) pour le fixer sur une unité alliée. Une unité porte au plus 2 objets ; leurs bonus s'additionnent.
- L'unité équipée reçoit les bonus « +X/+Y » et les capacités de l'objet tant qu'elle le porte.
- On peut rééquiper l'objet sur une autre unité autant de fois qu'on veut, en repayant le coût d'équipement.
- Si le porteur meurt ou quitte le terrain, l'objet reste en jeu, déséquipé.

**Emblèmes.** Certaines cartes (unités, actions) et certains pouvoirs de héros posent un emblème : un effet permanent attaché à un **joueur**, non à une carte.
- Il survit à la disparition de sa source (unité morte, action résolue).
- Il agit à la cadence indiquée — entrée en jeu, attaque, mort, fin de tour… — chez le joueur qu'il affecte, jusqu'à la fin de la partie ou de sa durée.
- Les emblèmes se lisent autour du portrait du héros (losanges) : ardoise = effet permanent ; brun = effet à durée (des points dorés comptent les tours restants, le dernier vire à l'orange) ; bleu = emblème qui réagit à un événement. Un liseré rouge signale une malédiction posée par l'adversaire, « ×N » un emblème posé plusieurs fois.

## 5. Les capacités : quand elles agissent, comment les lire

**Une icône par capacité.** La couleur de l'icône dit QUAND la capacité agit :
- **blanc — permanent** : passif, aura ou râle d'agonie, actif tant que la carte est là ;
- **jaune — entrée en jeu / action** : quand l'unité arrive en jeu, ou quand l'action se résout ;
- **orange — activation** : pouvoir que le joueur déclenche en cliquant l'unité, une fois par tour (pas le tour de son arrivée, sauf Traque) ;
- **magenta — à l'attaque** : chaque fois que l'unité attaque, avant les dégâts du combat ;
- **rouge sombre — à la mort** : quand l'unité meurt ;
- **vert citron — blessure** : quand l'unité est blessée sans mourir (une fois par source de dégâts et par tour) ;
- **violet — sous 15 PV** : quand le héros du joueur passe strictement sous 15 PV. Ce seuil est le même pour tous les héros ;
- **argent — début du tour** : au début de chacun des tours du joueur ;
- **vert — fin du tour** : à la fin de chacun des tours du joueur ;
- **bleu — retour en main** : quand la carte revient dans la main ;
- **cyan — à la pioche** : quand le joueur pioche cette carte ;
- **ambre — Retard X** : une seule fois, au début du X-ième tour suivant du joueur (X de 1 à 3).

**Marqueurs sur l'icône.**
- **✦ effet composé** (étincelle en haut à droite) : l'effet est assemblé à partir d'un déclencheur, d'un contenu et d'une cible — par exemple « À la mort : inflige 2 dégâts à toutes les unités ennemies ». Son texte exact est dans la bulle de détail.
- **« A »** (en bas à gauche) : au lieu d'une cible choisie, la capacité touche toutes les unités d'un camp (ou des deux). Sur une action, il signale une capacité conférée à toutes les unités alliées.
- **« S »** : la capacité s'applique à l'unité qui la porte, et non à une autre unité.
- **« / »** : deux effets séparés par une barre forment un choix — à la résolution, le joueur n'en joue qu'un.
- **icône bicolore** (turquoise + couleur du déclencheur) : condition **Singulier**, voir le chapitre sur les decks.
- **icône barrée d'un trait rouge** : capacité rendue muette par une Neutralisation adverse.
- **chiffre accolé** : la valeur X (ou X/Y) de la capacité sur cette carte. Un **« ? »** annonce une valeur tirée au hasard.

**Valeurs X et Y.** Beaucoup de capacités portent une valeur propre à chaque carte : « Résistance 2 », « Renforcement +1/+2 ». Le lexique écrit X et Y ; la carte donne les nombres.

**Capacités « Seuil ».** Elles s'activent quand le deck de leur contrôleur tombe à 25 cartes ou moins.

**En main, rien n'est actif.** Une unité en main n'a aucune capacité active, pas même une protection, sauf celles dont le texte dit agir en main (par exemple Mutation, ou un effet « fin de tour en main »).

## 6. Les choix et l'ordre de résolution

**Qui choisit.** Quand un effet demande un choix — une cible, une carte parmi plusieurs —, c'est toujours le **propriétaire de l'effet** qui choisit, même pendant le tour adverse.

**Délai.** Le joueur dispose de 20 secondes par choix. Pendant ce temps le chrono du tour est suspendu. Sans réponse, le jeu tranche au hasard.

**Tant qu'un choix est en attente**, aucune autre action n'est possible, pour les deux joueurs : il faut d'abord le régler.

**Choix « à l'attaque ».** Un choix déclenché par une attaque se règle avant le combat ; le combat reprend ensuite.

**Ordre des effets d'une action.** Les effets d'une action se résolvent dans l'ordre où la carte les présente. Après chaque effet, les unités mortes quittent le terrain et leurs effets « à la mort » se règlent, avant de passer à l'effet suivant.

**Sans réponse d'un joueur déconnecté.** Si le joueur qui doit choisir ne répond pas, le choix est tranché au hasard.

## 7. Changer de zone : ce qu'une unité garde

Une unité qui change de zone reste la **même carte** : elle n'est pas recréée à neuf. Cela vaut pour un retour en main (Remontée), une sortie du cimetière vers le terrain ou la main (Exhumation, Rappel, Résurrection, Cycle éternel) et un renvoi dans le deck (Retour différé).

**Ce qu'elle garde.**
- Ses bonus et malus d'ATK et de PV permanents : Renforcement, Gloire, Entrainement, Affaiblissement, tout « +X/+Y » ou « -X/-Y » donné par une action ou une capacité, et les gains de Loyauté, Nécrophagie, Richesse, Instinct de meute et Dévoration.
- Les capacités qu'on lui a conférées.
Une unité morte garde donc ses bonus au cimetière, et les retrouve si elle revient.

**Ce qu'elle perd.**
- Les bonus qui dépendent du terrain, recalculés à son retour selon la situation du moment : auras comme Commandement, Sang mêlé, Force des ancêtres, Pureté, Seuil Sacrificiel ; la Fureur en cours.
- Le bonus de son objet : l'objet se détache et reste en jeu.
- Les valeurs relevées par un emblème ou un objet.
- Ses blessures, et ses états : Poison, Paralysie, neutralisation subie.
- Les décomptes de Retard en cours (ils repartent de zéro si elle est rejouée) et l'action mémorisée par Apprentissage.

**Ce qui se réarme.** Bouclier, Esquive, Ombre et Résurrection sont de nouveau disponibles. L'unité subit de nouveau le mal d'invocation (sauf Traque).

**PV au retour.** Elle revient soignée, à ses PV maximum bonus compris. Exception : Résurrection la fait revenir à 1 PV (avec ses bonus d'ATK).

**Effets d'entrée.** Rejouée, ses effets « à l'entrée en jeu » se déclenchent de nouveau, et leurs gains s'ajoutent aux bonus conservés.

**Unité volée.** Une unité dont l'adversaire a pris le contrôle (Domination) retourne à son propriétaire d'origine quand elle quitte le terrain : dans sa main, son cimetière ou son deck.

**En main.** Aucune capacité n'est active, protections comprises. Une unité blessée en main par un effet garde sa blessure (ses PV s'affichent en rouge) ; tombée à 0 PV en main, elle part au cimetière sans déclencher d'effet de mort.

**Silence.** C'est le Silence, et non le changement de zone, qui efface les gains personnels d'une unité et la ramène à ses ATK/PV imprimés. Il ne soigne pas, ne peut pas tuer, et ne touche ni aux auras ni au bonus d'un objet équipé.

## 8. Le héros, son pouvoir et les compteurs

**Pouvoir de héros.** Chaque héros a un pouvoir utilisable **une fois par tour**, en payant son coût en mana. Selon le héros, il confère une capacité à une unité, déclenche un effet d'action, ou pose un emblème.

**L'orbite du héros.** Autour du portrait gravitent ses emblèmes (losanges) et ses compteurs (médaillons). Chaque élément s'explique au survol ; ceux du héros adverse sont visibles aussi.

**Compteurs.** Plusieurs capacités alimentent des compteurs personnels. Un compteur n'apparaît que lorsqu'il dépasse 0, et son halo pulse quand il peut être dépensé. Ils ne coûtent pas de mana.
- **Épargne** (maximum 8) : un clic dépense tout le compteur pour choisir 1 carte parmi 3 tirées au hasard dans le jeu, de coût inférieur ou égal à l'Épargne. Le compteur repart à 0.
- **Foi** (maximum 10) : un clic propose 1 carte parmi 3 tirées du propre deck du joueur, de coût inférieur ou égal à la Foi. Seul le coût de la carte prise est retiré ; le reste est conservé.
- **Conquête** (palier 3) : quand le compteur atteint 3, le joueur choisit 1 carte parmi 3 tirées du deck adverse. Elle est à lui pour le reste de la partie, jouable sans contrainte de faction, et l'adversaire ne la piochera jamais. Le compteur repart à 0.
- **Invention +X/+Y** : chaque Invention ajoute +X/+Y à la machine du joueur (0/1 au départ), et parfois une capacité avec son déclencheur — deux fois la même capacité au même déclencheur additionnent leurs valeurs. La machine coûte 1 mana par Invention, 6 au plus. Un clic sur le compteur la met en main ; la suivante repart de zéro.
- **Exploration** (palier 3) : le seul compteur qui ne se clique pas. Chaque fois qu'il atteint 3, le joueur pioche une carte aussitôt et 3 points sont retirés ; le reste est conservé, si bien qu'un gros gain peut faire piocher deux cartes.

## 9. Les coûts : mana, coûts additionnels, éveil, réductions

**Mana.** Jouer une carte coûte son mana. Le mana non dépensé est perdu à la fin du tour.

**Coûts additionnels.** Certaines cartes demandent, en plus du mana, une ressource engagée au moment de les jouer. Ces coûts s'ajoutent au mana, se cumulent entre eux sur une même carte, et ne sont **jamais réductibles**.
- **Points de vie** : le héros du joueur perd N PV. Impossible si cela le tuerait.
- **Défausse** : le joueur jette au cimetière N autres cartes de sa main, qu'il désigne.
- **Sacrifice** : il détruit N unités alliées de son choix ; leurs effets « à la mort » se déclenchent.
- **Exil** : N cartes sont retirées du dessus de son deck, définitivement.
- **Repli** : il replace N cartes de sa main sur le dessus de son deck, dans l'ordre qu'il choisit — la dernière posée sera la première repiochée.

**Éveil.** Le seul coût alternatif : il **remplace** le mana. Une carte à coût d'éveil se met en éveil depuis la main, gratuitement, dans une zone dédiée. À chacun de ses tours, le joueur y verse autant de points qu'il veut, un point par mana. Le dernier point la fait entrer en jeu. 3 cartes en éveil au maximum à la fois.

**Réductions de coût.** Certaines capacités réduisent le coût en mana : Canalisation (actions, selon le terrain), Entraide (selon les alliés de même race), Concentration. Elles ne touchent jamais les coûts additionnels. Un coût réduit s'affiche en bleu clair.

## 10. Construire un deck, formats et Singulier

**Un deck contient exactement 50 cartes.**
- Une seule faction principale par deck.
- Un seul clan : c'est lui qui définit le style de jeu.
- Jusqu'à 4 cartes Mercenaires (sans clan ni allégeance, elles s'ajoutent à n'importe quel deck).
- On ne mélange pas une faction bonne et une faction maléfique.
- Répartition par rareté (mode Expert) : 2 Uniques, 4 Épiques, 6 Rares, 8 Peu Communes, 30 Communes.
- Copies : 1 exemplaire par carte non commune, 3 exemplaires par Commune.
- Une même capacité nommée ne peut pas figurer plus de 12 fois dans le deck. Dispensées de ce plafond : Vol, Chant.
- Les objets ne se mettent pas dans un deck.

**Formats.** Deux réglages se combinent :
- le mode — **Classique** (Communes seulement, 50 cartes à égalité de puissance) ou **Expert** (répartition par rareté ci-dessus) ;
- l'étendue — **Standard** (cartes des deux dernières années) ou **Étendu** (toute la collection).

**Singulier.** Un deck sans aucune carte en double est dit singulier. Certaines capacités portent la condition Singulier (icône bicolore) : elles n'agissent que si le **deck de départ** de leur contrôleur ne contenait aucun doublon.
- Cet état est fixé au lancement de la partie et ne change plus : les cartes conquises, générées ou copiées en cours de partie n'y changent rien.
- Une carte gagnée en partie profite de l'état de son nouveau contrôleur, pas de celui de son ancien propriétaire.
- Aucune règle de construction ne l'impose : c'est une prime facultative.
- L'adversaire ne découvre qu'un deck est singulier qu'à la première capacité Singulier qu'il voit jouer.

## 11. Lexique des capacités

Nom de la capacité, type de carte qui peut la porter, effet. X et Y sont les valeurs portées par la carte. Les mentions entre accolades (par exemple {race}) sont remplacées sur la carte par ce qu'elles désignent.

- **Loyauté** (unité) — +1/+1 par allié {race_bare} en jeu.
- **Ancré** (unité) — Ne peut pas être déplacé ou exilé.
- **Résistance X** (unité) — Réduit les dégâts reçus de X (minimum 1 dégât).
- **Provocation** (unité) — Les ennemis doivent attaquer cette unité en priorité.
- **Raid** (unité) — Peut attaquer une créature ennemie dès son invocation (mais pas le héros).
- **Traque** (unité) — Peut attaquer et utiliser son pouvoir activable dès son invocation.
- **Première Frappe** (unité) — Lorsque cette unité attaque, inflige ses dégâts en premier ; l'unité adverse ne riposte que si elle survit.
- **Gloire +X/+Y** (unité) — Chaque fois que cette unité survit à des dégâts de combat, elle gagne +X/+Y de façon permanente.
- **Bouclier** (unité) — Absorbe une première attaque sans dégâts.
- **Vol** (unité) — Ignore les provocations adverses.
- **Touché mortel** (unité et action) — Toute créature blessée par cette unité meurt, quels que soient ses PV.
  - sur une action : Toute créature blessée par cette action meurt, quels que soient ses PV.
- **Précision** (unité et action) — Ignore la Résistance, l'Armure, le Bouclier et le plafond d'Éthérée.
  - sur une action : Les dégâts de cette action ignorent la Résistance, l'Armure et le Bouclier.
- **Drain de vie** (unité) — Soigne votre héros des dégâts infligés.
- **Esquive** (unité) — Évite automatiquement la première attaque reçue chaque tour.
- **Poison** (unité et action) — Les unités blessées perdent 1 PV par tour.
- **Célérité** (unité) — Peut attaquer deux fois par tour.
- **Augure** (unité) — Quand cette unité inflige des dégâts au héros adverse, vous piochez une carte.
- **Bénédiction** (unité et action) — Soigne complètement l'unité ciblée.
  - sur une action : Soigne complètement une unité alliée ciblée.
- **Bravoure** (unité) — Double ses dégâts (arrondi au supérieur) contre les unités ayant une ATK supérieure à la sienne.
- **Pillage X** (unité et action) — L'adversaire défausse X cartes aléatoires de sa main.
- **Riposte X** (unité) — Quand cette unité subit des dégâts, inflige X dégâts à la source de l'attaque (unité ou héros).
- **Combustion** (unité) — Défaussez une carte de votre main, puis piochez deux cartes.
- **Terreur X** (unité) — Les unités adverses perdent X ATK en présence de cette carte.
- **Pauvreté X** (unité) — Perd autant d'ATK que de cartes en main adverse (dynamique).
- **Richesse X** (unité) — Chaque fois qu'un joueur défausse une carte de sa main, cette unité gagne +X/+X (permanent).
- **Armure** (unité) — Réduit de moitié les dégâts de combat reçus (arrondi au supérieur) ; les dégâts des actions ne sont pas réduits.
- **Commandement X** (unité) — +X/+X à vos alliés {faction_de}.
- **Fureur** (unité) — Après avoir subi des dégâts, attaque une unité adverse au hasard (le héros à défaut). 1 fois par tour.
- **Double Attaque** (unité) — En phase offensive uniquement : inflige deux fois son ATK lors de l'attaque. L'unité ciblée riposte normalement.
- **Invisible** (unité) — Ne peut pas être ciblé par des actions ni par des capacités d'unités adverses.
- **Canalisation** (unité) — Tant que cette unité est en jeu, vos actions coûtent 1 mana de moins (minimum 1).
- **Catalyse** (unité) — Vos {race_pl} en main coûtent 1 mana de moins.
- **Entraide (Race)** (unité) — Coûte 1 mana de moins par allié {race_bare} en jeu (cumulable, min. 0).
- **Contresort X** (unité et action) — Annule les X prochaines actions adverses.
- **Transformation** (unité) — Se transforme en la carte désignée. Retrouve sa forme d'origine si elle quitte le plateau.
- **Maître d'arme** (unité) — S'équipe gratuitement de 2 de vos objets en jeu, les plus chers d'abord, même portés par vos autres créatures.
- **Exclusion X** (unité et action) — Annule les X prochaines invocations d'unités adverses.
- **Convocation X** (unité) — Crée {token}.
- **Convocation** (unité et action) — Crée {token}.
- **Lycanthropie X** (unité) — Se transforme en {lycanthrope} avec Traque.
- **Malédiction X** (unité et action) — Ciblez une unité ennemie de coût ≤ X, elle est exilée à la fin du prochain tour adverse.
  - sur une action : Maudit l'unité ennemie ciblée de coût ≤ X : elle est exilée à la fin du prochain tour adverse
- **Nécrophagie** (unité) — Gagne +1 ATK et +1 PV chaque fois qu'une unité (alliée ou ennemie) meurt.
- **Force des ancêtres +X/+Y** (unité) — Tant que votre cimetière compte 7 créatures ou plus, gagne +X ATK et +Y PV.
- **Pureté +X/+Y** (unité) — Tant que votre cimetière est vide, gagne +X ATK et +Y PV.
- **Seuil Sacrificiel +X/+Y** (unité) — Tant que votre deck compte 25 cartes ou moins, gagne +X ATK et +Y PV.
- **Seuil de colère X** (action) — Si votre deck compte 25 cartes ou moins, cette action inflige X dégâts supplémentaires.
- **Chant** (unité et action) — Vos actions avec Chant sont renforcées tant que cette unité est en jeu.
- **Lune X** (unité et action) — À partir de la deuxième carte jouée dans le tour, toutes ses valeurs sont augmentées de X — définitivement.
- **Soleil X** (unité et action) — Si c'est la première carte jouée dans le tour, toutes ses valeurs sont augmentées de X — définitivement.
- **Paralysie** (unité) — Les unités qu'elle blesse ne peuvent ni attaquer ni activer de capacité jusqu'à la fin de leur prochain tour.
- **Permutation** (unité) — Échange les PV actuels de deux unités ciblées (une alliée et une ennemie).
- **Persécution X** (unité) — Chaque fois que cette unité attaque, inflige X dégâts au héros adverse.
- **Piétinement** (unité) — En attaque, les dégâts excédant les PV de la créature ciblée vont au héros adverse.
- **Ombre du passé** (unité) — +1/+1 par unité {race_bare} dans votre cimetière.
- **Savant** (unité) — Gagne +1 ATK et +1 PV par action dans votre cimetière.
- **Profanation X** (unité) — Exile jusqu'à X cartes de votre cimetière, les plus récentes d'abord : +1/+1 par carte exilée.
- **Prescience X** (unité) — Piochez des cartes jusqu'à avoir X cartes en main.
- **Suprématie** (unité) — Gagne +1 ATK et +1 PV par carte dans votre main au moment de l'invocation.
- **Divination** (unité et action) — Révèle les 3 premières cartes du deck ; replacez-en 1 dessus et 2 dessous, dans l'ordre choisi.
- **Liaison de vie** (unité) — Partage les dégâts subis avec le héros adverse.
- **Ombre** (unité) — Ne peut être ciblée ni attaquée tant qu'elle n'a pas effectué une action (attaque ou capacité).
- **Sacrifice** (unité) — Détruisez un allié pour gagner ses PV et son ATK de manière permanente.
- **Maléfice** (unité) — À la mort, inflige X dégâts à toutes les unités (alliés et ennemis), X = son ATK.
- **Synergie X** (unité) — À son arrivée, choisissez une capacité : gagne +X/+X à chacun de ses déclenchements (1 fois par source et par tour).
- **Éthérée** (unité) — Subit au plus 1 dégât par coup en combat. Les dégâts des actions qu'elle subit sont doublés.
- **Indestructible** (unité) — Ne subit aucun dégât de combat.
- **Régénération X** (unité) — Récupère X PV au début de votre tour.
- **Corruption X** (unité et action) — Convertit une unité ennemie de coût ≤ X à votre camp jusqu'à la fin du tour ; elle gagne Traque.
  - sur une action : Convertit l'unité ennemie ciblée de coût ≤ X à votre camp jusqu'à la fin du tour ; elle gagne Traque.
- **Carnage X** (unité) — Inflige X dégâts à toutes les unités en jeu (alliées et ennemies).
- **Héritage X** (unité) — Chaque unité alliée en jeu gagne +X ATK et +X PV de manière permanente.
- **Mimique** (unité) — Copie toutes les capacités d'une unité ciblée et les attribue à cette unité de manière permanente.
- **Métamorphose** (unité) — Cette unité devient une copie exacte (ATK / PV / capacités) d'une unité ciblée.
- **Dédoublement** (unité) — Crée en jeu une copie exacte de cette créature.
- **Tactique X** (unité) — Donne à une unité alliée ciblée X capacités tirées au hasard parmi celles des créatures de même coût.
- **Héritage du cimetière** (unité) — Attribue à cette unité les capacités d'une unité ciblée dans votre cimetière.
- **Pacte de sang** (unité) — À sa mort, invoque deux tokens 1/1 de sa race.
- **Sacrifice démoniaque X** (unité) — À sa mort, répartit X réductions de -1 mana entre les Démons de votre main (min. 1).
- **Souffle de feu X** (unité) — Inflige X dégâts à toutes les unités ennemies lors de l'attaque (ex : Souffle de feu 2 = 2 dégâts).
- **Domination X** (unité et action) — Prend le contrôle d'une unité ennemie au hasard de coût ≤ X à son invocation.
  - sur une action : Prend le contrôle de l'unité ennemie ciblée de coût ≤ X.
- **Résurrection** (unité) — Revient en jeu après sa mort avec 1 PV ; perd la capacité Résurrection à son retour.
- **Transcendance** (unité) — Immunité totale aux actions adverses : ne peut subir aucun dégât ni effet d'action, y compris les actions de zone.
- **Vampirisme X** (unité) — Vole jusqu'à X PV à une unité ennemie ciblée et les ajoute aux PV de cette unité.
- **Traque du destin X** (unité) — Révèle les X premières cartes du deck ; gardez-en une en main, replacez les autres dessous au hasard.
- **Cycle éternel** (unité) — Ajoutez une copie de cette carte dans votre deck ; si elle est piochée, mettez-la directement en jeu.
- **Sang mêlé** (unité) — Gagne +1 ATK et +1 PV pour chaque type de race différent parmi vos alliés en jeu.
- **Instinct de meute X** (unité) — +X/+X si un allié {faction_de} est mort ce tour.
- **Totem** (unité) — Gagne les capacités de vos {race_pl} en jeu.
- **Fierté du clan** (unité) — Tant qu'elle est en jeu, vos unités {clan_de} invoquées arrivent avec +1/+1.
- **Appel du clan X** (unité et action) — Met en jeu gratuitement la 1re unité {clan_de} de coût ≤ X du dessus de votre deck.
  - sur une action : Met en jeu gratuitement la 1re unité {clan_de} de coût ≤ X de votre deck.
- **Appel Suprême** (unité et action) — Ajoute en main la carte au coût le plus élevé de votre deck (au hasard si égalité).
- **Solidarité X** (unité) — Piochez X cartes si vous contrôlez 2 autres unités {race_bare}.
- **Rassemblement X** (unité et action) — Révèle les X premières cartes du deck ; gardez les {race_pl} en main, défaussez le reste.
- **Rappel X** (unité et action) — Remettez une carte ciblée de coût ≤ X de votre cimetière dans votre main.
  - sur une action : Renvoie une carte de coût ≤ X de votre cimetière dans votre main
- **Exhumation X** (unité et action) — Ressuscite une unité de votre cimetière dont le coût en mana est égal ou inférieur à X.
  - sur une action : Ressuscite une créature (coût ≤ X) de votre cimetière sur le terrain
- **Sélection X** (unité et action) — Révèle 3 communes {alignment} de coût X ; ajoutez-en une en main.
  - sur une action : Révèle 3 communes {alignment} de coût X ; ajoutez-en une en main
- **Forge X** (unité et action) — Mélange dans votre deck un objet neutre{forge_align}{forge_cout}, au hasard.
  - sur une action : Mélange dans votre deck un objet neutre{forge_align}{forge_cout}, au hasard
- **Faveur X** (unité et action) — Ajoute en main une commune {alignment} de coût X, au hasard.
  - sur une action : Ajoute en main une commune {alignment} de coût X, au hasard
- **Sélection magique X** (unité et action) — Révèle 3 actions communes {alignment} de coût X ; ajoutez-en une en main.
  - sur une action : Révèle 3 actions communes {alignment} de coût X ; ajoutez-en une en main
- **Trésor X** (unité et action) — Révèle 3 objets communs {alignment} ou neutres de coût X ; ajoutez-en un en main.
  - sur une action : Révèle 3 objets communs {alignment} ou neutres de coût X ; ajoutez-en un en main
- **Sélection Royale X** (unité et action) — Révèle 3 de vos éditions limitées de coût X (≥30 requises ; sinon 3 communes {alignment}) ; gardez-en une.
  - sur une action : Révèle 3 de vos éditions limitées de coût X (≥30 requises ; sinon 3 communes {alignment}) ; gardez-en une
- **Relancer X** (unité et action) — Rejoue les X dernières actions jouées avec des cibles aléatoires.
  - sur une action : Rejoue les X dernières actions jouées avec des cibles aléatoires
- **Déchainement X/Y** (unité et action) — Joue X actions aléatoires de coût Y de votre collection ({alignment}), avec des cibles aléatoires.
- **Invocation X** (unité et action) — Invoque une créature aléatoire de coût X de votre collection ({alignment}, format en cours).
- **Impact X** (unité et action) — Inflige X dégâts à une cible ennemie (unité ou héros).
- **Déferlement X** (action) — Inflige X dégâts à toutes les créatures ennemies
- **Boomerang** (action) — Après sa résolution, cette action est mélangée dans votre deck au lieu d'aller au cimetière.
- **Siphon X** (action) — Inflige X dégâts à une cible et soigne votre héros du même montant
- **Entrave X** (action) — Paralyse une créature ennemie ciblée pendant X tour(s)
- **Exécution X** (unité et action) — Détruit une unité ennemie ciblée de coût ≤ X.
- **Silence** (unité et action) — Retire tous les mots-clés d'une autre unité ciblée et ramène ses stats à leur valeur d'origine.
- **Renforcement +X/+Y** (unité et action) — Donne +X ATK et +Y PV de façon permanente à une autre unité alliée ciblée.
  - sur une action : +X/+Y à une créature alliée ciblée.
- **Discipline +X/+Y** (unité et action) — Si tous les coûts de votre plateau ont la parité du sien, donne +X/+Y permanent à une autre unité alliée ciblée.
  - sur une action : Si toutes vos créatures en jeu ont un coût de même parité que celui de cette action, +X/+Y à une créature alliée ciblée.
- **Lien du sang X** (unité) — Gagne +X/+X et vous perdez X PV, si vos PV le permettent.
- **Usurpation +X/+Y** (unité et action) — Donne +X/+Y permanent à une autre unité alliée ciblée par carte adverse que vous avez jouée.
  - sur une action : +X/+Y à une créature alliée ciblée par carte adverse que vous avez jouée.
- **Esprit de corps** (unité) — Gagne +1 ATK ou +1 PV au hasard par Esprit de corps que vous avez déjà déclenché.
- **Mutation X** (unité) — En main : découvrez 2 créatures communes de coût X. Prend leurs meilleures ATK et PV et 1 capacité de chacune.
- **Infestation X** (unité) — Mélange X copies de cette unité dans votre deck. Piochée, une copie est invoquée et vous piochez une autre carte.
- **Affaiblissement -X/-Y** (unité et action) — Donne -X ATK et -Y PV à une créature ennemie ciblée.
- **Guérison X** (unité et action) — Restaure X PV à une autre unité alliée ciblée ou à votre héros.
- **Seconde vie X** (unité et action) — Peut être jouée depuis votre cimetière pour X mana. Elle perd alors Seconde vie.
- **Incinération X** (unité et action) — Remet X cartes au hasard du cimetière ciblé sous le deck de son propriétaire.
  - sur une action : Remet X cartes au hasard du cimetière ciblé sous le deck de son propriétaire
- **Enterrement X** (unité et action) — Place les X premières cartes du deck du joueur ciblé dans son cimetière (fatigue par carte manquante).
  - sur une action : Place les X premières cartes du deck du joueur ciblé dans son cimetière
- **Dévoration** (unité) — Détruit une unité ciblée ; cette créature gagne définitivement son ATK et ses PV.
- **Creuser X** (unité et action) — Regardez les X cartes du dessous de votre deck ; placez-en une sur le dessus.
  - sur une action : Regardez les X cartes du dessous de votre deck ; placez-en une sur le dessus
- **Présage** (unité et action) — Révèle 3 cartes du dessus dans le désordre ; désignez celle du sommet pour la prendre en main, puis mélangez le deck.
- **Apprentissage X** (unité) — Retire une action de coût ≤ X de votre main et la mémorise : la créature peut la jouer sans payer de mana.
- **Retour différé X** (unité et action) — Place l'unité ciblée de coût ≤ X sous le deck de son propriétaire.
  - sur une action : Place l'unité ou l'objet ciblé de coût ≤ X sous le deck de son propriétaire
- **Épargne X** (unité et action) — Ajoute X à votre compteur d'Épargne (maximum 8).
  - sur une action : Ajoute X à votre compteur d'Épargne (maximum 8)
- **Foi X** (unité et action) — Ajoute X à votre Foi (max. 10). Dépense : découvrez 1 carte parmi 3 du deck de coût ≤ Foi, seul ce coût est retiré.
  - sur une action : Ajoute X à votre Foi (max. 10). Dépense : découvrez 1 carte parmi 3 du deck de coût ≤ Foi, seul ce coût est retiré
- **Conquête X** (unité et action) — Ajoute X à votre Conquête (palier 3). Au palier : prenez en main 1 carte parmi 3 du deck adverse, compteur remis à 0.
  - sur une action : Ajoute X à votre Conquête (palier 3). Au palier : prenez en main 1 carte parmi 3 du deck adverse, compteur remis à 0
- **Exploration X** (unité et action) — Ajoute X à votre Exploration. Chaque fois qu'elle atteint 3 : piochez une carte et retirez 3 (le reste est conservé).
  - sur une action : Ajoute X à votre Exploration. Chaque fois qu'elle atteint 3 : piochez une carte et retirez 3 (le reste est conservé)
- **Invention +X/+Y** (unité et action) — Ajoute +X/+Y{machine_part} à votre machine (0/1 au départ, 1 mana par Invention, 6 au plus).
  - sur une action : Ajoute +X/+Y{machine_part} à votre machine (0/1 au départ, 1 mana par Invention, 6 au plus)
- **Inspiration X** (unité et action) — Piochez X cartes.
  - sur une action : Piochez X cartes
- **Remontée X** (unité et action) — Renvoie X unité(s) ciblée(s) dans la main de leur propriétaire d'origine.
  - sur une action : Renvoie X unité(s) ou objet(s) ciblé(s) dans la main de leur propriétaire d'origine.
- **Entrainement X** (unité et action) — +X/+X à vos créatures {faction_de} en main.
- **Fortifier +X/+Y** (unité et action) — La première créature de votre deck en partant du dessus gagne +X ATK et +Y PV de façon permanente.
- **Préincanter X** (unité et action) — La première action de votre deck en partant du dessus coûte X mana de moins (minimum 1), de façon permanente.
- **Concentration X** (unité et action) — Chaque action en main devient une action au hasard de coût +X, réduite de X (toutes factions).
- **Invocations multiples** (unité et action) — Invoque {invocations}.
- **Convocations multiples** (unité et action) — Crée {tokens}.
- **Canon X** (unité et action) — Inflige X dégâts à une unité ennemie au hasard.
- **Tempête X** (unité et action) — Inflige X dégâts répartis aléatoirement entre les unités ennemies.
- **Cataclysme X** (unité et action) — Inflige X dégâts à toutes les créatures (alliées ET ennemies).
- **Afflux X** (unité et action) — Gagnez X mana ce tour.
- **Neutralisation** (unité) — Tant qu'elle est en jeu, l'unité ennemie ciblée est paralysée et ses capacités sont sans effet.
- **Conférer** (unité) — Confère {ability} {scope}.
- **Déclenchement** (unité) — Rejoue une fois les effets composés de vos autres alliés (entrée / mort / fin de tour / retour).
- **Compagnons** (unité et action) — Mélange ses compagnons (cartes liées, choisies à la création) dans votre deck, puis remélange le deck. Une seule fois.
- **Tuteur** (unité et action) — Ajoute à votre main les cartes désignées à la création (une même carte peut l'être plusieurs fois).

## 12. Précisions par capacité

Cas particuliers, exceptions et arbitrages. Ils complètent le lexique : en cas de doute sur une capacité, ce qui est écrit ici fait foi.

**Exécution X**
- Portée par une unité, Exécution X détruit une unité ENNEMIE que vous désignez ; Transcendance ne protège pas la cible, car il s'agit d'une capacité d'unité et non d'une action.
- En version « toutes », Exécution X d'une unité détruit toutes les unités ET tous les objets ennemis, et ne touche rien dans votre camp.
- Une action Exécution X « toutes les ennemies » détruit aussi les objets ennemis ; vos propres objets restent en place.
- Quand une unité déclenche Exécution X à sa mort, c'est son propriétaire qui choisit la cible, même si elle meurt pendant le tour adverse.

**Silence**
- Portée par une unité, Silence vise une AUTRE unité, alliée ou ennemie ; Transcendance ne protège pas la cible.
- Une unité peut porter un Silence qui s'applique à elle-même : il se déclenche alors sans cible à désigner et ne touche aucune autre unité.
- En version « toutes », le Silence d'une unité frappe toutes les AUTRES unités et tous les objets des deux camps ; la porteuse garde ses capacités.
- Une unité réduite au silence perd toutes ses capacités, son Bouclier, sa paralysie, ses bonus de Fureur, et son attaque et ses PV maximum reviennent aux valeurs imprimées sur la carte.
- Le Silence ne soigne pas et ne tue pas : les PV actuels sont seulement ramenés au nouveau maximum s'ils le dépassent.
- Le Silence remet à zéro les gains de Gloire déjà accumulés.
- Une unité réduite au silence conserve le bonus que lui donne le Commandement d'un allié encore en jeu.
- Selon la carte, un Silence peut viser tout un camp, y compris le vôtre (toutes les unités ennemies, toutes vos unités).
- Le Silence fait oublier à une unité l'action qu'elle avait mémorisée par Apprentissage, et désarme ses charges de Contresort et d'Exclusion.

**Guérison X**
- Guérison X ne soigne que votre camp : une unité alliée ou votre héros, jamais l'adversaire — en action comme en capacité d'unité.
- Portée par une unité, Guérison X vise une AUTRE unité alliée ou votre héros.
- En version « toutes », Guérison X soigne toutes vos unités ET votre héros (pour une unité porteuse : toutes vos autres unités et votre héros).
- Une unité peut porter une Guérison X qui s'applique à elle-même : elle se soigne sans cible à désigner.

**Afflux X**
- Une unité avec Afflux X vous donne X mana à son entrée en jeu, utilisable le tour même : une unité de coût 2 avec Afflux 3 vous laisse 1 mana de plus qu'avant de la jouer.
- Le mana gagné par Afflux X s'ajoute à votre mana du tour sans plafond.
- Si l'Afflux X d'une unité est lié à un autre moment (fin de tour, activation, mort…), elle ne donne rien à son entrée en jeu.
- Afflux X à l'activation engage l'unité.

**Lune X et Soleil X**
- Soleil X ne renforce une carte que si elle est la PREMIÈRE carte que vous jouez dans le tour ; Lune X ne renforce qu'à partir de la DEUXIÈME. La carte en train d'être jouée ne se compte jamais elle-même.
- Le bonus s'ajoute à TOUTES les valeurs de la carte : une action Impact 3 avec Lune 2 inflige 3 dégâts en première carte du tour et 5 ensuite ; un couple +X/+Y gagne le bonus sur ses deux moitiés.
- Le nombre de répétitions d'un effet (« 2 fois : ») est lui aussi augmenté : avec Soleil 2 en première carte, « 2 fois » devient « 4 fois ».
- Le compteur de cartes jouées repart de zéro au début de chacun de vos tours.
- Compte comme « carte jouée » toute carte que vous jouez vous-même, y compris une carte jouée depuis le cimetière par Seconde vie.
- Ne comptent pas : une carte refusée (terrain plein), un jeton ou une unité mise en jeu par un effet, une action rejouée par Relancer X.
- Une action rejouée par un effet ne profite pas du bonus de Lune ou de Soleil de la carte qui la rejoue.
- Sur une unité, le bonus est fixé au moment où elle entre en jeu et dure tant qu'elle reste sur le terrain, même aux tours suivants.
- Si l'unité revient en main et est rejouée, le bonus est réévalué : rejouée quand la condition n'est plus remplie, elle retrouve ses valeurs d'origine ; rejouée quand elle l'est, elle ne cumule pas deux fois le bonus.
- Lune, Soleil et Chant ne s'augmentent jamais entre eux : le X de l'un n'est pas majoré par un autre.
- Une carte qui porte à la fois Soleil X et Lune X reçoit l'un OU l'autre selon le moment où elle est jouée, jamais les deux.
- Les bonus de Lune ou de Soleil et celui de Chant s'additionnent sur une même action.

**Appel Suprême**
- Appel Suprême met en main la carte au coût le plus élevé de votre deck, quels que soient son type (unité ou action) et sa race.
- En cas d'égalité de coût, la carte est tirée au hasard parmi les plus chères.
- Deck vide : Appel Suprême ne fait rien.
- Certaines cartes restreignent Appel Suprême (race, clan, faction, capacité portée, coût maximum) : vous recevez alors la plus chère des cartes de votre deck qui respectent la restriction, même si une autre carte coûte plus.
- Si aucune carte de votre deck ne respecte la restriction, rien ne se passe.
- Un Appel Suprême répété (« 3 fois : ») ramène les cartes les plus chères l'une après l'autre, par coût décroissant.

**Apprentissage X**
- Apprentissage X retire de votre main une action de coût imprimé ≤ X et l'unité la mémorise ; une action plus chère ne peut pas être apprise.
- Sans X sur la carte, n'importe quelle action peut être apprise, quel que soit son coût.
- Si vous n'avez en main aucune action apprenable, rien ne se passe.
- Une unité n'apprend qu'UNE action, définitivement : un nouveau déclenchement d'Apprentissage ne remplace pas l'action déjà mémorisée.
- Quand l'Apprentissage se déclenche à un moment où vous ne pouvez pas choisir (fin de tour par exemple), l'action est désignée au hasard parmi celles de coût ≤ X de votre main.
- Lancer l'action mémorisée ne coûte aucun mana (possible à 0 mana), mais ses coûts additionnels restent dus : points de vie, défausse, exil de cartes du deck…
- L'action mémorisée est refusée si son coût additionnel est impayable : main vide pour une défausse, coût en PV qui serait mortel, deck trop court pour un exil.
- Lancer l'action mémorisée engage l'unité : une fois par tour au plus, et impossible si elle est déjà engagée, paralysée ou arrivée ce tour (sauf Traque).
- L'action reste mémorisée après usage et ne va jamais au cimetière : l'unité peut la relancer à chaque tour, une fois désengagée.
- Lancer l'action mémorisée révèle une unité dans l'Ombre.
- L'action mémorisée disparaît définitivement si l'unité meurt (elle ne va pas au cimetière), si elle retourne en main, ou si elle est réduite au silence.
- Bien que lancée gratuitement, l'action mémorisée garde son coût imprimé pour les effets qui lisent le coût (par exemple Discipline +X/+Y).

**Gloire +X/+Y**
- Chaque fois qu'une unité avec Gloire +X/+Y survit à des dégâts de combat, elle gagne +X/+Y de façon permanente (ses PV maximum augmentent aussi).
- La Gloire se déclenche aussi quand l'unité ATTAQUE et survit à la riposte.
- Les gains se cumulent : deux combats survécus donnent deux fois le bonus.
- Une unité qui meurt au combat ne gagne rien.
- Si un Bouclier absorbe entièrement le coup, la Gloire ne se déclenche pas (aucune blessure subie).
- Les dégâts d'une action ou d'une capacité (par exemple Souffle de feu) ne déclenchent pas la Gloire : seuls les dégâts de combat comptent.
- Dans un échange de coups simultané, l'unité frappe avec son attaque d'AVANT le gain de Gloire : le bonus ne compte qu'à partir du combat suivant.
- Une Gloire conférée par une autre carte ou par un pouvoir de héros utilise le +X/+Y indiqué par cet effet.

**Canon X**
- Canon X inflige X dégâts, d'un seul bloc, à UNE unité ennemie tirée au hasard.
- Canon X ne touche jamais le héros adverse : sans unité ennemie sur le terrain, il ne fait rien.
- Une unité dans l'Ombre peut être touchée par Canon X (le tirage au hasard ignore l'Ombre).
- Une action Canon X ne peut pas tomber sur une unité avec Transcendance : le tir va toujours sur une autre unité ennemie.
- Sur une action, Précision fait ignorer la Résistance de l'unité touchée par Canon X.
- Une unité qui déclenche Canon X à sa mort tire quand même.
- Canon X porté par un objet est transmis à l'unité équipée : c'est elle qui tire (par exemple à l'attaque).

**Faveur X**
- Faveur X ajoute à votre main une carte commune de coût EXACTEMENT X, tirée au hasard ; s'il n'existe aucune carte de ce coût, rien ne se passe (aucun repli sur un autre coût).
- La carte offerte vient de votre alignement ou des neutres, jamais de l'alignement opposé, et toujours d'une rareté Commune.
- Main pleine : Faveur X ne donne rien.
- Les deux joueurs voient la carte offerte par Faveur X.
- Une Faveur répétée (« N fois : ») offre N cartes.
- Sans X sur la carte, Faveur tire parmi les cartes de tous les coûts.

**Foi X**
- Foi X ajoute X à votre compteur de Foi, plafonné à 10 ; chaque joueur a son propre compteur, indépendant de l'Épargne.
- À votre tour, vous pouvez dépenser de la Foi : 3 cartes de VOTRE deck de coût ≤ votre Foi vous sont proposées (moins s'il y en a moins), vous en prenez une en main.
- Seul le coût de la carte choisie est retiré du compteur ; le reste est conservé, et vous pouvez dépenser plusieurs fois dans le même tour tant qu'il reste de la Foi.
- Avec un compteur à 0, rien n'est proposé, même si votre deck contient des cartes de coût 0.
- Si aucune carte de votre deck n'est assez bon marché, rien n'est proposé.
- La carte prise par la Foi n'est pas une pioche : les effets « à la pioche » ne se déclenchent pas et l'ordre du reste du deck ne change pas.
- Main pleine : la dépense est refusée et la Foi n'est pas consommée.

**Conquête X**
- Conquête X ajoute X à votre compteur de Conquête, plafonné à 3 ; chaque joueur a le sien, indépendant de l'Épargne et de la Foi.
- Quand le compteur atteint 3, vous pouvez, à votre tour, révéler 3 cartes du deck ADVERSE (sans condition de coût) et en prendre une en main ; sous 3, rien n'est possible.
- Si le deck adverse contient moins de 3 cartes, vous choisissez parmi celles qui restent ; s'il est vide, rien n'est proposé.
- Après la prise, le compteur revient à 0 et peut être rechargé jusqu'à 3 pour une nouvelle prise.
- La carte conquise vous appartient pour le reste de la partie et vous pouvez la jouer quelle que soit sa faction.
- Les deux cartes non retenues restent à leur place : le deck adverse n'est pas mélangé.
- Main pleine : la prise est refusée et le compteur reste à 3.

**Transformation**
- Une unité qui se transforme devient la carte désignée, sur place : elle prend l'attaque et les PV pleins de sa nouvelle forme (ses blessures disparaissent), sans déclencher d'effet d'entrée en jeu.
- Elle garde ses objets équipés et son état du tour : une unité qui a déjà attaqué ne peut pas réattaquer grâce à sa transformation.
- La Transformation ne joue qu'une fois : la nouvelle forme ne se retransforme pas aux déclenchements suivants.
- Transformation « à l'attaque » : l'unité se transforme AVANT le combat et c'est la nouvelle forme qui frappe et encaisse.
- Transformation « à la mort » : l'unité revient sur le terrain sous sa nouvelle forme, PV pleins, et ne peut pas attaquer tout de suite (sauf Traque).
- Transformation « à la mort » ne fait rien si votre terrain est plein.
- Ses autres effets « à la mort » se résolvent avant la transformation, sous sa forme d'origine.
- Une unité transformée qui quitte le terrain (mort, retour en main, retour au deck) reprend sa forme d'origine, avec ses valeurs d'origine.
- Une action peut transformer d'autres unités (une au choix, toutes les ennemies, toutes les unités des deux camps) ; elles aussi reprennent leur forme d'origine en quittant le terrain.
- Si l'action désigne plusieurs cartes d'arrivée, chaque unité transformée tire la sienne au hasard.

**Chant X**
- Une action avec Chant X voit toutes ses valeurs augmentées de X si vous contrôlez au moins une unité avec Chant : Impact 2 avec Chant 2 inflige 4 avec une chanteuse, 2 sans.
- Le bonus ne se cumule pas : trois unités avec Chant ne donnent pas plus qu'une seule.
- Seules VOS unités avec Chant comptent ; une chanteuse adverse n'active rien.
- Une action sans Chant n'est jamais renforcée, quel que soit le nombre de chanteuses.
- Tous les effets de l'action sont renforcés, pas seulement le premier, et un couple +X/+Y gagne le bonus sur ses deux moitiés (+1/+1 devient +3/+3 avec Chant 2).
- La présence d'une chanteuse est constatée au lancement de l'action : si l'action tue votre propre chanteuse, ses effets suivants restent renforcés.
- Les effets déclenchés par l'action chez d'autres cartes (par exemple l'effet « à la mort » d'une unité qu'elle tue) ne sont pas renforcés.
- Une action rejouée par Relancer X n'hérite pas du Chant de l'action qui la rejoue.
- Le bonus ne fait pas dépasser les plafonds : une Épargne renforcée reste limitée à 8.
- Le bonus élargit aussi les limites de coût de l'action : une Exhumation 2 avec Chant 4 et une chanteuse en jeu peut ranimer une unité de coût 6.
- Dans un deck, la capacité Chant n'est pas soumise à la limite de 12 cartes portant une même capacité.

**Commandement X**
- Commandement X donne +X/+X à vos autres unités de la même faction ; la porteuse ne se renforce pas elle-même et les unités d'une autre faction ne reçoivent rien.
- Plusieurs Commandements s'additionnent, chacun avec son propre X (Commandement 1 + Commandement 3 = +4/+4).
- Le bonus disparaît dès que la porteuse quitte le terrain.
- Un Commandement sans valeur indiquée vaut Commandement 1 (+1/+1).

**Choix à faire pendant une partie**
- Tout choix lié à un effet revient au propriétaire de la carte qui le déclenche, même pendant le tour adverse (par exemple un effet « à la mort » qui demande une cible).
- Vous disposez de 20 secondes pour chaque choix ; passé ce délai, le choix est fait au hasard.
- Le temps passé dans une fenêtre de choix n'est pas décompté du chrono de tour (90 secondes).
- Si le joueur qui doit choisir ne répond pas (déconnexion), le choix est tranché au hasard au bout de 45 secondes supplémentaires.
- Un effet « à l'attaque » qui demande de choisir une carte (Sélection X, Sélection Royale X…) suspend l'attaque : vous choisissez d'abord, le combat a lieu ensuite.
- Tant que cette attaque est suspendue, aucune autre attaque ne peut être déclarée ; si le tour se termine avant, le combat suspendu se joue d'abord.
- Une capacité ciblée « à l'attaque » (par exemple un affaiblissement) demande sa cible au moment où vous déclarez l'attaque et s'applique AVANT les dégâts du combat.
- Quand plusieurs choix sont en attente, ils sont traités un par un, dans l'ordre, chacun par son propriétaire.

**Effets « Au choix » (OU)**
- Quand une carte propose plusieurs effets « Au choix », vous en choisissez UN SEUL : il se résout, les autres sont abandonnés.
- Rien ne se résout tant que vous n'avez pas répondu.
- Les autres effets de la carte, non marqués « Au choix », se résolvent normalement sans rien demander.
- Si vous ne répondez pas à temps, un des effets proposés est tiré au hasard — jamais plusieurs.

**Effets répétés (« N fois : »)**
- Un effet précédé de « N fois : » se résout N fois de suite ; la répétition porte sur tout l'effet, restrictions de coût et de type comprises.
- Un effet ne se répète jamais plus de 10 fois.
- Une Sélection répétée ouvre N fenêtres successives de 3 cartes ; vous gardez une carte par fenêtre, et chaque fenêtre a son propre tirage.
- Un Appel répété met en jeu les N premières unités éligibles de votre deck et s'arrête dès qu'il n'en reste plus.
- Pour un effet qui désigne des cartes précises (Tuteur, Invocation d'unités désignées), c'est la liste entière qui est rejouée : [A, B] trois fois donne A B A B A B.

**Sélection X et Sélection Royale X**
- Une Sélection ne propose que des cartes de coût EXACTEMENT X.
- Certaines cartes restreignent la Sélection (race, clan, faction, capacité portée, type de carte) ; plusieurs restrictions se cumulent.
- Si aucune carte ne correspond, la Sélection ne propose rien et ne donne rien : la restriction n'est jamais élargie.
- Une action qui contient deux Sélections ouvre deux fenêtres l'une après l'autre, avec des propositions différentes, et vous gardez une carte par fenêtre.
- Sélection Royale X propose des cartes communes à la place de vos éditions limitées si vous n'en possédez pas au moins 30.

**Déchainement X/Y**
- Déchainement X/Y joue X actions de coût EXACTEMENT Y, tirées au hasard, avec des cibles aléatoires ; il n'y a aucun repli sur un coût inférieur.
- S'il n'existe aucune action au coût demandé, rien ne se passe.
- Les actions tirées ne peuvent pas porter elles-mêmes Déchainement ou Relancer.
- Quand Y est marqué « ? », chaque action est tirée parmi les coûts de 1 à Y, jamais au-dessus.
- Une unité peut porter Déchainement X/Y : elle joue alors ces actions au moment prévu par sa carte (par exemple à son entrée en jeu).
- Déchainement X/Y joue X actions tirées au hasard, de coût exactement Y : s'il n'existe aucune action de ce coût, rien n'est joué (aucun repli sur un coût inférieur).
- Quand Y est marqué « ? », Y devient un plafond : chaque action est tirée parmi celles de coût 1 à Y, et le coût peut donc varier d'une action à l'autre.
- Les actions sont tirées parmi les communes (et les éditions limitées que vous possédez) des factions du même alignement que la carte ou neutres.
- Chaque tirage est indépendant : la même action peut sortir plusieurs fois.
- Une action qui porte elle-même Déchainement X/Y ou Relancer X ne peut jamais être tirée.
- Chaque action tirée se résout en entier (tous ses effets), avec des cibles choisies au hasard.

**Effets visant le cimetière**
- La limite de coût « ≤ X » d'une Exhumation X ne s'applique qu'à l'Exhumation : un autre effet de la même carte qui vise une unité du cimetière (par exemple lui conférer une capacité) peut choisir une unité de n'importe quel coût.
- Quand une action demande plusieurs cibles au cimetière, vous les désignez l'une après l'autre et tous les choix sont pris en compte.

**Contresort X**
- Une unité avec Contresort X annule les X prochaines actions jouées par l'adversaire, puis sa garde est épuisée.
- Une action annulée part au cimetière sans aucun effet.
- Sans valeur indiquée, Contresort vaut Contresort 1.
- Une action Contresort X donne X contres à son lanceur, sans unité pour les porter ; plusieurs actions Contresort se cumulent.
- Les contres obtenus par une action sont consommés AVANT la garde d'une unité avec Contresort.
- Une action Contresort peut elle-même être annulée par un Contresort adverse : elle ne donne alors aucun contre.

**Exclusion X**
- Exclusion X annule les X prochaines unités JOUÉES par l'adversaire : l'unité part directement au cimetière, son coût reste payé.
- L'unité annulée n'entre pas en jeu : aucun de ses effets d'entrée en jeu ne se déclenche.
- Exclusion X n'affecte ni vos propres unités ni les actions adverses.
- Seules les unités jouées par l'adversaire (depuis la main, par éveil ou par Seconde vie) sont annulées ; les unités mises en jeu par un effet (Invocation X, Appel, jetons, résurrections) passent.
- Une action Exclusion X donne X exclusions à son lanceur, consommées AVANT la garde d'une unité avec Exclusion.
- Réduire au silence une unité avec Exclusion X lui retire toutes ses charges.

**Coûts « ? » avec plancher (A à X)**
- Sur une Sélection marquée « ? », le coût des cartes proposées est compris entre un plancher A et X (par exemple « 4 à 6 ») ; sans plancher, entre 1 et X.
- La même plage vaut pour Sélection magique (actions), Faveur (la carte offerte coûte entre A et X) et les invocations d'unités à coût « ? ».
- Sans « ? », le coût reste exactement X.
- Dans une plage de coûts, chaque CARTE éligible a la même chance d'être tirée : un coût représenté par peu de cartes est donc tiré moins souvent.

**Capacités sans coût indiqué**
- Quand une capacité à limite de coût n'affiche aucun X (Rappel, Exhumation, Invocation, Sélection, Faveur…), elle accepte les cartes de n'importe quel coût.
- Rappel X ne ramène en main qu'une carte de coût ≤ X : Rappel 2 ne peut pas reprendre une carte de coût 3.
- Sans coût indiqué, une Invocation ou une Sélection tire chaque carte éligible avec la même chance, quel que soit son coût.

**Coût d'éveil**
- Une carte dotée d'un coût d'éveil peut être mise en éveil au lieu d'être jouée : elle quitte votre main pour une zone à part, sans dépenser de mana, même à 0 mana.
- Vous pouvez avoir au plus 3 cartes en éveil en même temps.
- Une carte en éveil n'est ni en main, ni sur le terrain, ni au cimetière, ni dans le deck, et ne peut plus être jouée normalement.
- Chaque point d'éveil coûte 1 mana ; vous pouvez verser plusieurs points dans le même tour, y compris le tour de la mise en éveil.
- Le dernier point ne se verse pas à l'avance : le payer (1 mana) fait entrer la carte en jeu. Un versement est donc limité à votre mana et au nombre de points restants moins un.
- Le coût en mana imprimé n'est jamais payé : une carte de coût 9 avec un coût d'éveil de 2 ne coûte que 2 mana au total.
- Une carte dont le coût d'éveil est 1 peut être mise en éveil puis entrer en jeu dans le même tour pour 1 mana.
- Une unité arrivant par éveil se comporte comme si elle était jouée depuis la main : effets d'entrée en jeu résolus, Esprit de corps déclenché, et elle ne peut pas attaquer ce tour, sauf Traque.
- Une action en éveil se résout au paiement du dernier point, avec les cibles choisies à ce moment-là.
- Les coûts additionnels de la carte (défausse, etc.) se paient à l'arrivée en jeu, pas à la mise en éveil.
- Si l'arrivée est impossible (terrain plein, action sans cible valide, coût additionnel impayable), le dernier point est refusé : aucun mana n'est dépensé et la carte reste en éveil jusqu'à ce que l'obstacle disparaisse.

**Plusieurs Sélections sur une même carte (Sélection X, Sélection magique X, Sélection Royale X, Trésor X)**
- Une unité qui porte plusieurs de ces capacités à l'entrée en jeu fait choisir une carte pour CHACUNE d'elles : vous gagnez une carte par capacité, pas une seule pour toutes.
- Les choix se font l'un après l'autre, dans l'ordre où les capacités sont inscrites sur la carte.
- Une action qui porte Sélection X et Sélection magique X donne elle aussi une carte par capacité ; le choix fait pour l'une n'est jamais réutilisé pour l'autre.
- Si votre main est pleine (8 cartes) au moment où une carte choisie devrait arriver, elle n'est pas ajoutée.

**Déclencheur « Blessure »**
- Un effet « Blessure » se déclenche quand l'unité qui le porte subit des dégâts et y survit.
- Des dégâts entièrement absorbés (par exemple par Bouclier) ne sont pas une blessure.
- L'effet ne part qu'une fois par source de dégâts et par tour : une même action qui frappe l'unité plusieurs fois ne le déclenche qu'une fois.
- Deux exemplaires de la même carte comptent pour deux sources différentes.
- Une même unité ennemie qui blesse deux fois dans le tour ne compte qu'une fois ; une autre unité compte à part.
- La mémoire des sources est effacée à chaque fin de tour (celle de chaque joueur) : le même attaquant redéclenche l'effet au tour suivant.
- En combat, l'attaquant blessé par la riposte de sa cible déclenche lui aussi son effet « Blessure ».
- Les dégâts de Poison comptent comme une blessure (le Poison est une source à part) ; s'ils tuent l'unité, rien ne se déclenche.
- Les PV volés par Vampirisme X comptent comme une blessure.
- Un effet « Blessure » qui vise « la source des dégâts » frappe l'unité coupable ; si la source est une action, il retombe sur le héros du joueur qui l'a jouée ; si c'est le Poison, l'effet est perdu.
- Deux unités à effet « Blessure » qui se blessent mutuellement ne bouclent pas : chacune ne répond qu'une fois à l'autre par tour.
- Une unité blessée puis tuée (ou retirée du terrain) avant que son effet ne se résolve ne répond pas.
- Quand plusieurs unités sont blessées en même temps, celles du joueur actif répondent d'abord (de gauche à droite), puis celles de l'adversaire.
- Pendant une Tempête X ou des dégâts répartis au hasard, l'unité blessée répond entre deux points de dégâts : blessée par le premier puis tuée par un suivant, elle a quand même répondu.
- Une réponse « Blessure » qui intervient au milieu d'une Tempête X n'interrompt pas celle-ci : les points de dégâts restants sont distribués ensuite.
- Une réponse « Blessure » à cible « au choix » qui intervient au milieu d'une Tempête X ou de dégâts répartis choisit sa cible au hasard, sans vous poser la question.
- Une capacité conférée par une action avec le déclencheur « Blessure » se déclenche chez l'unité qui l'a reçue.
- Un objet ne peut pas porter d'effet « Blessure ».

**Défausse ciblée et Pillage X**
- Pillage X fait défausser X cartes au hasard de la main adverse vers son cimetière ; si la main compte moins de X cartes, elle est entièrement défaussée.
- Un effet de défausse frappe toujours la main de l'adversaire, jamais celle de celui qui le joue.
- Quand un effet de défausse précise un type de carte ou un coût minimum (borne incluse), seules les cartes qui y répondent peuvent être défaussées ; s'il n'y en a aucune, rien n'est défaussé.

**Dévoration**
- À l'entrée en jeu, vous choisissez l'unité dévorée ; vous pouvez désigner une unité ennemie ou l'une de vos propres unités.
- L'unité dévorée est détruite et l'unité qui dévore gagne définitivement son ATK et ses PV du moment (bonus compris).
- L'unité dévorée meurt normalement : ses effets « à la mort » se déclenchent.
- Quand aucune cible n'est désignée, la victime est tirée au hasard parmi les unités ennemies uniquement ; sans unité ennemie en jeu, personne n'est dévoré.
- Une unité ne peut pas se dévorer elle-même.
- Dévoration tue l'unité visée et ajoute définitivement son ATK et ses PV du moment (bonus compris) à l'unité qui dévore.
- Une Dévoration portée par une action ne détruit rien, faute d'unité pour absorber.

**Discipline +X/+Y**
- Le bonus n'est accordé que si toutes les unités de votre terrain ont un coût de même parité (pair ou impair) que la carte qui déclenche Discipline ; une seule unité de l'autre parité suffit à l'empêcher.
- Le terrain adverse n'entre jamais dans le calcul.
- Un coût de 0 est pair.
- C'est le coût réel qui compte, réductions comprises, et non le coût imprimé : la parité d'une unité déjà en jeu peut donc changer sans qu'elle bouge.
- L'unité qui porte Discipline compte dans son propre terrain : arrivée seule en jeu, elle est disciplinée.
- Le bonus obtenu est définitif : il reste acquis même si votre terrain se dépareille ensuite.
- Sur une action, c'est la parité du coût de l'action qui compte, pas celle de la cible ; la cible doit être une de vos unités, une unité ennemie n'est jamais renforcée.
- Si la condition n'est pas remplie, Discipline ne fait rien du tout.

**Divination**
- Divination révèle les 3 premières cartes de votre deck : la carte que vous désignez reste sur le dessus, les deux autres passent sous le deck.
- Divination existe aussi sur les actions, avec le même effet.
- Si votre deck compte moins de 3 cartes, seules celles-ci sont révélées ; deck vide, il ne se passe rien.
- Quand personne ne peut choisir (par exemple une action rejouée automatiquement), la carte gardée sur le dessus est désignée au hasard.

**Prise de contrôle (Domination X et effets de vol d'unité)**
- Une unité dont vous prenez le contrôle de façon permanente arrive chez vous avec le mal d'invocation et ne repart pas aux tours suivants.
- Il faut une place libre sur votre terrain : terrain plein, aucun vol ; s'il reste moins de places que d'unités à voler, seules autant d'unités que de places changent de camp.
- Quand l'effet indique un coût maximum, seules les unités dont le coût imprimé ne le dépasse pas peuvent être volées, y compris quand la cible est tirée au hasard.
- S'il n'existe aucune cible valide, rien ne se passe.
- Une unité volée qui meurt va dans le cimetière de son propriétaire d'origine, pas dans celui du voleur ; il en va de même avec Domination X et Corruption X.
- Reprendre le contrôle de votre propre unité volée la rend simplement à vous : elle mourra dans votre cimetière.
- Une unité sous l'effet de Corruption X qui est volée de façon permanente ne retourne pas chez son ancien contrôleur à la fin du tour.
- Transcendance protège une unité d'un vol venant d'une action (elle n'est ni ciblée ni tirée au hasard), mais pas d'un vol venant d'une capacité d'unité.
- Ombre protège du ciblage, pas du hasard : une unité sous Ombre peut être volée par un effet « au hasard ».
- Un objet équipé sur une unité volée reste chez son propriétaire et se détache de l'unité.
- Si la source d'un effet de vol « à la mort » est tuée pendant le tour adverse, l'unité volée va au propriétaire de cette source.

**Conférer : capacités données à une autre carte**
- Conférer une capacité à X à une unité qui la porte déjà (même déclencheur) ne cumule pas : l'unité garde le plus élevé des deux X (Régénération 2 + Régénération 3 ⇒ Régénération 3).
- Un don de valeur inférieure ne fait jamais baisser la valeur déjà portée.
- Pour une capacité +X/+Y, le maximum est pris sur chaque valeur séparément (Gloire +1/+3 et Gloire +2/+1 ⇒ Gloire +2/+3).
- Si la capacité conférée a un déclencheur différent de celle déjà portée, les deux coexistent, chacune avec son X.
- Une capacité donnée par un emblème ou un objet équipé est temporaire : quand l'emblème disparaît ou que l'objet quitte l'unité, celle-ci retrouve sa valeur propre (ou perd la capacité si elle ne l'avait pas).
- Une capacité conférée par une action reste acquise : reçue pendant qu'un emblème donnait une valeur plus haute, elle subsiste après la disparition de l'emblème (2 de base, emblème 5, action 3 ⇒ 3).
- La disparition d'un emblème ne retire jamais une capacité que l'unité possédait déjà par elle-même.
- Une capacité peut être conférée avec un déclencheur « fin de tour, en main », « début de tour, en main » ou « fin de tour, au cimetière » : elle se déclenche alors depuis cette zone à chacun de vos tours, et jamais depuis le terrain.
- Une capacité conférée qui se déclenche depuis la main ou le cimetière et qui demande une cible la choisit au hasard.
- Une capacité conférée avec un Retard X compte à partir du moment où elle est conférée : elle se déclenche au début de votre X-ième tour suivant, une seule fois.

**Pioche et effets « à la pioche »**
- Piocher dans un deck vide inflige la fatigue à votre héros : 1 dégât la première fois, puis 1 de plus à chaque nouvelle pioche à vide.
- Si votre main est pleine (8 cartes), la carte piochée va directement au cimetière et son éventuel effet « à la pioche » ne se déclenche pas.
- Un effet « à la pioche » ne concerne que la carte qui vient d'être piochée et ne part que si elle rejoint effectivement votre main.
- Quand un effet « à la pioche » se déclenche, la carte piochée est révélée aux deux joueurs ; une carte piochée sans effet « à la pioche » n'est pas révélée.
- La main de départ et le mulligan ne déclenchent pas les effets « à la pioche ».

**Enchaînement des effets et Déclenchement**
- Un effet qui en provoque un autre (par exemple une entrée en jeu qui tue une unité dotée d'un effet « à la mort ») laisse l'effet provoqué se résoudre aussitôt, avant la suite.
- Dans une chaîne de morts en cascade, toutes les morts et tous leurs effets sont résolus, quelle que soit la longueur de la chaîne.
- Déclenchement : à l'entrée en jeu de l'unité, les effets de vos autres unités en jeu sont rejoués une fois, comme s'ils venaient de ces unités (un effet « se renforce » renforce l'unité d'origine, pas celle qui porte Déclenchement).
- Déclenchement ne rejoue que les types d'effets indiqués sur la carte (parmi entrée en jeu, mort, fin de tour, retour en main).
- Quand Déclenchement rejoue un effet « à la mort » ou « au retour en main », l'unité concernée ne meurt pas et ne revient pas en main : seul le bénéfice de l'effet est rejoué.
- Déclenchement ne se rejoue pas lui-même et ignore vos autres unités qui portent Déclenchement.
- Les effets rejoués par Déclenchement ne vous demandent jamais de choisir une cible : elle est désignée automatiquement.
- Déclenchement ne rejoue que les effets décrits en toutes lettres sur vos unités, pas leurs capacités nommées.

**Emblèmes**
- Un emblème est posé à l'arrivée de la carte qui le crée (entrée en jeu d'une unité, résolution d'une action) et reste en place même si cette carte quitte le jeu.
- Un emblème agit sur le camp du joueur chez qui il est posé : un emblème posé chez l'adversaire affecte ses unités, pas les vôtres.
- Deux emblèmes identiques se cumulent : leur effet se résout autant de fois qu'il y a d'exemplaires.
- Un emblème à effet réagit à un seul type d'événement, indiqué sur la carte : entrée en jeu, mort, attaque ou activation d'une unité de son porteur, retour en main, passage sous 15 PV, début ou fin du tour de son porteur ; il ne réagit à aucun autre.
- L'unité qui pose un emblème « à l'entrée en jeu » ne le déclenche pas par sa propre arrivée.
- Un emblème « sous 15 PV » ne se déclenche qu'une seule fois, au moment où le héros de son porteur passe sous 15 PV.
- En fin de tour, les emblèmes se résolvent après les effets des unités du terrain, de la main et du cimetière.
- Un emblème dont l'effet demande une cible « au choix » met le tour en pause le temps que son porteur choisisse.
- Sans durée indiquée, un emblème est permanent.
- La durée d'un emblème se compte en tours du joueur chez qui il est posé et diminue à la fin de chacun de ses tours : un emblème posé chez l'adversaire vieillit pendant les tours de l'adversaire.
- Un emblème arrivé à son dernier tour agit une dernière fois avant de disparaître.
- Un emblème « début de tour » à durée limitée posé pendant votre propre tour ne perd pas de durée ce tour-là : avec une durée de 2, il agit à vos 2 prochains débuts de tour.
- Quand un emblème disparaît, la capacité qu'il donnait à vos unités leur est retirée.
- Deux emblèmes identiques dont la durée restante diffère restent distincts et expirent chacun à leur terme.

**Effets de fin de tour**
- Un effet « fin de tour » se déclenche à la fin de chaque tour du joueur qui contrôle l'unité, jamais à la fin du tour adverse.
- Les effets de fin de tour se résolvent un par un, de gauche à droite selon la position des unités sur le terrain (et non selon l'ordre dans lequel elles ont été jouées).
- Une unité tuée par un effet de fin de tour situé à sa gauche ne déclenche pas son propre effet de fin de tour.
- Un effet de fin de tour qui demande de choisir une cible met la fin du tour en pause ; le tour ne passe à l'adversaire qu'une fois le choix fait, et les effets situés plus à droite attendent ce choix.
- Vous disposez de 20 secondes pour chaque choix, indépendamment du temps restant sur le chrono du tour ; passé ce délai, la cible est tirée au hasard parmi les cibles valides.
- Si un effet en attente n'a plus aucune cible valide au moment de choisir, il est abandonné et le tour se poursuit.
- Demander deux fois la fin du tour pendant une pause de choix ne rejoue pas les effets de fin de tour et ne fait passer le tour qu'une seule fois.
- Un effet « au choix » déclenché pendant votre tour et resté sans cible désignée quand vous terminez le tour est abandonné.
- Ordre complet de la fin de tour : effets des unités du terrain, puis effets « en main », puis effets « au cimetière », puis emblèmes.

**Effets « fin de tour, en main »**
- Une unité dotée d'un effet « fin de tour, en main » le résout à la fin de chacun de vos tours tant qu'elle est dans votre main, et jamais à la fin du tour adverse.
- Les bonus qu'elle s'est donnés en main sont conservés quand vous la jouez ; une fois sur le terrain, cet effet cesse.
- Seules les unités peuvent avoir un tel effet, et les jetons n'en ont jamais.

**Effets « fin de tour, au cimetière »**
- Une unité dotée d'un effet « fin de tour, au cimetière » le résout à la fin de chacun des tours de son propriétaire tant qu'elle est dans son cimetière, et jamais à la fin du tour adverse.
- Cet effet ne se déclenche ni en main ni sur le terrain.
- Un bonus que l'unité se donne à elle-même s'accumule sur la carte au cimetière, tour après tour.
- Les jetons et les objets n'ont jamais cet effet.
- Les effets « au cimetière » se résolvent dans l'ordre d'arrivée des cartes au cimetière, la plus ancienne d'abord.

**Enterrement X**
- Enterrement X place les X premières cartes du deck du joueur visé dans son cimetière, en partant du dessus.
- Vous choisissez le joueur visé en désignant un héros : l'adversaire ou vous-même.
- Quand aucun choix n'est possible (par exemple en fin de tour), c'est l'adversaire qui est visé.
- Si le deck visé contient moins de X cartes, chaque carte manquante inflige la fatigue à son héros, comme une pioche à vide, avec des dégâts croissants.
- Une carte enterrée n'a jamais été en jeu : ses effets « à la mort » ne se déclenchent pas.
- Une carte enterrée dotée d'un effet « fin de tour, au cimetière » le déclenche à partir de la prochaine fin de tour de son propriétaire.
- Une copie d'Infestation X ou une carte de Cycle éternel enterrée n'est jamais invoquée.
- Un effet d'enterrement qui précise un filtre (race, capacité portée, type de carte…) prend les X premières cartes du deck qui y répondent, où qu'elles se trouvent ; s'il en manque, aucune fatigue n'est infligée.

**Entrainement X**
- Entrainement X donne +X/+X à vos unités en main qui sont de la même faction que la carte qui le déclenche ; les unités d'une autre faction et les actions ne reçoivent rien.
- Le bonus est définitif : il est conservé quand l'unité est jouée.
- Sur une action, c'est la faction de l'action qui désigne les unités renforcées.
- Seules les unités en main au moment du déclenchement en profitent ; avec un déclencheur répété (fin de tour, attaque), le bonus est redonné à chaque fois.
- Déclenché à la mort d'une unité, il renforce la main du joueur qui contrôlait cette unité.

**Entrave X et Paralysie**
- Entrave X paralyse l'unité ciblée pendant X tours de son contrôleur : la durée diminue d'un à la fin de chacun de ses tours, pas à la fin des vôtres.
- Une unité paralysée ne peut ni attaquer ni activer de capacité.
- Une nouvelle paralysie ne raccourcit jamais une paralysie en cours : la plus longue des deux durées restantes est conservée (Entrave 1 sur une unité sous Entrave 3 la laisse à 3).
- Une Entrave sans valeur, comme la capacité Paralysie, dure un seul tour du contrôleur de la cible.

**Esprit de corps**
- À chaque déclenchement, l'unité gagne autant de points que le nombre d'Esprit de corps que vous avez déjà déclenchés depuis le début de la partie ; chaque point est tiré au hasard entre +1 ATK et +1 PV.
- Votre tout premier déclenchement ne rapporte rien, le deuxième rapporte 1 point, le troisième 2, et ainsi de suite.
- Chaque déclenchement compte pour les suivants, même s'il n'a rien rapporté, quelle que soit l'unité et quel que soit son clan.
- Une unité Esprit de corps posée sans que sa capacité se déclenche (par exemple si elle ne se déclenche qu'à sa mort) ne compte pas tant qu'elle ne s'est pas déclenchée.
- Le compteur ne redescend jamais, même quand les unités concernées meurent, et chaque joueur a le sien : les déclenchements adverses ne vous profitent pas.
- Les gains sont définitifs.
- Une unité dont Esprit de corps se déclenche à chaque fin de tour alimente son propre compteur : seule, elle gagne 0 au premier tour, 1 au suivant, puis 2, etc.
- Esprit de corps conféré à une unité en main ou dans le deck avec le déclencheur d'entrée en jeu se déclenche quand elle est jouée et compte pour la suite.

**Exhumation depuis un cimetière adverse**
- Un effet d'exhumation peut viser votre cimetière, celui de l'adversaire ou les deux selon ce qu'indique la carte ; l'unité ressuscitée arrive toujours sur votre terrain, sous votre contrôle, avec le mal d'invocation.
- L'unité ressuscitée conserve ses bonus permanents.
- Une unité ressuscitée depuis le cimetière adverse retourne, à sa mort, dans le cimetière de son propriétaire d'origine.
- Le X d'une Exhumation est un coût maximum ; sans X, une unité de n'importe quel coût peut être ressuscitée.
- Une exhumation « au hasard » choisit réellement au hasard parmi les unités admissibles ; elle ne prend pas systématiquement la plus chère.
- Une exhumation automatique de plusieurs unités ressuscite les plus chères d'abord, dans la limite des places libres sur votre terrain ; les autres restent au cimetière.
- Les actions présentes dans un cimetière ne sont jamais ressuscitées.

**Exploration X**
- Exploration X ajoute X à votre compteur d'Exploration ; chaque fois que le compteur atteint 3, vous piochez une carte et 3 sont retirés du compteur.
- Le reste est conservé et rien n'est plafonné : à 2, un gain de 2 donne une pioche et laisse le compteur à 1 ; un gain de 7 depuis 0 donne deux pioches et laisse 1.
- Il s'agit d'une vraie pioche : deck vide, vous subissez la fatigue (et le palier est quand même consommé) ; l'effet « à la pioche » de la carte tirée se déclenche.
- Le compteur et la pioche reviennent au joueur qui contrôle l'unité au moment du déclenchement : une unité volée profite à son nouveau contrôleur.
- Le compteur d'Exploration est indépendant des autres compteurs (Épargne, Foi, Conquête) et n'apparaît qu'à partir du premier déclenchement.
- Avec un déclencheur « à l'attaque », le compteur monte à chaque attaque et pas à l'entrée en jeu.

**Impact X**
- Impact X ne peut viser qu'une unité ennemie ou le héros adverse, jamais une de vos unités ni votre héros, que la capacité vienne d'une unité, d'une action ou d'un pouvoir de héros.
- Si le terrain adverse est vide, le héros adverse reste une cible possible.
- Une unité ennemie invisible ou sous Ombre non révélée ne peut pas être choisie comme cible d'Impact X.
- Quand la cible d'Impact X est tirée au hasard (déclencheur « à l'attaque » sans cible désignée), elle ne tombe jamais sur une de vos unités.
- Avec la portée « toutes », Impact X touche toutes les unités ennemies et elles seules.

**Infestation X**
- Infestation X mélange dans votre deck X copies de l'unité dans son état actuel (bonus permanents compris).
- Les copies portent elles aussi Infestation X.
- Quand vous piochez une copie, elle est invoquée directement sur votre terrain avec le mal d'invocation, et vous piochez une autre carte à la place.
- Une copie invoquée de cette façon ne déclenche ni ses effets d'entrée en jeu ni ses effets « à la pioche » : elle ne réinfeste pas en arrivant.
- Si votre terrain est plein quand vous piochez une copie, elle va au cimetière sans déclencher d'effet « à la mort », et vous piochez quand même une autre carte.
- Plusieurs copies piochées d'affilée sont toutes invoquées, chacune remplacée par une nouvelle pioche.
- Une copie dont Infestation X se déclenche à la mort réinfeste votre deck quand elle meurt.
- Infestation X n'ajoute plus de copies quand votre deck atteint 60 cartes.
- Seule une vraie pioche invoque une copie ; une copie placée au cimetière par Enterrement X n'est pas invoquée.

**Invention +X/+Y et machine**
- Chaque joueur construit au plus une machine à la fois ; elle n'existe pas tant qu'aucune Invention n'a été déclenchée, et une Invention n'alimente que la machine du joueur qui la déclenche.
- La machine part de 0/1 ; chaque Invention lui ajoute +X/+Y et, éventuellement, une capacité, et augmente son coût de 1 mana.
- Une machine reçoit au plus 6 Inventions (coût maximal 6) ; au-delà, une Invention supplémentaire est entièrement ignorée, statistiques comprises.
- Deux Inventions qui apportent la même capacité avec le même déclencheur additionnent leurs valeurs (Impact 1 + Impact 1 = Impact 2) ; avec des déclencheurs différents, la machine porte deux capacités distinctes.
- Une capacité permanente sans valeur (par exemple Vol) n'est jamais doublée.
- Vous pouvez prendre la machine en main : vous recevez une unité avec les statistiques, le coût et les capacités accumulés, et la construction repart d'une machine vierge.
- Prendre la machine est impossible si aucune Invention ne l'a encore alimentée, ou si votre main est pleine (dans ce cas la machine n'est pas perdue).
- Le nom, la race et l'illustration de la machine dépendent de son coût (un modèle par coût de 1 à 6) ; ses statistiques et ses capacités viennent uniquement des Inventions.
- La machine appartient à la faction de votre héros.

**Invocation X**
- Invocation X met en jeu une unité tirée au hasard dont le coût est exactement X ; s'il n'existe aucune unité à ce coût, rien n'est invoqué (jamais de repli sur un coût inférieur).
- Sans restriction écrite sur la carte, l'unité invoquée est une commune du même alignement que la carte qui invoque.
- Une édition limitée ne peut être invoquée que si le joueur la possède.
- L'unité invoquée doit être légale dans le format de la partie (une commune hors rotation est exclue en Standard ; en Classique, seules les communes sont invocables).
- L'unité invoquée ne déclenche pas ses propres effets d'entrée en jeu.
- L'unité invoquée arrive avec le mal d'invocation, sauf si elle possède Traque : elle peut alors attaquer le tour même de son arrivée.
- La même règle vaut pour une unité amenée par Appel du clan X ou ramenée du cimetière par un effet de résurrection : elle garde sa Traque, sinon elle subit le mal d'invocation.
- Quand une Invocation est restreinte à une race ou à une capacité portée, cette restriction remplace l'alignement : l'unité peut venir d'un autre alignement que la carte.
- « Invocation 1 à X » (X au hasard) : X devient un plafond ; l'unité est tirée au hasard parmi toutes celles dont le coût va de 1 à X, jamais au-dessus.
- Invocations multiples invoque une unité par coût listé, au coût exact ; un coût sans candidat est sauté sans empêcher les suivants, et un même coût listé deux fois invoque deux unités.

**Invocation d'une carte désignée**
- Quand un effet invoque une carte nommée sur la carte, celle-ci arrive telle quelle, quel que soit son coût.
- Si plusieurs cartes sont désignées, elles sont invoquées dans l'ordre écrit, une même carte pouvant arriver en plusieurs exemplaires ; l'invocation s'arrête dès que le terrain est plein (8 places).
- Terrain plein : l'invocation d'une carte désignée ne fait rien.
- Une action désignée n'est jamais « invoquée » : rien ne se passe ; il n'y a pas de tirage aléatoire de remplacement.
- Un objet désigné est posé sur le terrain, non équipé.

**Tuteur**
- Tuteur ajoute à votre main les cartes nommées sur la carte (unités ou actions), dans l'ordre écrit ; une carte désignée deux fois arrive en deux exemplaires.
- Main pleine (8 cartes) : rien n'est ajouté ; si la main se remplit en cours d'effet, les cartes restantes sont perdues.
- Sur une unité, Tuteur se résout à son entrée en jeu : l'unité se pose et les cartes arrivent en main.
- Sur une action, Tuteur se résout à la résolution de l'action et ne demande aucune cible.

**Activation des pouvoirs d'une unité**
- Une unité qui possède plusieurs pouvoirs activables laisse le joueur choisir lequel activer ; seul le pouvoir choisi se résout.
- Une unité ne s'active qu'une fois par tour, quel que soit le pouvoir choisi : l'activation l'engage.

**Mutation X**
- Mutation X s'utilise depuis la main, pendant votre tour, sur une unité qui la porte ; elle est refusée pendant le tour adverse ou sur une carte qui n'est pas en main.
- Muter ne coûte pas de mana.
- La mutation propose deux fois de suite 3 unités communes de coût exactement X, toutes factions confondues ; le joueur choisit une unité dans chaque offre, puis une capacité sur chacune.
- La seconde offre ne contient jamais l'unité choisie à la première : on ne peut pas prendre deux fois la même.
- Les offres d'une carte donnée sont fixes : annuler puis recommencer ne change pas les unités proposées.
- La carte mutée garde son nom, son coût, son clan, sa race et ses capacités d'origine ; elle gagne les deux capacités choisies.
- L'ATK de la carte mutée devient la plus haute ATK des deux unités choisies, et ses PV les plus hauts PV des deux ; ces valeurs remplacent ses caractéristiques (bonus reçus en main compris).
- Une capacité léguée garde sa valeur X et son moment de déclenchement d'origine.
- Mutation ne sert qu'une fois : la capacité disparaît de la carte après usage.
- S'il existe moins de 3 unités communes au coût X, l'offre est plus courte, voire vide.

**Neutralisation**
- Neutralisation peut viser n'importe quelle unité ennemie, même si elle n'a aucune capacité.
- Une unité neutralisée ne peut ni attaquer ni activer un pouvoir, et toutes ses capacités sont sans effet.
- Portée par une unité, la Neutralisation dure tant que cette unité reste sur le terrain ; dès qu'elle le quitte, la victime retrouve ses capacités et peut de nouveau attaquer, le tour même.
- Les effets « à la mort » d'une unité neutralisée ne se déclenchent pas si elle meurt neutralisée.
- Le Bouclier et les charges de Contresort X d'une unité neutralisée sont suspendus, puis rendus intacts quand la Neutralisation prend fin.
- Une unité avec Traque qui arrive face à une Neutralisation visant toutes les unités ennemies ne peut pas attaquer.
- Une Neutralisation visant toutes les unités ennemies s'applique aussi aux unités ennemies qui arrivent plus tard.
- Si deux unités neutralisent la même victime, celle-ci reste neutralisée tant qu'il en reste une sur le terrain.
- Deux porteuses de Neutralisation face à face se neutralisent mutuellement : chacune est paralysée et perd ses autres capacités, mais continue de neutraliser l'autre.
- Si la victime subit Silence pendant qu'elle est neutralisée, ses capacités ne lui sont pas rendues à la fin de la Neutralisation.
- Lancée par une action, la Neutralisation dure X tours de la victime (1 si X n'est pas précisé) et se lève à la fin du dernier de ces tours.
- Une Neutralisation plus courte ne raccourcit jamais une Neutralisation plus longue déjà en cours.

**Objets**
- Un objet joué se pose sur le terrain et y reste : il ne part pas au cimetière comme une action.
- Un objet occupe l'une des 8 places du terrain, partagées avec les unités : terrain plein, on ne peut poser ni unité ni objet.
- Un objet ne peut pas être attaqué et ne reçoit aucun bonus d'aura.
- Équiper un objet sur une de vos unités coûte son coût d'équipement en mana ; sans le mana nécessaire, l'équipement est refusé.
- L'unité équipée gagne l'ATK et les PV de l'objet.
- Une unité porte au plus deux objets ; un troisième est refusé, et leurs bonus s'additionnent.
- Rééquiper un objet sur l'unité qui le porte déjà est refusé (aucun mana dépensé).
- Un objet peut être déplacé vers une autre unité en repayant son coût d'équipement ; l'ancienne porteuse perd aussitôt le bonus.
- Quand la porteuse quitte le terrain, l'objet reste en jeu, déséquipé, et peut être rééquipé sur une autre unité.
- À votre tour, vous pouvez sacrifier gratuitement un de vos objets : il part au cimetière et libère sa place.
- Perdre un objet retire son bonus de PV à la porteuse, y compris sur ses PV actuels, mais ne la tue jamais : elle garde au moins 1 PV.
- Les capacités d'un objet ne sont actives que lorsqu'il est équipé : elles passent à la porteuse, avec leur valeur X.
- Quand l'objet quitte la porteuse (déséquipé ou sacrifié), les capacités qu'il donnait disparaissent ; celles que l'unité possédait déjà restent.
- Une aura portée par un objet (par exemple Commandement X) agit dès l'équipement et cesse dès que l'objet part.
- Un effet « à l'entrée en jeu » d'un objet se résout une seule fois, quand l'objet est posé ; l'équiper ou le déplacer ne le rejoue pas.
- Les effets « à la mort » et « en fin de tour » d'un objet équipé suivent sa porteuse : ils se déclenchent à la mort de celle-ci, ou à la fin du tour de son contrôleur.
- Un objet ne peut pas être mis dans un deck.
- Exécution X peut viser un objet de l'un ou l'autre camp : l'objet est détruit et va au cimetière de son propriétaire, et sa porteuse perd le bonus.
- Les actions Remontée X, Retour différé X et Silence peuvent viser un objet : Remontée le renvoie en main, Retour différé le place sous le deck de son propriétaire, Silence lui retire ses capacités mais lui laisse ses bonus d'ATK et de PV.
- Un effet qui vise « une unité » ne touche jamais un objet.
- Un bonus +X/+Y appliqué à un objet augmente ce que l'objet donne : sa porteuse en profite.
- Un objet ramené du cimetière sur le terrain par un effet revient non équipé.

**Maître d'arme**
- Quand Maître d'arme se déclenche, l'unité s'équipe sans payer des objets que vous avez déjà en jeu, y compris ceux portés par vos autres unités, qui les perdent.
- Maître d'arme ne prend jamais les objets qui sont dans votre main.
- Maître d'arme respecte la limite de deux objets par unité : il prend les plus chers d'abord et, à coût égal, le choix se fait au hasard.
- Une unité qui porte déjà deux objets ne prend rien de plus avec Maître d'arme.

**Trésor X**
- Trésor X ne propose que des objets, au coût exactement X ; s'il n'en existe aucun à ce coût, l'offre est vide.
- « Trésor 1 à X » (ou A à X) propose des objets dont le coût va de 1 (ou A) à X.
- Les objets proposés sont ceux de l'alignement de la carte qui porte Trésor, plus les objets neutres ; jamais un objet de l'alignement opposé.
- L'objet choisi arrive dans votre main.
- Quand Trésor se déclenche en fin de tour, le joueur choisit parmi 3 objets ; si le temps de choix expire, un objet de l'offre est pris au hasard.

**Ombre**
- Ombre (comme Invisible) ne protège que du ciblage : un effet « au hasard » ou « toutes les unités » touche normalement une unité dans l'ombre.
- Un effet « au choix » ne peut pas désigner une unité dans l'ombre.
- Ancré, lui, protège du renvoi en main même quand l'effet touche « toutes » les unités.
- Une unité dans l'ombre se révèle dès qu'une de ses capacités se déclenche : à l'activation, à l'attaque, en début ou en fin de tour, à la blessure, aux PV bas ou après un Retard.
- Les effets d'entrée en jeu d'une unité avec Ombre ne la révèlent pas.
- Le déclenchement d'une capacité d'une autre unité ne révèle pas l'Ombre de sa voisine.
- Une activation refusée (unité déjà engagée ou paralysée) ne révèle pas l'Ombre.
- Une unité avec Provocation qui est encore dans l'ombre n'oblige pas l'adversaire à l'attaquer ; sa Provocation redevient contraignante une fois révélée.

**Capacités conférées de nouveau**
- Recevoir Ombre par un effet ponctuel renvoie dans l'ombre une unité déjà révélée : elle redevient inciblable.
- Recevoir de nouveau Esquive rend l'esquive déjà dépensée ce tour ; recevoir de nouveau Résurrection la rend disponible même si elle a déjà servi.
- Un Contresort X conféré en cours de partie est immédiatement actif.
- Une aura qui donne Ombre en continu ne renvoie pas dans l'ombre une unité qui vient d'agir.
- Un don fait par un pouvoir de héros réarme lui aussi la capacité déjà consommée.

**Ordre de résolution des effets d'une carte**
- Sur une action, un effet placé avant une capacité sur la carte se résout avant elle ; les effets se résolvent dans l'ordre où la carte les présente.
- Sur une action, un effet écrit avant un don de capacité se résout avant ce don : une unité invoquée par le premier effet reçoit bien la capacité conférée ensuite.
- À l'inverse, si l'invocation est écrite après le don, l'unité invoquée ne reçoit pas la capacité.
- Après chaque effet d'une action, les unités mortes quittent le terrain et leurs effets « à la mort » se résolvent avant l'effet suivant.
- Un effet de zone ne touche donc jamais une unité tuée par l'effet précédent de la même action.
- Une unité invoquée par un effet « à la mort » déclenché au milieu d'une action peut être touchée par les effets suivants de cette action.
- Une condition « si la cible est détruite » reste vérifiée même si la cible est retirée du terrain avant la fin de l'action.
- À l'entrée en jeu d'une unité, un effet écrit avant toutes ses capacités d'entrée se résout avant elles ; sinon il se résout après.

**Paralysie**
- Tous les dégâts infligés par une unité qui a Paralysie paralysent les unités blessées qui survivent, pas seulement les dégâts de combat (par exemple une Tempête X en fin de tour ou un effet de dégâts de cette unité).
- Une unité avec Paralysie ne se paralyse jamais elle-même, même si son propre effet la blesse.

**Poison**
- Tous les dégâts infligés par une unité qui a Poison empoisonnent les unités blessées qui survivent, y compris hors combat.
- En combat, le Poison s'applique dans les deux sens : l'unité empoisonne en attaquant comme en se défendant.

**Portée « toutes les unités »**
- Une capacité à portée « toutes » ne demande aucune cible et s'applique à chaque unité du camp visé.
- La portée « toutes » ne touche que des unités : jamais les héros, et Impact X « toutes » ne touche que les unités ennemies, jamais les alliées.
- Siphon X sur toutes les unités ennemies rend X PV au héros pour chaque unité touchée.
- Corruption X sur toutes les unités ennemies les prend dans la limite des places libres sur votre terrain.
- Une capacité qui vise « toutes les unités alliées » depuis une unité ne s'applique pas à l'unité qui la porte.
- Malédiction X sur toutes les unités ennemies les exile toutes au tour suivant du lanceur.
- Un effet « toutes les unités » peut couvrir plusieurs zones à la fois (terrain, main, deck, cimetière) quand la carte le précise ; hors du terrain, il ne s'applique qu'aux unités, jamais aux actions.

**« Unité » hors du terrain**
- Un effet qui vise des unités dans la main, le deck ou le cimetière ne touche que les cartes unité, jamais les actions (par exemple une capacité conférée aux unités du deck).

**Présage**
- Présage révèle les 3 premières cartes de votre deck ; vous désignez celle que vous pensez être au sommet : si vous avez raison, elle va dans votre main, sinon vous ne gagnez rien.
- Après Présage, réussite ou échec, votre deck entier est remélangé.
- Seules les 3 premières cartes sont en jeu : la quatrième ne peut jamais être gagnée.
- Deck vide : Présage ne fait rien. Deck d'une seule carte : la désignation est forcément juste. Deck de deux cartes : seules ces deux cartes sont révélées.
- Main pleine : même en désignant juste, la carte reste dans le deck.
- Le joueur désigne lui-même la carte quand Présage vient d'une unité qui entre en jeu, d'une activation ou d'une action jouée ; en fin de tour ou à l'attaque, la désignation est faite au hasard.
- Une carte que vous avez vous-même placée au sommet du deck juste avant (par Divination, par exemple) peut être reconnue et gagnée à coup sûr.
- Quand une action portant Présage est relancée par un autre effet, la désignation est faite au hasard.

**Pureté +X/+Y**
- Pureté donne +X/+Y tant que le cimetière de son contrôleur est totalement vide : une seule carte suffit à retirer le bonus, et une action au cimetière compte aussi.
- Le bonus de Pureté revient si le cimetière redevient vide.
- Seul le cimetière du contrôleur compte ; celui de l'adversaire n'a aucun effet.
- Perdre le bonus de PV de Pureté ne tue jamais une unité déjà blessée.
- Pureté, Force des ancêtres et Seuil Sacrificiel profitent par défaut à l'unité qui les porte (marque « S ») ; en version « A », le bonus va à toutes les autres unités alliées, pas à la porteuse, tant que la condition est remplie.
- Deux unités porteuses d'une de ces auras en version « A » additionnent leurs bonus, et chacune profite de l'autre.

**Points de vie des héros**
- Chaque héros commence la partie avec ses propres PV de départ, compris entre 20 et 40 (30 par défaut) ; cette valeur est aussi son maximum.
- Aucun soin ne peut faire dépasser à un héros ses PV de départ.

**Rappel X**
- Rappel X peut ramener en main une action de votre cimetière aussi bien qu'une unité.
- Un objet de votre cimetière ramené par un effet de rappel revient en main.
- Quand un effet de rappel se résout sans que vous puissiez choisir, c'est la carte éligible arrivée le plus récemment au cimetière qui revient.
- Un rappel de plusieurs cartes s'arrête dès que la main est pleine.

**Régénération X**
- Régénération X rend X PV à l'unité au début du tour de son contrôleur, sans jamais dépasser ses PV maximum.
- Une Régénération sans valeur indiquée rend 2 PV.
- Une Régénération conférée rend la valeur X du don.
- Si l'unité a déjà sa propre Régénération X, un don de valeur inférieure ne la diminue pas.

**Renforcement +X/+Y et Discipline +X/+Y**
- Par défaut, le Renforcement ou la Discipline d'une unité donne son bonus à une autre unité alliée que vous désignez ; seule celle-ci le reçoit.
- Avec la marque « S », l'unité se renforce elle-même, sans ciblage.
- Avec la marque « A », le bonus va à toutes les autres unités alliées : ni à la porteuse, ni aux unités ennemies.
- Discipline ne donne rien à personne si sa condition n'est pas remplie, quel que soit le bénéficiaire.
- Quand un Renforcement ou une Discipline visant une autre unité se déclenche en fin de tour, le joueur désigne l'unité alliée bénéficiaire à ce moment-là.
- Le bonus de Renforcement est permanent : il reste acquis à l'unité après avoir été donné.

**Coût de repli**
- Un coût de repli N oblige, pour jouer la carte, à replacer N autres cartes de votre main sur le dessus de votre deck ; il s'ajoute au coût en mana.
- Les cartes repliées ne passent pas par le cimetière et seront vos prochaines pioches.
- Vous choisissez l'ordre : la première carte désignée finit au sommet du deck.
- Il faut replier exactement N cartes différentes, toutes dans votre main ; la carte que vous jouez ne peut pas se replier elle-même.
- Une même carte ne peut pas payer à la fois un coût de défausse et un coût de repli : si une carte demande les deux, il faut assez de cartes en main pour leur somme.
- Le coût de repli s'applique aux actions comme aux unités.
- L'adversaire sait combien de cartes ont été repliées, mais pas lesquelles.

**Effets « répartis au hasard »**
- Un effet de dégâts ou de soin « réparti au hasard » distribue ses X points un par un, chaque point allant à une cible tirée au hasard ; une même cible peut en recevoir plusieurs.
- Pour les autres effets (paralysie, bonus…), « réparti au hasard sur au plus N unités » fait N tirages qui peuvent retomber sur la même unité : entre 1 et N unités sont touchées, jamais plus.
- Chaque tirage applique l'effet entier : une unité tirée deux fois par un bonus +X/+Y le reçoit deux fois.
- S'il n'y a aucune cible, l'effet réparti ne fait rien.

**Seconde vie X**
- Une unité avec Seconde vie X peut être jouée depuis votre cimetière en payant X mana au lieu de son coût normal.
- Elle revient en jeu avec tous ses PV et déclenche ses effets d'entrée en jeu comme si elle venait de la main.
- Une fois rejouée, l'unité perd Seconde vie : elle ne peut revenir ainsi qu'une seule fois.
- Une action avec Seconde vie X se relance depuis votre cimetière pour X mana, produit son effet, puis retourne au cimetière sans Seconde vie.
- Seconde vie ne permet de jouer que les cartes de votre propre cimetière, et seulement celles qui portent la capacité.
- Il faut avoir X mana disponible et, pour une unité, une place libre sur le terrain.

**Incinération X**
- Incinération X retire jusqu'à X cartes d'un cimetière et les place sous le deck de son propriétaire, jamais dessus.
- En action, viser le héros adverse incinère le cimetière adverse ; viser votre héros incinère le vôtre.
- Si le cimetière contient moins de X cartes, toutes sont incinérées.
- L'action qui porte Incinération n'est pas recyclée par son propre effet : elle arrive au cimetière après la résolution.

**Creuser X**
- Creuser X révèle les X dernières cartes de votre deck ; celle que vous choisissez monte au sommet, les autres retournent au fond dans le même ordre.
- Si le deck contient moins de X cartes, Creuser ne révèle que celles qui s'y trouvent.

**Retour différé X**
- Retour différé place l'unité visée, alliée ou ennemie, sous le deck de son propriétaire.
- Une unité volée à l'adversaire retourne sous le deck de son véritable propriétaire.

**Épargne X**
- Le compteur d'Épargne d'un joueur est plafonné à 8 : tout surplus est perdu.
- Dépenser son Épargne met en main une carte commune dont le coût est exactement la valeur du compteur, choisie parmi 3 au plus, puis remet le compteur à zéro.
- Main pleine : l'Épargne ne peut pas être dépensée et le compteur est conservé.

**Sélection X, Sélection magique X, Sélection Royale X**
- Une Sélection X ne propose que des cartes dont le coût est exactement X ; s'il n'en existe aucune, l'offre est vide (aucun repli sur des cartes moins chères).
- « Sélection 1 à X » : chaque carte proposée a un coût tiré séparément entre 1 et X ; l'offre peut donc mêler plusieurs coûts, sans jamais dépasser X.
- Une Sélection ne propose que des cartes communes, d'une faction du même alignement que la carte source (jamais de l'alignement opposé).

**Sets spéciaux**
- Les cartes d'un set spécial n'apparaissent jamais dans les offres et tirages aléatoires (Sélection, Invocation, etc.) ; si toutes les cartes éligibles sont d'un set spécial, l'offre est vide.
- Une carte de set spécial que vous possédez se met dans un deck et se joue normalement.
- Les éditions limitées, qui n'appartiennent à aucun set, ne sont jamais concernées par cette exclusion.

**Singulier**
- Une capacité marquée Singulier ne fonctionne que si le deck de départ de son contrôleur ne contient aucune carte en double.
- Chez un joueur dont le deck contient un doublon, la capacité Singulier est sans effet, mais les autres capacités de la carte fonctionnent normalement.
- La règle vaut pour tous les types de capacités : entrée en jeu, fin de tour, mort, effets d'action et capacités permanentes (une « Provocation (Singulier) » n'existe que chez un joueur au deck sans doublon).
- C'est le deck du joueur qui contrôle la carte qui compte : une carte prise à l'adversaire fonctionne chez un joueur sans doublon, et devient inerte chez un joueur avec doublons.
- Le statut « deck sans doublon » est fixé au début de la partie ; rien ne le modifie ensuite.
- L'adversaire n'apprend que votre deck est sans doublon que lorsqu'une de vos capacités Singulier actives devient visible ; une carte Singulier gardée en main ne révèle rien.

**Déclencheur « début de tour »**
- Un effet « début de tour » se déclenche au début du tour de son contrôleur uniquement, jamais au tour adverse.
- Il se résout après la pioche, le réveil des unités et les dégâts de Poison : une unité tuée par le Poison au début du tour ne déclenche pas son effet.
- Si l'effet demande une cible « au choix », c'est le joueur dont le tour commence qui choisit ; si le temps de choix expire, la cible est tirée au hasard.
- S'il n'existe aucune cible valable, l'effet « au choix » est simplement ignoré.
- Les effets « début de tour » des unités se résolvent de gauche à droite sur le terrain, puis viennent ceux des emblèmes.
- Un effet « début de tour, tant qu'elle est en main » se déclenche à chaque début de tour de son contrôleur tant que la carte est en main, et cesse une fois la carte jouée.
- Un emblème « fin de tour » ne se déclenche pas en début de tour, et inversement.

**Tactique X**
- Tactique X donne à l'unité bénéficiaire X capacités tirées au hasard parmi celles des unités communes de même coût qu'elle ; le joueur ne choisit pas les capacités.
- Ne peuvent pas être tirées : les capacités que la bénéficiaire possède déjà, les effets d'entrée en jeu, de pioche, de retour en main ou « en main », ainsi que Tactique et Mutation.
- S'il existe moins de X capacités éligibles, la bénéficiaire les reçoit toutes ; s'il n'existe aucune unité commune à son coût, elle ne reçoit rien.
- Chaque capacité est copiée en entier, avec sa valeur X et son moment de déclenchement.
- Par défaut le bénéficiaire est une autre unité alliée que vous ciblez (la porteuse ne reçoit rien) ; avec « S » la porteuse se les donne à elle-même ; avec « A » chaque autre unité alliée reçoit son propre tirage, selon son propre coût.
- Lancée par une action, Tactique donne à chaque unité visée X capacités correspondant à son coût.

**Terreur X**
- Terreur X réduit de X l'ATK des unités ennemies, sans jamais la faire descendre sous 0 ; elle n'affecte pas les unités de son propre camp.
- Une Terreur sans valeur indiquée vaut Terreur 1.
- Les Terreurs de plusieurs unités s'additionnent.
- Quand l'unité qui porte Terreur quitte le terrain, les unités ennemies retrouvent leur ATK.
- Un emblème de Terreur X retire X d'ATK par exemplaire de l'emblème.

**Traque du destin X**
- Quand Traque du destin X se déclenche en fin de tour, le tour reste en suspens jusqu'à ce que le joueur ait choisi une carte parmi les X premières de son deck : elle va dans sa main et les autres cartes révélées passent sous le deck.
- Si le temps de choix expire, l'une des cartes révélées est prise au hasard.

**Usurpation +X/+Y**
- Usurpation donne +X/+Y multiplié par le nombre de cartes appartenant à l'adversaire que vous avez jouées depuis votre main durant la partie.
- Toute carte dont l'adversaire est le véritable propriétaire compte, unité comme action ; vos propres cartes ne comptent pas.
- Une action adverse compte même si elle a été contrée.
- Une unité prise directement sur le terrain adverse (par Domination X, par exemple) ne compte pas : seules les cartes jouées depuis la main comptent.
- Le compteur ne redescend jamais, même quand la carte adverse jouée quitte le jeu ; chaque joueur a son propre compteur.
- Une carte adverse portant elle-même Usurpation ne se compte pas dans son propre effet, mais compte pour les Usurpations suivantes.
- Si vous n'avez joué aucune carte adverse, Usurpation ne donne rien.
- Le bonus est calculé au moment du déclenchement et reste acquis ; une Usurpation qui se déclenche plusieurs fois (en fin de tour, par exemple) cumule ses gains.
- Par défaut le bonus va à une autre unité alliée désignée ; avec « S » à la porteuse, avec « A » à toutes les autres unités alliées.
- En action, Usurpation ne peut renforcer qu'une unité alliée.

## 13. Factions, clans et races

- **L'Alliance Céleste** (bon) — races : Elfes, Fées, Aigles Géants, Hobbits, Hommes-Arbres, Farfadets, Korrigans, Faunes, Dryades — clans : Les Sylvains, Les Hauts-Elfes, La Forêt d'Émeraude, La Combe Verte
- **Les Armées des Montagnes** (bon) — races : Nains, Golems, Gnomes, Machines, Kobolds, Géants, Mammouths — clans : La Forge Ardente, La Guilde des Ingénieurs, Clan des Mille Tunnels, Clan des Premiers Géants
- **L'Empire du Milieu** (neutre) — races : Humains, Nagas, Tengu, Oni, Qilins — clans : Les Hordes des Steppes, L'Empire de Jade, Les Lames de l'Ombre, Les Défenseurs d'Ivoire
- **Les Royaumes du Soleil** (neutre) — races : Humains, Esprits — clans : Les Enfants du Soleil, Les Seigneurs des Dunes, Le Royaume des Masques, Les Fils du Volcan
- **Les Royaumes Libres** (neutre) — races : Humains, Griffons, Faucons, Pégases, Sphinx, Yétis — clans : Le Royaume du Nord, L'Ordre de l'Aube, Les Guerrières du Vent, La Sublime Porte
- **La Meute** (neutre) — races : Hommes-Loups, Hommes-Ours, Hommes-Félins, Centaures, Mimis, Hommes-Chiens, Hommes-Renards, Hommes-Cerfs, Hommes-Singes, Hommes-Poissons, Hommes-Oiseaux, Insectes — clans : Les Seigneurs Fauves, Les Enfants de la Lune, Le Pacte des Griffes, La Harde Sauvage, La Forêt Enchantée
- **Les Primordiaux** (neutre) — races : Élémentaire, Ondins, Sirènes, Léviathans, Cristallins, Troglodytes, Bêtes Chtoniennes, Salamandres, Sylphes, Néphélides — clans : La Colère des Flammes, Le Socle du Monde, La Vague Sans Fin, Le Souffle des Cimes
- **Mercenaires** (spéciale) — races : Ogres, Dragons, Chiens, Phoenix, Anges, Ours, Loups, Fauves, Éléphants
- **La Nécropole** (maléfique) — races : Squelettes, Zombies, Ghoules, Spectres, Vampires, Lich, Banshees, Homuncules de Sang, Gargouilles, Dhampirs, Chiroptères, Momies, Chimères nécrotiques, Vermines mortuaires, Poltergeists, Dullahans, Sluaghs — clans : Les Rangs Silencieux, Le Voile Hurlant, La Cour Écarlate, Le Cénacle Nécromant
- **Les Légions du Chaos** (maléfique) — races : Elfes Corrompus, Araignées Géantes, Démons, Orcs, Gobelins, Trolls, Wargs, Guerriers du Chaos — clans : Les Cohortes Sanglantes, Les Princes des Abîmes, La Forêt Maudite, La Garde Noire

## 14. Le site et l'économie

Ce chapitre décrit ce qui fonctionne **aujourd'hui** hors des parties. Ce que le site annonce comme prévu ou à venir (déroulement des tournois, récompenses de tournoi, or gagné en jouant) n'y figure pas : il ne faut rien en promettre à un joueur. Les cas individuels — un solde, un achat non reçu, un remboursement — ne se règlent pas avec ce livret : ils relèvent de l'équipe du jeu.

### Montants en vigueur

Fixés dans le jeu :
- Bourses de pièces d'or : Petite bourse — 20 pièces d'or pour 1,99 € ; Bourse — 55 pièces d'or pour 4,99 € ; Grande bourse — 120 pièces d'or pour 9,99 €. Le prix facturé est celui affiché sur la page de paiement.
- Carnets de tickets de tournoi : 1 ticket pour 2,50 € ; 5 tickets pour 11,50 € ; 12 tickets pour 25,00 €.
- Validité d'un ticket : 365 jours à partir de l'achat.
- Une session de paiement non terminée expire après 30 minutes.
- Forge d'essence : 2000 essence par forge. Chances : Héros unique 1 sur 10 000 ; Unique 1 sur 1 000 ; Épique 1 sur 100 ; Rare 1 sur 10 ; Peu Commune le reste.
- Exemplaires d'une édition limitée, par rareté : Unique 1, Épique 10, Rare 100, Peu Commune 1000.
- Mise de départ minimale aux enchères, par rareté (en pièces d'or) : Peu Commune 5, Rare 10, Épique 15, Unique 20.
- Crédits marché : un lot expire 30 jours après son attribution ; l'alerte part quand il lui reste moins de 3 jours.
- Pseudo : de 3 à 20 caractères.
- Langues disponibles : 14.
- Une partie sans aucune activité pendant 60 minutes est fermée par un passage automatique quotidien.

Réglés par l'équipe du jeu (ils peuvent changer) :
- Prix d'une faction : affiché dans la boutique (réglé par l'équipe du jeu).
- Prix du forfait « Toutes les factions » : affiché dans la boutique (réglé par l'équipe du jeu).
- Surenchère minimale : indiquée sur la page de la vente (réglée par l'équipe du jeu).
- Prolongation d'une vente quand une mise arrive dans les dernières secondes : durée réglée par l'équipe du jeu.
- Âge minimum pour acheter, et fonctions ouvertes (achat de pièces d'or, tickets, enchères, gains en euros) : ils dépendent du pays de connexion du joueur, que ce livret ne connaît pas.

### Les monnaies et les biens du joueur
- Le jeu a une monnaie principale, la pièce d'or, affichée en permanence dans l'en-tête du site.
- L'essence est une seconde ressource, distincte de l'or, qui ne sert qu'à la forge d'essence.
- Les crédits marché sont une troisième ressource, attribuée par l'équipe du jeu, qui ne se dépense qu'aux enchères.
- Les tickets de tournoi sont un bien que l'on détient : on les achète, on les garde, et on en dépense un pour entrer dans le tournoi de son choix.
- Les pièces d'or sont une monnaie interne au jeu : elles ne sont ni convertibles en euros, ni transférables à un autre joueur.
- Un ticket de tournoi n'est ni transférable, ni revendable, ni convertible en euros.
- Le solde d'or ne peut jamais être négatif, et le solde d'essence non plus.

### Gagner et dépenser de l'or
- On obtient de l'or en achetant une bourse de pièces d'or en euros dans la boutique.
- L'or sert à débloquer des factions dans la boutique.
- L'or sert à enchérir à l'hôtel des ventes ; la mise est prélevée au moment où on la place.
- Un enchérisseur dépassé récupère exactement ce qu'il avait misé.
- L'historique des crédits se consulte dans le compte, page « crédits ».

### La dette d'or
- Une dette d'or apparaît quand un achat de pièces d'or est remboursé alors que tout ou partie de cet or a déjà été dépensé : le jeu reprend l'or encore disponible, et ce qui manque devient une dette.
- Tant qu'il a une dette d'or, un joueur ne peut acheter ni faction ni forfait dans la boutique.
- Tout nouvel achat de pièces d'or rembourse d'abord la dette ; seul le surplus arrive sur le solde.
- La dette est affichée en rouge à côté du solde dans l'en-tête, et rappelée dans la boutique.

### La boutique
- La boutique est réservée aux joueurs connectés et présente, dans l'ordre : la forge d'essence, les factions, les tickets de tournoi, les bourses de pièces d'or.
- Les factions se paient en pièces d'or ; les tickets et les bourses d'or se paient en euros ; la forge se paie en essence.
- Débloquer une faction donne toutes ses cartes communes ; cela ne donne aucune carte de rareté supérieure.
- Toutes les factions sont au même prix, et la boutique affiche pour chacune le nombre de cartes communes jouables qu'elle contient.
- Le forfait « Toutes les factions » débloque d'un coup les communes de toutes les factions manquantes, ainsi que celles des factions qui sortiront plus tard.
- Le forfait n'est proposé que s'il manque au moins deux factions au joueur.
- Une faction déjà possédée ne peut pas être rachetée, et le détenteur du forfait ne peut plus acheter de faction à l'unité.
- Si l'or manque, l'achat est refusé et rien n'est débité.
- Une faction peut aussi être débloquée depuis sa page de présentation, où l'on voit ses cartes.
- Le déblocage d'une faction est définitif et rattaché au compte, sauf reprise à la suite d'un remboursement (voir « Remboursements »).
- La boutique vend trois bourses de pièces d'or et trois carnets de tickets de tournoi, le prix au ticket baissant avec la taille du carnet.
- Chaque ticket a sa propre date d'expiration, comptée à partir de l'achat ; la boutique indique le nombre de tickets détenus et la date du premier à expirer.

### Payer en euros
- Avant le premier achat en euros, le joueur doit certifier, en cochant une case, qu'il a au moins l'âge minimum exigé dans son pays ; cette confirmation n'est demandée qu'une fois.
- Si le joueur achète ensuite depuis un pays où l'âge minimum est plus élevé que celui qu'il a certifié, la confirmation lui est redemandée.
- Le paiement se fait sur une page sécurisée de Stripe : aucune donnée bancaire ne passe par le jeu, et une adresse de facturation est demandée.
- Une session de paiement ouverte et non terminée expire d'elle-même ; rien n'est alors débité et l'achat apparaît « Non abouti ».
- L'or ou les tickets ne sont crédités qu'une fois le paiement confirmé par la banque, en général en quelques secondes ; la page de retour attend cette confirmation avant d'annoncer « Paiement confirmé ».
- Si la confirmation tarde, il n'y a rien à refaire : le crédit se fera automatiquement dès qu'elle arrive, et l'état reste visible dans l'historique des paiements.
- Abandonner le paiement ramène à une page « Paiement annulé » : rien n'est débité et l'achat peut être relancé.
- La page « Mes paiements » du compte liste les achats de tickets et de pièces d'or avec leur date, leur objet, leur montant et leur état : En attente, Réglé, Remboursé ou Non abouti.
- Un paiement encore en attente n'affiche pas de montant.

### Remboursements
- Il n'existe pas de bouton de remboursement : toute demande passe par le support, et seul le paiement d'origine peut être remboursé.
- Quand un achat de pièces d'or est remboursé, l'or correspondant est repris sur le solde du joueur.
- Si l'or remboursé a servi à débloquer des factions, celles-ci sont reprises en commençant par la plus récente, jusqu'à couvrir la dette ; chaque faction reprise efface de la dette le prix réellement payé pour elle.
- Le forfait « Toutes les factions » peut être repris de la même manière.
- La faction offerte à l'inscription n'est jamais reprise.
- Un deck qui contient des cartes d'une faction reprise est conservé tel quel mais ne peut plus être joué ; il redevient jouable dès que la faction est de nouveau débloquée.
- Quand un achat de tickets est remboursé, les tickets encore détenus sont annulés, puis les inscriptions aux tournois qui n'ont pas commencé ; un ticket réellement joué devient une dette de tickets.
- Une dette de tickets bloque l'inscription aux tournois à ticket, même si le joueur détient d'autres tickets valides ; le prochain achat de tickets la solde en premier.
- Un ticket offert par l'administration n'est jamais repris par un remboursement.

### L'essence et la forge d'essence
- La forge d'essence échange un montant fixe d'essence contre une carte en édition limitée tirée au hasard parmi les exemplaires qui n'appartiennent encore à personne.
- Le bouton de forge reste inactif tant que le joueur n'a pas assez d'essence, et une jauge montre sa progression vers la prochaine forge.
- Le tirage se fait en cascade : d'abord la rareté, puis la faction, puis le clan, puis la carte.
- Les chances de rareté sont affichées dans la boutique : héros Unique, carte Unique, Épique, Rare, et Peu Commune pour tout le reste.
- La forge ne donne jamais de carte Commune.
- La faction puis le clan sont tirés à chances égales parmi ceux qui ont encore au moins un exemplaire libre dans la rareté tirée.
- Si la rareté tirée n'a plus aucun exemplaire libre, la forge descend d'un cran de rareté.
- Le joueur reçoit toujours le plus petit numéro d'exemplaire encore libre de la carte tirée.
- S'il ne reste plus aucun exemplaire à forger, la forge est refusée et aucune essence n'est dépensée.
- Seules les cartes jouables, hors sets spéciaux, peuvent sortir de la forge.
- Il n'y a aucune limite au nombre de forges : chaque forge ne demande que l'essence nécessaire.
- L'historique des gains d'essence et des forges se consulte dans le compte, page « Mon essence ».

### La collection
- La collection se compose de quatre rubriques : les cartes, les héros, les dos de cartes et les plateaux.
- À l'inscription, le joueur choisit une faction et en reçoit gratuitement toutes les cartes communes ; ce choix est définitif.
- Les cartes communes de la faction neutre, les Mercenaires, appartiennent à tous les joueurs.
- Les cartes de rareté supérieure à Commune ne s'obtiennent qu'à l'unité : aux enchères, à la forge d'essence, ou par un don de l'équipe du jeu.
- Une carte acquise personnellement reste utilisable quelles que soient sa rareté et sa faction, même si le joueur n'a pas débloqué cette faction.
- Une carte en édition limitée existe en un nombre fixe d'exemplaires numérotés, d'autant plus petit que la rareté est élevée ; chaque exemplaire n'a qu'un seul propriétaire.
- Dans la collection, chaque exemplaire numéroté détenu apparaît séparément avec son numéro sur le tirage total.
- Les cartes que le joueur ne possède pas peuvent être affichées dans la collection, grisées et marquées « Verrouillée » ; elles ne sont pas utilisables en deck.
- Les joueurs ne peuvent pas mettre leurs cartes en vente : seules les enchères proposées par la plateforme sont ouvertes, et les joueurs peuvent y enchérir.
- Les dos de cartes et les plateaux communs sont disponibles pour tous ; ceux de rareté supérieure existent en exemplaires numérotés et il faut en posséder un pour l'utiliser.
- Les héros communs sont disponibles pour tous ; les autres héros se possèdent à l'exemplaire.

### Les cartes jouables en deck
- Un deck ne peut contenir que des cartes que le joueur possède.
- Seules les cartes publiées et actives peuvent être ajoutées à un deck.
- Une carte peut être retirée du jeu, provisoirement ou définitivement : elle reste visible, grisée, dans la collection, mais ne peut plus être ajoutée à un deck.
- Un deck qui contient une carte retirée est invalide et ne peut pas lancer de partie, mais il n'est pas modifié ; il redevient valide si la carte revient en jeu.
- Les cartes encore en préparation ne sont pas visibles des joueurs.
- Une partie déjà commencée va à son terme même si une de ses cartes est retirée entre-temps.
- Les cartes d'un set spécial ne sortent jamais des tirages au hasard, ni en partie ni à la forge d'essence ; la collection, le deck et la pioche du joueur ne sont pas concernés par cette restriction.

### Disponibilité selon le pays
- Le jeu gratuit est accessible partout ; quatre fonctions peuvent être ouvertes ou fermées pays par pays : l'achat de pièces d'or, les tickets de tournoi, les enchères et l'affichage des gains en euros des tournois.
- C'est le pays depuis lequel le joueur est connecté qui compte, et non son adresse de facturation.
- Quand une fonction est fermée dans le pays du joueur, le bouton d'achat disparaît et un message indique qu'elle n'est pas encore disponible dans ce pays, le reste du jeu demeurant accessible.
- Là où les tickets sont fermés, on ne peut ni en acheter ni s'inscrire à un tournoi.
- Là où les enchères sont fermées, on ne peut ni enchérir ni mettre en vente ; l'hôtel des ventes affiche le message d'indisponibilité.
- Là où les gains en euros sont fermés, les montants en euros des tournois ne sont pas affichés.
- L'âge minimum pour acheter dépend du pays de connexion.
- Quand le pays du joueur ne peut pas être déterminé, ou n'a pas de réglage propre, c'est le réglage général « tous les autres pays » qui s'applique.
- La forge d'essence et l'achat de factions en pièces d'or ne dépendent pas du pays.

### Le compte
- On crée un compte avec une adresse e-mail et un mot de passe, ou en se connectant avec Google ou Discord.
- À l'inscription par e-mail, il faut choisir un pseudo, saisir un mot de passe d'une longueur minimale et accepter les conditions générales d'utilisation en cochant une case qui n'est pas cochée d'avance.
- Le pseudo est public ; il se compose de lettres sans accent, de chiffres, de tirets et de soulignés, sans espace, dans une longueur bornée.
- Deux joueurs ne peuvent pas porter le même pseudo, même en changeant les majuscules.
- Les pseudos qui feraient croire à un compte officiel sont refusés.
- Un contrôle anti-robot peut être demandé à l'inscription, à la connexion et à la réinitialisation du mot de passe.
- Après l'inscription, un e-mail de confirmation peut être demandé ; il peut être renvoyé après un court délai d'attente.
- Un mot de passe oublié se réinitialise par un lien envoyé à l'adresse e-mail du compte.
- Un joueur inscrit avec Google ou Discord choisit son pseudo à sa première arrivée dans le jeu.
- Avant d'accéder au menu principal, le nouveau joueur choisit sa faction de départ.
- Aucun âge n'est demandé à l'inscription ; l'âge n'est certifié qu'au moment du premier achat en euros.
- Le jeu est disponible en quatorze langues, que l'on change à tout moment avec le sélecteur de langue.
- À la première visite, la langue proposée est celle du pays de connexion quand le jeu la parle, l'anglais sinon ; le choix fait ensuite par le joueur est conservé et passe toujours devant.

### Enchères — qui vend, quoi
- Seule la plateforme met des objets en vente à l'hôtel des ventes ; les joueurs y achètent, ils ne revendent pas.
- Quand le marché est fermé par l'administration, aucune nouvelle vente n'est ouverte.
- Peuvent être mis en vente : des cartes, des exemplaires numérotés de cartes en édition limitée, des plateaux de jeu et des dos de cartes.
- Les cartes Communes ne sont jamais mises aux enchères ; seules les raretés Peu Commune, Rare, Épique et Unique le sont.
- La mise de départ d'une carte ne peut pas être inférieure à un plancher fixé par sa rareté.
- Une vente peut regrouper plusieurs objets en un lot, dans la limite d'un nombre maximum d'objets ; le lot se remporte en entier, pour un seul prix.
- Un exemplaire numéroté affiche son numéro et la taille de la série ; une carte vendue directement par la plateforme sans exemplaire attribué n'en affiche pas.
- L'hôtel des ventes se filtre par nom, faction, clan, rareté, type, coût, capacité et numéro d'exemplaire, et se trie par fin proche, prix ou nouveauté.

### Enchères — miser
- La première mise doit être au moins égale à la mise de départ.
- Chaque mise suivante doit dépasser la mise en cours d'au moins l'incrément minimum.
- Le montant d'une mise est immédiatement retiré du solde du joueur et mis sous séquestre ; sans solde suffisant, la mise est refusée.
- Quand un joueur est surenchéri, sa mise lui est rendue aussitôt et en totalité, et il reçoit une notification.
- On ne peut pas enchérir sur une vente terminée ou annulée.
- Une mise déposée dans les toutes dernières secondes repousse la fin de la vente de ce même délai, autant de fois qu'il le faut : une vente ne se ferme que sur un silence.
- La page d'une vente se met à jour toute seule pendant que d'autres enchérissent, plus souvent dans la dernière minute et demie.
- L'historique des mises d'une vente est visible sur sa page.

### Enchères — achat immédiat
- Certaines ventes portent un prix d'achat immédiat, toujours supérieur à la mise de départ.
- Payer ce prix clôt la vente sur-le-champ et attribue le lot à l'acheteur ; l'enchérisseur précédent est remboursé.
- L'achat immédiat n'est plus accepté dès que la mise en cours est assez haute pour que ce prix ne la dépasse plus d'au moins l'incrément minimum.
- Un achat immédiat ne prolonge pas la vente.

### Enchères — fin d'une vente
- À l'échéance, le meilleur enchérisseur remporte le lot : les cartes du lot rejoignent sa collection et il reçoit une notification.
- Le gagnant paie exactement sa dernière mise, déjà sous séquestre ; rien d'autre n'est prélevé.
- Une vente échue est soldée à la première consultation de l'hôtel des ventes ou de sa page qui suit l'échéance.
- Une vente sans aucune mise se termine « invendue ».
- Si l'administration annule une vente en cours, le meilleur enchérisseur est remboursé de tout ce qu'il avait engagé et reçoit une notification.
- L'onglet « Mes enchères » liste les ventes sur lesquelles le joueur a misé.

### Notifications
- Le joueur est notifié quand il est surenchéri (avec le détail de ce qui lui est rendu), quand il remporte une vente et quand une vente où il menait est annulée.

### Crédits marché
- Les crédits marché sont une monnaie d'enchère distincte de l'or ; ils ne se convertissent jamais en or.
- Les crédits sont attribués par lots ; chaque lot expire un nombre fixe de jours après son attribution, et les crédits non dépensés d'un lot expiré sont perdus.
- Le solde de crédits est la somme de ce qui reste dans les lots non expirés.
- Les crédits ne se dépensent qu'aux enchères, et seulement sur les ventes de la plateforme.
- Dans une mise, un crédit vaut une pièce d'or.
- Une mise utilise d'abord tous les crédits disponibles, puis l'or complète le montant ; le joueur ne choisit pas la répartition.
- Avant de valider, le formulaire de mise annonce la répartition « crédits + or » du montant saisi.
- Les crédits sont pris en commençant par le lot qui expire le plus tôt.
- Un joueur surenchéri récupère exactement ce qu'il avait payé : l'or en or, les crédits en crédits.
- Les crédits rendus retournent dans leur lot d'origine avec leur date d'expiration d'origine : si ce lot a expiré pendant la vente, ils sont perdus, et la notification de surenchère l'indique.
- La même règle de remboursement s'applique quand l'administration annule une vente.
- Une alerte est envoyée une seule fois par lot quand il lui reste moins de quelques jours ; elle est émise au moment où le joueur consulte son solde ou une page d'enchère.
- La page « Mes crédits marché » montre le solde, la prochaine échéance, les lots actifs, les lots expirés récemment et les derniers mouvements.

### Tickets de tournoi
- Un ticket de tournoi s'achète en boutique, à l'unité ou par carnet, et se garde jusqu'à sa date de péremption.
- L'achat de tickets est réservé aux joueurs ayant déclaré avoir l'âge minimum de leur pays, et il est fermé dans certains pays.

### Tournois — ce qui existe aujourd'hui
- La page des tournois liste les tournois ouverts ou en cours, avec leur nom, leur type, leur nombre de places et leur date de début.
- L'inscription n'est possible que tant que le tournoi est ouvert et qu'il reste des places.
- Un joueur ne peut s'inscrire qu'une fois à un même tournoi.
- S'inscrire à un tournoi Hebdomadaire ou Spécial coûte un ticket ; un tournoi Gratuit n'en coûte aucun.
- Le ticket dépensé est toujours celui qui périme le plus tôt.
- L'inscription ne passe jamais par un paiement : elle dépense un ticket déjà détenu.
- Sans ticket valide, la page renvoie vers la boutique au lieu de proposer l'inscription.
- Dans les pays où les tournois à ticket sont fermés, l'inscription à ces tournois est refusée.

### Jouer une partie — trouver un adversaire
- Pour jouer, le joueur choisit un format puis un de ses decks construits pour ce format, et lance la recherche.
- Seuls les decks complets sont proposés : le nombre exact de cartes, aucun objet, aucune carte retirée ou exclue du jeu.
- Le format mis en avant et présélectionné est Classique · Standard.
- Le joueur est opposé à celui qui attend depuis le plus longtemps dans le même format ; il n'y a ni classement ni niveau pris en compte.
- Deux joueurs ne sont jamais appariés s'ils ont choisi des formats différents.
- La recherche affiche le temps d'attente et peut être annulée à tout moment.
- Un joueur qui ferme la page pendant la recherche quitte la file après un court délai sans signe de vie.
- Si une carte du deck devient indisponible pendant l'attente, la recherche s'arrête et le joueur en est averti.
- Relancer la recherche juste après avoir été apparié ramène à la partie qui vient de commencer, pas à une nouvelle.
- Au lancement, la configuration de la partie est figée : decks, héros, cartes et règles en vigueur. Modifier son deck ensuite ne change rien à la partie en cours.

### Jouer une partie — abandon, déconnexion, résultat
- Un joueur peut abandonner à tout moment depuis le menu des réglages, y compris pendant le mulligan ; son adversaire gagne immédiatement.
- Une partie terminée n'accepte plus aucune action : un abandon tardif ne change pas le vainqueur.
- Se déconnecter ne fait pas perdre la partie : au retour, le joueur retrouve la partie dans son état à jour.
- Le vainqueur est établi par le serveur, qui rejoue la partie action par action à partir de la configuration figée ; ce résultat prévaut sur ce qu'affichent les écrans des joueurs.
- Une partie restée sans aucune activité au-delà du délai d'inactivité est fermée par un passage automatique quotidien.

### Formats au lancement d'une partie
- Quatre formats combinent un mode (Classique ou Expert) et une étendue (Standard ou Étendu) ; seuls les formats actifs sont proposés.
- Un deck est attaché à un format à sa construction ; l'écran de jeu ne propose pour un format que les decks construits pour lui.
- Si le joueur n'a aucun deck pour le format choisi, il ne peut pas lancer la recherche dans ce format.
