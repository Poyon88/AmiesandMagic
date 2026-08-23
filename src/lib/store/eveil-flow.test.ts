// Le parcours RÉEL de l'ÉVEIL, côté interface.
//
// Le moteur a ses propres tests (game/eveil.test.ts) ; ceux-ci couvrent ce que
// le moteur ne voit pas — l'estampillage automatique de `fromEveil` sur l'action
// sortante, et le fait que le DERNIER point réutilise tout le flux de jeu
// normal (modale de coûts additionnels, pickers de ciblage) au lieu d'un chemin
// parallèle qui aurait dû être maintenu à part.
//
// Le point sensible : une carte en éveil n'est PLUS EN MAIN. Une bonne moitié
// du client suppose l'inverse, et c'est le point de résolution unique
// `carteJouable` — créé pour Apprentissage — qui absorbe la différence. Ces
// tests le verrouillent.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { useGameStore } from "./gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { CardInstance, GameState, SpellKeywordInstance } from "@/lib/game/types";

/** Pose un état jouable : P1 actif, la carte à éveil en main. */
function poser(carte: CardInstance, mana = 10, autresEnMain: string[] = []) {
  const s = mkState();
  s.players[0].mana = mana;
  s.players[0].hand = [
    ...autresEnMain.map(n => mkInstance(mkCard({ name: n, mana_cost: 1, attack: 1, health: 1 }))),
    carte,
  ];
  s.players[0].deck = [mkInstance(mkCard({ name: "D1" }))];
  useGameStore.setState({
    gameState: s, localPlayerId: s.players[0].id,
    targetingMode: "none", pendingCostCard: null,
    selectedDiscardIds: [], selectedSacrificeIds: [], selectedTopdeckIds: [],
    isAnimating: false, pendingIncomingActions: [],
  });
  return s;
}

const etat = (): GameState => useGameStore.getState().gameState!;
const eveil = () => etat().players[0].eveil ?? [];

/** Met la carte en éveil, puis verse `n` points intermédiaires.
 *
 *  `runAllTimers` entre CHAQUE geste, et pas seulement à la fin : le store ne
 *  commet l'état qu'au bout de son pipeline d'animation, si bien qu'un second
 *  appel immédiat lirait encore l'état d'avant le premier. C'est aussi ce que
 *  fait un joueur — deux clics séparés dans le temps. */
function verser(id: string, n: number) {
  useGameStore.getState().suspendToEveil(id);
  vi.runAllTimers();
  for (let i = 0; i < n; i++) {
    useGameStore.getState().payEveilPoint(id);
    vi.runAllTimers();
  }
}

describe("éveil — mise en éveil", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("l'action part et la carte quitte la main", () => {
    const carte = mkInstance(mkCard({ name: "Colosse", mana_cost: 8, attack: 5, health: 5, eveil_cost: 3 }));
    poser(carte);

    const action = useGameStore.getState().suspendToEveil(carte.instanceId);
    vi.runAllTimers();

    expect(action).toEqual({ type: "suspend_eveil", cardInstanceId: carte.instanceId });
    expect(eveil()).toHaveLength(1);
    expect(eveil()[0].remaining).toBe(3);
    expect(etat().players[0].hand).toHaveLength(0);
  });

  it("est refusée sur une carte sans coût d'éveil — aucune action diffusée", () => {
    const carte = mkInstance(mkCard({ name: "Banale", mana_cost: 2, attack: 2, health: 2 }));
    poser(carte);

    expect(useGameStore.getState().suspendToEveil(carte.instanceId)).toBeNull();
    expect(eveil()).toHaveLength(0);
  });
});

