// Début de tour resté « en pause » sans aucun choix en attente
// (`startOfTurnQueue: []`, `pendingTriggers: []`) : endTurn refusait pour
// toujours — END TURN ne faisait plus rien. Vu en partie le 2026-10-30.
import { describe, expect, it, vi } from "vitest";
import { applyAction } from "./engine";
import { mkState } from "./test-harness";
import type { GameState } from "./types";

describe("pause de début de tour orpheline", () => {
  it("la fin de tour passe quand même", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const s: GameState = mkState();
    s.startOfTurnQueue = [];
    s.pendingTriggers = [];
    const apres = applyAction(s, { type: "end_turn" });
    expect(apres.currentPlayerIndex).toBe(1);
    expect(apres.startOfTurnQueue).toBeUndefined();
  });

  it("un VRAI choix en attente bloque toujours la fin de tour", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const s: GameState = mkState();
    s.startOfTurnQueue = [];
    s.pendingTriggers = [{ id: "t1", controllerId: "P1" } as never];
    const apres = applyAction(s, { type: "end_turn" });
    expect(apres.currentPlayerIndex).toBe(0);
  });
});
