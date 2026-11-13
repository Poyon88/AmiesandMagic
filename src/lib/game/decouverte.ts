// DÉCOUVERTE UN TOUR SUR DEUX — variante expérimentale des règles.
//
// Aux tours PAIRS d'un joueur (son 2e, 4e, 6e…), la pioche du tour est
// remplacée par une DÉCOUVERTE : il choisit 1 carte parmi 3 Communes — 2 de
// son clan au coût C, 1 de sa faction mais d'un AUTRE clan au coût C+1 (le +1
// contrebalance les synergies de clan et pousse à regarder ailleurs). La carte
// est créée à partir du vivier : le deck n'est pas entamé (cf. offreDecouverte
// et startTurn, engine.ts).
//
// LE COÛT C (refonte du 2026-11-01). Avant, chaque carte avait un coût libre :
// on prenait toujours la plus chère, et la partie se jouait sur qui tirait un
// « spoiler ». Désormais :
//   • C est le MÊME pour les deux joueurs à la même découverte (ta 3e et la 3e
//     de l'adversaire) — un gros coût tombe chez les deux à la fois ;
//   • C est tiré au hasard, une fois par rang, dans `TABLE_COUTS_DECOUVERTE` :
//     tous les coûts 1-10 restent possibles, le milieu (3-6) domine, les coûts
//     bas pèsent plus en début de partie. Rien ne GARANTIT une carte jouable
//     dans le tour — sans quoi plus personne ne mettrait de petites cartes
//     dans son deck (arbitrage de l'auteur).
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

/** Poids des coûts 1 → 10 de la carte du CLAN, par rang de découverte (1ʳᵉ,
 *  2ᵉ… ; la dernière ligne vaut pour la 5ᵉ et au-delà). Chaque ligne fait 100.
 *
 *  Réglage du 2026-11-14 : les coûts 8-10 sortaient trop souvent (10 % au
 *  tour 2, 23 % au tour 10+) — part divisée par deux, et coûts 1-2 relevés
 *  à partir de la 2ᵉ découverte (16 % au lieu de 8 % en fin de partie). */
export const TABLE_COUTS_DECOUVERTE: readonly (readonly number[])[] = [
  //  1   2   3   4   5   6   7   8   9  10
  [ 15, 19, 19, 16, 13,  8,  5,  2,  2,  1], // 1ʳᵉ (tour 2)
  [ 11, 15, 16, 17, 15, 12,  8,  3,  2,  1], // 2ᵉ  (tour 4)
  [  9, 12, 13, 17, 17, 15, 10,  4,  2,  1], // 3ᵉ  (tour 6)
  [  8, 10, 12, 16, 17, 16, 11,  5,  3,  2], // 4ᵉ  (tour 8)
  [  7,  9, 11, 16, 17, 16, 12,  5,  4,  3], // 5ᵉ et plus (tour 10+)
];

export const COUT_MAX_DECOUVERTE = 10;

/** Rang de la découverte qui s'ouvre (1 pour la 1ʳᵉ…). Le même chez les deux
 *  joueurs pour leur k-ième découverte, quel que soit celui qui commence. */
export function rangDeDecouverte(turnNumber: number): number {
  return Math.max(1, Math.floor(tourDuJoueur(turnNumber) / 2));
}

/** Coût de l'AUTRE clan : C+1, plafonné à 10 (à C = 10, elle coûte 10 aussi). */
export function coutAutreClan(c: number): number {
  return Math.min(COUT_MAX_DECOUVERTE, c + 1);
}

/** Tire le coût C du rang, à partir de la graine de PARTIE seule : le même
 *  pour les deux joueurs, différent d'une partie à l'autre, sans toucher à la
 *  RNG partagée. */
export function tirerCoutDecouverte(rang: number, graine: number): number {
  const ligne = TABLE_COUTS_DECOUVERTE[Math.min(rang, TABLE_COUTS_DECOUVERTE.length) - 1];
  let h = (graine ^ Math.imul(rang, 0x9e3779b1)) >>> 0;
  // Deux tours de mélange : des graines voisines donnent des tirages éloignés.
  for (let i = 0; i < 2; i++) { h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0; }
  h = (h ^ (h >>> 16)) >>> 0;
  const total = ligne.reduce((a, b) => a + b, 0);
  let r = h % total;
  for (let i = 0; i < ligne.length; i++) {
    if (r < ligne[i]) return i + 1;
    r -= ligne[i];
  }
  return ligne.length;
}

/** REPLI des clans incomplets : le coût valide le plus proche de `c`
 *  (à distance égale, le moins cher d'abord). `null` si aucun ne l'est. */
export function coutValideLePlusProche(c: number, valide: (cout: number) => boolean): number | null {
  for (let d = 0; d < COUT_MAX_DECOUVERTE; d++) {
    for (const k of d === 0 ? [c] : [c - d, c + d]) {
      if (k >= 1 && k <= COUT_MAX_DECOUVERTE && valide(k)) return k;
    }
  }
  return null;
}
