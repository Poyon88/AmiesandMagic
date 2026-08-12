// Fortifier +X/+Y : au déclenchement, +X ATK / +Y PV PERMANENT à la PREMIÈRE
// créature du deck du contrôleur en partant du dessus (deck[0] = dessus, les
// sorts au-dessus sont sautés). Silencieux, cumulable, perdu si le deck n'a
// plus de créature. Utilisable par unités (tous déclencheurs) et par sorts
// (une fois à la résolution).
import { describe, expect, it } from "vitest";
import { playCard, attack, applyAction } from "./engine";
import type { Card } from "./types";
import { mkCard, mkInstance, mkState } from "./test-harness";

function creature(name: string, attack = 2, health = 2, extra: Partial<Card> = {}): Card {
  return mkCard({ name, attack, health, mana_cost: 0, ...extra });
}

function spellCard(name: string, extra: Partial<Card> = {}): Card {
  return mkCard({ name, card_type: "spell", attack: null, health: null, mana_cost: 2, ...extra });
}

/** Source Fortifier x/y, mode optionnel. */
function fortifieur(x: number, y: number, mode?: "death" | "end_of_turn" | "attack") {
  return mkInstance(creature("Fortifieur", 2, 2, {
    keywords: ["fortifier"] as never,
    keyword_instances: [{ id: "fortifier", x, y, ...(mode ? { mode } : {}) } as never],
  }));
}

describe("Fortifier — invocation (on_play)", () => {
  it("buffe la PREMIÈRE créature du deck, en sautant les sorts au-dessus", () => {
    const s = mkState();
    const sortDessus = mkInstance(spellCard("Sort du dessus"));
    const cible = mkInstance(creature("Cible", 2, 3));
    const profonde = mkInstance(creature("Profonde", 1, 1));
    s.players[0].deck = [sortDessus, cible, profonde];

    const src = fortifieur(2, 3);
    s.players[0].hand.push(src);
    const next = playCard(s, { type: "play_card", cardInstanceId: src.instanceId });

    const c = next.players[0].deck.find((d) => d.card.name === "Cible")!;
    expect(c.card.attack).toBe(4);
    expect(c.currentAttack).toBe(4);
    expect(c.currentHealth).toBe(6);
    expect(c.maxHealth).toBe(6);
    // Le sort au-dessus et la créature plus profonde sont intacts.
    expect(next.players[0].deck.find((d) => d.card.name === "Profonde")!.currentAttack).toBe(1);
    expect(next.players[0].deck.find((d) => d.card.name === "Sort du dessus")!.card.attack ?? null).toBeNull();
  });

  it("deck sans créature → effet perdu sans bruit", () => {
    const s = mkState();
    s.players[0].deck = [mkInstance(spellCard("Que des sorts"))];
    const src = fortifieur(2, 2);
    s.players[0].hand.push(src);

    const next = playCard(s, { type: "play_card", cardInstanceId: src.instanceId });

    expect(next.players[0].board.some((c) => c.card.name === "Fortifieur")).toBe(true);
    expect(next.players[0].deck).toHaveLength(1); // rien n'a bougé
  });

  it("ne FUIT PAS aux autres exemplaires partageant le même objet Card", () => {
    const s = mkState();
    // Deux exemplaires construits sur le MÊME objet Card (comme createDeckInstances).
    const shared = creature("Jumelle", 2, 2);
    const ex1 = mkInstance(shared);
    const ex2 = mkInstance(shared);
    s.players[0].deck = [ex1, ex2];
    const src = fortifieur(3, 3);
    s.players[0].hand.push(src);

    const next = playCard(s, { type: "play_card", cardInstanceId: src.instanceId });

    const [premier, second] = next.players[0].deck;
    expect(premier.card.attack).toBe(5);
    expect(premier.currentAttack).toBe(5);
    expect(second.card.attack).toBe(2); // le spread a isolé la carte buffée
    expect(second.currentAttack).toBe(2);
  });

  it("est CUMULABLE : deux déclenchements s'empilent sur la même carte", () => {
    const s = mkState();
    s.players[0].deck = [mkInstance(creature("Cible", 1, 1))];
    const a = fortifieur(1, 2);
    const b = fortifieur(2, 1);
    s.players[0].hand.push(a, b);

    let next = playCard(s, { type: "play_card", cardInstanceId: a.instanceId });
    next = playCard(next, { type: "play_card", cardInstanceId: b.instanceId });

    const cible = next.players[0].deck[0];
    expect(cible.currentAttack).toBe(4); // 1 + 1 + 2
    expect(cible.maxHealth).toBe(4);     // 1 + 2 + 1
  });

  it("le buff PERSISTE quand la carte est piochée puis jouée", () => {
    const s = mkState();
    s.players[0].deck = [mkInstance(creature("Promue", 2, 2)), mkInstance(creature("Suivante", 1, 1))];
    const src = fortifieur(2, 2);
    s.players[0].hand.push(src);
    let next = playCard(s, { type: "play_card", cardInstanceId: src.instanceId });

    // Fin de tour aller-retour : P1 repioche la Promue au début de son tour 2.
    next = applyAction(next, { type: "end_turn" });
    next = applyAction(next, { type: "end_turn" });
    const enMain = next.players[0].hand.find((c) => c.card.name === "Promue")!;
    expect(enMain.currentAttack).toBe(4);

    next = playCard(next, { type: "play_card", cardInstanceId: enMain.instanceId });
    const surPlateau = next.players[0].board.find((c) => c.card.name === "Promue")!;
    expect(surPlateau.currentAttack).toBe(4);
    expect(surPlateau.maxHealth).toBe(4);
  });
});

