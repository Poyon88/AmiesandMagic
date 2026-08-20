// L'ORDRE à l'écran des effets SUCCESSIFS d'un même sort.
//
// Inversion n°4 de l'audit du 2026-08-20, et la plus ancienne : le moteur règle
// morts et râles APRÈS CHAQUE EFFET depuis le 2026-08-01 (« Tempête 3 se résout
// entièrement avant Déchainement »), mais l'animation par vague n'avait jamais
// été faite. Un sort à deux effets montrait donc les deux salves de dégâts
// ensemble, puis les deux morts ensemble, quel que soit l'ordre réel.
//
// Le moteur pose désormais une frontière « effet » là où il réglait déjà les
// morts, et le store peint un intervalle par effet.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { useGameStore } from "./gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { GameState } from "@/lib/game/types";

// Environnement `node` : document vide, `getElementCenter` retombe sur sa
// sentinelle. Cf. draw-wave-order.test.ts.
if (typeof globalThis.document === "undefined") {
  (globalThis as unknown as { document: unknown }).document = {
    querySelectorAll: () => [] as unknown as NodeListOf<Element>,
    querySelector: () => null,
  };
}

/** Un sort à DEUX effets de zone successifs : Déferlement 2 (toutes les unités
 *  ennemies) puis Cataclysme 2 (tout le monde). Chacun tue une créature
 *  différente, ce qui donne deux moments distincts à lire. */
function partie(): GameState {
  const s = mkState();
  s.players[0].mana = 10;
  // Deux victimes d'endurance différente : la première tombe au 1er effet,
  // la seconde au 2nd.
  s.players[1].board = [
    mkInstance(mkCard({ name: "Frêle", attack: 1, health: 2 })),
    mkInstance(mkCard({ name: "Robuste", attack: 1, health: 4 })),
  ];
  s.players[0].hand = [mkInstance(mkCard({
    name: "Double Vague", card_type: "spell", attack: null, health: null, mana_cost: 1,
    keywords: ["deferlement", "cataclysme"] as never,
    keyword_instances: [
      { id: "deferlement", x: 2 },
      { id: "cataclysme", x: 2 },
    ] as never,
    spell_keywords: [
      { id: "deferlement", amount: 2 },
      { id: "cataclysme", amount: 2 },
    ] as never,
  }))];
  return s;
}

/** RANG D'ÉMISSION auquel chaque moment devient vrai pour la première fois.
 *
 *  Enregistrer un simple ordre d'apparition ne suffirait pas : dans une même
 *  émission du store, l'ordre retenu serait celui des tests de la sonde, pas
 *  celui de l'écran. Deux moments peints ENSEMBLE partagent au contraire le
 *  même rang — c'est précisément ce que ce fichier doit savoir distinguer. */
function trace(s: GameState): Record<string, number> {
  const rang: Record<string, number> = {};
  let emission = 0;
  const pousser = (m: string) => { if (!(m in rang)) rang[m] = emission; };
  const frele = s.players[1].board[0].instanceId;
  const robuste = s.players[1].board[1].instanceId;

  useGameStore.setState({
    gameState: s, localPlayerId: s.players[0].id,
    isAnimating: false, pendingIncomingActions: [],
    damageEvents: [], deathEvents: [], spellCastEvent: null,
    targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
  });

  const desabonner = useGameStore.subscribe((st) => {
    emission++;
    const board1 = st.gameState?.players[1].board ?? [];
    if (!board1.some(c => c.instanceId === frele)) pousser("mort de Frêle");
    if (!board1.some(c => c.instanceId === robuste)) pousser("mort de Robuste");
  });

  useGameStore.getState().dispatchAction({
    type: "play_card", cardInstanceId: s.players[0].hand[0].instanceId,
  });
  vi.runAllTimers();
  desabonner();
  return rang;
}

describe("sort à effets multiples — ordre à l'écran", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("chaque effet a sa vague : la victime du 1er meurt AVANT celle du 2nd", () => {
    const rang = trace(partie());

    // STRICTEMENT avant : peintes dans la même émission, les deux morts
    // partageraient le même rang — c'était le défaut.
    expect(rang["mort de Frêle"]).toBeLessThan(rang["mort de Robuste"]);
  });

  it("l'état final engagé reste celui du moteur", () => {
    // La frontière ne sert qu'à la mise en scène : les deux créatures sont
    // mortes, le sort est au cimetière.
    const s = partie();
    trace(s);
    const fin = useGameStore.getState().gameState!;

    expect(fin.players[1].board).toHaveLength(0);
    expect(fin.players[0].graveyard.some(c => c.card.name === "Double Vague")).toBe(true);
  });

  it("un sort à effet UNIQUE ne fabrique aucune vague supplémentaire", () => {
    // L'empreinte du moteur doit écarter les frontières qui n'encadrent rien,
    // sinon chaque sort gagnerait une pause vide.
    const s = partie();
    s.players[0].hand = [mkInstance(mkCard({
      name: "Vague Simple", card_type: "spell", attack: null, health: null, mana_cost: 1,
      keywords: ["deferlement"] as never,
      keyword_instances: [{ id: "deferlement", x: 9 }] as never,
      spell_keywords: [{ id: "deferlement", amount: 9 }] as never,
    }))];

    const rang = trace(s);

    // Tuées par le MÊME effet, les deux meurent au même instant : même rang.
    // C'est le témoin — la séparation ne doit apparaître que lorsqu'il y a
    // vraiment deux effets.
    expect(rang["mort de Frêle"]).toBe(rang["mort de Robuste"]);
    expect(useGameStore.getState().gameState!.players[1].board).toHaveLength(0);
  });
});
