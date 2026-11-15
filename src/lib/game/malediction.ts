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

type Zone = "board" | "hand" | "graveyard";

function maudites(gs: Pick<GameState, "players"> | null | undefined, zones: Zone[]): Set<string> {
  const visees = new Set<string>();
  if (!gs) return visees;
  for (const p of gs.players) {
    for (const id of p.maledictions ?? []) visees.add(id);
    for (const c of p.board) {
      if (c.maledictionTargetId) visees.add(c.maledictionTargetId);
      for (const id of c.maledictionExtraIds ?? []) visees.add(id);
    }
  }
  if (visees.size === 0) return visees;
  // Seules celles encore dans une zone d'où l'exil les retirera comptent : une
  // victime repartie au deck laisse derrière elle un identifiant sans objet.
  const presentes = new Set(gs.players.flatMap((p) => zones.flatMap((z) => p[z].map((c) => c.instanceId))));
  return new Set([...visees].filter((id) => presentes.has(id)));
}

/** Identifiants des créatures EN JEU promises à l'exil. */
export function creaturesMaudites(gs: Pick<GameState, "players"> | null | undefined): Set<string> {
  return maudites(gs, ["board"]);
}

/** Identifiants de TOUTES les cartes promises à l'exil : plateau, main et
 *  cimetière — les trois zones que l'exil balaie (cf. startTurn). */
export function cartesMaudites(gs: Pick<GameState, "players"> | null | undefined): Set<string> {
  return maudites(gs, ["board", "hand", "graveyard"]);
}
