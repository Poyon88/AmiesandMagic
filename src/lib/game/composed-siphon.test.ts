// SIPHON en effet composé : les dégâts de `deal_damage`, plus un soin du héros.
//
// Arbitrages de l'auteur (2026-11-07), verrouillés ici :
//   1. X PV par cible touchée ; 1 par point en répartition, soit X au total ;
//   2. toujours X, même si le coup est absorbé, comme le Siphon d'action ;
//   3. mêmes cibles que les dégâts composés ;
//   4. le menu des sorts insère désormais cette forme composée, les cartes en
//      base gardent la leur.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { composedIcon, describeComposedCap } from "./composed-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { buildSpellEffectCatalog } from "@/lib/card-forge/spell-effect-catalog";
import type { Capability, CapabilityTrigger, CardInstance, ComposedEffect, GameAction, GameState, SpellKeywordInstance, TargetSpec } from "./types";

const cible = (t: Partial<TargetSpec> = {}): TargetSpec =>
  ({ entity: "unit", count: 1, side: "enemy", location: "board", designation: "random", ...t }) as TargetSpec;
const effet = (x: number, t: Partial<TargetSpec> = {}, extra: Partial<ComposedEffect> = {}): ComposedEffect =>
  ({ content: "siphon", magnitude: { x }, target: cible(t), ...extra });
const cap = (trigger: CapabilityTrigger, composed: ComposedEffect): Capability =>
  ({ uid: "s0", trigger, effectKind: "immediate", abilityId: "_composed", targets: [], composed });

const sort = (composed: ComposedEffect) => mkInstance(mkCard({
  name: "Sort", card_type: "spell", mana_cost: 0, attack: null, health: null,
  capabilities: [cap("spell_resolution", composed)],
}));
const unite = (name = "Unité", health = 9, extra: Record<string, unknown> = {}) =>
  mkInstance(mkCard({ name, mana_cost: 0, attack: 1, health, ...extra }));

function etat(ennemis: CardInstance[], hp = 20): GameState {
  const s = mkState();
  s.players[0].hero.hp = hp;
  s.players[1].board.push(...ennemis);
  return s;
}
function lancer(s: GameState, ci: CardInstance): GameState {
  s.players[0].hand.push(ci);
  return applyAction(s, { type: "play_card", cardInstanceId: ci.instanceId } as GameAction);
}
const pv = (st: GameState) => st.players[0].hero.hp;

describe("le soin", () => {
  it("cible unique : X dégâts, X PV rendus", () => {
    const e = unite();
    const st = lancer(etat([e]), sort(effet(3)));
    expect(st.players[1].board[0].currentHealth).toBe(6);
    expect(pv(st)).toBe(23);
  });

  it("plafonné aux PV max du héros", () => {
    expect(pv(lancer(etat([unite()], 29), sort(effet(3))))).toBe(30);
  });

  it("toutes les unités : X PV par unité touchée", () => {
    const st = lancer(etat([unite("A"), unite("B"), unite("C")]), sort(effet(2, { count: "all", designation: "automatic" })));
    expect(st.players[1].board.map(c => c.currentHealth)).toEqual([7, 7, 7]);
    expect(pv(st)).toBe(26);
  });

  it("répartition au hasard : X PV au total, comme les dégâts", () => {
    const st = lancer(etat([unite("A"), unite("B")]), sort(effet(4, { designation: "scatter" })));
    expect(st.players[1].board.reduce((n, c) => n + (9 - c.currentHealth), 0)).toBe(4);
    expect(pv(st)).toBe(24);
  });

  it("héros ennemi visé : dégâts et soin", () => {
    const st = lancer(etat([]), sort(effet(3, { entity: "hero" })));
    expect(st.players[1].hero.hp).toBe(27);
    expect(pv(st)).toBe(23);
  });

  it("2 cibles au hasard : X PV par cible", () => {
    const st = lancer(etat([unite("A"), unite("B"), unite("C")]), sort(effet(2, { count: 2 })));
    expect(pv(st)).toBe(24);
  });
});

