// Ordre à l'écran — lot 1 de l'audit des animations du 2026-11-02.
//
// Chaque cas est une inversion CONFIRMÉE par sonde avant correctif :
//   • la flèche d'un râle partait au tout début de l'action, avant la mort ;
//   • dans une cascade, le râle de la 2e victime frappait avant sa mort ;
//   • en fin de tour, l'effet de début de tour s'animait avant la bascule et
//     la carte piochée ;
//   • un sort fait d'effets COMPOSÉS peignait tous ses effets d'une salve ;
//   • un pouvoir « à l'attaque » qui tuait une unité à râle faisait remonter
//     les PV du héros (faux soin) avant de les rebaisser.
//
// On note le RANG D'ÉMISSION auquel chaque moment devient vrai (cf.
// effect-wave-order.test.ts) : deux moments peints ensemble partagent le même
// rang, d'où des inégalités STRICTES.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { useGameStore } from "./gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { Capability, ComposedEffect, GameAction, GameState } from "@/lib/game/types";

if (typeof globalThis.document === "undefined") {
  (globalThis as unknown as { document: unknown }).document = {
    querySelectorAll: () => [] as unknown as NodeListOf<Element>,
    querySelector: () => null,
  };
}

type Etat = ReturnType<typeof useGameStore.getState>;

const cap = (trigger: string, composed: ComposedEffect, uid = "cx_0"): Capability =>
  ({ uid, trigger, effectKind: "immediate", abilityId: "_composed", composed, targets: [] }) as unknown as Capability;
const auHeros = (side: "enemy" | "ally", x: number): ComposedEffect =>
  ({ target: { side, count: 1, entity: "hero", location: "board", designation: "automatic" }, content: "deal_damage", magnitude: { x } }) as unknown as ComposedEffect;
const aToutes = (x: number): ComposedEffect =>
  ({ target: { side: "enemy", count: "all", entity: "unit", location: "board", designation: "automatic" }, content: "deal_damage", magnitude: { x } }) as unknown as ComposedEffect;
const trait = () => mkInstance(mkCard({
  name: "Trait", card_type: "spell", attack: null, health: null, mana_cost: 1,
  spell_keywords: [{ id: "impact", amount: 5 }] as never,
}));

/** Rang de première apparition de chaque moment. */
function rangs(s: GameState, action: GameAction, sonde: (st: Etat) => Record<string, boolean>): Record<string, number> {
  useGameStore.setState({
    gameState: s, localPlayerId: s.players[0].id, isAnimating: false, pendingIncomingActions: [],
    damageEvents: [], deathEvents: [], spellCastEvent: null, powerArrowEvent: null,
    targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
  });
  const rang: Record<string, number> = {};
  let emission = 0;
  const desabonner = useGameStore.subscribe((st) => {
    emission++;
    for (const [k, v] of Object.entries(sonde(st))) if (v && !(k in rang)) rang[k] = emission;
  });
  useGameStore.getState().dispatchAction(action);
  vi.runAllTimers();
  desabonner();
  return rang;
}

