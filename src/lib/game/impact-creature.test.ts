// Impact X : inflige X dégâts à une unité ou au héros ENNEMI. Viser ses alliés
// passe par un effet composé. On exerce l'offre de cibles de chaque chemin. Le
// résolveur, lui, accepte encore un allié : les anciens journaux doivent se
// rejouer à l'identique.
import { describe, expect, it } from "vitest";
import { applyAction, getCreatureTargets, getHeroPowerTargets, getSpellTargets, getTapActivateTargets, impactTargetIds } from "./engine";
import { spellScopes, creatureScopes } from "./target-scope";
import { HERO_MAX_HP } from "./constants";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, GameAction, HeroDefinition } from "./types";

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

  it("journal ancien : un Impact sur un ALLIÉ se rejoue à l'identique", () => {
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

  it("journal ancien : un Impact sur son PROPRE héros se rejoue à l'identique", () => {
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

describe("Impact X — pool de cibles (ennemis seulement)", () => {
  it("impactTargetIds = unités ennemies + héros ennemi, jamais d'allié", () => {
    const s = mkState();
    const a = mkInstance(mkCard({ name: "A" }));
    const b = mkInstance(mkCard({ name: "B" }));
    s.players[0].board.push(a);
    s.players[1].board.push(b);
    const ids = impactTargetIds(s.players[0], s.players[1]);
    expect(ids).toEqual([b.instanceId, "enemy_hero"]);
    expect(ids).not.toContain(a.instanceId);
  });

  it("plateau ennemi vide : le héros adverse reste proposé", () => {
    const s = mkState();
    s.players[0].board.push(mkInstance(mkCard({ name: "Allie" })));
    expect(impactTargetIds(s.players[0], s.players[1])).toEqual(["enemy_hero"]);
  });

  it("chaque chemin n'offre que l'ennemi : entrée, activation, action, pouvoir de héros", () => {
    const s = mkState();
    const allie = mkInstance(mkCard({ name: "Allie" }));
    const ennemi = mkInstance(mkCard({ name: "Ennemi" }));
    s.players[0].board.push(allie);
    s.players[1].board.push(ennemi);
    const attendu = [ennemi.instanceId, "enemy_hero"].sort();
    const sort = mkCard({ card_type: "spell", attack: null, health: null, spell_keywords: [{ id: "impact", amount: 2 }] });
    const heros = { id: 1, name: "H", powerEffect: { mode: "spell_trigger", keywordId: "impact", params: { amount: 1 } } } as unknown as HeroDefinition;
    expect([...getCreatureTargets(s, bearer(1).card)].sort()).toEqual(attendu);
    expect([...(getTapActivateTargets(s, "impact") ?? [])].sort()).toEqual(attendu);
    expect([...getSpellTargets(s, sort, "enemy_any")].sort()).toEqual(attendu);
    expect([...getHeroPowerTargets(s, heros)].sort()).toEqual(attendu);
  });

  it("mode attaque : le tirage au hasard ne touche jamais un allié", () => {
    for (let graine = 0; graine < 20; graine++) {
      const s = mkState();
      s.rngState = graine + 1;
      const porteur = mkInstance(mkCard({
        name: "Assaillant", attack: 1, health: 5, keywords: ["impact"],
        keyword_instances: [{ id: "impact", x: 1, mode: "attack" }], effect_text: "[Impact 1]",
      }));
      porteur.hasSummoningSickness = false;
      const allie = mkInstance(mkCard({ name: "Allie", attack: 0, health: 5 }));
      s.players[0].board.push(porteur, allie);
      const n = applyAction(s, { type: "attack", attackerInstanceId: porteur.instanceId, targetInstanceId: "enemy_hero" });
      expect(n.players[0].board.find(c => c.card.name === "Allie")!.currentHealth).toBe(5);
      expect(n.players[0].hero.hp).toBe(HERO_MAX_HP);
      // Sans unité ennemie, l'Impact n'a que le héros : 1 (attaque) + 1 (Impact).
      expect(n.players[1].hero.hp).toBe(HERO_MAX_HP - 2);
    }
  });

  it("le composé garde l'accès aux alliés (dégâts, unité ou héros, tous camps)", () => {
    const s = mkState();
    const allie = mkInstance(mkCard({ name: "Allie" }));
    s.players[0].board.push(allie);
    const sort = mkCard({
      card_type: "spell", attack: null, health: null,
      capabilities: [{ uid: "c", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
        composed: { content: "deal_damage", magnitude: { x: 2 }, target: { entity: "both", side: "any", count: 1, location: "board", designation: "choice" } } }],
    } as Partial<Card>);
    const ids = getSpellTargets(s, sort, "any");
    expect(ids).toContain(allie.instanceId);
    expect(ids).toContain("friendly_hero");
  });

  it("portée « toutes » : les ennemies seulement, créature comme action", () => {
    expect(spellScopes("impact")).toEqual(["all_enemies"]);
    expect(creatureScopes("impact")).toEqual(["all_enemies"]);
  });

  it("exclut les créatures invisibles / ombre non révélée", () => {
    const s = mkState();
    const inv = mkInstance(mkCard({ name: "Invi", keywords: ["invisible"] }));
    s.players[1].board.push(inv);
    const ids = impactTargetIds(s.players[0], s.players[1]);
    expect(ids).not.toContain(inv.instanceId);
  });
});
