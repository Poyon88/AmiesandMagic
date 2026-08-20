// Le parcours RÉEL du coût de REPLI, côté interface : cliquer la carte ouvre la
// modale de paiement, désigner N cartes de la main, confirmer.
//
// Le moteur a ses propres tests (topdeck-cost.test.ts) ; ceux-ci couvrent ce
// que le moteur ne voit pas — l'ouverture de la modale, l'exclusivité entre les
// deux coûts de main (une carte ne paie pas la défausse ET le repli), et la
// transmission de l'ORDRE des désignations jusqu'à l'action diffusée.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { useGameStore } from "./gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { CardInstance } from "@/lib/game/types";

function main(noms: string[]): CardInstance[] {
  return noms.map(n => mkInstance(mkCard({ name: n, mana_cost: 1, attack: 1, health: 1 })));
}

/** Pose un état jouable : P1 actif, main garnie, plus la carte à coût. */
function poser(carte: CardInstance, noms = ["A", "B", "C"]) {
  const s = mkState();
  s.players[0].mana = 10;
  s.players[0].hand = main(noms);
  s.players[0].deck = [mkInstance(mkCard({ name: "D1" }))];
  s.players[0].hand.push(carte);
  useGameStore.setState({
    gameState: s, localPlayerId: s.players[0].id,
    targetingMode: "none", pendingCostCard: null,
    selectedDiscardIds: [], selectedSacrificeIds: [], selectedTopdeckIds: [],
    isAnimating: false, pendingIncomingActions: [],
  });
  return s;
}

const idDe = (nom: string) =>
  useGameStore.getState().gameState!.players[0].hand.find(c => c.card.name === nom)!.instanceId;

describe("coût de repli — la modale de paiement", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("jouer une carte à repli ouvre la modale au lieu de partir directement", () => {
    const carte = mkInstance(mkCard({ name: "Pacte", mana_cost: 1, attack: 2, health: 2, topdeck_cost: 1 }));
    poser(carte);

    const action = useGameStore.getState().playCardDirect(carte.instanceId);

    expect(action, "rien ne doit être diffusé tant que le coût n'est pas payé").toBeNull();
    expect(useGameStore.getState().targetingMode).toBe("cost_payment");
    expect(useGameStore.getState().pendingCostCard?.topdeckNeeded).toBe(1);
  });

  it("les désignations gardent l'ORDRE des clics et partent dans l'action", () => {
    // C'est cet ordre qui décide de la carte remise sur le dessus, donc de la
    // prochaine pioche : le perdre en route ferait mentir le rang affiché.
    const carte = mkInstance(mkCard({ name: "Pacte", mana_cost: 1, attack: 2, health: 2, topdeck_cost: 2 }));
    poser(carte);
    useGameStore.getState().playCardDirect(carte.instanceId);

    const b = idDe("B"), a = idDe("A");
    useGameStore.getState().toggleTopdeckSelection(b);
    useGameStore.getState().toggleTopdeckSelection(a);
    expect(useGameStore.getState().selectedTopdeckIds).toEqual([b, a]);

    const action = useGameStore.getState().confirmCostPayment();
    vi.runAllTimers();

    expect(action).not.toBeNull();
    expect(action!.type === "play_card" && action!.topdeckInstanceIds).toEqual([b, a]);
    // B désignée en premier ⇒ B sur le dessus.
    expect(useGameStore.getState().gameState!.players[0].deck.map(c => c.card.name))
      .toEqual(["B", "A", "D1"]);
  });

  it("confirmer est impossible tant que le compte n'y est pas", () => {
    const carte = mkInstance(mkCard({ name: "Pacte", mana_cost: 1, attack: 2, health: 2, topdeck_cost: 2 }));
    poser(carte);
    useGameStore.getState().playCardDirect(carte.instanceId);
    useGameStore.getState().toggleTopdeckSelection(idDe("A"));

    expect(useGameStore.getState().confirmCostPayment()).toBeNull();
    expect(useGameStore.getState().gameState!.players[0].board).toHaveLength(0);
  });

  it("on ne désigne jamais plus que demandé", () => {
    const carte = mkInstance(mkCard({ name: "Pacte", mana_cost: 1, attack: 2, health: 2, topdeck_cost: 1 }));
    poser(carte);
    useGameStore.getState().playCardDirect(carte.instanceId);

    useGameStore.getState().toggleTopdeckSelection(idDe("A"));
    useGameStore.getState().toggleTopdeckSelection(idDe("B"));

    expect(useGameStore.getState().selectedTopdeckIds).toEqual([idDe("A")]);
  });

  it("la carte JOUÉE ne peut pas se replier elle-même", () => {
    const carte = mkInstance(mkCard({ name: "Pacte", mana_cost: 1, attack: 2, health: 2, topdeck_cost: 1 }));
    poser(carte);
    useGameStore.getState().playCardDirect(carte.instanceId);

    useGameStore.getState().toggleTopdeckSelection(carte.instanceId);

    expect(useGameStore.getState().selectedTopdeckIds).toEqual([]);
  });
});

describe("coût de repli — exclusivité avec la défausse", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("une carte promise à la défausse ne peut pas être repliée en plus", () => {
    // Même main, deux coûts, un seul exemplaire : le moteur rejetterait
    // l'action en silence, donc l'interface doit l'interdire en amont.
    const carte = mkInstance(mkCard({
      name: "Pacte", mana_cost: 1, attack: 2, health: 2, discard_cost: 1, topdeck_cost: 1,
    }));
    poser(carte);
    useGameStore.getState().playCardDirect(carte.instanceId);

    const a = idDe("A");
    useGameStore.getState().toggleDiscardSelection(a);
    useGameStore.getState().toggleTopdeckSelection(a);

    expect(useGameStore.getState().selectedTopdeckIds).toEqual([]);
    expect(useGameStore.getState().selectedDiscardIds).toEqual([a]);
  });

  it("les deux coûts se paient sur des cartes DIFFÉRENTES, et l'action passe", () => {
    const carte = mkInstance(mkCard({
      name: "Pacte", mana_cost: 1, attack: 2, health: 2, discard_cost: 1, topdeck_cost: 1,
    }));
    poser(carte);
    useGameStore.getState().playCardDirect(carte.instanceId);

    const a = idDe("A"), b = idDe("B");
    useGameStore.getState().toggleDiscardSelection(a);
    useGameStore.getState().toggleTopdeckSelection(b);
    const action = useGameStore.getState().confirmCostPayment();
    vi.runAllTimers();

    expect(action).not.toBeNull();
    const st = useGameStore.getState().gameState!;
    expect(st.players[0].graveyard.map(c => c.card.name)).toContain("A");
    expect(st.players[0].deck.map(c => c.card.name)).toEqual(["B", "D1"]);
  });
});

describe("coût de repli — signalé à l'animation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("l'évènement arrive au store, sans jamais nommer la carte repliée", () => {
    const carte = mkInstance(mkCard({ name: "Pacte", mana_cost: 1, attack: 2, health: 2, topdeck_cost: 1 }));
    poser(carte);
    useGameStore.getState().playCardDirect(carte.instanceId);
    useGameStore.getState().toggleTopdeckSelection(idDe("A"));
    useGameStore.getState().confirmCostPayment();
    vi.runAllTimers();

    const ev = useGameStore.getState().topdeckCostEvent;
    expect(ev).not.toBeNull();
    expect(ev!.count).toBe(1);
    expect(ev!.isLocal).toBe(true);
    expect(JSON.stringify(ev)).not.toContain("A");
  });
});
