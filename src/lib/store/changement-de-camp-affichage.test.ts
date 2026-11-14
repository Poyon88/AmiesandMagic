// CHANGEMENT DE CAMP (Domination, Corruption) à l'écran.
//
// Défaut relevé en rejouant de vraies parties dans le store : la créature volée
// était affichée à 0 PV sur son plateau d'origine pendant l'impact — comme une
// morte — puis réapparaissait vivante en face, sous un portail d'invocation.
// « Elle meurt et revient en jeu. » Elle n'est ni morte ni invoquée : elle
// reste telle quelle sur sa case, puis passe de l'autre côté.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { useGameStore } from "./gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { Capability, GameAction, GameState } from "@/lib/game/types";

if (typeof globalThis.document === "undefined") {
  (globalThis as unknown as { document: unknown }).document = {
    querySelectorAll: () => [] as unknown as NodeListOf<Element>,
    querySelector: () => null,
  };
}

function partie(): { s: GameState; volee: string; sort: string } {
  const s = mkState();
  s.players[0].mana = 10;
  const cible = mkInstance(mkCard({ name: "Convoitée", mana_cost: 3, attack: 2, health: 5 }));
  s.players[1].board = [cible];
  const carte = mkInstance(mkCard({
    name: "Emprise", card_type: "spell", mana_cost: 0, attack: null, health: null,
    capabilities: [{
      uid: "d0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", targets: [],
      composed: { content: "domination", target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "random" } },
    }] as Capability[],
  }));
  s.players[0].hand = [carte];
  return { s, volee: cible.instanceId, sort: carte.instanceId };
}

describe("créature qui change de camp", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("jamais affichée à 0 PV, jamais annoncée par un portail d'invocation", () => {
    const { s, volee, sort } = partie();
    useGameStore.setState({
      gameState: s, localPlayerId: s.players[0].id,
      isAnimating: false, pendingIncomingActions: [],
      damageEvents: [], deathEvents: [], summonEvents: [], spellCastEvent: null,
      targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
    });

    const pvVus: number[] = [];
    let portail = false, mortJouee = false;
    const desabonner = useGameStore.subscribe((st) => {
      const gs = st.gameState;
      if (!gs) return;
      const c = [...gs.players[0].board, ...gs.players[1].board].find((x) => x.instanceId === volee);
      if (c) pvVus.push(c.currentHealth);
      if ((st.summonEvents as unknown[] ?? []).some((e) => (typeof e === "string" ? e : (e as { instanceId: string }).instanceId) === volee)) portail = true;
      if ((st.deathEvents ?? []).some((e) => e.instanceId === volee)) mortJouee = true;
    });
    useGameStore.getState().dispatchAction({ type: "play_card", cardInstanceId: sort } as GameAction);
    vi.runAllTimers();
    desabonner();

    const fin = useGameStore.getState().gameState!;
    expect(fin.players[0].board.some((c) => c.instanceId === volee)).toBe(true);
    expect(pvVus.length).toBeGreaterThan(0);
    expect(Math.min(...pvVus)).toBe(5);
    expect(portail).toBe(false);
    expect(mortJouee).toBe(false);
  });
});
