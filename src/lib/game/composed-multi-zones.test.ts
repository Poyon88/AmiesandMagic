// Localisations MULTIPLES d'un effet composé « toutes » : le même effet frappe
// chaque zone cochée, avec les filtres habituels.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { describeComposedCap } from "./composed-display";
import { composedScope, zonesDeCible } from "./target-scope";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, ComposedEffect, GameState, TargetSpec } from "./types";

const cible = (p: Partial<TargetSpec> = {}): TargetSpec => ({
  entity: "unit", count: "all", side: "ally", location: "board", designation: "automatic",
  extraLocations: ["hand", "deck", "graveyard"], ...p,
});
const cap = (composed: ComposedEffect): Capability => ({
  uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", composed,
} as unknown as Capability);
const buff = (t: TargetSpec) => cap({ content: "buff", magnitude: { x: 2, y: 2 }, target: t });

const unite = (nom: string) => mkInstance(mkCard({ name: nom, mana_cost: 1, attack: 1, health: 1 }));
const action = (nom: string) => mkInstance(mkCard({ name: nom, mana_cost: 1, card_type: "spell", attack: null, health: null }));

function lancer(c: Capability, prepare: (s: GameState) => void): GameState {
  const s = mkState();
  prepare(s);
  const sort = mkInstance(mkCard({ name: "Grand Sort", card_type: "spell", attack: null, health: null, capabilities: [c] as never }));
  s.players[0].hand.push(sort);
  return applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId });
}

const toutes = (s: GameState, i: number): CardInstance[] => {
  const p = s.players[i];
  return [...p.board, ...p.hand, ...p.deck, ...p.graveyard];
};
const atk = (s: GameState, i: number, nom: string) => toutes(s, i).find(c => c.card.name === nom)?.card.attack;

function peupler(s: GameState) {
  for (const i of [0, 1]) {
    const p = s.players[i];
    p.board = [unite(`B${i}`)]; p.hand = [unite(`H${i}`)];
    p.deck = [unite(`D${i}`)]; p.graveyard = [unite(`G${i}`)];
  }
}

describe("effet composé sur plusieurs zones", () => {
  it("donne +2/+2 aux unités alliées des 4 zones, pas à l'adversaire", () => {
    const s = lancer(buff(cible()), peupler);
    for (const n of ["B0", "H0", "D0", "G0"]) expect(atk(s, 0, n)).toBe(3);
    for (const n of ["B1", "H1", "D1", "G1"]) expect(atk(s, 1, n)).toBe(1);
  });

  it("ne touche que les zones cochées", () => {
    const s = lancer(buff(cible({ extraLocations: ["graveyard"] })), peupler);
    expect(atk(s, 0, "B0")).toBe(3);
    expect(atk(s, 0, "G0")).toBe(3);
    expect(atk(s, 0, "H0")).toBe(1);
    expect(atk(s, 0, "D0")).toBe(1);
  });

  it("couvre les deux camps avec le bord « any »", () => {
    const s = lancer(buff(cible({ side: "any", extraLocations: ["deck"] })), peupler);
    expect(atk(s, 0, "D0")).toBe(3);
    expect(atk(s, 1, "D1")).toBe(3);
  });

  it("ne confère rien aux actions d'une zone hors plateau", () => {
    const s = lancer(buff(cible()), (st) => { peupler(st); st.players[0].deck.push(action("Act")); });
    expect(atk(s, 0, "Act") ?? 0).toBe(0);
  });

  it("ignore les zones en plus si le nombre n'est pas « toutes »", () => {
    expect(zonesDeCible(cible({ count: 1 }))).toEqual(["board"]);
    const s = lancer(buff(cible({ count: 1, designation: "random" })), peupler);
    expect(atk(s, 0, "H0")).toBe(1);
  });

  it("annonce les zones sur la carte, sans le marqueur plateau", () => {
    const c = buff(cible());
    expect(describeComposedCap(c)).toContain("du plateau, de la main, du deck et du cimetière");
    expect(composedScope(c)).toBeUndefined();
  });

  it("laisse intact un effet à une seule zone", () => {
    const { extraLocations: _sans, ...seule } = cible();
    const c = buff(seule);
    expect(describeComposedCap(c)).not.toContain("du plateau");
    expect(composedScope(c)).toBe("all_allies");
  });
});
