// CANON X : X dégâts d'un bloc à UNE unité ennemie tirée au hasard.
//
// Arbitrages de l'auteur (2026-10-30), verrouillés ici :
//   1. jamais le héros, et rien du tout sans unité ennemie ;
//   2. Ombre / Invisible touchables — le hasard ne cible pas ;
//   3. deux faces comme Tempête : capacité de créature (préréglage composé
//      `canonPreset`) et vrai mot-clé d'action, sans cible à désigner ; un effet
//      composé de même forme est nommé Canon ;
//   4. l'objet passe Canon à son porteur (transfert), sans code dédié.
import { describe, expect, it } from "vitest";
import { applyAction, canonPreset, initRNG } from "./engine";
import { composedIcon, composedKeywordName } from "./composed-display";
import { buildSpellEffectCatalog } from "@/lib/card-forge/spell-effect-catalog";
import { ALL_SPELL_KEYWORDS, SPELL_KEYWORDS } from "./spell-keywords";
import { isItemAuthorable } from "./abilities";
import { HERO_MAX_HP } from "./constants";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, GameAction, GameState, Keyword, KeywordInstance, KeywordMode, SpellKeywordInstance } from "./types";

const ennemie = (name: string, health = 5, kws: string[] = []) =>
  mkInstance(mkCard({ name, attack: 1, health, keywords: kws as Keyword[] }));

function canonniere(x: number, mode?: KeywordMode) {
  const c = mkInstance(mkCard({
    name: "Canonnière", mana_cost: 0, attack: 1, health: 5, keywords: ["canon"],
    keyword_instances: [{ id: "canon", x, ...(mode ? { mode } : {}) } as KeywordInstance],
  }));
  c.hasSummoningSickness = false;
  return c;
}

function jouer(s: GameState, ci: CardInstance): GameState {
  s.players[0].hand.push(ci);
  return applyAction(s, { type: "play_card", cardInstanceId: ci.instanceId } as GameAction);
}

/** PV perdus par chaque unité ennemie. */
const pertes = (st: GameState) => st.players[1].board.map(c => c.maxHealth - c.currentHealth);

describe("forme CRÉATURE — à l'entrée en jeu", () => {
  it("UNE seule unité ennemie prend les X dégâts, d'un bloc", () => {
    const s = mkState();
    s.players[1].board.push(ennemie("A"), ennemie("B"), ennemie("C"));
    const st = jouer(s, canonniere(3));
    expect([...pertes(st)].sort()).toEqual([0, 0, 3]);
  });

  it("jamais le héros", () => {
    const s = mkState();
    s.players[1].board.push(ennemie("A", 10));
    const st = jouer(s, canonniere(3));
    expect(st.players[1].hero.hp).toBe(HERO_MAX_HP);
  });

  it("aucune unité ennemie ⇒ rien, ni héros ni alliée", () => {
    const s = mkState();
    s.players[0].board.push(ennemie("Alliée"));
    const st = jouer(s, canonniere(3));
    expect(st.players[1].hero.hp).toBe(HERO_MAX_HP);
    expect(st.players[0].board.every(c => c.currentHealth === c.maxHealth)).toBe(true);
  });

  it("une unité dans l'OMBRE peut être touchée (seule cible possible)", () => {
    const s = mkState();
    s.players[1].board.push(ennemie("Tapie", 5, ["ombre"]));
    const st = jouer(s, canonniere(2));
    expect(pertes(st)).toEqual([2]);
  });

  it("une unité tuée part au cimetière", () => {
    const s = mkState();
    s.players[1].board.push(ennemie("Frêle", 2));
    const st = jouer(s, canonniere(3));
    expect(st.players[1].board).toHaveLength(0);
    expect(st.players[1].graveyard.map(c => c.card.name)).toContain("Frêle");
  });

  it("même graine ⇒ même cible", () => {
    const tir = () => {
      initRNG(42);
      const s = mkState();
      s.rngState = 42;
      s.players[1].board.push(ennemie("A"), ennemie("B"), ennemie("C"), ennemie("D"));
      return pertes(jouer(s, canonniere(3)));
    };
    expect(tir()).toEqual(tir());
  });
});

describe("forme CRÉATURE — autres déclencheurs", () => {
  it("à l'attaque", () => {
    const s = mkState();
    const c = canonniere(2, "attack");
    s.players[0].board.push(c);
    s.players[1].board.push(ennemie("A", 9));
    const st = applyAction(s, { type: "attack", attackerInstanceId: c.instanceId, targetInstanceId: "enemy_hero" } as GameAction);
    expect(pertes(st)).toEqual([2]);
  });

  it("à l'activation", () => {
    const s = mkState();
    const c = canonniere(4, "tap");
    s.players[0].board.push(c);
    s.players[1].board.push(ennemie("A", 9));
    const st = applyAction(s, { type: "tap_activate", sourceInstanceId: c.instanceId, instanceIdx: 0 } as GameAction);
    expect(pertes(st)).toEqual([4]);
    expect(st.players[0].board[0].tapped).toBe(true);
  });

  it("en fin de tour", () => {
    const s = mkState();
    s.players[0].board.push(canonniere(1, "end_of_turn"));
    s.players[1].board.push(ennemie("A", 9));
    const st = applyAction(s, { type: "end_turn" });
    expect(pertes(st)).toEqual([1]);
  });

  it("à la mort, la source au cimetière tire quand même", () => {
    const s = mkState();
    const c = canonniere(3, "death");
    c.currentHealth = 1;
    s.players[0].board.push(c);
    s.players[1].board.push(ennemie("A", 9));
    const sort = mkInstance(mkCard({
      name: "Purge", card_type: "spell", mana_cost: 0, attack: null, health: null,
      capabilities: [{ uid: "p", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
        composed: { content: "deal_damage", magnitude: { x: 1 }, target: { entity: "unit", count: "all", side: "ally", location: "board", designation: "automatic" } } }],
    }));
    const st = jouer(s, sort);
    expect(st.players[0].graveyard.some(g => g.card.name === "Canonnière")).toBe(true);
    expect(pertes(st)).toEqual([3]);
  });
});

