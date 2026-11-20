import { MAX_OBJETS_PAR_UNITE } from "@/lib/game/items";
import type { Chapitre } from "../livret";

export const actionsObjetsEmblemes: Chapitre = {
  id: "actions-objets-emblemes",
  titre: "Les actions, les objets et les emblèmes",
  texte: () => `
**Actions.** Une action produit un effet immédiat puis part au cimetière. Certaines demandent une cible (une unité, un héros, une carte d'une main ou d'un cimetière). Une action peut aussi **conférer une capacité d'unité** : à l'unité ciblée, ou à toutes les unités alliées (icône marquée d'un « A »).

**Objets.** Troisième type de carte, hors deck : on les trouve en cours de partie (Trésor, Compagnons, Tuteur, Sélection, Faveur…).
- Un objet occupe un emplacement du terrain mais reste inerte : il n'est pas attaquable et ne compte pas comme une unité.
- On paie son coût pour le poser, puis son **coût d'équipement** (le cartouche sous le mana) pour le fixer sur une unité alliée. Une unité porte au plus ${MAX_OBJETS_PAR_UNITE} objets ; leurs bonus s'additionnent.
- L'unité équipée reçoit les bonus « +X/+Y » et les capacités de l'objet tant qu'elle le porte.
- On peut rééquiper l'objet sur une autre unité autant de fois qu'on veut, en repayant le coût d'équipement.
- Si le porteur meurt ou quitte le terrain, l'objet reste en jeu, déséquipé.

**Emblèmes.** Certaines cartes (unités, actions) et certains pouvoirs de héros posent un emblème : un effet permanent attaché à un **joueur**, non à une carte.
- Il survit à la disparition de sa source (unité morte, action résolue).
- Il agit à la cadence indiquée — entrée en jeu, attaque, mort, fin de tour… — chez le joueur qu'il affecte, jusqu'à la fin de la partie ou de sa durée.
- Les emblèmes se lisent autour du portrait du héros (losanges) : ardoise = effet permanent ; brun = effet à durée (des points dorés comptent les tours restants, le dernier vire à l'orange) ; bleu = emblème qui réagit à un événement. Un liseré rouge signale une malédiction posée par l'adversaire, « ×N » un emblème posé plusieurs fois.
`,
};
