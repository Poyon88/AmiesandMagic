// DÉCOUVERTE UN TOUR SUR DEUX — variante expérimentale des règles.
//
// Aux tours PAIRS d'un joueur (son 2e, 4e, 6e…), la pioche du tour est
// remplacée par une DÉCOUVERTE : il choisit 1 carte parmi 3 Communes de coûts
// aléatoires — 2 de son clan, 1 de sa faction mais d'un autre clan. La carte
// est créée à partir du vivier : le deck n'est pas entamé (cf. offreDecouverte
// et startTurn, engine.ts).
//
// Activée par `GameState.regles.decouverteAlternee`, fixé à l'initialisation et
// partagé par les deux clients (inclus dans le hash de synchro).
import type { Card, GameState, HeroDefinition, IdentiteDeck } from "./types";

/** La variante est-elle activée pour cette build ? Lue par la page de match et
 *  le simulateur au moment d'initialiser la partie, jamais en cours de partie. */
export function regleDecouverteActivee(): boolean {
  return process.env.NEXT_PUBLIC_REGLE_DECOUVERTE === "1";
}

/** Tour propre du joueur actif (1, 2, 3…) : `turnNumber` est global, le 1er
 *  joueur jouant les tours impairs et le second les pairs. */
export function tourDuJoueur(turnNumber: number): number {
  return Math.ceil(turnNumber / 2);
}

/** Le tour qui s'ouvre remplace-t-il la pioche par une découverte ? */
export function estTourDeDecouverte(state: Pick<GameState, "regles" | "turnNumber">): boolean {
  return !!state.regles?.decouverteAlternee && tourDuJoueur(state.turnNumber) % 2 === 0;
}

/** Faction et clan de RÉFÉRENCE du joueur, figés à l'initialisation.
 *  Le héros d'abord (il porte faction et clan) ; à défaut, la faction puis le
 *  clan les plus représentés dans le deck de départ, Mercenaires exclus. Un
 *  deck multi-clans prend donc son clan majoritaire. Égalité : ordre
 *  alphabétique, pour que les deux clients tranchent pareil. */
export function identiteDuDeck(
  cards: { card: Card; quantity: number }[],
  hero?: HeroDefinition | null,
): IdentiteDeck | null {
  const majoritaire = (compte: Map<string, number>): string | null => {
    let meilleur: string | null = null, n = 0;
    for (const [k, v] of [...compte].sort(([a], [b]) => a.localeCompare(b))) if (v > n) { meilleur = k; n = v; }
    return meilleur;
  };
  const propres = cards.filter(({ card }) => card.faction && card.faction !== "Mercenaires");
  const parFaction = new Map<string, number>();
  for (const { card, quantity } of propres) parFaction.set(card.faction!, (parFaction.get(card.faction!) ?? 0) + quantity);
  const faction = hero?.faction || majoritaire(parFaction);
  if (!faction) return null;
  if (hero?.faction === faction && hero.clan) return { faction, clan: hero.clan };
  const parClan = new Map<string, number>();
  for (const { card, quantity } of propres) {
    if (card.faction === faction && card.clan) parClan.set(card.clan, (parClan.get(card.clan) ?? 0) + quantity);
  }
  return { faction, clan: majoritaire(parClan) };
}