describe("éveil — versement", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("un point intermédiaire diffuse pay_eveil et ne joue rien", () => {
    const carte = mkInstance(mkCard({ name: "Colosse", mana_cost: 8, attack: 5, health: 5, eveil_cost: 3 }));
    poser(carte);
    useGameStore.getState().suspendToEveil(carte.instanceId);
    vi.runAllTimers();

    const action = useGameStore.getState().payEveilPoint(carte.instanceId);
    vi.runAllTimers();

    // Le montant est TOUJOURS porté par l'action, même à 1 : un rejeu ne doit
    // pas dépendre d'un défaut implicite côté récepteur.
    expect(action).toEqual({ type: "pay_eveil", cardInstanceId: carte.instanceId, amount: 1 });
    expect(eveil()[0].remaining).toBe(2);
    expect(etat().players[0].board).toHaveLength(0);
  });

  it("le DERNIER point diffuse un play_card estampillé fromEveil", () => {
    const carte = mkInstance(mkCard({ name: "Colosse", mana_cost: 8, attack: 5, health: 5, eveil_cost: 2 }));
    poser(carte);
    verser(carte.instanceId, 1);
    vi.runAllTimers();

    const action = useGameStore.getState().payEveilPoint(carte.instanceId);
    vi.runAllTimers();

    // C'est l'estampillage automatique de `dispatchAction` qui est éprouvé ici :
    // aucun appelant ne passe `fromEveil` à la main.
    expect(action).toMatchObject({
      type: "play_card", cardInstanceId: carte.instanceId, fromEveil: true,
    });
    expect(etat().players[0].board.map(c => c.card.name)).toEqual(["Colosse"]);
    expect(eveil()).toHaveLength(0);
  });
});

describe("éveil — versement de plusieurs points depuis l'interface", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("transmet le montant demandé dans l'action", () => {
    const carte = mkInstance(mkCard({ name: "Colosse", mana_cost: 9, attack: 5, health: 5, eveil_cost: 5 }));
    poser(carte, 10);
    useGameStore.getState().suspendToEveil(carte.instanceId);
    vi.runAllTimers();

    const action = useGameStore.getState().payEveilPoint(carte.instanceId, 3);
    vi.runAllTimers();

    expect(action).toEqual({ type: "pay_eveil", cardInstanceId: carte.instanceId, amount: 3 });
    expect(eveil()[0].remaining).toBe(2);
    expect(etat().players[0].mana).toBe(7);
  });

  it("ÉCRÊTE au maximum possible côté client, là où le moteur refuserait", () => {
    // L'interface borne avec la MÊME source que le moteur (`maxEveilPayment`).
    // Sans cet écrêtage, un bouton demandant trop serait refusé en silence — le
    // pire des retours pour un joueur qui vient de cliquer.
    const carte = mkInstance(mkCard({ name: "Colosse", mana_cost: 9, attack: 5, health: 5, eveil_cost: 4 }));
    poser(carte, 2);
    useGameStore.getState().suspendToEveil(carte.instanceId);
    vi.runAllTimers();

    const action = useGameStore.getState().payEveilPoint(carte.instanceId, 99);
    vi.runAllTimers();

    expect(action).toMatchObject({ type: "pay_eveil", amount: 2 });
    expect(eveil()[0].remaining).toBe(2);
    expect(etat().players[0].mana).toBe(0);
  });

  it("ne descend jamais en dessous du dernier point, même en demandant tout", () => {
    const carte = mkInstance(mkCard({ name: "Colosse", mana_cost: 9, attack: 5, health: 5, eveil_cost: 3 }));
    poser(carte, 10);
    useGameStore.getState().suspendToEveil(carte.instanceId);
    vi.runAllTimers();

    useGameStore.getState().payEveilPoint(carte.instanceId, 3);
    vi.runAllTimers();

    expect(eveil()[0].remaining).toBe(1);
    expect(etat().players[0].board).toHaveLength(0);
  });
});

