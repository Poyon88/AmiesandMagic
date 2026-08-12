// Préincanter X : au déclenchement, le PREMIER sort du deck du contrôleur en
// partant du dessus (les créatures au-dessus sont sautées) coûte X mana de
// moins, de façon PERMANENTE, via manaCostReduction — écrêté À LA SOURCE pour
// que le coût effectif ne descende jamais sous 1. Un sort déjà à coût
// effectif ≤ 1 consomme l'effet sans changement (on ne passe PAS au suivant).
// Silencieux, cumulable jusqu'au plancher. Unités (tous déclencheurs) et
// sorts (à la résolution).
import { describe, expect, it } from "vitest";
import { playCard, attack, applyAction, effectiveManaCost } from "./engine";
import type { Card } from "./types";
import { mkCard, mkInstance, mkState } from "./test-harness";

function creature(name: string, attack = 2, health = 2, extra: Partial<Card> = {}): Card {
  return mkCard({ name, attack, health, mana_cost: 0, ...extra });
}

function spellCard(name: string, manaCost: number, extra: Partial<Card> = {}): Card {
  return mkCard({ name, card_type: "spell", attack: null, health: null, mana_cost: manaCost, ...extra });
}

function preincanteur(x: number, mode?: "death" | "end_of_turn") {
  return mkInstance(creature("Préincanteur", 2, 2, {
    keywords: ["preincanter"] as never,
    keyword_instances: [{ id: "preincanter", x, ...(mode ? { mode } : {}) } as never],
  }));
}

describe("Préincanter — invocation (on_play)", () => {
  it("réduit le PREMIER sort du deck, en sautant les créatures au-dessus", () => {
    const s = mkState();
    const creatureDessus = mkInstance(creature("Créature du dessus"));
    const cible = mkInstance(spellCard("Cible", 4));
    const sortProfond = mkInstance(spellCard("Profond", 4));
    s.players[0].deck = [creatureDessus, cible, sortProfond];

    const src = preincanteur(2);
    s.players[0].hand.push(src);
    const next = playCard(s, { type: "play_card", cardInstanceId: src.instanceId });

    expect(next.players[0].deck.find((d) => d.card.name === "Cible")!.manaCostReduction).toBe(2);
    expect(next.players[0].deck.find((d) => d.card.name === "Profond")!.manaCostReduction).toBe(0);
    expect(next.players[0].deck.find((d) => d.card.name === "Créature du dessus")!.manaCostReduction).toBe(0);
  });

  it("PLANCHER : la réduction est écrêtée pour que le coût effectif reste ≥ 1", () => {
    const s = mkState();
    s.players[0].deck = [mkInstance(spellCard("Cible", 3))];
    const src = preincanteur(5);
    s.players[0].hand.push(src);

    const next = playCard(s, { type: "play_card", cardInstanceId: src.instanceId });

    // Coût 3, X=5 → réduction 2 seulement (effectif 1).
    expect(next.players[0].deck[0].manaCostReduction).toBe(2);
  });

  it("un sort à coût 1 (et à coût 0) consomme l'effet SANS changement", () => {
    for (const cost of [1, 0]) {
      const s = mkState();
      s.players[0].deck = [mkInstance(spellCard("Petit sort", cost))];
      const src = preincanteur(3);
      s.players[0].hand.push(src);

      const next = playCard(s, { type: "play_card", cardInstanceId: src.instanceId });

      expect(next.players[0].deck[0].manaCostReduction).toBe(0);
    }
  });

  it("est CUMULABLE jusqu'au plancher, sans jamais passer au sort suivant", () => {
    const s = mkState();
    s.players[0].deck = [mkInstance(spellCard("Cible", 3)), mkInstance(spellCard("Suivant", 5))];
    const a = preincanteur(1), b = preincanteur(1), c = preincanteur(1);
    s.players[0].hand.push(a, b, c);

    let next = playCard(s, { type: "play_card", cardInstanceId: a.instanceId });
    next = playCard(next, { type: "play_card", cardInstanceId: b.instanceId });
    expect(next.players[0].deck[0].manaCostReduction).toBe(2); // 3 → effectif 1

    next = playCard(next, { type: "play_card", cardInstanceId: c.instanceId });
    // Le 3e est consommé sans effet — et le sort SUIVANT n'est pas touché.
    expect(next.players[0].deck[0].manaCostReduction).toBe(2);
    expect(next.players[0].deck[1].manaCostReduction).toBe(0);
  });

  it("deck sans sort → effet perdu sans bruit", () => {
    const s = mkState();
    s.players[0].deck = [mkInstance(creature("Que des créatures"))];
    const src = preincanteur(2);
    s.players[0].hand.push(src);

    const next = playCard(s, { type: "play_card", cardInstanceId: src.instanceId });

    expect(next.players[0].board.some((c) => c.card.name === "Préincanteur")).toBe(true);
    expect(next.players[0].deck[0].manaCostReduction).toBe(0);
  });
});

