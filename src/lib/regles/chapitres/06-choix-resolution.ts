import { CHOICE_TIMER_SECONDS } from "@/lib/game/constants";
import type { Chapitre } from "../livret";

export const choixEtResolution: Chapitre = {
  id: "choix-resolution",
  titre: "Les choix et l'ordre de résolution",
  texte: () => `
**Qui choisit.** Quand un effet demande un choix — une cible, une carte parmi plusieurs —, c'est toujours le **propriétaire de l'effet** qui choisit, même pendant le tour adverse.

**Délai.** Le joueur dispose de ${CHOICE_TIMER_SECONDS} secondes par choix. Pendant ce temps le chrono du tour est suspendu. Sans réponse, le jeu tranche au hasard.

**Tant qu'un choix est en attente**, aucune autre action n'est possible, pour les deux joueurs : il faut d'abord le régler.

**Choix « à l'attaque ».** Un choix déclenché par une attaque se règle avant le combat ; le combat reprend ensuite.

**Ordre des effets d'une action.** Les effets d'une action se résolvent dans l'ordre où la carte les présente. Après chaque effet, les unités mortes quittent le terrain et leurs effets « à la mort » se règlent, avant de passer à l'effet suivant.

**Sans réponse d'un joueur déconnecté.** Si le joueur qui doit choisir ne répond pas, le choix est tranché au hasard.
`,
};
