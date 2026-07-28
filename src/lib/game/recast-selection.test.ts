// Relancer X + Sélection : un sort relancé n'a personne pour choisir dans la
// modale « 1 parmi 3 ». Avant correctif, resolveSpellKeywords ne trouvait aucun
// slot `selection_0` et l'effet disparaissait EN SILENCE — « Renfort des Trois
// Peuples » relancé résolvait Tempête 3 mais pas Sélection 2. Le moteur doit
// désormais pré-tirer une option au hasard (RNG semé → identique sur les deux
// clients), comme le fait déjà le chemin créature quand la modale ne peut pas
// s'ouvrir.
import { describe, expect, it } from "vitest";
import { playCard } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";

function selectionSpellCard() {
  return mkCard({
    name: "Renfort des Trois Peuples", card_type: "spell", attack: null, health: null,
    spell_keywords: [{ id: "selection", amount: 2 }] as never,
  });
}

function relancerSpell(x = 1) {
  return mkInstance(mkCard({
    name: "Convergence des Arcanes", card_type: "spell", attack: null, health: null,
    spell_keywords: [{ id: "relancer", amount: x }] as never,
  }));
}

describe("Relancer — un sort relancé résout aussi sa Sélection", () => {
  it("ajoute une carte du pool en main (option tirée au hasard)", () => {
    const s = mkState();
    s.rngState = 7;
    // Pool d'options : commune, faction autorisée par le repli (Mercenaires),
    // coût ≤ 2 (Sélection 2).
    s.factionCardPool = [
      mkCard({ name: "Recrue", faction: "Mercenaires", rarity: "Commune", mana_cost: 1 }),
    ];
    s.players[0].spellHistory = [{ card: selectionSpellCard(), targetMap: {} }];

    const relancer = relancerSpell(1);
    s.players[0].hand.push(relancer);
    const next = playCard(s, { type: "play_card", cardInstanceId: relancer.instanceId });

    expect(next.players[0].hand.map((c) => c.card.name)).toContain("Recrue");
  });

  it("ne casse rien quand le pool ne propose aucune option éligible", () => {
    const s = mkState();
    s.rngState = 7;
    // Coût 5 > Sélection 2 → aucune option : le sort relancé se résout sans
    // rien ajouter, et surtout sans lever d'erreur.
    s.factionCardPool = [
      mkCard({ name: "Trop chère", faction: "Mercenaires", rarity: "Commune", mana_cost: 5 }),
    ];
    s.players[0].spellHistory = [{ card: selectionSpellCard(), targetMap: {} }];

    const relancer = relancerSpell(1);
    s.players[0].hand.push(relancer);
    const next = playCard(s, { type: "play_card", cardInstanceId: relancer.instanceId });

    expect(next.players[0].hand).toHaveLength(0);
  });
});

describe("Relancer — l'Exhumation relancée respecte le plafond de coût", () => {
  it("ressuscite la créature ÉLIGIBLE, quelle que soit la graine", () => {
    // Le tirage de cible d'un sort relancé piochait parmi TOUT le cimetière,
    // sans appliquer le plafond de coût d'Exhumation X. Une créature trop chère
    // tirée au sort faisait fizzler l'effet alors qu'une cible valide attendait
    // à côté — environ une fois sur deux ici. On balaie donc plusieurs graines.
    for (const seed of [1, 2, 3, 5, 8, 13, 21]) {
      const s = mkState();
      s.rngState = seed;
      s.players[0].graveyard.push(
        mkInstance(mkCard({ name: "Petit", mana_cost: 1, attack: 1, health: 1 })),
        mkInstance(mkCard({ name: "Colosse", mana_cost: 9, attack: 9, health: 9 })),
      );
      s.players[0].spellHistory = [{
        card: mkCard({
          name: "Exhumation", card_type: "spell", attack: null, health: null,
          spell_keywords: [{ id: "exhumation", amount: 1 }] as never,
        }),
        targetMap: {},
      }];

      const relancer = relancerSpell(1);
      s.players[0].hand.push(relancer);
      const next = playCard(s, { type: "play_card", cardInstanceId: relancer.instanceId });

      expect(next.players[0].board.map((c) => c.card.name), `graine ${seed}`).toEqual(["Petit"]);
    }
  });

  it("aucune créature sous le plafond : rien ne ressuscite", () => {
    const s = mkState();
    s.rngState = 5;
    s.players[0].graveyard.push(mkInstance(mkCard({ name: "Colosse", mana_cost: 9, attack: 9, health: 9 })));
    s.players[0].spellHistory = [{
      card: mkCard({
        name: "Exhumation", card_type: "spell", attack: null, health: null,
        spell_keywords: [{ id: "exhumation", amount: 1 }] as never,
      }),
      targetMap: {},
    }];

    const relancer = relancerSpell(1);
    s.players[0].hand.push(relancer);
    const next = playCard(s, { type: "play_card", cardInstanceId: relancer.instanceId });

    expect(next.players[0].board).toHaveLength(0);
  });
});