describe("Fortifier — autres déclencheurs", () => {
  it("mode death : buffe le deck du CONTRÔLEUR de la créature qui meurt", () => {
    const s = mkState();
    const attaquant = mkInstance(creature("Attaquant", 5, 5));
    s.players[0].board.push(attaquant);

    const defenseur = fortifieur(2, 2, "death");
    s.players[1].board.push(defenseur);
    s.players[1].deck = [mkInstance(creature("Héritière", 2, 2))];

    const next = attack(s, { type: "attack", attackerInstanceId: attaquant.instanceId, targetInstanceId: defenseur.instanceId });

    expect(next.players[1].board.find((c) => c.card.name === "Fortifieur")).toBeUndefined(); // mort
    const h = next.players[1].deck[0];
    expect(h.currentAttack).toBe(4);
    expect(h.maxHealth).toBe(4);
  });

  it("mode end_of_turn : buffe à chaque fin de tour du contrôleur", () => {
    const s = mkState();
    s.players[0].board.push(fortifieur(1, 1, "end_of_turn"));
    s.players[0].deck = [mkInstance(creature("Cible", 2, 2))];

    const next = applyAction(s, { type: "end_turn" });

    const c = next.players[0].deck.find((d) => d.card.name === "Cible")!;
    expect(c.currentAttack).toBe(3);
    expect(c.maxHealth).toBe(3);
  });
});

describe("Fortifier — sort (spell_resolution)", () => {
  it("buffe la 1re créature du deck du LANCEUR, sans cible", () => {
    const s = mkState();
    s.players[0].deck = [mkInstance(spellCard("Sort du dessus")), mkInstance(creature("Cible", 2, 2))];
    const sort = mkInstance(spellCard("Fortification", {
      spell_keywords: [{ id: "fortifier", attack: 2, health: 3 }] as never,
    }));
    s.players[0].hand.push(sort);

    const next = playCard(s, { type: "play_card", cardInstanceId: sort.instanceId });

    const c = next.players[0].deck.find((d) => d.card.name === "Cible")!;
    expect(c.currentAttack).toBe(4);
    expect(c.maxHealth).toBe(5);
    expect(c.currentHealth).toBe(5);
  });
});
