// PARALYSIE : « les unités qu'elle blesse » — tous les dégâts infligés par la
// créature, pas seulement le combat. Vu en partie : Tisseuse de Brume verte
// (Paralysie + Tempête 2 en fin de tour) blessait sans paralyser.
import { describe, expect, it } from "vitest";
import { applyAction, initRNG } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Keyword, KeywordInstance } from "./types";

const ennemi = (name: string, hp: number) => mkInstance(mkCard({ name, attack: 1, health: hp }));

describe("Paralysie hors combat", () => {
  it("Tempête en fin de tour paralyse les unités blessées qui survivent", () => {
    const s = mkState();
    const tisseuse = mkInstance(mkCard({
      name: "Tisseuse", attack: 3, health: 1,
      keywords: ["paralysie", "tempete"] as unknown as Keyword[],
      keyword_instances: [{ id: "tempete" as Keyword, x: 2, mode: "end_of_turn" }] as KeywordInstance[],
    }));
    tisseuse.hasSummoningSickness = false;
    s.players[0].board.push(tisseuse);
    const cible = ennemi("Cible", 9);
    s.players[1].board.push(cible);
    initRNG(5);
    const next = applyAction(s, { type: "end_turn" });
    const c = next.players[1].board.find(u => u.card.name === "Cible")!;
    expect(c.currentHealth).toBe(7);
    expect(c.isParalyzed).toBe(true);
  });

  it("un effet composé de dégâts porté par la créature paralyse aussi", () => {
    const s = mkState();
    const caps: Capability[] = [{
      uid: "cx_0", trigger: "on_play", effectKind: "immediate", abilityId: "_composed",
      composed: { content: "deal_damage", magnitude: { x: 1 }, target: { entity: "unit", count: "all", side: "enemy", location: "board", designation: "automatic" } },
    }];
    const geolier = mkInstance(mkCard({ name: "Geôlier", attack: 1, health: 1, keywords: ["paralysie"] as unknown as Keyword[], capabilities: caps as never }));
    s.players[0].hand.push(geolier);
    s.players[1].board.push(ennemi("Survivante", 5), ennemi("Fragile", 1));
    initRNG(1);
    const next = applyAction(s, { type: "play_card", cardInstanceId: geolier.instanceId });
    expect(next.players[1].board.map(u => u.card.name)).toEqual(["Survivante"]); // Fragile est morte
    expect(next.players[1].board[0].isParalyzed).toBe(true);
  });

  it("une créature SANS Paralysie ne paralyse pas, et le combat paralyse toujours", () => {
    const s = mkState();
    const brute = mkInstance(mkCard({ name: "Brute", attack: 2, health: 9, keywords: ["paralysie"] as unknown as Keyword[] }));
    brute.hasSummoningSickness = false;
    s.players[0].board.push(brute);
    const cible = ennemi("Cible", 9);
    s.players[1].board.push(cible);
    initRNG(1);
    const next = applyAction(s, { type: "attack", attackerInstanceId: brute.instanceId, targetInstanceId: cible.instanceId });
    expect(next.players[1].board[0].isParalyzed).toBe(true);
    // La cible sans Paralysie riposte sans paralyser.
    expect(next.players[0].board[0].isParalyzed).toBe(false);
  });
});

// POISON : même règle que Paralysie — « les unités blessées » par la créature,
// quel que soit le chemin des dégâts.
describe("Poison hors combat", () => {
  it("Tempête en fin de tour empoisonne les unités blessées qui survivent", () => {
    const s = mkState();
    const vipere = mkInstance(mkCard({
      name: "Vipère", attack: 1, health: 1,
      keywords: ["poison", "tempete"] as unknown as Keyword[],
      keyword_instances: [{ id: "tempete" as Keyword, x: 1, mode: "end_of_turn" }] as KeywordInstance[],
    }));
    vipere.hasSummoningSickness = false;
    s.players[0].board.push(vipere);
    s.players[1].board.push(ennemi("Cible", 9));
    initRNG(2);
    const next = applyAction(s, { type: "end_turn" });
    const c = next.players[1].board.find(u => u.card.name === "Cible")!;
    expect(c.currentHealth).toBeLessThan(9);
    expect(c.isPoisoned).toBe(true);
  });

  it("le combat empoisonne toujours, dans les deux sens", () => {
    const s = mkState();
    const a = mkInstance(mkCard({ name: "Assaillant", attack: 1, health: 9, keywords: ["poison"] as unknown as Keyword[] }));
    a.hasSummoningSickness = false;
    s.players[0].board.push(a);
    const d = mkInstance(mkCard({ name: "Défenseur", attack: 1, health: 9, keywords: ["poison"] as unknown as Keyword[] }));
    s.players[1].board.push(d);
    initRNG(1);
    const next = applyAction(s, { type: "attack", attackerInstanceId: a.instanceId, targetInstanceId: d.instanceId });
    expect(next.players[1].board[0].isPoisoned).toBe(true);
    expect(next.players[0].board[0].isPoisoned).toBe(true);
  });
});