describe("Préincanter — la réduction voyage avec la carte", () => {
  it("le sort pioché arrive en main au coût réduit et se joue à ce coût", () => {
    const s = mkState();
    s.players[0].deck = [mkInstance(spellCard("Éclair", 4)), mkInstance(creature("Suivante"))];
    const src = preincanteur(2);
    s.players[0].hand.push(src);
    let next = playCard(s, { type: "play_card", cardInstanceId: src.instanceId });

    // P1 repioche l'Éclair au début de son tour 2.
    next = applyAction(next, { type: "end_turn" });
    next = applyAction(next, { type: "end_turn" });
    const eclair = next.players[0].hand.find((c) => c.card.name === "Éclair")!;
    expect(eclair.manaCostReduction).toBe(2);
    expect(effectiveManaCost(eclair, next.players[0])).toBe(2); // 4 − 2

    const manaAvant = next.players[0].mana;
    next = playCard(next, { type: "play_card", cardInstanceId: eclair.instanceId });
    expect(next.players[0].mana).toBe(manaAvant - 2);
  });

  it("interaction Canalisation : un sort préincanté à 1 reste à 1", () => {
    const s = mkState();
    const sort = mkInstance(spellCard("Éclair", 3));
    sort.manaCostReduction = 2; // préincanté au plancher (effectif 1)
    s.players[0].hand.push(sort);
    s.players[0].board.push(mkInstance(creature("Canaliseuse", 1, 1, { keywords: ["canalisation"] as never })));

    expect(effectiveManaCost(sort, s.players[0])).toBe(1);
  });
});

describe("Préincanter — autres déclencheurs et forme sort", () => {
  it("mode death : réduit le deck du CONTRÔLEUR de la créature qui meurt", () => {
    const s = mkState();
    const attaquant = mkInstance(creature("Attaquant", 5, 5));
    s.players[0].board.push(attaquant);
    const defenseur = preincanteur(2, "death");
    s.players[1].board.push(defenseur);
    s.players[1].deck = [mkInstance(spellCard("Cible", 4))];

    const next = attack(s, { type: "attack", attackerInstanceId: attaquant.instanceId, targetInstanceId: defenseur.instanceId });

    expect(next.players[1].board.find((c) => c.card.name === "Préincanteur")).toBeUndefined();
    expect(next.players[1].deck[0].manaCostReduction).toBe(2);
  });

  it("mode end_of_turn : réduit à chaque fin de tour du contrôleur", () => {
    const s = mkState();
    s.players[0].board.push(preincanteur(1, "end_of_turn"));
    s.players[0].deck = [mkInstance(spellCard("Cible", 4))];

    const next = applyAction(s, { type: "end_turn" });

    expect(next.players[0].deck[0].manaCostReduction).toBe(1);
  });

  it("forme SORT : réduit le 1er sort du deck du lanceur", () => {
    const s = mkState();
    s.players[0].deck = [mkInstance(spellCard("Cible", 4))];
    const sort = mkInstance(spellCard("Préincantation", 1, {
      spell_keywords: [{ id: "preincanter", amount: 2 }] as never,
    }));
    s.players[0].hand.push(sort);

    const next = playCard(s, { type: "play_card", cardInstanceId: sort.instanceId });

    expect(next.players[0].deck[0].manaCostReduction).toBe(2);
  });
});
