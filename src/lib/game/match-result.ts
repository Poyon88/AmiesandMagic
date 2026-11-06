// DÉCISION DU RÉSULTAT D'UNE PARTIE — fonction pure, testée.
//
// Trois issues :
//   * "server" : le rejeu serveur a mené la partie à son terme sans aucune
//     anomalie, sur une configuration figée intacte. Le vainqueur est celui du
//     rejeu, quoi qu'en dise le client.
//   * "review" : quelque chose cloche (action d'un mauvais auteur, trou dans le
//     journal, carte modifiée depuis le lancement, rejeu inachevé). On garde le
//     meilleur vainqueur connu pour ne pas bloquer une partie amicale, mais un
//     enjeu (tournoi) exigera une validation admin.
//   * "client" : pas de configuration figée (partie lancée avant la mise en
//     place) — comportement historique, vainqueur déclaré par le client.
import type { ReplayAnomaly } from "./replay";

export type ResultSource = "server" | "review" | "client";

export interface ResultDecision {
  winnerId: string | null;
  source: ResultSource;
  notes: string[];
}

export function decideResult(args: {
  hasSetup: boolean;
  replayFinished: boolean;
  replayWinner: string | null;
  anomalies: ReplayAnomaly[];
  changedCardIds: number[];
  missingCardIds: number[];
  claimedWinner: string | null;
  players: [string, string];
}): ResultDecision {
  const { hasSetup, replayFinished, replayWinner, anomalies, changedCardIds, missingCardIds, players } = args;
  // Un vainqueur déclaré qui n'est pas l'un des deux joueurs est ignoré.
  const claimed = args.claimedWinner && players.includes(args.claimedWinner) ? args.claimedWinner : null;

  if (!hasSetup) {
    return { winnerId: claimed, source: "client", notes: ["no_setup"] };
  }

  const notes: string[] = [];
  for (const a of anomalies) notes.push(`${a.kind}${a.seq != null ? `@${a.seq}` : ""}: ${a.detail}`);
  if (changedCardIds.length) notes.push(`cartes modifiées depuis le lancement : ${changedCardIds.slice(0, 20).join(",")}`);
  if (missingCardIds.length) notes.push(`cartes introuvables : ${missingCardIds.slice(0, 20).join(",")}`);

  if (replayFinished && replayWinner && notes.length === 0) {
    if (claimed && claimed !== replayWinner) notes.push("vainqueur déclaré par le client contredit par le rejeu");
    return { winnerId: replayWinner, source: "server", notes };
  }

  if (!replayFinished) notes.push("rejeu inachevé");
  return {
    winnerId: replayFinished ? replayWinner : claimed,
    source: "review",
    notes,
  };
}

/** Vainqueur si cette mise à jour du store FAIT passer la partie à terminée,
 *  sinon null. Une transition, pas un état : l'état résiduel d'une partie
 *  précédente ne doit pas clôturer celle qu'on ouvre. */
export function vainqueurTransition(
  avant: { phase: string } | null | undefined,
  apres: { phase: string; winner?: string | null } | null | undefined,
): string | null {
  if (avant?.phase === "finished" || apres?.phase !== "finished") return null;
  return apres.winner ?? null;
}

/** Délai sans la moindre activité au-delà duquel une partie est tenue pour
 *  interrompue. Très au-dessus du chrono de tour (90 s) et d'une reconnexion. */
export const DELAI_INACTIVITE_MS = 60 * 60 * 1000;

/** Dernier signe de vie d'une partie : création, action ou snapshot. */
export function derniereActivite(dates: Array<string | null | undefined>): number {
  return Math.max(...dates.map((d) => (d ? Date.parse(d) : 0)));
}

export function partieInactive(dernierSigneDeVie: number, maintenant: number): boolean {
  return maintenant - dernierSigneDeVie > DELAI_INACTIVITE_MS;
}
