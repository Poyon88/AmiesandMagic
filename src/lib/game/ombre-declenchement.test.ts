// OMBRE : une capacité DÉCLENCHÉE de la créature la sort de l'ombre.
//
// Arbitrage de l'auteur (2026-11-01) : le libellé disait déjà « tant qu'elle
// n'a pas effectué une action (attaque ou capacité) », mais seuls l'attaque et
// l'activation révélaient. Désormais tout déclencheur d'une créature EN JEU
// révèle (fin/début de tour, blessure, PV bas, Retard…) — SAUF l'entrée en jeu,
// pour qu'Ombre et effet d'arrivée restent compatibles.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, GameAction, GameState, Keyword, KeywordInstance } from "./types";

const piocheCap = (trigger: Capability["trigger"]): Capability =>
  ({ uid: "c", trigger, effectKind: "immediate", abilityId: "_composed", composed: { content: "draw_cards", magnitude: { x: 1 } } });

function tapie(opts: { caps?: Capability[]; kws?: KeywordInstance[] }): CardInstance {
  const c = mkInstance(mkCard({
    name: "Tapie", mana_cost: 0, attack: 1, health: 5,
    keywords: ["ombre", ...(opts.kws ?? []).map(k => k.id)] as Keyword[],
    keyword_instances: [{ id: "ombre" } as KeywordInstance, ...(opts.kws ?? [])],
    capabilities: opts.caps,
  }));
  c.hasSummoningSickness = false;
  return c;
}

const avecDeck = (s: GameState) => {
  for (const p of s.players) for (let i = 0; i < 5; i++) p.deck.push(mkInstance(mkCard({ name: `Pioche ${i}` })));
  return s;
};
const revelee = (st: GameState, name = "Tapie") =>
  st.players.flatMap(p => p.board).find(c => c.card.name === name)?.ombreRevealed === true;

describe("se révèle quand une capacité se déclenche", () => {
  it("effet composé en fin de tour", () => {
    const s = avecDeck(mkState());
    s.players[0].board.push(tapie({ caps: [piocheCap("on_end_of_turn")] }));
    const st = applyAction(s, { type: "end_turn" } as GameAction);
    expect(revelee(st)).toBe(true);
  });

  it("mot-clé classique en fin de tour (Canon 1)", () => {
    const s = avecDeck(mkState());
    s.players[0].board.push(tapie({ kws: [{ id: "canon", x: 1, mode: "end_of_turn" } as KeywordInstance] }));
    s.players[1].board.push(mkInstance(mkCard({ name: "Cible", attack: 1, health: 9 })));
    const st = applyAction(s, { type: "end_turn" } as GameAction);
    expect(revelee(st)).toBe(true);
  });

  it("à la blessure", () => {
    const s = avecDeck(mkState());
    s.players[0].board.push(tapie({ caps: [piocheCap("on_wound")] }));
    const sort = mkInstance(mkCard({
      name: "Écharde", card_type: "spell", mana_cost: 0, attack: null, health: null,
      capabilities: [{ uid: "e", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
        composed: { content: "deal_damage", magnitude: { x: 1 }, target: { entity: "unit", count: "all", side: "ally", location: "board", designation: "automatic" } } }],
    }));
    s.players[0].hand.push(sort);
    const st = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId } as GameAction);
    expect(revelee(st)).toBe(true);
  });
});

describe("ne se révèle PAS", () => {
  it("à l'entrée en jeu (choix de l'auteur)", () => {
    const s = avecDeck(mkState());
    const c = tapie({ caps: [piocheCap("on_play")] });
    s.players[0].hand.push(c);
    const st = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as GameAction);
    expect(st.players[0].board.some(b => b.card.name === "Tapie")).toBe(true);
    expect(revelee(st)).toBe(false);
  });

  it("sans capacité déclenchée, la fin de tour ne change rien", () => {
    const s = avecDeck(mkState());
    s.players[0].board.push(tapie({}));
    expect(revelee(applyAction(s, { type: "end_turn" } as GameAction))).toBe(false);
  });

  it("une AUTRE créature qui déclenche ne révèle pas l'Ombre voisine", () => {
    const s = avecDeck(mkState());
    s.players[0].board.push(tapie({}));
    s.players[0].board.push(mkInstance(mkCard({ name: "Voisine", attack: 1, health: 3, capabilities: [piocheCap("on_end_of_turn")] })));
    expect(revelee(applyAction(s, { type: "end_turn" } as GameAction))).toBe(false);
  });
});
