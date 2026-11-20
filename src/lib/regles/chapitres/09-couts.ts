import { MAX_EVEIL } from "@/lib/game/constants";
import type { Chapitre } from "../livret";

export const couts: Chapitre = {
  id: "couts",
  titre: "Les coûts : mana, coûts additionnels, éveil, réductions",
  texte: () => `
**Mana.** Jouer une carte coûte son mana. Le mana non dépensé est perdu à la fin du tour.

**Coûts additionnels.** Certaines cartes demandent, en plus du mana, une ressource engagée au moment de les jouer. Ces coûts s'ajoutent au mana, se cumulent entre eux sur une même carte, et ne sont **jamais réductibles**.
- **Points de vie** : le héros du joueur perd N PV. Impossible si cela le tuerait.
- **Défausse** : le joueur jette au cimetière N autres cartes de sa main, qu'il désigne.
- **Sacrifice** : il détruit N unités alliées de son choix ; leurs effets « à la mort » se déclenchent.
- **Exil** : N cartes sont retirées du dessus de son deck, définitivement.
- **Repli** : il replace N cartes de sa main sur le dessus de son deck, dans l'ordre qu'il choisit — la dernière posée sera la première repiochée.

**Éveil.** Le seul coût alternatif : il **remplace** le mana. Une carte à coût d'éveil se met en éveil depuis la main, gratuitement, dans une zone dédiée. À chacun de ses tours, le joueur y verse autant de points qu'il veut, un point par mana. Le dernier point la fait entrer en jeu. ${MAX_EVEIL} cartes en éveil au maximum à la fois.

**Réductions de coût.** Certaines capacités réduisent le coût en mana : Canalisation (actions, selon le terrain), Entraide (selon les alliés de même race), Concentration. Elles ne touchent jamais les coûts additionnels. Un coût réduit s'affiche en bleu clair.
`,
};
