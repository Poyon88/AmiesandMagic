import { LOW_HP_TRIGGER_THRESHOLD, SEUIL_DECK_THRESHOLD } from "@/lib/game/constants";
import type { Chapitre } from "../livret";

export const capacites: Chapitre = {
  id: "capacites",
  titre: "Les capacités : quand elles agissent, comment les lire",
  texte: () => `
**Une icône par capacité.** La couleur de l'icône dit QUAND la capacité agit :
- **blanc — permanent** : passif, aura ou râle d'agonie, actif tant que la carte est là ;
- **jaune — entrée en jeu / action** : quand l'unité arrive en jeu, ou quand l'action se résout ;
- **orange — activation** : pouvoir que le joueur déclenche en cliquant l'unité, une fois par tour (pas le tour de son arrivée, sauf Traque) ;
- **magenta — à l'attaque** : chaque fois que l'unité attaque, avant les dégâts du combat ;
- **rouge sombre — à la mort** : quand l'unité meurt ;
- **vert citron — blessure** : quand l'unité est blessée sans mourir (une fois par source de dégâts et par tour) ;
- **violet — sous ${LOW_HP_TRIGGER_THRESHOLD} PV** : quand le héros du joueur passe strictement sous ${LOW_HP_TRIGGER_THRESHOLD} PV. Ce seuil est le même pour tous les héros ;
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

**Capacités « Seuil ».** Elles s'activent quand le deck de leur contrôleur tombe à ${SEUIL_DECK_THRESHOLD} cartes ou moins.

**En main, rien n'est actif.** Une unité en main n'a aucune capacité active, pas même une protection, sauf celles dont le texte dit agir en main (par exemple Mutation, ou un effet « fin de tour en main »).
`,
};