describe("frontières d'animation — lot 1", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("la flèche d'un râle part APRÈS la mort, et AVANT ses dégâts", () => {
    const s = mkState(); s.players[0].mana = 10;
    s.players[1].board = [mkInstance(mkCard({ name: "Vengeur", attack: 1, health: 1,
      capabilities: [cap("on_death", auHeros("enemy", 3))] }))];
    s.players[0].hand = [trait()];
    const v = s.players[1].board[0].instanceId;

    const r = rangs(s, { type: "play_card", cardInstanceId: s.players[0].hand[0].instanceId, targetInstanceId: v }, (st) => ({
      mort: !st.gameState?.players[1].board.some((c) => c.instanceId === v),
      fleche: !!st.powerArrowEvent?.arrows?.some((a) => a.sourceId === v),
      degats: (st.gameState?.players[0].hero.hp ?? 30) < 30,
    }));

    expect(r.mort).toBeLessThan(r.fleche);
    expect(r.fleche).toBeLessThan(r.degats);
  });

  it("cascade : la 2e victime meurt AVANT que son propre râle ne frappe", () => {
    const s = mkState(); s.players[0].mana = 10;
    s.players[0].board = [mkInstance(mkCard({ name: "Pion", attack: 1, health: 1,
      capabilities: [cap("on_death", auHeros("enemy", 2))] }))];
    s.players[1].board = [mkInstance(mkCard({ name: "Vengeur", attack: 1, health: 1,
      capabilities: [cap("on_death", { target: { side: "enemy", count: 1, entity: "unit", location: "board", designation: "random" }, content: "deal_damage", magnitude: { x: 3 } } as unknown as ComposedEffect)] }))];
    s.players[0].hand = [trait()];
    const v = s.players[1].board[0].instanceId, p = s.players[0].board[0].instanceId;

    const r = rangs(s, { type: "play_card", cardInstanceId: s.players[0].hand[0].instanceId, targetInstanceId: v }, (st) => ({
      mortVengeur: !st.gameState?.players[1].board.some((c) => c.instanceId === v),
      mortPion: !st.gameState?.players[0].board.some((c) => c.instanceId === p),
      raleDuPion: (st.gameState?.players[1].hero.hp ?? 30) < 30,
    }));

    expect(r.mortVengeur).toBeLessThan(r.mortPion);
    expect(r.mortPion).toBeLessThan(r.raleDuPion);
  });

  it("fin de tour : bascule et pioche AVANT l'effet de début de tour", () => {
    const s = mkState();
    s.players[1].board = [mkInstance(mkCard({ name: "Matinal", attack: 1, health: 5,
      capabilities: [cap("on_start_of_turn", auHeros("enemy", 2))] }))];
    s.players[1].deck = [mkInstance(mkCard({ name: "Piochée", attack: 1, health: 1 }))];

    const r = rangs(s, { type: "end_turn" }, (st) => ({
      bascule: st.gameState?.currentPlayerIndex === 1,
      carte: !!st.gameState?.players[1].hand.some((c) => c.card.name === "Piochée"),
      degats: (st.gameState?.players[0].hero.hp ?? 30) < 30,
    }));

    expect(r.bascule).toBeLessThan(r.degats);
    expect(r.carte).toBeLessThan(r.degats);
  });

  it("sort à deux effets COMPOSÉS : chaque effet a sa vague", () => {
    const s = mkState(); s.players[0].mana = 10;
    s.players[1].board = [mkInstance(mkCard({ name: "Robuste", attack: 1, health: 9 }))];
    s.players[0].hand = [mkInstance(mkCard({
      name: "Double salve", card_type: "spell", attack: null, health: null, mana_cost: 1,
      capabilities: [cap("spell_resolution", aToutes(2), "s0"), cap("spell_resolution", aToutes(3), "s1")],
    }))];
    const rob = s.players[1].board[0].instanceId;

    const r = rangs(s, { type: "play_card", cardInstanceId: s.players[0].hand[0].instanceId }, (st) => {
      const pv = st.gameState?.players[1].board.find((c) => c.instanceId === rob)?.currentHealth ?? 9;
      return { premier: pv <= 7, second: pv <= 4 };
    });

    expect(r.premier).toBeLessThan(r.second);
  });

  it("attaque : un pouvoir « à l'attaque » qui tue un râleur ne fait jamais remonter les PV du héros", () => {
    const s = mkState();
    s.players[1].board = [
      mkInstance(mkCard({ name: "Cible", attack: 2, health: 6 })),
      mkInstance(mkCard({ name: "Mouche", attack: 1, health: 1, capabilities: [cap("on_death", auHeros("enemy", 4))] })),
    ];
    s.players[0].board = [mkInstance(mkCard({ name: "Attaquant", attack: 3, health: 5,
      capabilities: [cap("on_attack", aToutes(1))] }))];
    const attaquant = s.players[0].board[0];
    attaquant.hasSummoningSickness = false;

    useGameStore.setState({
      gameState: s, localPlayerId: s.players[0].id, isAnimating: false, pendingIncomingActions: [],
      damageEvents: [], deathEvents: [], spellCastEvent: null, powerArrowEvent: null,
    });
    const pv: number[] = [];
    let faussSoin = false;
    const desabonner = useGameStore.subscribe((st) => {
      pv.push(st.gameState?.players[0].hero.hp ?? 30);
      if (st.damageEvents.some((e) => e.type === "heal" && e.targetId === "friendly_hero")) faussSoin = true;
    });
    useGameStore.getState().dispatchAction({ type: "attack", attackerInstanceId: attaquant.instanceId, targetInstanceId: s.players[1].board[0].instanceId });
    vi.runAllTimers();
    desabonner();

    for (let i = 1; i < pv.length; i++) expect(pv[i]).toBeLessThanOrEqual(pv[i - 1]);
    expect(faussSoin).toBe(false);
    expect(useGameStore.getState().gameState!.players[0].hero.hp).toBe(26);
  });
});
