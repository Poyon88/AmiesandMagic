// Entrave X : la cible reste paralysée pendant X tours de son contrôleur, tour
// en cours compris. Les cartes d'avant X (sans `amount` / sans magnitude)
// gardent la durée historique d'un tour.
import { describe, expect, it } from "vitest";
import { applyAction, initRNG, paralyser } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, GameAction, SpellKeywordInstance } from "./types";

type State = ReturnType<typeof mkState>;

function entrave(amount?: number) {
  return mkInstance(mkCard({
    name: "Entrave", card_type: "spell", attack: null, health: null,
    spell_keywords: [{ id: "entrave", ...(amount != null ? { amount } : {}) }] as SpellKeywordInstance[],
  }));
}

function jouer(s: State, carte: ReturnType<typeof mkInstance>, cible?: string): State {
  s.players[0].hand.push(carte);
  const action: GameAction = { type: "play_card", cardInstanceId: carte.instanceId, targetInstanceId: cible };
  return applyAction(s, action);
}

const cibleDe = (s: State) => s.players[1].board.find(u => u.card.name === "Cible")!;
const finDeTour = (s: State) => applyAction(s, { type: "end_turn" });

function plateau() {
  const s = mkState();
  const cible = mkInstance(mkCard({ name: "Cible", attack: 2, health: 9 }));
  cible.hasSummoningSickness = false;
  s.players[1].board.push(cible);
  initRNG(3);
  return { s, cible };
}

describe("Entrave X — mot-clé de sort", () => {
  it("Entrave 2 paralyse pendant DEUX tours du camp ciblé", () => {
    const { s, cible } = plateau();
    let n = jouer(s, entrave(2), cible.instanceId);
    expect(cibleDe(n).isParalyzed).toBe(true);
    expect(cibleDe(n).paralysisTurnsLeft).toBe(2);

    n = finDeTour(n);                      // fin du tour du lanceur : rien ne s'écoule
    expect(cibleDe(n).paralysisTurnsLeft).toBe(2);
    expect(cibleDe(n).attacksRemaining).toBe(0);

    n = finDeTour(n);                      // 1er tour du camp ciblé consommé
    expect(cibleDe(n).isParalyzed).toBe(true);
    expect(cibleDe(n).paralysisTurnsLeft).toBe(1);

    n = finDeTour(n);                      // 2e tour du camp ciblé : toujours inerte
    expect(cibleDe(n).isParalyzed).toBe(true);
    expect(cibleDe(n).attacksRemaining).toBe(0);

    n = finDeTour(n);                      // 2e tour consommé : libérée
    expect(cibleDe(n).isParalyzed).toBe(false);
    expect(cibleDe(n).paralysisTurnsLeft).toBeUndefined();
  });

  it("sans X (cartes d'avant la réforme) : un seul tour, comme avant", () => {
    const { s, cible } = plateau();
    let n = jouer(s, entrave(), cible.instanceId);
    n = finDeTour(finDeTour(n));
    expect(cibleDe(n).isParalyzed).toBe(false);
  });

  it("une Entrave plus courte ne raccourcit pas une paralysie en cours", () => {
    const { s, cible } = plateau();
    let n = jouer(s, entrave(3), cible.instanceId);
    n = jouer(n, entrave(1), cible.instanceId);
    expect(cibleDe(n).paralysisTurnsLeft).toBe(3);
  });
});

describe("Entrave X — effet composé « paralyser »", () => {
  const sortComposé = (magnitude?: { x: number }) => mkInstance(mkCard({
    name: "Racines", card_type: "spell", attack: null, health: null,
    capabilities: [{
      uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
      composed: {
        content: "paralyze", ...(magnitude ? { magnitude } : {}),
        target: { entity: "unit", count: "all", side: "enemy", location: "board", designation: "automatic" },
      },
    }] as Capability[] as never,
  }));

  it("X = nombre de tours", () => {
    const { s } = plateau();
    const n = jouer(s, sortComposé({ x: 3 }));
    expect(cibleDe(n).isParalyzed).toBe(true);
    expect(cibleDe(n).paralysisTurnsLeft).toBe(3);
  });

  it("magnitude absente ⇒ 1 tour", () => {
    const { s } = plateau();
    const n = jouer(s, sortComposé());
    expect(cibleDe(n).paralysisTurnsLeft).toBe(1);
  });
});

describe("paralyser", () => {
  it("une durée nulle ou négative vaut quand même un tour", () => {
    const u = mkInstance(mkCard({ name: "U" }));
    paralyser(u, 0);
    expect(u.isParalyzed).toBe(true);
    expect(u.paralysisTurnsLeft).toBe(1);
  });
});
