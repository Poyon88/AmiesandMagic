// Invocation X : invoque une créature aléatoire de coût EXACTEMENT X issue de
// la collection du joueur (communes + éditions limitées possédées), du même
// alignement que la source, légale dans le format du match. Couvre les deux
// faces (sort + créature à l'invocation), le repli legacy (ex-« Invocation
// X/Y » token : attack devient le coût), le filtre d'alignement, la
// possession des éditions limitées, la légalité de format et le no-op quand
// aucun candidat n'existe au coût exact.
import { describe, expect, it } from "vitest";
import { playCard } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, FormatCode } from "./types";

// Elfes = alignement « bon », Humains = « neutre » (cf. FACTIONS).
function poolCreature(partial: Partial<Card>): Card {
  return mkCard({ card_type: "creature", faction: "Elfes", rarity: "Commune", attack: 2, health: 2, ...partial });
}

function mkInvocationSpell(x: number) {
  return mkInstance(mkCard({
    mana_cost: 0, card_type: "spell", attack: null as unknown as number, health: null as unknown as number,
    faction: "Elfes",
    spell_keywords: [{ id: "invocation", amount: x }],
  }));
}

function withPool(pool: Card[], formatCode: FormatCode | null = null) {
  const s = mkState();
  s.factionCardPool = pool;
  s.formatCode = formatCode;
  return s;
}

describe("Invocation X — sort", () => {
  it("invoque une créature commune de coût exactement X et du même alignement", () => {
    const c4 = poolCreature({ name: "Cible4", mana_cost: 4 });
    const s = withPool([
      c4,
      poolCreature({ name: "Cout3", mana_cost: 3 }),
      poolCreature({ name: "Neutre4", mana_cost: 4, faction: "Humains" }), // autre alignement
    ]);
    const spell = mkInvocationSpell(4);
    s.players[0].hand.push(spell);

    const next = playCard(s, { type: "play_card", cardInstanceId: spell.instanceId });

    expect(next.players[0].board.length).toBe(1);
    expect(next.players[0].board[0].card.name).toBe("Cible4");
    expect(next.players[0].board[0].hasSummoningSickness).toBe(true);
  });

  it("ne fait rien si aucune créature n'a un coût exactement égal à X (pas de repli ≤ X)", () => {
    const s = withPool([
      poolCreature({ name: "Cout3", mana_cost: 3 }),
      poolCreature({ name: "Cout5", mana_cost: 5 }),
    ]);
    const spell = mkInvocationSpell(4);
    s.players[0].hand.push(spell);

    const next = playCard(s, { type: "play_card", cardInstanceId: spell.instanceId });

    expect(next.players[0].board.length).toBe(0);
  });

  it("exclut une édition limitée non possédée, l'inclut quand elle est possédée", () => {
    // Édition limitée = carte datée hors set (même définition que Renfort Royal).
    const limited = poolCreature({ name: "Limitee4", mana_cost: 4, rarity: "Rare", card_year: 2026, card_month: 1, set_id: null });

    const s1 = withPool([limited]);
    const spellA = mkInvocationSpell(4);
    s1.players[0].hand.push(spellA);
    const next1 = playCard(s1, { type: "play_card", cardInstanceId: spellA.instanceId });
    expect(next1.players[0].board.length).toBe(0); // non possédée → exclue

    const s2 = withPool([limited]);
    s2.players[0].ownedLimitedCardIds = [limited.id];
    const spellB = mkInvocationSpell(4);
    s2.players[0].hand.push(spellB);
    const next2 = playCard(s2, { type: "play_card", cardInstanceId: spellB.instanceId });
    expect(next2.players[0].board.length).toBe(1); // possédée → invocable
    expect(next2.players[0].board[0].card.name).toBe("Limitee4");
  });

  it("respecte le format : une commune hors rotation Standard est exclue", () => {
    const s = withPool([
      poolCreature({ name: "Perimee", mana_cost: 4, card_year: 2000, card_month: 1 }),
      poolCreature({ name: "SetDeBase", mana_cost: 4 }), // non datée → toujours légale
    ], "expert-standard");
    const spell = mkInvocationSpell(4);
    s.players[0].hand.push(spell);

    const next = playCard(s, { type: "play_card", cardInstanceId: spell.instanceId });

    expect(next.players[0].board.length).toBe(1);
    expect(next.players[0].board[0].card.name).toBe("SetDeBase");
  });

  it("respecte le format : en Classique, une non-commune est exclue même possédée", () => {
    const limited = poolCreature({ name: "Rare4", mana_cost: 4, rarity: "Rare", card_year: 2026, card_month: 1, set_id: null });
    const s = withPool([limited], "classique-etendu");
    s.players[0].ownedLimitedCardIds = [limited.id];
    const spell = mkInvocationSpell(4);
    s.players[0].hand.push(spell);

    const next = playCard(s, { type: "play_card", cardInstanceId: spell.instanceId });

    expect(next.players[0].board.length).toBe(0);
  });

  it("legacy « Invocation X/Y » (token) : l'ancienne ATK devient le coût X", () => {
    const c3 = poolCreature({ name: "Cible3", mana_cost: 3 });
    const s = withPool([c3]);
    const spell = mkInstance(mkCard({
      mana_cost: 0, card_type: "spell", attack: null as unknown as number, health: null as unknown as number,
      faction: "Elfes",
      // Sort sauvé avant la refonte : attack/health de token, pas de amount.
      spell_keywords: [{ id: "invocation", attack: 3, health: 5, token_id: 7 }],
    }));
    s.players[0].hand.push(spell);

    const next = playCard(s, { type: "play_card", cardInstanceId: spell.instanceId });

    expect(next.players[0].board.length).toBe(1);
    expect(next.players[0].board[0].card.name).toBe("Cible3");
  });
});

describe("Invocation X — créature (à l'invocation)", () => {
  it("invoque une créature de coût X à l'arrivée en jeu de la porteuse", () => {
    const c2 = poolCreature({ name: "Cible2", mana_cost: 2 });
    const s = withPool([c2]);
    const inst = mkInstance(mkCard({
      mana_cost: 0, faction: "Elfes",
      keywords: ["invocation"],
      keyword_instances: [{ id: "invocation", x: 2 }],
    }));
    s.players[0].hand.push(inst);

    const next = playCard(s, { type: "play_card", cardInstanceId: inst.instanceId });

    // La porteuse + la créature invoquée.
    expect(next.players[0].board.length).toBe(2);
    const summoned = next.players[0].board.find(c => c.card.name === "Cible2");
    expect(summoned).toBeTruthy();
    expect(summoned!.hasSummoningSickness).toBe(true);
  });

  it("la créature invoquée ne déclenche pas ses propres effets d'arrivée", () => {
    // La cible porte Inspiration 2 : si ses effets d'arrivée se déclenchaient,
    // le joueur piocherait — le deck doit rester intact (précédent Appel du Clan).
    const cible = poolCreature({
      name: "Piocheuse", mana_cost: 2,
      keywords: ["inspiration"], effect_text: "[Inspiration 2]",
    });
    const s = withPool([cible]);
    s.players[0].deck.push(mkInstance(mkCard({ name: "DeckCard" })));
    const spell = mkInvocationSpell(2);
    s.players[0].hand.push(spell);

    const next = playCard(s, { type: "play_card", cardInstanceId: spell.instanceId });

    expect(next.players[0].board.length).toBe(1);
    expect(next.players[0].deck.length).toBe(1); // aucune pioche
    expect(next.players[0].hand.length).toBe(0);
  });
});
