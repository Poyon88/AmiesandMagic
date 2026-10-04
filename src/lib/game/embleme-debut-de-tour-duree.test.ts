// Emblème « début de tour » ÉPHÉMÈRE posé pendant le tour de son porteur :
// son début de tour est déjà passé, ce tour ne doit pas entamer sa durée.
// Cas réel : Réacteur de Secours (« au début du tour : +2 mana », 2 tours)
// n'agissait qu'une fois.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, GameState } from "./types";

const reacteur = (cible: "self" | "opponent" = "self") => mkInstance(mkCard({
  name: "Réacteur de Secours", card_type: "spell", attack: null, health: null, mana_cost: 0,
  capabilities: [{
    uid: "cx_0", trigger: "on_start_of_turn", effectKind: "emblem", abilityId: "_composed", duration: 2,
    ...(cible === "opponent" ? { side: "opponent" } : {}),
    composed: { content: "gain_mana", magnitude: { x: 2 } },
  } as Capability] as never,
}));

function etat(): GameState {
  const s = mkState();
  for (const p of s.players) for (let i = 0; i < 10; i++) p.deck.push(mkInstance(mkCard({ name: "Pioche" })));
  return s;
}
/** Bonus de mana du joueur `i` au début de SON prochain tour. */
function prochainTour(st: GameState, i: 0 | 1): { st: GameState; bonus: number } {
  do st = applyAction(st, { type: "end_turn" }); while (st.currentPlayerIndex !== i);
  const p = st.players[i];
  return { st, bonus: p.mana - p.maxMana };
}

describe("Emblème début de tour à durée", () => {
  it("posé chez soi : agit à ses 2 prochains débuts de tour, puis disparaît", () => {
    let st = etat();
    const c = reacteur();
    st.players[0].hand.push(c);
    st = applyAction(st, { type: "play_card", cardInstanceId: c.instanceId });
    let r = prochainTour(st, 0);
    expect(r.bonus).toBe(2);
    r = prochainTour(r.st, 0);
    expect(r.bonus).toBe(2);
    r = prochainTour(r.st, 0);
    expect(r.bonus).toBe(0);
    expect(r.st.players[0].emblems).toHaveLength(0);
  });
  it("posé chez l'adversaire : inchangé, 2 débuts de tour adverses", () => {
    let st = etat();
    const c = reacteur("opponent");
    st.players[0].hand.push(c);
    st = applyAction(st, { type: "play_card", cardInstanceId: c.instanceId });
    let r = prochainTour(st, 1);
    expect(r.bonus).toBe(2);
    r = prochainTour(r.st, 1);
    expect(r.bonus).toBe(2);
    r = prochainTour(r.st, 1);
    expect(r.bonus).toBe(0);
  });
});
