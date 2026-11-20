import { MAX_BOARD_SIZE } from "@/lib/game/constants";
import type { Chapitre } from "../livret";

export const unitesEtCombat: Chapitre = {
  id: "unites-combat",
  titre: "Les unités et le combat",
  texte: () => `
**Invoquer.** On paie le coût en mana d'une unité pour la poser sur le terrain. Le terrain accueille au plus ${MAX_BOARD_SIZE} emplacements par joueur ; les objets en occupent aussi.

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
`,
};
