import {
  EXPLORATION_PALIER,
  MACHINE_BASE_ATTACK,
  MACHINE_BASE_HEALTH,
  MAX_CONQUETE,
  MAX_EPARGNE,
  MAX_FOI,
  MAX_INVENTIONS_MACHINE,
} from "@/lib/game/constants";
import type { Chapitre } from "../livret";

export const herosEtCompteurs: Chapitre = {
  id: "heros-compteurs",
  titre: "Le héros, son pouvoir et les compteurs",
  texte: () => `
**Pouvoir de héros.** Chaque héros a un pouvoir utilisable **une fois par tour**, en payant son coût en mana. Selon le héros, il confère une capacité à une unité, déclenche un effet d'action, ou pose un emblème.

**L'orbite du héros.** Autour du portrait gravitent ses emblèmes (losanges) et ses compteurs (médaillons). Chaque élément s'explique au survol ; ceux du héros adverse sont visibles aussi.

**Compteurs.** Plusieurs capacités alimentent des compteurs personnels. Un compteur n'apparaît que lorsqu'il dépasse 0, et son halo pulse quand il peut être dépensé. Ils ne coûtent pas de mana.
- **Épargne** (maximum ${MAX_EPARGNE}) : un clic dépense tout le compteur pour choisir 1 carte parmi 3 tirées au hasard dans le jeu, de coût inférieur ou égal à l'Épargne. Le compteur repart à 0.
- **Foi** (maximum ${MAX_FOI}) : un clic propose 1 carte parmi 3 tirées du propre deck du joueur, de coût inférieur ou égal à la Foi. Seul le coût de la carte prise est retiré ; le reste est conservé.
- **Conquête** (palier ${MAX_CONQUETE}) : quand le compteur atteint ${MAX_CONQUETE}, le joueur choisit 1 carte parmi 3 tirées du deck adverse. Elle est à lui pour le reste de la partie, jouable sans contrainte de faction, et l'adversaire ne la piochera jamais. Le compteur repart à 0.
- **Invention +X/+Y** : chaque Invention ajoute +X/+Y à la machine du joueur (${MACHINE_BASE_ATTACK}/${MACHINE_BASE_HEALTH} au départ), et parfois une capacité avec son déclencheur — deux fois la même capacité au même déclencheur additionnent leurs valeurs. La machine coûte 1 mana par Invention, ${MAX_INVENTIONS_MACHINE} au plus. Un clic sur le compteur la met en main ; la suivante repart de zéro.
- **Exploration** (palier ${EXPLORATION_PALIER}) : le seul compteur qui ne se clique pas. Chaque fois qu'il atteint ${EXPLORATION_PALIER}, le joueur pioche une carte aussitôt et ${EXPLORATION_PALIER} points sont retirés ; le reste est conservé, si bien qu'un gros gain peut faire piocher deux cartes.
`,
};
