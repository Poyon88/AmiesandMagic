// L'ORDRE à l'écran d'un Déchainement (ou d'un Relancer) à plusieurs sorts.
//
// Signalé en partie sur « Convergence des Sept Cercles » (Déchainement 7) : les
// sept sorts devraient s'enchaîner — un premier sort est lancé, il se résout,
// puis le second, il se résout, et ainsi de suite. Le moteur le faisait déjà
// (chaque sort imbriqué pose sa frontière « effet » en sortant) ; l'écran, lui,
// révélait les sept cartes d'affilée, PUIS peignait les salves une par une —
// les dégâts de la première tombaient après la lecture de la septième.
//
// Chaque frontière porte désormais le rang des relances déjà annoncées, et le
// store révèle chaque sort dans SA vague, juste avant ses dégâts. Ce test lit
// la séquence réellement émise, comme draw-wave-order.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { useGameStore } from "./gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { GameState } from "@/lib/game/types";

// Environnement `node` : document VIDE pour les ancres de popups (cf.
// draw-wave-order.test.ts — même raison, même sentinelle).
if (typeof globalThis.document === "undefined") {
  (globalThis as unknown as { document: unknown }).document = {
    querySelectorAll: () => [] as unknown as NodeListOf<Element>,
    querySelector: () => null,
  };
}

/** P0 lance un Déchainement 3/1 ; le seul candidat, « Vague », est un
 *  Déferlement 1 (1 dégât à toutes les unités ennemies, sans cible à tirer) :
 *  chaque sort imbriqué retire exactement 1 PV à « Encaisse », de façon
 *  déterministe — l'assertion distingue BINAIREMENT les deux ordres. */
function partie(): { s: GameState; sort: string; encaisse: string } {
  const s = mkState();
  const vague = mkCard({
    name: "Vague", card_type: "spell", attack: null as unknown as number, health: null as unknown as number,
    faction: "Elfes", rarity: "Commune", mana_cost: 1,
    spell_keywords: [{ id: "deferlement", amount: 1 }],
  });
  s.allSpellsPool = [vague];
  const convergence = mkInstance(mkCard({
    name: "Convergence test", card_type: "spell", attack: null as unknown as number, health: null as unknown as number,
    faction: "Elfes", mana_cost: 0,
    spell_keywords: [{ id: "dechainement", amount: 3, health: 1 }],
  }));
  s.players[0].hand.push(convergence);
  const encaisse = mkInstance(mkCard({ name: "Encaisse", attack: 1, health: 9 }));
  s.players[1].board = [encaisse];
  return { s, sort: convergence.instanceId, encaisse: encaisse.instanceId };
}

/** Déroule l'action et rend la SÉQUENCE des moments visibles, dans l'ordre où
 *  le store les a émis (chaque `set` passe par l'abonnement). */
function trace(): string[] {
  const { s, sort, encaisse } = partie();
  const vu: string[] = [];
  const pousser = (m: string) => { if (!vu.includes(m)) vu.push(m); };
  const revelations = new Set<number>();

  useGameStore.setState({
    gameState: s, localPlayerId: s.players[0].id,
    isAnimating: false, pendingIncomingActions: [],
    damageEvents: [], spellCastEvent: null, deathEvents: [],
  });

  const desabonner = useGameStore.subscribe((st) => {
    const ev = st.spellCastEvent;
    if (ev?.card?.name === "Convergence test") pousser("révélation de la Convergence");
    if (ev?.card?.name === "Vague" && !revelations.has(ev.timestamp)) {
      revelations.add(ev.timestamp);
      pousser(`révélation ${revelations.size}`);
    }
    const pv = st.gameState?.players[1].board.find((c) => c.instanceId === encaisse)?.currentHealth;
    if (pv === 8) pousser("PV 8");
    if (pv === 7) pousser("PV 7");
    if (pv === 6) pousser("PV 6");
  });

  useGameStore.getState().dispatchAction({ type: "play_card", cardInstanceId: sort });
  vi.runAllTimers();
  desabonner();
  return vu;
}

describe("Déchainement à plusieurs sorts — ordre à l'écran", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("chaque sort se révèle, se résout, PUIS le suivant se révèle", () => {
    expect(trace()).toEqual([
      "révélation de la Convergence",
      "révélation 1",
      "PV 8",
      "révélation 2",
      "PV 7",
      "révélation 3",
      "PV 6",
    ]);
  });

  it("les dégâts du premier sort ne tombent plus après la lecture du dernier", () => {
    // L'assertion exacte du défaut signalé.
    const vu = trace();
    expect(vu.indexOf("PV 8")).toBeLessThan(vu.indexOf("révélation 2"));
    expect(vu.indexOf("PV 7")).toBeLessThan(vu.indexOf("révélation 3"));
  });

  it("l'état final engagé reste celui du moteur", () => {
    trace();
    const fin = useGameStore.getState().gameState!;
    expect(fin.players[1].board[0].currentHealth).toBe(6);
    expect(fin.players[0].hand).toHaveLength(0);
    expect(useGameStore.getState().isAnimating).toBe(false);
  });
});
