// Déclencheur composé « À la fin du tour, tant qu'elle est au cimetière » :
// l'effet part depuis le CIMETIÈRE du joueur sortant, sur l'instance morte.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { composedBadge } from "./composed-display";
import { isItemFiringTrigger, isTokenFiringTrigger } from "./capability-adapter";
import type { Capability, CardInstance, ComposedEffect } from "./types";

const cap = (composed: ComposedEffect): Capability => ({
  uid: "cx_0", trigger: "on_end_of_turn_in_graveyard", effectKind: "immediate", abilityId: "_composed", composed,
});
const brulure = () => cap({ content: "deal_damage", magnitude: { x: 2 }, target: { entity: "hero", side: "enemy", count: 1, location: "board", designation: "automatic" } });
const renfort = () => cap({ content: "buff", magnitude: { x: 1, y: 1 }, target: { entity: "self", side: "ally", count: 1, location: "board", designation: "automatic" } });

/** État avec des decks garnis : sans eux, la pioche à vide coûte des PV. */
function etat() {
  const s = mkState();
  for (const p of s.players) for (let i = 0; i < 10; i++) p.deck.push(mkInstance(mkCard({ name: `Pioche ${i}`, mana_cost: 9 })));
  return s;
}

function revenant(c: Capability): CardInstance {
  return mkInstance(mkCard({ name: "Revenant", mana_cost: 0, attack: 1, health: 1, capabilities: [c] }));
}

describe("fin de tour, au cimetière", () => {
  it("part à CHAQUE fin de tour de son contrôleur, pas à celle de l'adversaire", () => {
    const s = etat();
    s.players[0].graveyard.push(revenant(brulure()));
    const pv0 = s.players[1].hero.hp;

    let st = applyAction(s, { type: "end_turn" }); // fin du tour de P1
    expect(st.players[1].hero.hp).toBe(pv0 - 2);
    st = applyAction(st, { type: "end_turn" }); // fin du tour de P2 : rien
    expect(st.players[1].hero.hp).toBe(pv0 - 2);
    st = applyAction(st, { type: "end_turn" }); // fin du tour de P1
    expect(st.players[1].hero.hp).toBe(pv0 - 4);
  });

  it("un renfort « self » s'accumule sur la carte au cimetière", () => {
    const s = etat();
    const c = revenant(renfort());
    s.players[0].graveyard.push(c);
    const st = applyAction(s, { type: "end_turn" });
    const mort = st.players[0].graveyard.find((k) => k.instanceId === c.instanceId)!;
    expect([mort.card.attack, mort.card.health]).toEqual([2, 2]);
  });

  it("ne part ni en main ni sur le plateau", () => {
    const s = etat();
    s.players[0].hand.push(revenant(brulure()));
    s.players[0].board.push(revenant(brulure()));
    const pv0 = s.players[1].hero.hp;
    const st = applyAction(s, { type: "end_turn" });
    expect(st.players[1].hero.hp).toBe(pv0);
  });

  it("badge « Fin de tour · au cimetière », couleur de la fin de tour", () => {
    const c = brulure();
    expect(composedBadge(c)?.label).toBe("Fin de tour · au cimetière");
    expect(composedBadge(c)?.color).toBe(composedBadge({ ...c, trigger: "on_end_of_turn" })?.color);
  });

  it("jamais proposé aux jetons ni aux objets", () => {
    expect(isTokenFiringTrigger("on_end_of_turn_in_graveyard")).toBe(false);
    expect(isItemFiringTrigger("on_end_of_turn_in_graveyard")).toBe(false);
  });
});
