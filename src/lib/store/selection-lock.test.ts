// Verrou anti-annulation des sélecteurs « Sélection » (révélation de N cartes).
//
// Bug : un sélecteur ouvert via un pouvoir de héros (ex. Noham), un sort ou une
// invocation de créature pouvait être ANNULÉ (clic fond / Échap) après que le
// joueur ait vu les cartes — « scouting » gratuit, puis relance pour de
// nouvelles cartes. Une fois révélées, le choix doit être OBLIGATOIRE.
//
// On teste directement le garde dans clearSelection / activateHeroPower, et on
// vérifie que la confirmation marche toujours et que la Divination reste, elle,
// annulable (mode distinct, hors périmètre).
import { describe, expect, it, beforeEach } from "vitest";
import { useGameStore } from "./gameStore";
import { mkCard, mkState } from "../game/test-harness";
import type { Card, GameAction } from "../game/types";

const cards: Card[] = [
  mkCard({ id: 901, name: "Choix A" }),
  mkCard({ id: 902, name: "Choix B" }),
  mkCard({ id: 903, name: "Choix C" }),
];

beforeEach(() => {
  // État neutre : store global Zustand, on réinitialise ce qui nous concerne.
  useGameStore.setState({
    gameState: mkState(),
    localPlayerId: "P1",
    isAnimating: false,
    targetingMode: "none",
    selectionCards: [],
    selectedCardInstanceId: null,
    pendingHeroPowerSelection: false,
    divinationCards: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

describe("Verrou des sélecteurs « Sélection »", () => {
  it("pouvoir de héros : clearSelection ne ferme PAS le sélecteur révélé", () => {
    useGameStore.setState({
      targetingMode: "selection",
      selectionCards: cards,
      pendingHeroPowerSelection: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    useGameStore.getState().clearSelection();

    const s = useGameStore.getState();
    expect(s.targetingMode).toBe("selection");
    expect(s.selectionCards).toHaveLength(3);
    expect(s.pendingHeroPowerSelection).toBe(true);
  });

  it("sort/créature : clearSelection ne ferme PAS non plus le sélecteur révélé", () => {
    useGameStore.setState({
      targetingMode: "selection",
      selectionCards: cards,
      selectedCardInstanceId: "i_spell",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    useGameStore.getState().clearSelection();

    expect(useGameStore.getState().targetingMode).toBe("selection");
    expect(useGameStore.getState().selectionCards).toHaveLength(3);
  });

  it("la confirmation reste possible (dispatch hero_power avec la carte choisie)", () => {
    let dispatched: GameAction | null = null;
    useGameStore.setState({
      targetingMode: "selection",
      selectionCards: cards,
      pendingHeroPowerSelection: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dispatchAction: ((a: GameAction) => { dispatched = a; return a; }) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    useGameStore.getState().selectTarget("902"); // choisir « Choix B » (id 902)

    expect(dispatched).toBeTruthy();
    expect(dispatched!.type).toBe("hero_power");
    expect((dispatched! as { selectionCardId?: number }).selectionCardId).toBe(902);
  });

  it("activateHeroPower est bloqué pendant qu'un sélecteur est ouvert", () => {
    useGameStore.setState({
      targetingMode: "selection",
      selectionCards: cards,
      pendingHeroPowerSelection: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const res = useGameStore.getState().activateHeroPower();

    expect(res).toBeNull();
    // état inchangé : toujours le même sélecteur
    expect(useGameStore.getState().targetingMode).toBe("selection");
  });

  it("la Divination, elle, reste annulable (hors périmètre)", () => {
    useGameStore.setState({
      targetingMode: "divination",
      divinationCards: cards,
      selectedCardInstanceId: "i_div",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    useGameStore.getState().clearSelection();

    expect(useGameStore.getState().targetingMode).toBe("none");
  });
});
