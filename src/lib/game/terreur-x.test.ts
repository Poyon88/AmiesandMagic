// TERREUR X : X est le malus d'ATK de l'aura. Les 6 cartes en base ne déclarent
// aucun X : elles doivent rester à -1, et l'écrire.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { describeKeyword } from "./keyword-display";
import { applyKeywordValueToLabel } from "./keyword-labels";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, GameAction, GameState } from "./types";

const porteur = (x?: number, over: Partial<Card> = {}) => mkInstance(mkCard({
  name: "Effroi", mana_cost: 0, attack: 2, health: 3,
  keywords: ["terreur"] as never,
  ...(x != null
    ? { capabilities: [{ uid: "cw_0", targets: [], trigger: "automatic", effectKind: "immediate", abilityId: "terreur", params: { x } }] as never }
    : {}),
  ...over,
}));
const ennemie = (attack = 5) => mkInstance(mkCard({ name: "Ennemie", attack, health: 4 }));

function poser(s: GameState, c: ReturnType<typeof porteur>): GameState {
  s.players[0].hand.push(c);
  return applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as GameAction);
}
function etat(attack = 5): GameState {
  const s = mkState();
  s.players[1].board.push(ennemie(attack));
  return s;
}
const atk = (s: GameState) => s.players[1].board[0].currentAttack;

describe("Terreur X", () => {
  it("carte existante sans X : Terreur 1", () => {
    expect(atk(poser(etat(), porteur()))).toBe(4);
  });

  it("X = 3 : -3 ATK, plancher à 0", () => {
    expect(atk(poser(etat(), porteur(3)))).toBe(2);
    expect(atk(poser(etat(2), porteur(3)))).toBe(0);
  });

  it("deux porteurs d'amplitudes différentes s'additionnent", () => {
    const st = poser(poser(etat(), porteur(2)), porteur(1));
    expect(atk(st)).toBe(2);
  });

  it("un emblème de Terreur X vaut X par pile, sans X il vaut 1", () => {
    const st = etat();
    st.players[0].emblems = [{ abilityId: "terreur", stacks: 2, params: { amount: 2 } }] as never;
    expect(atk(poser(st, mkInstance(mkCard({ name: "Neutre", mana_cost: 0 }))))).toBe(1);
    const sansX = etat();
    sansX.players[0].emblems = [{ abilityId: "terreur", stacks: 1 }] as never;
    expect(atk(poser(sansX, mkInstance(mkCard({ name: "Neutre", mana_cost: 0 }))))).toBe(4);
  });

  it("une capacité conférée lit son X de don", () => {
    const st = etat();
    const allie = mkInstance(mkCard({ name: "Allié", attack: 1, health: 3 }));
    st.players[0].board.push(allie);
    const c = mkInstance(mkCard({
      name: "Don", card_type: "spell", mana_cost: 0, attack: null, health: null,
      capabilities: [{ uid: "g", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", targets: [],
        composed: { content: "grant_keyword", grantAbilityId: "terreur", magnitude: { x: 2 }, target: { entity: "unit", count: "all", side: "ally", location: "board", designation: "automatic" } } }] as never,
    }));
    st.players[0].hand.push(c);
    expect(atk(applyAction(st, { type: "play_card", cardInstanceId: c.instanceId } as GameAction))).toBe(3);
  });

  it("n'affecte pas son propre camp", () => {
    const st = poser(etat(), porteur(2));
    expect(st.players[0].board[0].currentAttack).toBe(2);
  });

  it("son départ rend l'ATK", () => {
    const st = poser(etat(), porteur(2));
    const c = mkInstance(mkCard({
      name: "Fin", card_type: "spell", mana_cost: 0, attack: null, health: null,
      capabilities: [{ uid: "d", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", targets: [],
        composed: { content: "destroy", target: { entity: "unit", count: "all", side: "ally", location: "board", designation: "automatic" } } }] as never,
    }));
    st.players[0].hand.push(c);
    expect(atk(applyAction(st, { type: "play_card", cardInstanceId: c.instanceId } as GameAction))).toBe(5);
  });

  it("une carte sans X affiche Terreur 1, jamais la lettre", () => {
    expect(applyKeywordValueToLabel("terreur", "Terreur X", undefined)).toBe("Terreur 1");
    expect(applyKeywordValueToLabel("terreur", "Terreur X", 3)).toBe("Terreur 3");
    const carte = mkCard({ keywords: ["terreur"] as never });
    expect(describeKeyword("terreur", { card: carte })).toContain("1 ATK");
    expect(describeKeyword("terreur", { card: carte, x: 3 })).toContain("3 ATK");
  });
});
