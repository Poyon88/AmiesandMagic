// ÉTHÉRÉE — passif de créature.
//   • En COMBAT (attaque reçue, riposte encaissée, Fureur) : jamais plus de
//     1 dégât par coup — 2 face à Double attaque, qui porte deux coups.
//     Précision perce ce plafond ; Touché mortel tue quand même.
//   • Les dégâts des ACTIONS qu'elle subit sont doublés, point par point
//     compris. Les capacités de créature ne sont ni plafonnées ni doublées.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, ComposedEffect, GameAction, GameState, Keyword } from "./types";

function unite(name: string, attack: number, health: number, keywords: Keyword[] = []): CardInstance {
  const c = mkInstance(mkCard({ name, attack, health, keywords }));
  c.hasSummoningSickness = false;
  return c;
}
const brume = (pv = 10, autres: Keyword[] = []) => unite("Brume", 2, pv, ["etheree", ...autres]);
const trouver = (s: GameState, c: CardInstance) =>
  [...s.players[0].board, ...s.players[1].board].find((u) => u.instanceId === c.instanceId);
const attaquer = (s: GameState, a: CardInstance, cible: CardInstance) =>
  applyAction(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: cible.instanceId } as GameAction);

/** P0 attaque la Brume de P1 avec `a` ; rend les PV restants de la Brume. */
function pvApresAttaque(a: CardInstance, b = brume()): number {
  const s = mkState();
  s.players[0].board.push(a);
  s.players[1].board.push(b);
  return trouver(attaquer(s, a, b), b)?.currentHealth ?? 0;
}

const DEGATS_3: ComposedEffect = {
  content: "deal_damage", magnitude: { x: 3 },
  target: { entity: "unit", count: "all", side: "enemy", location: "board", designation: "random" },
};
const cap = (trigger: Capability["trigger"], composed: ComposedEffect): Capability =>
  ({ uid: "cx_0", trigger, effectKind: "immediate", abilityId: "_composed", composed, targets: [] });

/** P0 joue `carte` (action ou créature) face à la Brume de P1. */
function pvApresCarte(carte: CardInstance, b = brume()): { pv: number; st: GameState } {
  const s = mkState();
  s.players[0].mana = 10;
  s.players[0].hand.push(carte);
  s.players[1].board.push(b);
  const st = applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId } as GameAction);
  return { pv: trouver(st, b)?.currentHealth ?? 0, st };
}
const action = (composed: ComposedEffect) => mkInstance(mkCard({
  name: "Trait", card_type: "spell", mana_cost: 0, attack: null, health: null,
  capabilities: [cap("spell_resolution", composed)],
}));

describe("Éthérée — combat : 1 dégât par coup", () => {
  it("attaquée par une 5/5 : ne perd qu'1 PV", () => {
    expect(pvApresAttaque(unite("Brute", 5, 5))).toBe(9);
  });

  it("quand ELLE attaque : la riposte ne lui retire qu'1 PV", () => {
    const s = mkState();
    const b = brume();
    const mur = unite("Mur", 6, 10);
    s.players[0].board.push(b);
    s.players[1].board.push(mur);
    const st = attaquer(s, b, mur);
    expect(trouver(st, b)!.currentHealth).toBe(9);
    expect(trouver(st, mur)!.currentHealth).toBe(8); // elle frappe normalement
  });

  it("Double attaque porte deux coups : 2 PV — avec ou sans Première frappe", () => {
    expect(pvApresAttaque(unite("Duelliste", 4, 5, ["double_attaque"]))).toBe(8);
    expect(pvApresAttaque(unite("Bretteur", 4, 5, ["double_attaque", "premiere_frappe"]))).toBe(8);
  });

  it("Précision perce le plafond : dégâts normaux", () => {
    expect(pvApresAttaque(unite("Tireur", 5, 5, ["precision"]))).toBe(5);
  });

  it("Touché mortel : une blessure de 1 suffit à la tuer", () => {
    const s = mkState();
    const a = unite("Vipère", 1, 5, ["touche_mortel"]);
    const b = brume();
    s.players[0].board.push(a);
    s.players[1].board.push(b);
    expect(trouver(attaquer(s, a, b), b)).toBeUndefined();
  });

  it("Piétinement : aucun surplus ne passe au héros", () => {
    const s = mkState();
    const a = unite("Mastodonte", 9, 9, ["pietinement"]);
    const b = brume(1);
    s.players[0].board.push(a);
    s.players[1].board.push(b);
    const pv = s.players[1].hero.hp;
    expect(attaquer(s, a, b).players[1].hero.hp).toBe(pv);
  });

  it("une créature sans Éthérée encaisse normalement (témoin)", () => {
    expect(pvApresAttaque(unite("Brute", 5, 5), unite("Témoin", 2, 10))).toBe(5);
  });
});

describe("Éthérée — actions doublées, capacités inchangées", () => {
  it("une action à 3 dégâts lui en inflige 6", () => {
    expect(pvApresCarte(action(DEGATS_3)).pv).toBe(4);
  });

  it("un Bouclier absorbe le coup entier, doublé ou non", () => {
    const b = brume();
    b.hasDivineShield = true;
    expect(pvApresCarte(action(DEGATS_3), b).pv).toBe(10);
  });

  it("Résistance 1 s'applique APRÈS le doublement : 6 − 1 = 5", () => {
    const b = brume(10, ["resistance"]);
    b.grantedKeywordX.resistance = 1;
    expect(pvApresCarte(action(DEGATS_3), b).pv).toBe(5);
  });

  it("une capacité de créature (composé à l'entrée) fait ses dégâts normaux", () => {
    const mage = mkInstance(mkCard({ name: "Mage", mana_cost: 0, attack: 1, health: 1, capabilities: [cap("on_play", DEGATS_3)] }));
    expect(pvApresCarte(mage).pv).toBe(7);
  });

  it("action répartie point par point : chaque point retire 2, et le popup le dit", () => {
    const tempete = mkInstance(mkCard({
      name: "Orage", card_type: "spell", mana_cost: 0, attack: null, health: null,
      keywords: ["tempete"] as never,
      keyword_instances: [{ id: "tempete", x: 3 } as never],
      spell_keywords: [{ id: "tempete", amount: 3 }] as never,
    }));
    const { pv, st } = pvApresCarte(tempete);
    expect(pv).toBe(4);
    expect((st.sequentialHits ?? []).map((h) => h.amount)).toEqual([2, 2, 2]);
  });

  it("une action sur une créature SANS Éthérée n'est pas doublée (témoin)", () => {
    expect(pvApresCarte(action(DEGATS_3), unite("Témoin", 2, 10)).pv).toBe(7);
  });
});
