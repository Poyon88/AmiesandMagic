// Quelles cartes ont été PIOCHÉES pendant une action ?
//
// Le store retient les cartes piochées hors des états intermédiaires, pour ne les
// révéler que dans la phase de pioche dédiée. Encore faut-il savoir lesquelles.
//
// Le calcul se faisait par DIFFÉRENCE DE TAILLE de la main, puis découpe de sa
// queue. Or une carte RENVOYÉE en main (Remontée, « Se renvoie en main » de la
// Louve kiptchake) fait elle aussi grossir la main : elle était prise pour une
// pioche et retenue, si bien qu'elle apparaissait, disparaissait le temps des
// phases d'impact, puis revenait au commit final — un clignotement.
//
// Une carte déjà présente sur un PLATEAU avant l'action n'est pas une pioche :
// elle en revient. Les cartes surgies d'un pool (Sélection) restent comptées comme
// des arrivées à révéler — elles viennent bien de nulle part.
//
// Extrait du store pour être testable : le chemin d'attaque, celui où le
// clignotement se voyait, touche le DOM et l'environnement de test est « node ».

import type { GameState } from "./types";

/** Ids des cartes arrivées en main pendant l'action, par joueur — hors retours
 *  depuis un plateau. */
export function drawnCardIds(
  before: GameState,
  after: GameState,
): [Set<string>, Set<string>] {
  const surUnPlateauAvant = (id: string) =>
    before.players.some((p) => p.board.some((c) => c.instanceId === id));

  const res: [Set<string>, Set<string>] = [new Set(), new Set()];
  for (let i = 0; i < 2; i++) {
    const mainAvant = new Set(before.players[i].hand.map((c) => c.instanceId));
    for (const c of after.players[i].hand) {
      if (!mainAvant.has(c.instanceId) && !surUnPlateauAvant(c.instanceId)) {
        res[i].add(c.instanceId);
      }
    }
  }
  return res;
}