describe("le Chant", () => {
  it("majore les dégâts et le soin ensemble", () => {
    const s = etat([unite()]);
    s.players[0].board.push(mkInstance(mkCard({ name: "Barde", attack: 1, health: 4, keywords: ["chant"] as never })));
    const ci = mkInstance(mkCard({
      name: "Hymne", card_type: "spell", mana_cost: 0, attack: null, health: null,
      capabilities: [
        { uid: "c0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "chant", params: { x: 1 } } as unknown as Capability,
        cap("spell_resolution", effet(2)),
      ],
    }));
    const st = lancer(s, ci);
    expect(st.players[1].board[0].currentHealth).toBe(6);
    expect(pv(st)).toBe(23);
  });
});

describe("un coup absorbé soigne quand même", () => {
  it("armure du héros", () => {
    const s = etat([]);
    s.players[1].hero.armor = 5;
    const st = lancer(s, sort(effet(3, { entity: "hero" })));
    expect(st.players[1].hero.hp).toBe(30);
    expect(pv(st)).toBe(23);
  });

  it("Bouclier divin", () => {
    const e = unite("Protégée", 9, { keywords: ["divine_shield"] });
    e.hasDivineShield = true;
    const st = lancer(etat([e]), sort(effet(3)));
    expect(st.players[1].board[0].currentHealth).toBe(9);
    expect(pv(st)).toBe(23);
  });
});

describe("les cas sans soin", () => {
  it("aucune cible : ni dégâts ni soin", () => {
    expect(pv(lancer(etat([]), sort(effet(3))))).toBe(20);
  });

  it("un objet visé ne soigne pas", () => {
    const s = etat([]);
    const objet = mkInstance(mkCard({ name: "Objet", card_type: "item", mana_cost: 0, attack: null, health: null }));
    s.players[1].board.push(objet);
    expect(pv(lancer(s, sort(effet(3, { entity: "item" }))))).toBe(20);
  });
});

describe("la cible tuée", () => {
  it("le soin part et la cible meurt", () => {
    const st = lancer(etat([unite("Fragile", 1)]), sort(effet(3)));
    expect(st.players[1].board).toHaveLength(0);
    expect(st.players[1].graveyard.some(c => c.card.name === "Fragile")).toBe(true);
    expect(pv(st)).toBe(23);
  });
});

describe("les provenances", () => {
  const porteuse = (trigger: CapabilityTrigger, composed = effet(2)) => unite("Porteuse", 9, { capabilities: [cap(trigger, composed)] });

  it("créature à l'entrée en jeu", () => {
    const st = lancer(etat([unite()]), porteuse("on_play"));
    expect(pv(st)).toBe(22);
  });

  it("créature à la fin du tour", () => {
    const s = etat([unite()]);
    s.players[0].board.push(porteuse("on_end_of_turn"));
    expect(pv(applyAction(s, { type: "end_turn" }))).toBe(22);
  });

  it("créature à l'attaque", () => {
    const s = etat([unite()]);
    const p = porteuse("on_attack");
    p.hasSummoningSickness = false;
    s.players[0].board.push(p);
    const st = applyAction(s, { type: "attack", attackerInstanceId: p.instanceId, targetInstanceId: "enemy_hero" } as GameAction);
    expect(pv(st)).toBe(22);
  });

  it("créature à l'activation", () => {
    const s = etat([unite()]);
    const p = porteuse("on_activation");
    p.hasSummoningSickness = false;
    s.players[0].board.push(p);
    const st = applyAction(s, { type: "tap_activate", sourceInstanceId: p.instanceId, instanceIdx: 0, composedUid: "s0" });
    expect(pv(st)).toBe(22);
  });

  it("créature à la mort : le soin va à son propriétaire", () => {
    const s = etat([]);
    const p = porteuse("on_death");
    p.currentHealth = 1;
    s.players[0].board.push(p);
    const tueuse = unite("Tueuse");
    tueuse.currentAttack = 5;
    tueuse.hasSummoningSickness = false;
    s.players[1].board.push(tueuse);
    s.currentPlayerIndex = 1;
    const st = applyAction(s, { type: "attack", attackerInstanceId: tueuse.instanceId, targetInstanceId: p.instanceId } as GameAction);
    expect(st.players[0].graveyard.some(c => c.card.name === "Porteuse")).toBe(true);
    expect(pv(st)).toBe(22);
  });
});

describe("l'affichage", () => {
  const phrase = (c: ComposedEffect) => describeComposedCap(cap("spell_resolution", c));

  it("cible unique", () => {
    expect(phrase(effet(2))).toContain("Inflige 2 dégâts");
    expect(phrase(effet(2))).toContain("et soigne votre héros de 2 PV.");
  });

  it("plusieurs cibles", () => {
    expect(phrase(effet(2, { count: "all", designation: "automatic" }))).toContain("de 2 PV par cible touchée.");
  });

  it("répartition", () => {
    expect(phrase(effet(3, { designation: "scatter" }))).toContain("de 3 PV au total.");
  });

  it("icône de Siphon", () => {
    expect(composedIcon(cap("on_play", effet(1))).keyword).toBe("spell_siphon");
  });
});

describe("le menu des sorts", () => {
  it("Siphon insère la forme composée", () => {
    const entree = buildSpellEffectCatalog(["siphon"]).find(e => e.id === "siphon");
    expect(entree?.kind).toBe("composed");
    expect(entree?.kind === "composed" && entree.preset.content).toBe("siphon");
  });
});

describe("le Siphon d'action existant", () => {
  it("reste résolu à l'identique", () => {
    const e = unite();
    const s = etat([e]);
    const ci = mkInstance(mkCard({
      name: "Ancien", card_type: "spell", mana_cost: 0, attack: null, health: null,
      spell_keywords: [{ id: "siphon", amount: 3 }] as SpellKeywordInstance[],
    }));
    s.players[0].hand.push(ci);
    const st = applyAction(s, { type: "play_card", cardInstanceId: ci.instanceId, targetInstanceId: e.instanceId } as GameAction);
    expect(st.players[1].board[0].currentHealth).toBe(6);
    expect(pv(st)).toBe(23);
  });
});
