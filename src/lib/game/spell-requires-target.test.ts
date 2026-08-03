// Un SORT qui réclame une cible et n'en trouve AUCUNE est INJOUABLE.
//
// Signalé en partie : « Marque de Faiblesse » (Affaiblissement -1/-1 sur une
// créature ennemie) a pu être lancée alors que la seule unité adverse était
// tapie dans l'Ombre — donc intargetable. Le sort est parti dans le vide, carte
// et mana perdus sans le moindre effet.
//
// La règle est volontairement CONSERVATRICE : on ne bloque que si TOUS les
// slots de cible sont vides. Un sort à plusieurs cibles dont une seule est
// servie reste jouable — son effet partiel vaut mieux que rien.
import { describe, expect, it } from "vitest";
import { canPlayCard } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameState, SpellKeywordInstance } from "./types";

/** Affaiblissement -1/-1 : une cible, obligatoirement une créature ENNEMIE. */
function marqueDeFaiblesse(): CardInstance {
  return mkInstance(mkCard({
    name: "Marque de Faiblesse", card_type: "spell", attack: null, health: null, mana_cost: 1,
    spell_keywords: [{ id: "affaiblissement", attack: 1, health: 1 }] as SpellKeywordInstance[],
  }));
}

function etat(): { s: GameState; sort: CardInstance } {
  const s = mkState();
  const sort = marqueDeFaiblesse();
  s.players[0].hand.push(sort);
  return { s, sort };
}

describe("sort à cible obligatoire — aucune cible disponible", () => {
  it("plateau adverse VIDE : injouable", () => {
    const { s, sort } = etat();
    expect(canPlayCard(s, sort.instanceId)).toBe(false);
  });

  it("seule unité adverse tapie dans l'OMBRE : injouable", () => {
    // Le cas exact signalé. L'unité est bien là, mais intargetable tant qu'elle
    // n'a pas agi — le sort n'a donc personne à frapper.
    const { s, sort } = etat();
    const ombre = mkInstance(mkCard({
      name: "Tisseuse", attack: 1, health: 1,
      keywords: ["ombre"] as never,
    }));
    ombre.ombreRevealed = false;
    s.players[1].board.push(ombre);

    expect(canPlayCard(s, sort.instanceId)).toBe(false);
  });

  it("…mais jouable dès que cette Ombre s'est révélée", () => {
    // Contre-épreuve : sans elle, un test qui passe ne prouverait rien — il
    // suffirait que le sort soit toujours refusé.
    const { s, sort } = etat();
    const ombre = mkInstance(mkCard({
      name: "Tisseuse", attack: 1, health: 1,
      keywords: ["ombre"] as never,
    }));
    ombre.ombreRevealed = true;
    s.players[1].board.push(ombre);

    expect(canPlayCard(s, sort.instanceId)).toBe(true);
  });

  it("une créature ennemie ordinaire suffit à le rendre jouable", () => {
    const { s, sort } = etat();
    s.players[1].board.push(mkInstance(mkCard({ name: "Proie", attack: 1, health: 3 })));
    expect(canPlayCard(s, sort.instanceId)).toBe(true);
  });
});

describe("sort à cible obligatoire — les cas qu'on ne bloque PAS", () => {
  it("un sort SANS slot de cible reste jouable, plateau vide compris", () => {
    const s = mkState();
    const sort = mkInstance(mkCard({
      name: "Inspiration", card_type: "spell", attack: null, health: null, mana_cost: 1,
      spell_keywords: [{ id: "inspiration", amount: 2 }] as SpellKeywordInstance[],
    }));
    s.players[0].hand.push(sort);
    expect(canPlayCard(s, sort.instanceId)).toBe(true);
  });

  it("une CRÉATURE dont l'effet d'invocation ne trouve personne reste jouable", () => {
    // Poser le corps est un jeu légitime : la règle ne vaut que pour les sorts.
    const s = mkState();
    const creature = mkInstance(mkCard({
      name: "Sorcière", mana_cost: 1, attack: 2, health: 2,
      keywords: ["affaiblissement"] as never,
      keyword_instances: [{ id: "affaiblissement", x: 1, y: 1 } as never],
    }));
    s.players[0].hand.push(creature);
    expect(canPlayCard(s, creature.instanceId)).toBe(true);
  });

  it("sort à DEUX cibles dont une seule servie : reste jouable", () => {
    // Effet partiel plutôt que rien — c'est le point de la règle conservatrice.
    const s = mkState();
    // Impact vise n'importe quelle cible (le héros adverse suffit), tandis que
    // le don « à une créature alliée » n'a personne : plateau allié vide.
    const sort = mkInstance(mkCard({
      name: "Double effet", card_type: "spell", attack: null, health: null, mana_cost: 1,
      spell_keywords: [{ id: "impact", amount: 2 }] as SpellKeywordInstance[],
      keywords: ["taunt"] as never,
    }));
    s.players[0].hand.push(sort);

    expect(canPlayCard(s, sort.instanceId)).toBe(true);
  });
});
