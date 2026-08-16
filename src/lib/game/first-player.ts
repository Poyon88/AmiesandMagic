// QUI COMMENCE — dérivé de l'identifiant de la partie, et de rien d'autre.
//
// Le premier joueur n'est stocké NULLE PART. Il se recalcule à partir de
// `matches.id`, ce qui a deux conséquences heureuses :
//
//   · les deux clients tombent forcément d'accord, sans échanger de message ;
//   · la statistique est calculable RÉTROACTIVEMENT sur toutes les parties
//     déjà jouées, sans colonne à ajouter ni backfill à lancer.
//
// ⚠️ Cette fonction est LOAD-BEARING pour la synchronisation. La changer
// réécrirait l'ordre de jeu de toutes les parties passées — et, accessoirement,
// invaliderait toutes les statistiques d'initiative.
//
// Elle vivait en double dans src/app/game/[matchId]/page.tsx (deux copies du
// même calcul, à cent lignes d'écart) avant d'être extraite ici.

/** Graine déterministe d'une partie : les 8 premiers caractères hexadécimaux
 *  de son uuid, tirets retirés. Sert à la fois à semer la RNG du moteur et à
 *  désigner le premier joueur. */
export function seedForMatch(matchId: string): number {
  return parseInt(matchId.replace(/-/g, "").slice(0, 8), 16);
}

/** Index (0 = player1, 1 = player2) du joueur qui commence. */
export function firstPlayerIndexForMatch(matchId: string): 0 | 1 {
  return seedForMatch(matchId) % 2 === 0 ? 0 : 1;
}

/** Le joueur `playerId` a-t-il commencé cette partie ?
 *
 *  `player1Id` / `player2Id` viennent de la ligne `matches` : l'index seul ne
 *  suffit pas, il faut savoir à qui il correspond. Renvoie `null` quand
 *  l'identifiant n'appartient à aucun des deux camps — on préfère une absence
 *  de réponse à une réponse fausse, qui fausserait silencieusement les stats.
 */
export function didPlayerStart(
  matchId: string,
  playerId: string,
  player1Id: string,
  player2Id: string,
): boolean | null {
  if (playerId !== player1Id && playerId !== player2Id) return null;
  const firstId = firstPlayerIndexForMatch(matchId) === 0 ? player1Id : player2Id;
  return playerId === firstId;
}
