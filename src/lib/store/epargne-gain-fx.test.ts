// Le gain d'Épargne doit produire un event d'animation (+ son) quel que soit le
// chemin qui l'alimente. Vu avec « Porte-Coffre Kobold » (Épargne 1 en fin de
// tour) : le compteur montait en silence, sans repère visuel ni sonore — la fin
// de tour ne produit ni dégât, ni mort, ni invocation, donc AUCUNE phase
// d'animation n'était planifiée.
//
// L'event est un DIFF d'état côté store (pas un canal moteur) : ces tests
// passent donc par le vrai dispatchAction, pas par un état fabriqué à la main.
import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { useGameStore } from "./gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import { MAX_EPARGNE } from "@/lib/game/constants";
import type { CardInstance } from "@/lib/game/types";

/** Créature à Épargne X déclenchée en FIN DE TOUR (la carte de la capture). */
function porteCoffre(x = 1): CardInstance {
  return mkInstance(mkCard({
    name: "Porte-Coffre Kobold", mana_cost: 2, attack: 2, health: 3,
    keywords: ["epargne"] as never,
    keyword_instances: [{ id: "epargne", x, mode: "end_of_turn" }] as never,
  }));
}

/** Joue toute la séquence d'animation (les events sont posés par phases). */
function runAnimations() {
  vi.advanceTimersByTime(5000);
}

describe("FX du compteur d'Épargne", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // La suite tourne en environnement `node` (cf. vitest.config.ts) : le store
    // ancre ses popups de dégâts sur le DOM au passage. Un `querySelector` qui
    // ne trouve rien suffit — getElementCenter replie hors écran.
    (globalThis as { document?: unknown }).document = { querySelector: () => null };
    useGameStore.setState({
      epargneGainEvent: null, isAnimating: false, pendingIncomingActions: [],
      targetingMode: "none", validTargets: [], selectedCardInstanceId: null,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { document?: unknown }).document;
  });

  it("une Épargne « fin de tour » émet l'event de gain", () => {
    const s = mkState();
    s.players[0].board = [porteCoffre(1)];
    s.players[0].epargne = null; // jamais déclenchée
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    useGameStore.getState().dispatchAction({ type: "end_turn" });
    runAnimations();

    const evt = useGameStore.getState().epargneGainEvent;
    expect(evt).not.toBeNull();
    // Camp résolu par rapport au joueur LOCAL, pas par index de joueur.
    expect(evt!.bySide).toEqual({ mine: 1 });
  });

  it("le gain d'en face est attribué au camp adverse", () => {
    const s = mkState();
    s.players[0].board = [porteCoffre(2)];
    useGameStore.setState({ gameState: s, localPlayerId: "P2" }); // je suis P2

    useGameStore.getState().dispatchAction({ type: "end_turn" });
    runAnimations();

    expect(useGameStore.getState().epargneGainEvent!.bySide).toEqual({ theirs: 2 });
  });

  it("compteur déjà au plafond : aucun gain, donc aucune animation", () => {
    const s = mkState();
    s.players[0].board = [porteCoffre(1)];
    s.players[0].epargne = MAX_EPARGNE; // au plafond — le surplus est écrêté en silence
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    useGameStore.getState().dispatchAction({ type: "end_turn" });
    runAnimations();

    expect(useGameStore.getState().epargneGainEvent).toBeNull();
  });

  it("une fin de tour sans Épargne sur le plateau n'émet rien", () => {
    const s = mkState();
    s.players[0].board = [mkInstance(mkCard({ name: "Banale", mana_cost: 1, attack: 1, health: 1 }))];
    useGameStore.setState({ gameState: s, localPlayerId: "P1" });

    useGameStore.getState().dispatchAction({ type: "end_turn" });
    runAnimations();

    expect(useGameStore.getState().epargneGainEvent).toBeNull();
  });
});
