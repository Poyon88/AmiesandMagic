// RENVOI EN MAIN composé : la créature porteuse ne se renvoie jamais elle-même
// par « renvoie une / toutes les unités » — même règle que la capacité
// Remontée. Sert aux trois cartes converties de Remontée « tous les alliés » /
// « les deux camps » vers l'effet composé (2026-11-15).
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, GameAction, GameState } from "./types";

const renvoi = (uid: string, trigger: string, side: string): Capability => ({
  uid, trigger, effectKind: "immediate", abilityId: "_composed", position: 0, targets: [],
  composed: { content: "bounce", target: { side, count: "all", entity: "unit", location: "board", designation: "automatic" } },
} as never);
const unite = (n: string) => { const c = mkInstance(mkCard({ name: n, attack: 1, health: 5, mana_cost: 1 })); c.hasSummoningSickness = false; return c; };
function etat(): GameState {
  const s = mkState();
  s.players[0].mana = 10;
  s.players[0].board.push(unite("A1"), unite("A2"));
  s.players[1].board.push(unite("E1"), unite("E2"));
  return s;
}
const noms = (st: GameState, i: 0 | 1) => st.players[i].board.map((c) => c.card.name).sort();

describe("renvoi composé — la porteuse reste", () => {
  it("à l'entrée en jeu, les deux camps : tout repart sauf elle", () => {
    const s = etat();
    const c = mkInstance(mkCard({ name: "Sluagh", mana_cost: 0, attack: 3, health: 3, capabilities: [renvoi("cx_0", "on_play", "any")] }));
    s.players[0].hand.push(c);
    const st = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as GameAction);
    expect(noms(st, 0)).toEqual(["Sluagh"]);
    expect(noms(st, 1)).toEqual([]);
  });

  it("à l'attaque, tous les alliés : l'attaquante reste en jeu", () => {
    const s = etat();
    const c = mkInstance(mkCard({ name: "Maître", mana_cost: 0, attack: 3, health: 9, capabilities: [renvoi("cx_1", "on_attack", "ally")] }));
    c.hasSummoningSickness = false;
    s.players[0].board.push(c);
    const st = applyAction(s, { type: "attack", attackerInstanceId: c.instanceId, targetInstanceId: "enemy_hero" } as GameAction);
    expect(noms(st, 0)).toEqual(["Maître"]);
    expect(noms(st, 1)).toEqual(["E1", "E2"]);
  });

  it("une ACTION renvoie bien tous les alliés, puis résout son effet suivant", () => {
    const s = etat();
    const c = mkInstance(mkCard({
      name: "Repli", card_type: "spell", mana_cost: 0, attack: null, health: null,
      spell_keywords: [{ id: "afflux", amount: 7 }] as never,
      capabilities: [renvoi("cx_0", "spell_resolution", "ally"),
        { uid: "sk_0", params: { x: 7 }, targets: [], trigger: "spell_resolution", abilityId: "afflux", effectKind: "immediate" }] as never,
    }));
    s.players[0].hand.push(c);
    const mana = s.players[0].mana;
    const st = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as GameAction);
    expect(noms(st, 0)).toEqual([]);
    expect(noms(st, 1)).toEqual(["E1", "E2"]);
    expect(st.players[0].mana).toBeGreaterThan(mana);
  });

  it("« elle-même » la renvoie toujours", () => {
    const s = etat();
    const soi = { ...renvoi("cx_0", "on_attack", "ally"), composed: { content: "bounce", target: { side: "ally", count: 1, entity: "self", location: "board", designation: "automatic" } } } as never;
    const c = mkInstance(mkCard({ name: "Fuyarde", mana_cost: 0, attack: 3, health: 9, capabilities: [soi] }));
    c.hasSummoningSickness = false;
    s.players[0].board.push(c);
    const st = applyAction(s, { type: "attack", attackerInstanceId: c.instanceId, targetInstanceId: "enemy_hero" } as GameAction);
    expect(noms(st, 0)).toEqual(["A1", "A2"]);
  });
});
