// REJEU SERVEUR — fidélité du rejeu, contrôle des auteurs, décision du résultat.
//
// Le cas qui compte le plus : un joueur qui écrit un ABANDON au nom de son
// adversaire. Le rejeu doit le détecter, et la décision ne doit jamais en
// faire un résultat « server ».
import { describe, expect, it } from "vitest";
import { initializeGame } from "./engine";
import { mkCard } from "./test-harness";
import { expectedAuthor, replayMatch, type ActionRow, type MulliganRow } from "./replay";
import { decideResult } from "./match-result";
import { syncHash } from "./stateHash";
import type { GameAction, GameState, MulliganAction } from "./types";

// Cartes créées UNE fois : mkCard incrémente un id à chaque appel, et deux
// parties « identiques » auraient sinon des cartes différentes.
const CARTE_A = mkCard({ name: "D" });
const CARTE_B = mkCard({ name: "D" });
const partie = (): GameState =>
  initializeGame("a", "b", [{ card: CARTE_A, quantity: 20 }], [{ card: CARTE_B, quantity: 20 }], 0, 42);
const mull = (p: string): MulliganRow => ({ player_id: p, action: { type: "mulligan", playerId: p, replacedInstanceIds: [] } as MulliganAction });
const row = (seq: number, action: GameAction, author: string | null): ActionRow => ({ seq, action, author_id: author });

describe("rejeu", () => {
  it("mulligans puis actions : même état que le moteur en direct, partie lancée", () => {
    const r = replayMatch(partie(), [mull("b"), mull("a")], []);
    expect(r.state.phase).toBe("playing");
    expect(r.anomalies).toEqual([]);
  });

  it("est déterministe : deux rejeux identiques donnent le même état", () => {
    const actions = [row(1, { type: "end_turn" } as GameAction, "a"), row(2, { type: "end_turn" } as GameAction, "b")];
    const x = replayMatch(partie(), [mull("a"), mull("b")], actions);
    const y = replayMatch(partie(), [mull("a"), mull("b")], actions);
    // Hash de synchro : exclut les horodatages (turnStartedAt…), comme entre clients.
    expect(syncHash(x.state)).toBe(syncHash(y.state));
    expect(x.applied).toBe(2);
  });

  it("un abandon légitime clôt la partie au profit de l'adversaire, sans anomalie", () => {
    const r = replayMatch(partie(), [mull("a"), mull("b")], [row(1, { type: "concede", playerId: "a" } as GameAction, "a")]);
    expect(r.state.phase).toBe("finished");
    expect(r.state.winner).toBe("b");
    expect(r.anomalies).toEqual([]);
  });

  it("un abandon FORGÉ au nom de l'adversaire est signalé", () => {
    const r = replayMatch(partie(), [mull("a"), mull("b")], [row(1, { type: "concede", playerId: "a" } as GameAction, "b")]);
    expect(r.anomalies.map((a) => a.kind)).toEqual(["author_mismatch"]);
  });

  it("une action de tour écrite par le joueur inactif est signalée", () => {
    const s = replayMatch(partie(), [mull("a"), mull("b")], []).state;
    const actif = s.players[s.currentPlayerIndex].id;
    const autre = actif === "a" ? "b" : "a";
    const r = replayMatch(partie(), [mull("a"), mull("b")], [row(1, { type: "end_turn" } as GameAction, autre)]);
    expect(r.anomalies[0]?.kind).toBe("author_mismatch");
  });

  it("trous, lignes non signées et actions après la fin sont signalés", () => {
    const r = replayMatch(partie(), [mull("a"), mull("b")], [
      row(2, { type: "concede", playerId: "a" } as GameAction, null),
      row(3, { type: "end_turn" } as GameAction, "b"),
    ]);
    expect(r.anomalies.map((a) => a.kind)).toEqual(["gap", "unsigned", "after_end"]);
  });

  it("un mulligan écrit pour l'autre joueur est ignoré et signalé", () => {
    const forge: MulliganRow = { player_id: "b", action: { type: "mulligan", playerId: "a", replacedInstanceIds: [] } as MulliganAction };
    const r = replayMatch(partie(), [forge], []);
    expect(r.anomalies.map((a) => a.kind)).toEqual(["mulligan_author"]);
    expect(r.state.mulliganReady).toEqual([false, false]);
  });

  it("repli d'un choix expiré : l'un ou l'autre joueur peut l'émettre", () => {
    expect(expectedAuthor(partie(), { type: "auto_resolve_pending_triggers" } as GameAction)).toBeNull();
  });
});

describe("décision du résultat", () => {
  const base = {
    hasSetup: true, replayFinished: true, replayWinner: "b", anomalies: [],
    changedCardIds: [], missingCardIds: [], claimedWinner: "b", players: ["a", "b"] as [string, string],
  };

  it("rejeu complet et propre : le serveur tranche, même contre le client", () => {
    expect(decideResult({ ...base, claimedWinner: "a" })).toMatchObject({ winnerId: "b", source: "server" });
  });

  it("anomalie d'auteur : revue, jamais « server »", () => {
    const d = decideResult({ ...base, anomalies: [{ seq: 1, kind: "author_mismatch", detail: "x" }] });
    expect(d.source).toBe("review");
  });

  it("carte modifiée depuis le lancement : revue", () => {
    expect(decideResult({ ...base, changedCardIds: [12] }).source).toBe("review");
  });

  it("rejeu inachevé : revue avec le vainqueur déclaré", () => {
    expect(decideResult({ ...base, replayFinished: false, replayWinner: null })).toMatchObject({ winnerId: "b", source: "review" });
  });

  it("vainqueur déclaré étranger à la partie : ignoré", () => {
    expect(decideResult({ ...base, replayFinished: false, replayWinner: null, claimedWinner: "zzz" }).winnerId).toBeNull();
  });

  it("sans configuration figée : comportement historique « client »", () => {
    expect(decideResult({ ...base, hasSetup: false })).toMatchObject({ winnerId: "b", source: "client" });
  });
});
