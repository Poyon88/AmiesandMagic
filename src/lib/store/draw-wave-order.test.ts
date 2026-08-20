// L'ORDRE à l'écran d'une fin de tour qui pioche une carte à effet.
//
// Signalé en partie : « l'effet de Lances du Zénith s'est déclenché avant
// l'effet de fin de tour du Diablotin Ricanant, or cela aurait dû être
// l'inverse ». Le moteur avait raison — c'est l'écran qui mentait.
//
// La cause : le store ne comparait que deux états, celui d'avant et celui
// d'après l'action. Il ignorait donc QUAND, à l'intérieur de l'action, chaque
// point de vie avait été perdu. Tout partait dans une salve unique, et la
// révélation de la carte piochée était avancée devant cette salve — donc devant
// des dégâts qui lui étaient ANTÉRIEURS. La carte, elle, n'arrivait en main
// qu'en toute fin de séquence, après avoir tué sa victime.
//
// Le moteur pose désormais une frontière de pioche (animationCheckpoints), et le
// store déroule deux vagues. Ce test lit la séquence réellement émise.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { useGameStore } from "./gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { Capability, ComposedEffect, GameState } from "@/lib/game/types";

// Les tests tournent en environnement `node` (cf. vitest.config.ts) et le store
// interroge le DOM pour ancrer les popups de dégâts. On rend donc un document
// VIDE : `getElementCenter` retombe alors sur sa sentinelle (-9999), que la
// couche FX traite déjà comme « pas d'ancre ». Rien à installer, et l'ordre des
// évènements — le seul objet de ce fichier — n'en dépend pas.
if (typeof globalThis.document === "undefined") {
  (globalThis as unknown as { document: unknown }).document = {
    querySelectorAll: () => [] as unknown as NodeListOf<Element>,
    querySelector: () => null,
  };
}

function capPioche(composed: ComposedEffect): Capability {
  return { uid: "cx_0", trigger: "on_draw", effectKind: "immediate", abilityId: "_composed", composed, targets: [] };
}
function capFinDeTour(composed: ComposedEffect): Capability {
  return { uid: "cx_0", trigger: "on_end_of_turn", effectKind: "immediate", abilityId: "_composed", composed, targets: [] };
}

/** La partie exacte des captures : P0 finit son tour avec un Diablotin, P1
 *  pioche les Lances qui tuent ce Diablotin. */
function partie(): GameState {
  const s = mkState();
  s.players[0].board = [mkInstance(mkCard({
    name: "Diablotin Ricanant", mana_cost: 1, attack: 2, health: 1,
    capabilities: [capFinDeTour({
      target: { side: "enemy", count: 1, entity: "unit", location: "board", designation: "random" },
      content: "deal_damage",
      magnitude: { x: 1 },
    })] as Capability[],
  }))];
  s.players[1].board = [mkInstance(mkCard({ name: "Encaisse", attack: 1, health: 9 }))];
  s.players[1].deck = [mkInstance(mkCard({
    name: "Lances du Zénith", card_type: "spell", attack: null, health: null, mana_cost: 3,
    capabilities: [capPioche({
      target: { side: "enemy", count: 1, entity: "unit", location: "board", designation: "scatter" },
      content: "deal_damage",
      magnitude: { x: 2 },
    })] as Capability[],
  }))];
  return s;
}

/** Déroule l'action et rend la SÉQUENCE des moments visibles, dans l'ordre où
 *  le store les a émis. Chaque `set` du store passe par l'abonnement, donc la
 *  trace reflète exactement ce que l'écran joue. */
