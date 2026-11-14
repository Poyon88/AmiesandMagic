// Lot 3 de l'audit des animations du 2026-11-02 (finitions de cadence).
//   • Effet de zone sur beaucoup de cibles : popups décalés de 200 ms par cible,
//     mais la phase de mort tombait à IMPACT_MS fixe — au-delà de 6 cibles, une
//     créature quittait le plateau avant que son « -N » n'apparaisse.
//   • La carte d'un sort reste affichée 4 s ; le store se déverrouillait avant,
//     et son fondu débordait sur l'action suivante.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { useGameStore } from "./gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import { OVERLAY } from "@/lib/fx/overlayMotion";
import type { DamageEvent } from "@/lib/game/types";

if (typeof globalThis.document === "undefined") {
  (globalThis as unknown as { document: unknown }).document = {
    querySelectorAll: () => [] as unknown as NodeListOf<Element>,
    querySelector: () => null,
  };
}

function sortDeZone(x: number) {
  return mkInstance(mkCard({
    name: "Déluge", card_type: "spell", attack: null, health: null, mana_cost: 1,
    spell_keywords: [{ id: "deferlement", amount: x }] as never,
  }));
}

function preparer(nbCibles: number, pv: number) {
  const s = mkState();
  s.players[0].mana = 10;
  s.players[1].board = Array.from({ length: nbCibles }, (_, i) =>
    mkInstance(mkCard({ name: `C${i}`, attack: 1, health: pv })));
  s.players[0].hand = [sortDeZone(1)];
  useGameStore.setState({
    gameState: s, localPlayerId: s.players[0].id, isAnimating: false, pendingIncomingActions: [],
    damageEvents: [], deathEvents: [], spellCastEvent: null, powerArrowEvent: null,
    targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
  });
  return s;
}

describe("finitions de cadence — lot 3", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("effet de zone à 7 cibles : la phase de mort attend le DERNIER popup, plus le temps de le lire", () => {
    const s = preparer(7, 1);
    const t0 = Date.now();
    let impact: { t: number; evs: DamageEvent[] } | null = null;
    let mort = -1;
    const desabonner = useGameStore.subscribe((st) => {
      if (!impact && st.damageEvents.length > 0) impact = { t: Date.now() - t0, evs: st.damageEvents };
      if (mort < 0 && st.deathEvents.length > 0) mort = Date.now() - t0;
    });
    useGameStore.getState().dispatchAction({ type: "play_card", cardInstanceId: s.players[0].hand[0].instanceId });
    vi.runAllTimers();
    desabonner();

    expect(impact).not.toBeNull();
    const { t, evs } = impact as unknown as { t: number; evs: DamageEvent[] };
    const dernier = Math.max(...evs.map((e) => e.delayMs ?? 0));
    expect(dernier).toBeGreaterThanOrEqual(1200); // 7 cibles × 200 ms : au-delà de l'ancienne fenêtre
    expect(mort).toBeGreaterThanOrEqual(t + dernier + 600);
  });

  it("un sort ne rend la main qu'une fois sa carte sortie de l'écran", () => {
    const s = preparer(1, 9); // aucune mort : la séquence est courte
    const t0 = Date.now();
    let deverrouille = -1;
    let anime = false;
    const desabonner = useGameStore.subscribe((st) => {
      if (st.isAnimating) anime = true;
      if (anime && !st.isAnimating && deverrouille < 0) deverrouille = Date.now() - t0;
    });
    useGameStore.getState().dispatchAction({ type: "play_card", cardInstanceId: s.players[0].hand[0].instanceId });
    vi.runAllTimers();
    desabonner();

    expect(deverrouille).toBeGreaterThanOrEqual(OVERLAY.spell.displayMs);
  });
});
