// Déchainement X/Y : lance X sorts aléatoires de coût EXACTEMENT Y issus de
// la collection du joueur (communes + éditions limitées possédées), du même
// alignement que la source, légaux dans le format du match, avec des cibles
// aléatoires. Couvre les deux faces (sort + créature à l'invocation), le
// filtre de coût exact, le filtre d'alignement, l'anti-récursion (sorts
// porteurs de Déchainement/Relancer exclus) et le no-op sans candidat.
import { describe, expect, it } from "vitest";
import { playCard } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card } from "./types";

// Elfes = alignement « bon », Humains = « neutre » (cf. FACTIONS).
// Sort observable : Inspiration 1 → chaque lancement fait piocher 1 carte.
function poolSpell(partial: Partial<Card>): Card {
  return mkCard({
    card_type: "spell", attack: null as unknown as number, health: null as unknown as number,
    faction: "Elfes", rarity: "Commune",
    spell_keywords: [{ id: "inspiration", amount: 1 }],
    ...partial,
  });
}

function mkDechainementSpell(x: number, y: number) {
  return mkInstance(mkCard({
    mana_cost: 0, card_type: "spell", attack: null as unknown as number, health: null as unknown as number,
    faction: "Elfes",
    spell_keywords: [{ id: "dechainement", amount: x, health: y }],
  }));
}

function withSpellPool(pool: Card[]) {
  const s = mkState();
  s.allSpellsPool = pool;
  return s;
}

function fillDeck(s: ReturnType<typeof mkState>, n: number) {
  for (let i = 0; i < n; i++) s.players[0].deck.push(mkInstance(mkCard({ name: `Deck${i}` })));
}

describe("Déchainement X/Y — sort", () => {
  it("lance X sorts de coût exactement Y et du même alignement", () => {
    const s = withSpellPool([
      poolSpell({ name: "Pioche3", mana_cost: 3 }),
      poolSpell({ name: "Cout2", mana_cost: 2 }),           // mauvais coût → exclu
      poolSpell({ name: "Neutre3", mana_cost: 3, faction: "Humains" }), // autre alignement → exclu
    ]);
    fillDeck(s, 5);
    const spell = mkDechainementSpell(2, 3);
    s.players[0].hand.push(spell);

    const next = playCard(s, { type: "play_card", cardInstanceId: spell.instanceId });

    // Seule "Pioche3" est candidate : 2 lancements → 2 pioches.
    expect(next.players[0].hand.length).toBe(2);
    expect(next.players[0].deck.length).toBe(3);
  });

  it("ne fait rien si aucun sort n'a un coût exactement égal à Y (pas de repli ≤ Y)", () => {
    const s = withSpellPool([
      poolSpell({ name: "Cout2", mana_cost: 2 }),
      poolSpell({ name: "Cout4", mana_cost: 4 }),
    ]);
    fillDeck(s, 3);
    const spell = mkDechainementSpell(2, 3);
    s.players[0].hand.push(spell);

    const next = playCard(s, { type: "play_card", cardInstanceId: spell.instanceId });

    expect(next.players[0].hand.length).toBe(0);
    expect(next.players[0].deck.length).toBe(3);
  });

  it("exclut les sorts porteurs de Déchainement ou de Relancer (anti-récursion)", () => {
    const s = withSpellPool([
      poolSpell({
        name: "Boucle3", mana_cost: 3,
        spell_keywords: [{ id: "dechainement", amount: 1, health: 3 }],
      }),
      poolSpell({
        name: "Rejoue3", mana_cost: 3,
        spell_keywords: [{ id: "relancer", amount: 1 }],
      }),
    ]);
    fillDeck(s, 3);
    const spell = mkDechainementSpell(2, 3);
    s.players[0].hand.push(spell);

    const next = playCard(s, { type: "play_card", cardInstanceId: spell.instanceId });

    // Les deux candidats sont exclus → aucun lancement, aucune pioche.
    expect(next.players[0].hand.length).toBe(0);
    expect(next.players[0].deck.length).toBe(3);
  });

  it("exclut une édition limitée non possédée, l'inclut quand elle est possédée", () => {
    // Édition limitée = carte datée hors set (même définition qu'Invocation X).
    const limited = poolSpell({ name: "Limitee3", mana_cost: 3, rarity: "Rare", card_year: 2026, card_month: 1, set_id: null });

    const s1 = withSpellPool([limited]);
    fillDeck(s1, 2);
    const spellA = mkDechainementSpell(1, 3);
    s1.players[0].hand.push(spellA);
    const next1 = playCard(s1, { type: "play_card", cardInstanceId: spellA.instanceId });
    expect(next1.players[0].hand.length).toBe(0); // non possédée → exclue

    const s2 = withSpellPool([limited]);
    fillDeck(s2, 2);
    s2.players[0].ownedLimitedCardIds = [limited.id];
    const spellB = mkDechainementSpell(1, 3);
    s2.players[0].hand.push(spellB);
    const next2 = playCard(s2, { type: "play_card", cardInstanceId: spellB.instanceId });
    expect(next2.players[0].hand.length).toBe(1); // possédée → lancée, 1 pioche
  });
});

