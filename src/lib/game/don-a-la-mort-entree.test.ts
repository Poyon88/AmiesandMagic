// Une créature qui se confère à sa mort une capacité « à l'entrée en jeu » ne la
// déclenche qu'en étant rejouée depuis la main. Arbitrage de l'auteur (2026-11-07) :
// une résurrection ne rejoue pas les effets d'entrée. Cas réel : Sang-façonné scissipare.
import { describe, expect, it } from "vitest";
import { grantTriggersFor } from "./abilities";
import { applyAction } from "./engine";
import { describeComposedCap } from "./composed-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, ComposedEffect, GameAction, GameState } from "./types";

const don: Capability = {
  uid: "cx_0", trigger: "on_death", position: 0, abilityId: "_composed", effectKind: "immediate", targets: [],
  composed: { content: "grant_keyword", magnitude: { x: 1 }, grantAbilityId: "dedoublement", grantTrigger: "on_play",
    target: { side: "enemy", count: 1, entity: "self", location: "board", designation: "automatic" } },
} as Capability;

const sort = (composed: ComposedEffect) => mkInstance(mkCard({
  name: "Sort", card_type: "spell", mana_cost: 0, attack: null, health: null,
  capabilities: [{ uid: "t", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", targets: [], composed }] as never,
}));
const tue = () => sort({ content: "destroy", target: { entity: "unit", count: "all", side: "ally", location: "board", designation: "automatic" } });
const cimetiere = (content: "exhumation" | "rappel") =>
  sort({ content, target: { entity: "unit", count: 1, side: "ally", location: "graveyard", designation: "random", cardKind: "creature" } });

function jouer(s: GameState, c: CardInstance): GameState {
  s.players[0].hand.push(c);
  return applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as GameAction);
}
function apresMort(): GameState {
  const s = mkState();
  const u = mkInstance(mkCard({ name: "Sang", mana_cost: 0, attack: 4, health: 4, capabilities: [don] as never }));
  return jouer(jouer(s, u), tue());
}
const sangs = (s: GameState) => s.players[0].board.filter((c) => c.card.name === "Sang");

describe("don à la mort, effet à l'entrée en jeu", () => {
  it("l'entrée en jeu est le défaut dans ce cas, et seulement proposée en dernier sinon", () => {
    expect(grantTriggersFor("dedoublement", "board", true)[0]).toBe("on_play");
    const surPlateau = grantTriggersFor("dedoublement", "board");
    expect(surPlateau[surPlateau.length - 1]).toBe("on_play");
  });

  it("la mort ne crée aucune copie", () => {
    expect(sangs(apresMort())).toHaveLength(0);
  });

  it("une résurrection ne crée pas de copie", () => {
    expect(sangs(jouer(apresMort(), cimetiere("exhumation")))).toHaveLength(1);
  });

  it("rejouée depuis la main : une copie apparaît", () => {
    const st = jouer(apresMort(), cimetiere("rappel"));
    const carte = st.players[0].hand.find((c) => c.card.name === "Sang")!;
    st.players[0].hand = st.players[0].hand.filter((c) => c !== carte);
    expect(sangs(jouer(st, carte))).toHaveLength(2);
  });

  it("mort ou retour en main : la forge propose l'entrée en jeu aux capacités à plusieurs déclencheurs", () => {
    expect(grantTriggersFor("dedoublement", "board", true).length).toBeGreaterThan(1);
  });

  it("le texte annonce le déclencheur", () => {
    expect(describeComposedCap(don).toLowerCase()).toContain("entrée en jeu");
  });
});
