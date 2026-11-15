// MALÉDICTION à l'écran : savoir QUI est maudit (pastille sur la créature), et
// signaler le moment où la malédiction tombe (animation du sceau).
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { useGameStore } from "./gameStore";
import { applyAction } from "@/lib/game/engine";
import { creaturesMaudites } from "@/lib/game/malediction";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { GameAction, GameState, Keyword, KeywordInstance, SpellKeywordInstance } from "@/lib/game/types";

if (typeof globalThis.document === "undefined") {
  (globalThis as unknown as { document: unknown }).document = {
    querySelectorAll: () => [] as unknown as NodeListOf<Element>,
    querySelector: () => null,
  };
}

const cible = (name: string) => mkInstance(mkCard({ name, mana_cost: 2, attack: 1, health: 5 }));
const actionMaudite = () => mkInstance(mkCard({
  name: "Sceau", card_type: "spell", mana_cost: 0, attack: null, health: null,
  spell_keywords: [{ id: "malediction" } as SpellKeywordInstance],
}));
function etat(ennemis = [cible("A"), cible("B")]): GameState {
  const s = mkState();
  s.players[0].mana = 10;
  for (const p of s.players) for (let i = 0; i < 10; i++) p.deck.push(mkInstance(mkCard({ name: `Pioche ${i}`, mana_cost: 9 })));
  s.players[1].board.push(...ennemis);
  return s;
}

describe("creaturesMaudites", () => {
  it("action : la cible est maudite, pas sa voisine ; plus personne après l'exil", () => {
    const s = etat();
    const [a, b] = s.players[1].board;
    const carte = actionMaudite();
    s.players[0].hand.push(carte);
    let st = applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId, targetMap: { kw_0: a.instanceId } } as GameAction);
    expect([...creaturesMaudites(st)]).toEqual([a.instanceId]);
    expect(creaturesMaudites(st).has(b.instanceId)).toBe(false);
    st = applyAction(applyAction(st, { type: "end_turn" } as GameAction), { type: "end_turn" } as GameAction);
    expect(creaturesMaudites(st).size).toBe(0);
  });

  it("créature : la victime est maudite, et le RESTE si la source quitte le jeu", () => {
    const s = etat();
    const [a] = s.players[1].board;
    const source = mkInstance(mkCard({
      name: "Tisse-Nuit", mana_cost: 0, attack: 1, health: 5,
      keywords: ["malediction"] as Keyword[], keyword_instances: [{ id: "malediction" } as KeywordInstance],
    }));
    s.players[0].hand.push(source);
    const st = applyAction(s, { type: "play_card", cardInstanceId: source.instanceId, targetInstanceId: a.instanceId } as GameAction);
    expect([...creaturesMaudites(st)]).toEqual([a.instanceId]);
    const sans = structuredClone(st);
    sans.players[0].board = [];
    expect([...creaturesMaudites(sans)]).toEqual([a.instanceId]);
  });

  it("état absent : ensemble vide", () => {
    expect(creaturesMaudites(null).size).toBe(0);
  });
});

describe("animation de la malédiction", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("le store signale la créature nouvellement maudite, une seule fois", () => {
    const s = etat();
    const [a] = s.players[1].board;
    const carte = actionMaudite();
    s.players[0].hand = [carte];
    useGameStore.setState({
      gameState: s, localPlayerId: s.players[0].id,
      isAnimating: false, pendingIncomingActions: [], maledictionEvent: null,
      damageEvents: [], deathEvents: [], spellCastEvent: null,
      targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
    });
    const vus: string[][] = [];
    let dernier: unknown = null;
    const desabonner = useGameStore.subscribe((st) => {
      if (st.maledictionEvent && st.maledictionEvent !== dernier) { dernier = st.maledictionEvent; vus.push(st.maledictionEvent.ids); }
    });
    useGameStore.getState().dispatchAction({ type: "play_card", cardInstanceId: carte.instanceId, targetMap: { kw_0: a.instanceId } });
    vi.runAllTimers();
    // Une action sans rapport ensuite : pas de nouvelle animation.
    useGameStore.getState().dispatchAction({ type: "end_turn" });
    vi.runAllTimers();
    desabonner();
    expect(vus).toEqual([[a.instanceId]]);
  });
});
