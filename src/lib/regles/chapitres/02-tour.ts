import {
  CARDS_DRAWN_PER_TURN,
  FIRST_PLAYER_HAND_SIZE,
  MAX_HAND_SIZE,
  MAX_MANA,
  MULLIGAN_TIMER_SECONDS,
  STARTING_HAND_SIZE,
  STARTING_MANA,
  TURN_TIMER_SECONDS,
} from "@/lib/game/constants";
import type { Chapitre, ContexteLivret } from "../livret";

const V1 = "2 Communes de son clan et 1 Commune d'un autre clan de sa faction (celle-ci un cran plus chère)";
const V2 = "1 Commune de son clan, 1 Commune d'un autre clan de sa faction, et 1 Commune d'une autre faction de même alignement ou neutre (celle-ci un cran plus chère ; jamais de Mercenaires)";

function decouverte(ctx: ContexteLivret): string {
  if (ctx.decouverte === "off") return "";
  const offre =
    ctx.decouverte === "doc"
      ? `Selon le réglage en vigueur sur le site, l'offre est : soit ${V1} ; soit ${V2}.`
      : `L'offre : ${ctx.decouverte === 2 ? V2 : V1}.`;
  return `
**Découverte un tour sur deux.** À ses tours pairs (son 2e, son 4e, son 6e…), le joueur ne pioche pas : il fait une découverte, c'est-à-dire qu'il choisit 1 carte parmi 3. ${offre} La carte choisie est créée pour lui : son deck n'est pas entamé. Le coût des cartes proposées est tiré au hasard à chaque rang de découverte, et il est le même pour les deux joueurs à la même découverte (la 2e découverte de l'un et la 2e de l'autre). Si une faction n'a qu'un seul clan, la case « autre clan » est remplacée par une 2e carte du clan.
- Sans choix dans le délai, le joueur reçoit une des trois cartes au hasard.
- Tous les coûts de 1 à 10 sont possibles : rien ne garantit que la carte offerte soit jouable dans le tour. À 10, la carte « un cran plus chère » coûte 10 aussi.
- Si le clan n'a aucune carte au coût tiré, c'est le coût valide le plus proche qui est retenu (le moins cher en cas d'égalité).
- La faction et le clan de référence sont ceux du héros ; à défaut, la faction puis le clan les plus représentés dans le deck, Mercenaires exclus.
- Si aucune carte ne peut être offerte, le joueur pioche normalement.
`;
}

export const tour: Chapitre = {
  id: "tour",
  titre: "Mise en place et déroulement d'un tour",
  texte: (ctx) => `
**Qui commence.** Le premier joueur est désigné par le jeu. Commencer est un avantage, compensé de deux façons : le joueur qui commence en premier démarre avec une carte de moins, et celui qui commence en second reçoit une **Étincelle de mana** (+1 mana pour son premier tour).

**Main de départ et mulligan.** ${STARTING_HAND_SIZE} cartes pour le joueur en second, ${FIRST_PLAYER_HAND_SIZE} pour celui qui commence. Avant le premier tour, chacun peut remplacer autant de cartes de sa main qu'il le veut (mulligan), en ${MULLIGAN_TIMER_SECONDS} secondes ; passé ce délai, la sélection en cours est validée (tout garder si rien n'est sélectionné).

**Début de tour**, dans l'ordre :
1. le mana maximum du joueur augmente de 1 (plafond ${MAX_MANA}), puis son mana est entièrement rechargé. La partie commence à ${STARTING_MANA} mana ;
2. il pioche ${CARDS_DRAWN_PER_TURN} carte${ctx.decouverte === "off" ? "" : " — ou fait une découverte, voir plus bas"} ;
3. ses unités se « réveillent » : elles peuvent de nouveau attaquer et utiliser leur pouvoir activable.

**Pendant son tour**, le joueur joue autant de cartes que son mana le permet, attaque avec ses unités, utilise le pouvoir de son héros, dans l'ordre qu'il veut. Puis il passe la main (fin de tour).

**Chrono.** Un tour dure au plus ${TURN_TIMER_SECONDS} secondes ; à 0, le tour se termine.
${decouverte(ctx)}
**Main pleine.** La main contient au plus ${MAX_HAND_SIZE} cartes. Une carte piochée au-delà est perdue.

**Deck vide : la fatigue.** Un joueur qui doit piocher alors que son deck est vide subit des dégâts de fatigue : 1 la première fois, 2 la suivante, puis 3, et ainsi de suite.

**Fin de partie.** Un héros à 0 PV a perdu. Un joueur peut aussi concéder depuis les réglages (⚙).
`,
};
