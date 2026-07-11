// Impact X comme capacité de CRÉATURE : à l'invocation (et autres triggers via
// le picker), inflige X dégâts à une cible CRÉATURE OU HÉROS, de n'importe quel
// bord. On exerce le chemin invocation (cible explicite via action.targetInstanceId)
// + le pool de cibles impactTargetIds (sentinelles héros incluses).
import { describe, expect, it } from "vitest";
import { applyAction, impactTargetIds } from "./engine";
import { HERO_MAX_HP } from "./constants";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { GameAction } from "./types";

function play(state: ReturnType<typeof mkState>, ci: ReturnType<typeof mkInstance>, targetInstanceId?: string): GameAction {
  state.players[0].hand.push(ci);
  return { type: "play_card", cardInstanceId: ci.instanceId, targetInstanceId };
}

function bearer(x: number) {
  return mkInstance(mkCard({
    name: "Archer", mana_cost: 2, attack: 1, health: 1,
    keywords: ["impact"], effect_text: `[Impact ${x}]`,
  }));
}

describe("Impact X — créature (invocation)", () => {
  it("inflige X à une créature ENNEMIE ciblée", () => {
    const s = mkState();
    const enemy = mkInstance(mkCard({ name: "Cible", attack: 1, health: 5 }));
    s.players[1].board.push(enemy);
    const next = applyAction(s, play(s, bearer(3), enemy.instanceId));
    expect(next.players[1].board.find(c => c.card.name === "Cible")!.currentHealth).toBe(2); // 5-3
  });

  it("peut cibler une créature ALLIÉE (tout bord)", () => {
    const s = mkState();
    const ally = mkInstance(mkCard({ name: "Allie", attack: 1, health: 5 }));
    s.players[0].board.push(ally);
    const next = applyAction(s, play(s, bearer(2), ally.instanceId));
    expect(next.players[0].board.find(c => c.card.name === "Allie")!.currentHealth).toBe(3); // 5-2
  });

  it("peut cibler le HÉROS adverse (sentinelle enemy_hero)", () => {
    const s = mkState();
    const next = applyAction(s, play(s, bearer(4), "enemy_hero"));
    expect(next.players[1].hero.hp).toBe(HERO_MAX_HP - 4);
    expect(next.players[0].hero.hp).toBe(HERO_MAX_HP);
  });

  it("peut cibler son PROPRE héros (sentinelle friendly_hero)", () => {
    const s = mkState();
    const next = applyAction(s, play(s, bearer(3), "friendly_hero"));
    expect(next.players[0].hero.hp).toBe(HERO_MAX_HP - 3);
    expect(next.players[1].hero.hp).toBe(HERO_MAX_HP);
  });

  it("cible morte (X ≥ PV) → la créature meurt et va au cimetière", () => {
    const s = mkState();
    const enemy = mkInstance(mkCard({ name: "Fragile", attack: 1, health: 2 }));
    s.players[1].board.push(enemy);
    const next = applyAction(s, play(s, bearer(3), enemy.instanceId));
    expect(next.players[1].board.some(c => c.card.name === "Fragile")).toBe(false);
    expect(next.players[1].graveyard.some(c => c.card.name === "Fragile")).toBe(true);
  });
});

describe("Impact X — pool de cibles (tout bord + héros)", () => {
  it("impactTargetIds = créatures des deux plateaux + les deux sentinelles héros", () => {
    const s = mkState();
    const a = mkInstance(mkCard({ name: "A" }));
    const b = mkInstance(mkCard({ name: "B" }));
    s.players[0].board.push(a);
    s.players[1].board.push(b);
    const ids = impactTargetIds(s.players[0], s.players[1]);
    expect(ids).toContain(a.instanceId);
    expect(ids).toContain(b.instanceId);
    expect(ids).toContain("enemy_hero");
    expect(ids).toContain("friendly_hero");
  });

  it("exclut les créatures invisibles / ombre non révélée", () => {
    const s = mkState();
    const inv = mkInstance(mkCard({ name: "Invi", keywords: ["invisible"] }));
    s.players[1].board.push(inv);
    const ids = impactTargetIds(s.players[0], s.players[1]);
    expect(ids).not.toContain(inv.instanceId);
  });
});
