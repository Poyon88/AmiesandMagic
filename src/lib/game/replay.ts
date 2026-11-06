// REJEU SERVEUR d'une partie — rejoue mulligans + `match_actions` sur l'état
// initial avec le moteur, sans store ni animation, pour établir le vainqueur
// sans faire confiance aux navigateurs.
//
// Le moteur est déterministe (RNG semée par match, état RNG porté par le
// GameState) : mêmes entrées + mêmes actions ⇒ même partie.
//
// CONTRÔLE DES AUTEURS : chaque ligne porte le compte qui l'a écrite. Une
// action jouée au nom de l'autre joueur (typiquement un `concede` forgé) est
// signalée. Le rejeu ne la rejette pas lui-même — il rapporte, l'appelant
// décide (revue admin) : une règle d'auteur trop stricte bloquerait des parties
// légitimes, une trop lâche laisserait passer la fraude.
import { applyAction } from "./engine";
import type { GameAction, GameState, MulliganAction } from "./types";

export interface ActionRow {
  seq: number;
  action: GameAction;
  /** Compte qui a écrit la ligne (null : ligne antérieure à la signature). */
  author_id?: string | null;
}

export interface MulliganRow {
  player_id: string;
  action: MulliganAction;
}

export interface ReplayAnomaly {
  seq: number | null;
  kind: "author_mismatch" | "unsigned" | "gap" | "after_end" | "mulligan_author";
  detail: string;
}

export interface ReplayResult {
  state: GameState;
  /** Actions de tour appliquées (≤ reçues : le rejeu s'arrête à la fin). */
  applied: number;
  anomalies: ReplayAnomaly[];
}

/** Qui a le droit d'émettre `action` dans `state` ? `null` = l'un ou l'autre. */
export function expectedAuthor(state: GameState, action: GameAction): string | null {
  switch (action.type) {
    case "concede":
    case "mulligan":
      return action.playerId;
    // Repli d'un choix expiré : son propriétaire, OU l'autre client en secours
    // après un délai de grâce (cf. TurnTimer / actionALExpiration).
    case "auto_resolve_pending_triggers":
      return null;
    case "resolve_pending_trigger": {
      const head = state.pendingTriggers?.[0];
      return head?.controllerId ?? state.players[state.currentPlayerIndex].id;
    }
    default:
      return state.players[state.currentPlayerIndex].id;
  }
}

export function replayMatch(
  initial: GameState,
  mulligans: MulliganRow[],
  rows: ActionRow[],
): ReplayResult {
  const anomalies: ReplayAnomaly[] = [];
  let state = initial;

  // Mulligans d'abord, dans l'ordre des joueurs : le moteur ne tire rien avant
  // que les DEUX soient prêts, l'ordre d'arrivée n'a donc pas d'effet.
  const ordre = state.players.map((p) => p.id);
  for (const m of [...mulligans].sort((a, b) => ordre.indexOf(a.player_id) - ordre.indexOf(b.player_id))) {
    if (m.action.playerId !== m.player_id) {
      anomalies.push({ seq: null, kind: "mulligan_author", detail: `mulligan de ${m.action.playerId} écrit par ${m.player_id}` });
      continue;
    }
    state = applyAction(state, m.action);
  }

  const sorted = [...rows].sort((a, b) => a.seq - b.seq);
  let applied = 0;
  let expected = 1;
  for (const row of sorted) {
    if (row.seq !== expected) {
      anomalies.push({ seq: row.seq, kind: "gap", detail: `seq ${expected}..${row.seq - 1} manquants` });
    }
    expected = row.seq + 1;
    if (state.phase === "finished") {
      anomalies.push({ seq: row.seq, kind: "after_end", detail: row.action.type });
      continue;
    }
    const attendu = expectedAuthor(state, row.action);
    if (row.author_id == null) {
      anomalies.push({ seq: row.seq, kind: "unsigned", detail: row.action.type });
    } else if (attendu !== null && row.author_id !== attendu) {
      anomalies.push({ seq: row.seq, kind: "author_mismatch", detail: `${row.action.type} attendu de ${attendu}, écrit par ${row.author_id}` });
    }
    state = applyAction(state, row.action);
    applied++;
  }
  return { state, applied, anomalies };
}

/** Compatibilité : rejeu brut sans mulligans ni contrôle d'auteur. */
export function replayActions(initial: GameState, rows: ActionRow[]) {
  const r = replayMatch(initial, [], rows);
  return {
    state: r.state,
    applied: r.applied,
    gaps: r.anomalies.filter((a) => a.kind === "gap").map((a) => a.seq ?? 0),
    afterEnd: r.anomalies.filter((a) => a.kind === "after_end").length,
  };
}