function trace(s: GameState): string[] {
  // Un moment n'est retenu qu'à sa PREMIÈRE apparition : le store réémet ses
  // champs à chaque `set`, et c'est l'ordre d'entrée en scène qu'on juge ici.
  const vu: string[] = [];
  const pousser = (m: string) => { if (!vu.includes(m)) vu.push(m); };

  useGameStore.setState({
    gameState: s, localPlayerId: s.players[0].id,
    isAnimating: false, pendingIncomingActions: [],
    damageEvents: [], spellCastEvent: null, deathEvents: [],
  });

  const desabonner = useGameStore.subscribe((st) => {
    const cibles = st.damageEvents.map(e => e.targetId);
    const board0 = st.gameState?.players[0].board ?? [];
    const main1 = st.gameState?.players[1].hand ?? [];
    const diablotin = s.players[0].board[0].instanceId;
    const encaisse = s.players[1].board[0].instanceId;

    if (cibles.includes(encaisse)) pousser("dégâts fin de tour");
    if (main1.some(c => c.card.name === "Lances du Zénith")) pousser("carte en main");
    if (st.spellCastEvent?.card?.name === "Lances du Zénith") pousser("révélation");
    if (cibles.includes(diablotin)) pousser("dégâts de la pioche");
    if (!board0.some(c => c.instanceId === diablotin)) pousser("mort du Diablotin");
  });

  useGameStore.getState().dispatchAction({ type: "end_turn" });
  vi.runAllTimers();
  desabonner();
  return vu;
}

describe("fin de tour qui pioche une carte à effet — ordre à l'écran", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("déroule les cinq moments dans l'ordre du moteur", () => {
    const vu = trace(partie());

    expect(vu).toEqual([
      "dégâts fin de tour",
      "carte en main",
      "révélation",
      "dégâts de la pioche",
      "mort du Diablotin",
    ]);
  });

  it("la révélation ne précède plus les dégâts de fin de tour", () => {
    // L'assertion exacte du défaut signalé.
    const vu = trace(partie());
    expect(vu.indexOf("révélation")).toBeGreaterThan(vu.indexOf("dégâts fin de tour"));
  });

  it("la carte arrive en main AVANT d'avoir tué sa victime", () => {
    const vu = trace(partie());
    expect(vu.indexOf("carte en main")).toBeLessThan(vu.indexOf("mort du Diablotin"));
    expect(vu.indexOf("carte en main")).toBeLessThan(vu.indexOf("dégâts de la pioche"));
  });

  it("l'état final engagé reste celui du moteur", () => {
    // La frontière ne sert qu'à la mise en scène : l'état de jeu ne doit pas en
    // dépendre. Le Diablotin est mort, les Lances sont en main, le tour a basculé.
    const s = partie();
    trace(s);
    const fin = useGameStore.getState().gameState!;

    expect(fin.players[0].board).toHaveLength(0);
    expect(fin.players[1].hand.some(c => c.card.name === "Lances du Zénith")).toBe(true);
    expect(fin.players[1].board[0].currentHealth).toBe(8);
    expect(fin.currentPlayerIndex).toBe(1);
  });
});

describe("sans frontière, rien ne change", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("une fin de tour qui pioche une carte MUETTE garde l'ancienne séquence", () => {
    // Aucune vague supplémentaire ne doit s'insérer quand il n'y a rien à
    // raconter : la carte arrive en main à la phase de pioche, point.
    const s = partie();
    s.players[1].deck = [mkInstance(mkCard({ name: "Carte muette" }))];

    useGameStore.setState({
      gameState: s, localPlayerId: s.players[0].id,
      isAnimating: false, pendingIncomingActions: [],
      damageEvents: [], spellCastEvent: null,
    });
    useGameStore.getState().dispatchAction({ type: "end_turn" });
    vi.runAllTimers();

    const fin = useGameStore.getState().gameState!;
    expect(fin.players[1].hand.some(c => c.card.name === "Carte muette")).toBe(true);
    // Le Diablotin a survécu : personne ne l'a tué, il a juste tiré son dégât.
    expect(fin.players[0].board).toHaveLength(1);
    expect(fin.players[1].board[0].currentHealth).toBe(8);
    expect(useGameStore.getState().spellCastEvent).toBeNull();
  });
});