describe("Déchainement X/Y — créature (à l'invocation)", () => {
  it("lance X sorts de coût Y à l'arrivée en jeu de la porteuse", () => {
    const s = withSpellPool([poolSpell({ name: "Pioche2", mana_cost: 2 })]);
    fillDeck(s, 4);
    const inst = mkInstance(mkCard({
      mana_cost: 0, faction: "Elfes",
      keywords: ["dechainement"],
      keyword_instances: [{ id: "dechainement", x: 3, y: 2 }],
    }));
    s.players[0].hand.push(inst);

    const next = playCard(s, { type: "play_card", cardInstanceId: inst.instanceId });

    expect(next.players[0].board.length).toBe(1);
    // 3 lancements d'Inspiration 1 → 3 pioches.
    expect(next.players[0].hand.length).toBe(3);
    expect(next.players[0].deck.length).toBe(1);
  });

  it("un sort lancé à cible aléatoire peut toucher : Impact frappe une cible", () => {
    // Sort d'Impact 2 (cible requise) : la machinerie de cibles aléatoires de
    // Relancer doit fournir une cible valide — le héros ou la créature adverse.
    const s = withSpellPool([
      mkCard({
        card_type: "spell", attack: null as unknown as number, health: null as unknown as number,
        faction: "Elfes", rarity: "Commune", name: "Frappe2", mana_cost: 2,
        spell_keywords: [{ id: "impact", amount: 2 }],
      }),
    ]);
    const enemy = mkInstance(mkCard({ name: "CibleAdverse", attack: 1, health: 5 }));
    s.players[1].board.push(enemy);
    const heroHpBefore = s.players[1].hero.hp;
    const myHeroBefore = s.players[0].hero.hp;
    const spell = mkDechainementSpell(1, 2);
    s.players[0].hand.push(spell);

    const next = playCard(s, { type: "play_card", cardInstanceId: spell.instanceId });

    // 2 dégâts quelque part : créature adverse, héros adverse… ou notre camp
    // (cible « any » aléatoire) — au total, 2 PV ont été retirés.
    const enemyAfter = next.players[1].board.find(c => c.card.name === "CibleAdverse");
    const totalDamage =
      (heroHpBefore - next.players[1].hero.hp)
      + (myHeroBefore - next.players[0].hero.hp)
      + (5 - (enemyAfter?.currentHealth ?? 0));
    expect(totalDamage).toBe(2);
  });
});

// ─── Résolution COMPLÈTE des sorts imbriqués ───────────────────────────────
// castSpellWithRandomTargets ne faisait que les mots-clés et les effets
// composables : un sort tiré par Déchainement perdait silencieusement ses
// effets COMPOSÉS et ses DONS. Les deux appelants partagent désormais
// `resolveSpellCard`, ce qui rend l'écart impossible à réintroduire.
describe("Déchainement — le sort tiré se résout INTÉGRALEMENT", () => {
  it("applique les effets composés (spell_resolution) du sort tiré", () => {
    const s = withSpellPool([
      poolSpell({
        name: "Composé", mana_cost: 1,
        spell_keywords: null,
        capabilities: [{
          uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
          composed: {
            content: "draw_cards", magnitude: { x: 2 },
            target: { entity: "self", count: 1, side: "ally", location: "board", designation: "automatic" },
          },
        }] as never,
      }),
    ]);
    fillDeck(s, 5);
    const spell = mkDechainementSpell(1, 1);
    s.players[0].hand.push(spell);

    const next = playCard(s, { type: "play_card", cardInstanceId: spell.instanceId });

    // 2 pioches par l'effet composé du sort tiré. Avant : 0.
    expect(next.players[0].hand.length).toBe(2);
  });

  it("applique les dons (effectKind grant) du sort tiré", () => {
    const s = withSpellPool([
      poolSpell({
        name: "Donneur", mana_cost: 1,
        spell_keywords: null,
        keywords: ["taunt"] as never,
        capabilities: [{
          uid: "grant_0", trigger: "spell_resolution", effectKind: "grant",
          abilityId: "taunt", grantScope: "all_allies", targets: [],
        }] as never,
      }),
    ]);
    const allie = mkInstance(mkCard({ name: "Allié", attack: 2, health: 3 }));
    s.players[0].board.push(allie);
    const spell = mkDechainementSpell(1, 1);
    s.players[0].hand.push(spell);

    const next = playCard(s, { type: "play_card", cardInstanceId: spell.instanceId });

    // L'allié a reçu Provocation du sort tiré. Avant : rien.
    expect(next.players[0].board[0].card.keywords).toContain("taunt");
  });

  it("exclut du pool un Déchainement porté UNIQUEMENT par capabilities", () => {
    const s = withSpellPool([
      // Pas de spell_keywords : l'ancien filtre ne voyait rien et le laissait
      // passer, alors que la résolution (getCapabilities) l'aurait relancé.
      poolSpell({
        name: "RécursifCaché", mana_cost: 1,
        spell_keywords: null,
        capabilities: [{
          uid: "sk_0", trigger: "spell_resolution", effectKind: "immediate",
          abilityId: "dechainement", params: { x: 1, health: 1 }, targets: [],
        }] as never,
      }),
    ]);
    const spell = mkDechainementSpell(1, 1);
    s.players[0].hand.push(spell);

    // Aucun candidat éligible → no-op, et surtout pas de récursion.
    expect(() => playCard(s, { type: "play_card", cardInstanceId: spell.instanceId })).not.toThrow();
  });
});