describe("éveil — le dernier point réutilise le flux de jeu normal", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("un coût additionnel ouvre la modale de paiement au lieu de partir", () => {
    const carte = mkInstance(mkCard({
      name: "Pacte", mana_cost: 8, attack: 2, health: 2, eveil_cost: 1, discard_cost: 1,
    }));
    poser(carte, 10, ["Appât"]);
    useGameStore.getState().suspendToEveil(carte.instanceId);
    vi.runAllTimers();

    const action = useGameStore.getState().payEveilPoint(carte.instanceId);

    expect(action, "rien ne part tant que le coût additionnel n'est pas payé").toBeNull();
    expect(useGameStore.getState().targetingMode).toBe("cost_payment");
    expect(useGameStore.getState().pendingCostCard?.discardNeeded).toBe(1);
    // La carte est toujours en éveil, son point n'a pas été prélevé.
    expect(eveil()[0].remaining).toBe(1);
  });

  it("… et le paiement confirmé fait bien entrer la carte en jeu", () => {
    const carte = mkInstance(mkCard({
      name: "Pacte", mana_cost: 8, attack: 2, health: 2, eveil_cost: 1, discard_cost: 1,
    }));
    poser(carte, 10, ["Appât"]);
    useGameStore.getState().suspendToEveil(carte.instanceId);
    vi.runAllTimers();
    useGameStore.getState().payEveilPoint(carte.instanceId);

    const appat = etat().players[0].hand[0].instanceId;
    useGameStore.getState().toggleDiscardSelection(appat);
    const action = useGameStore.getState().confirmCostPayment();
    vi.runAllTimers();

    expect(action).toMatchObject({ type: "play_card", fromEveil: true });
    expect(etat().players[0].board.map(c => c.card.name)).toEqual(["Pacte"]);
  });

  it("un SORT ciblé ouvre le picker de cible avant de partir", () => {
    const sort = mkInstance(mkCard({
      name: "Marque", card_type: "spell", mana_cost: 6, attack: null, health: null, eveil_cost: 1,
      spell_keywords: [{ id: "affaiblissement", attack: 2, health: 2 }] as SpellKeywordInstance[],
    }));
    const s = poser(sort);
    const victime = mkInstance(mkCard({ name: "Cible", attack: 3, health: 5 }));
    s.players[1].board = [victime];
    useGameStore.setState({ gameState: { ...s } });
    useGameStore.getState().suspendToEveil(sort.instanceId);
    vi.runAllTimers();

    const action = useGameStore.getState().payEveilPoint(sort.instanceId);

    expect(action, "le sort attend sa cible").toBeNull();
    expect(useGameStore.getState().targetingMode).toBe("spell");
    expect(useGameStore.getState().validTargets).toContain(victime.instanceId);
    expect(eveil()[0].remaining).toBe(1);
  });
});

describe("éveil — refus", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sans mana, aucun versement", () => {
    const carte = mkInstance(mkCard({ name: "Colosse", mana_cost: 8, attack: 5, health: 5, eveil_cost: 3 }));
    poser(carte, 1);
    verser(carte.instanceId, 1);
    vi.runAllTimers();
    expect(etat().players[0].mana).toBe(0);

    expect(useGameStore.getState().payEveilPoint(carte.instanceId)).toBeNull();
    expect(eveil()[0].remaining).toBe(2);
  });

  it("plateau plein : le dernier point est refusé et rien n'est prélevé", () => {
    const carte = mkInstance(mkCard({ name: "Colosse", mana_cost: 8, attack: 5, health: 5, eveil_cost: 1 }));
    const s = poser(carte, 5);
    s.players[0].board = Array.from({ length: 8 }, (_, i) =>
      mkInstance(mkCard({ name: `B${i}`, attack: 1, health: 1 })));
    useGameStore.setState({ gameState: { ...s } });
    useGameStore.getState().suspendToEveil(carte.instanceId);
    vi.runAllTimers();

    expect(useGameStore.getState().payEveilPoint(carte.instanceId)).toBeNull();
    expect(eveil()[0].remaining).toBe(1);
    expect(etat().players[0].mana).toBe(5);
  });
});
