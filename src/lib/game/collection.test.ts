// Contrôle ce qu'un joueur peut utiliser : un bug fuite des cartes non possédées
// ou masque des cartes possédées. Fonctions pures.
//
// Depuis le passage au modèle « une faction offerte », ce fichier couvre DEUX
// régimes qui coexistent en base :
//   • grand-père — comptes créés avant le changement, règle d'origine
//     (toute carte de set est à eux). Les tests correspondants sont des
//     NON-RÉGRESSIONS : si l'un tombe, des joueurs installés perdent des cartes
//     et leurs decks deviennent injouables ;
//   • nouveau modèle — communes de la faction choisie, option payante pour les
//     communes de toutes les factions.
import { describe, expect, it } from "vitest";
import { isCardOwned, filterOwnedCards, NEUTRAL_FACTION, type OwnershipContext } from "./collection";
import type { Card } from "./types";

function card(
  id: number,
  setId: number | null,
  rarity: string | null = "Commune",
  faction: string | null = "Elfes",
): Card {
  return { id, set_id: setId, rarity, faction } as unknown as Card;
}

function ctx(over: Partial<OwnershipContext> = {}): OwnershipContext {
  return {
    ownsEverything: false,
    collectedCardIds: new Set<number>(),
    legacyFullAccess: false,
    starterFaction: null,
    allCommonsUnlocked: false,
    ...over,
  };
}

describe("isCardOwned — rôle privilégié", () => {
  it("possède tout, y compris hors set et toutes raretés", () => {
    const c = ctx({ ownsEverything: true });
    expect(isCardOwned(card(1, null, "Légendaire", "Nains"), c)).toBe(true);
  });
});

describe("isCardOwned — collection personnelle", () => {
  it("une carte acquise est possédée QUELLE QUE SOIT sa rareté", () => {
    // Garantit que les enchères et les dons admin survivent au changement de
    // modèle : une Légendaire remportée doit rester utilisable.
    const c = ctx({ collectedCardIds: new Set([7]), starterFaction: "Elfes" });
    expect(isCardOwned(card(7, 3, "Légendaire", "Nains"), c)).toBe(true);
  });

  it("une carte acquise est possédée même hors set", () => {
    const c = ctx({ collectedCardIds: new Set([8]) });
    expect(isCardOwned(card(8, null, "Rare", "Nains"), c)).toBe(true);
  });

  it("hors set et non acquise : pas possédée", () => {
    expect(isCardOwned(card(9, null), ctx({ starterFaction: "Elfes" }))).toBe(false);
  });
});

describe("isCardOwned — comptes grand-père (non-régression)", () => {
  it("garde l'accès à TOUTE carte de set, toutes raretés, toutes factions", () => {
    const c = ctx({ legacyFullAccess: true });
    for (const rarity of ["Commune", "Peu Commune", "Rare", "Épique", "Légendaire"]) {
      expect(isCardOwned(card(1, 4, rarity, "Nains"), c)).toBe(true);
    }
  });

  it("n'obtient pas pour autant les cartes hors set", () => {
    expect(isCardOwned(card(2, null, "Commune"), ctx({ legacyFullAccess: true }))).toBe(false);
  });
});

describe("isCardOwned — nouveau modèle", () => {
  const elfe = ctx({ starterFaction: "Elfes" });

  it("possède les communes de SA faction", () => {
    expect(isCardOwned(card(1, 2, "Commune", "Elfes"), elfe)).toBe(true);
  });

  it("ne possède PAS les communes d'une autre faction", () => {
    expect(isCardOwned(card(2, 2, "Commune", "Nains"), elfe)).toBe(false);
  });

  it("ne possède PAS une rareté supérieure, même dans sa propre faction", () => {
    for (const rarity of ["Peu Commune", "Rare", "Épique", "Légendaire"]) {
      expect(isCardOwned(card(3, 2, rarity, "Elfes"), elfe)).toBe(false);
    }
  });

  it("possède les cartes neutres : elles échappent déjà à la règle mono-faction", () => {
    expect(isCardOwned(card(4, 2, "Commune", NEUTRAL_FACTION), elfe)).toBe(true);
  });

  it("une carte sans rareté compte comme Commune (repli du reste du code)", () => {
    expect(isCardOwned(card(5, 2, null, "Elfes"), elfe)).toBe(true);
  });

  it("sans faction choisie : rien hormis le neutre", () => {
    const aucune = ctx();
    expect(isCardOwned(card(6, 2, "Commune", "Elfes"), aucune)).toBe(false);
    expect(isCardOwned(card(7, 2, "Commune", NEUTRAL_FACTION), aucune)).toBe(true);
  });
});

describe("isCardOwned — option « toutes les communes »", () => {
  const debloque = ctx({ starterFaction: "Elfes", allCommonsUnlocked: true });

  it("ouvre les communes de toutes les factions", () => {
    expect(isCardOwned(card(1, 2, "Commune", "Nains"), debloque)).toBe(true);
    expect(isCardOwned(card(2, 2, "Commune", "Morts-Vivants"), debloque)).toBe(true);
  });

  it("n'ouvre PAS les raretés supérieures — c'est bien l'offre « communes »", () => {
    expect(isCardOwned(card(3, 2, "Rare", "Nains"), debloque)).toBe(false);
    expect(isCardOwned(card(4, 2, "Légendaire", "Elfes"), debloque)).toBe(false);
  });

  it("n'ouvre pas les cartes hors set", () => {
    expect(isCardOwned(card(5, null, "Commune", "Nains"), debloque)).toBe(false);
  });
});

describe("filterOwnedCards", () => {
  it("ne garde que le possédé, en combinant socle de faction et acquisitions", () => {
    const cards = [
      card(1, 2, "Commune", "Elfes"),       // socle : sa faction
      card(2, 2, "Commune", "Nains"),       // autre faction → non
      card(3, 2, "Rare", "Elfes"),          // rareté supérieure → non
      card(4, 2, "Légendaire", "Nains"),    // mais acquise → oui
      card(5, null, "Commune", "Elfes"),    // hors set → non
      card(6, 2, "Commune", NEUTRAL_FACTION), // neutre → oui
    ];
    const owned = filterOwnedCards(
      cards,
      ctx({ starterFaction: "Elfes", collectedCardIds: new Set([4]) }),
    );
    expect(owned.map((c) => c.id)).toEqual([1, 4, 6]);
  });
});