describe("forme OBJET — transférée au porteur", () => {
  it("Canon est autorisée sur un objet", () => {
    expect(isItemAuthorable("canon")).toBe(true);
  });

  it("le porteur équipé tire à l'attaque", () => {
    const s = mkState();
    const porteur = mkInstance(mkCard({ name: "Porteur", mana_cost: 0, attack: 1, health: 5, faction: "Humains" }));
    porteur.hasSummoningSickness = false;
    const objet = mkInstance(mkCard({
      name: "Couleuvrine", card_type: "item", mana_cost: 0, attack: 0, health: 0, faction: "Humains",
      keywords: ["canon"], keyword_instances: [{ id: "canon", x: 2, mode: "attack" } as KeywordInstance],
    }));
    s.players[0].board.push(porteur);
    s.players[0].items = [objet];
    s.players[1].board.push(ennemie("A", 9));
    const arme = applyAction(s, { type: "equip_item", itemInstanceId: objet.instanceId, targetInstanceId: porteur.instanceId } as GameAction);
    const st = applyAction(arme, { type: "attack", attackerInstanceId: porteur.instanceId, targetInstanceId: "enemy_hero" } as GameAction);
    expect(pertes(st)).toEqual([2]);
  });
});

describe("forme ACTION — mot-clé d'action", () => {
  const sortCanon = (amount: number, extra: SpellKeywordInstance[] = []) => mkInstance(mkCard({
    name: "Bordée", card_type: "spell", mana_cost: 0, attack: null, health: null,
    spell_keywords: [{ id: "canon", amount }, ...extra] as SpellKeywordInstance[],
  }));

  it("vrai mot-clé d'action, sans cible à désigner", () => {
    expect(SPELL_KEYWORDS.canon.needsTarget).toBe(false);
    expect(SPELL_KEYWORDS.canon.params).toEqual(["amount"]);
  });

  it("proposé tel quel dans la forge (« + Effet : »), pas en effet composé", () => {
    const entree = buildSpellEffectCatalog(ALL_SPELL_KEYWORDS).filter(e => e.id === "canon");
    expect(entree.map(e => e.kind)).toEqual(["curated"]);
  });

  it("une seule unité ennemie prend tout, jamais le héros", () => {
    const s = mkState();
    s.players[1].board.push(ennemie("A"), ennemie("B"));
    const st = jouer(s, sortCanon(3));
    expect([...pertes(st)].sort()).toEqual([0, 3]);
    expect(st.players[1].hero.hp).toBe(HERO_MAX_HP);
  });

  it("aucune unité ennemie ⇒ rien", () => {
    const st = jouer(mkState(), sortCanon(3));
    expect(st.players[1].hero.hp).toBe(HERO_MAX_HP);
  });

  it("une unité dans l'OMBRE peut être touchée", () => {
    const s = mkState();
    s.players[1].board.push(ennemie("Tapie", 5, ["ombre"]));
    expect(pertes(jouer(s, sortCanon(2)))).toEqual([2]);
  });

  it("Transcendance (immunité aux sorts) est écartée du tirage", () => {
    // Sur 20 graines : le tir ne se perd JAMAIS sur l'unité immunisée.
    for (let graine = 1; graine <= 20; graine++) {
      const s = mkState();
      s.rngState = graine;
      s.players[1].board.push(ennemie("Sainte", 5, ["transcendance"]), ennemie("Mortelle"));
      const st = jouer(s, sortCanon(2));
      expect(st.players[1].board.map(c => [c.card.name, c.maxHealth - c.currentHealth]))
        .toEqual([["Sainte", 0], ["Mortelle", 2]]);
    }
  });

  it("Précision perce la Résistance, comme pour Tempête", () => {
    const s = mkState();
    s.players[1].board.push(ennemie("Cuirassée", 5, ["resistance"]));
    const sans = pertes(jouer(s, sortCanon(3)))[0];
    const s2 = mkState();
    s2.players[1].board.push(ennemie("Cuirassée", 5, ["resistance"]));
    const avec = pertes(jouer(s2, sortCanon(3, [{ id: "precision" } as SpellKeywordInstance])))[0];
    expect(sans).toBe(2); // Résistance 1 par défaut
    expect(avec).toBe(3);
  });
});

describe("forme COMPOSÉE — reconnue et nommée", () => {
  it("la forme est reconnue et nommée « Canon »", () => {
    const cap = { uid: "c", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", composed: canonPreset(2) } as Capability;
    expect(composedIcon(cap)).toEqual({ symbol: "💣", keyword: "canon" });
    expect(composedKeywordName(cap)).toBe("Canon");
  });

  it("un composé de cette forme touche une seule unité ennemie", () => {
    const s = mkState();
    s.players[1].board.push(ennemie("A"), ennemie("B"));
    const sort = mkInstance(mkCard({
      name: "Salve", card_type: "spell", mana_cost: 0, attack: null, health: null,
      capabilities: [{ uid: "c", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", composed: canonPreset(3) } as Capability],
    }));
    expect([...pertes(jouer(s, sort))].sort()).toEqual([0, 3]);
  });

  it("les autres dégâts au hasard restent Tempête", () => {
    const deux = { uid: "t", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
      composed: { ...canonPreset(1), target: { ...canonPreset(1).target!, count: 2 } } } as Capability;
    expect(composedIcon(deux).keyword).toBe("spell_tempete");
  });
});
