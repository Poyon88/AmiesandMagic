// MALÉDICTION — qui est maudit ?
//
// La malédiction n'est pas écrite sur sa victime : elle est portée par le
// JOUEUR qui maudit (`PlayerState.maledictions`), quelle que soit sa source —
// créature, action ou effet composé. Jusqu'au 2026-11-15 une CRÉATURE la
// portait elle-même (`maledictionTargetId`, `maledictionExtraIds`) : ces champs
// restent lus ici pour les parties commencées avant. L'écran, lui, veut la
// question inverse — « cette créature est-elle maudite ? » — d'où ce point de
// lecture unique.
import type { GameState } from "./types";

/** Identifiants des créatures EN JEU promises à l'exil. */
export function creaturesMaudites(gs: Pick<GameState, "players"> | null | undefined): Set<string> {
  const visees = new Set<string>();
  if (!gs) return visees;
  for (const p of gs.players) {
    for (const id of p.maledictions ?? []) visees.add(id);
    for (const c of p.board) {
      if (c.maledictionTargetId) visees.add(c.maledictionTargetId);
      for (const id of c.maledictionExtraIds ?? []) visees.add(id);
    }
  }
  // Seules celles encore sur un plateau comptent : une victime morte ou
  // renvoyée en main laisse derrière elle un identifiant sans objet.
  const enJeu = new Set(gs.players.flatMap((p) => p.board.map((c) => c.instanceId)));
  return new Set([...visees].filter((id) => enJeu.has(id)));
}
