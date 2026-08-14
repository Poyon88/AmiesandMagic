// Ordre des deux vagues d'une attaque : pouvoir « à l'attaque », puis combat.
//
// La vague de pouvoir est jouée AVANT le lunge, et c'est le bon ordre pour un
// pouvoir qui frappe ou qui buffe : le joueur le voit résoudre avant le combat.
//
// Il existe une exception. Quand le pouvoir RETIRE L'ATTAQUANT lui-même — « Se
// renvoie en main » de la Louve kiptchake —, jouer la vague d'abord efface du
// plateau la créature qui doit s'élancer : on la voyait repartir en main, puis un
// lunge sans personne pour le porter. Dans ce seul cas, l'assaut passe en premier
// et le retrait le suit.
//
// La décision vit ici, hors du store, pour être testable : le chemin d'attaque du
// store touche le DOM (positions des lunges) et l'environnement de test est
// « node ».

import type { GameState } from "./types";

/** L'attaquant a-t-il quitté le plateau du fait de son propre pouvoir
 *  « à l'attaque » ?
 *
 *  @param intermediate État APRÈS les pouvoirs et AVANT le combat
 *                      (`onAttackWave.intermediate`). `null` = pas de vague.
 *  @param attackerInstanceId Instance de l'attaquant.
 *
 *  Vrai uniquement s'il ne figure sur AUCUN des deux plateaux : un attaquant
 *  passé sous contrôle adverse (cas théorique) reste visible et n'a donc pas
 *  besoin du report. */
export function attackerRemovedItself(
  intermediate: GameState | null | undefined,
  attackerInstanceId: string | null | undefined,
): boolean {
  if (!intermediate || !attackerInstanceId) return false;
  return !intermediate.players.some((p) =>
    p.board.some((c) => c.instanceId === attackerInstanceId));
}
