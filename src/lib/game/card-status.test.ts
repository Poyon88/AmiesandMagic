// Statut de cycle de vie des cartes — draft / playable / retired / excluded.
//
// Retirée et Exclue ont le même effet (injouable partout), seul le sens change
// (provisoire / définitif). Un Draft n'est deck-able que par admin/testeur.
// `undefined` vaut JOUABLE, comme `discoverable` : un chemin qui ne sélectionne
// pas la colonne ne doit rien rendre injouable en silence.
import { describe, expect, it } from "vitest";
import {
  cardStatusOf,
  cartesIndisponiblesDansLeDeck,
  estIndisponible,
  onlyPlayable,
  statutPermetLeDeck,
} from "./deck-rules";
import type { CardStatus } from "./types";

const carte = (id: number, status?: CardStatus | null) => ({ id, status });

describe("cardStatusOf", () => {
  it("`undefined` et `null` valent jouable", () => {
    expect(cardStatusOf(carte(1))).toBe("playable");
    expect(cardStatusOf(carte(1, null))).toBe("playable");
  });
});

describe("onlyPlayable", () => {
  it("ne garde que les jouables pour les tirages", () => {
    const pool = [
      carte(1, "playable"), carte(2, "draft"), carte(3, "retired"),
      carte(4, "excluded"), carte(5),
    ];
    expect(onlyPlayable(pool).map((c) => c.id)).toEqual([1, 5]);
  });
});

describe("statutPermetLeDeck", () => {
  it("brouillon : admin/testeur seulement", () => {
    expect(statutPermetLeDeck(carte(1, "draft"), true)).toBe(true);
    expect(statutPermetLeDeck(carte(1, "draft"), false)).toBe(false);
  });

  it("retirée et exclue : jamais, même pour un testeur", () => {
    for (const s of ["retired", "excluded"] as const) {
      expect(statutPermetLeDeck(carte(1, s), true)).toBe(false);
      expect(estIndisponible(carte(1, s))).toBe(true);
    }
  });

  it("jouable : toujours", () => {
    expect(statutPermetLeDeck(carte(1, "playable"), false)).toBe(true);
    expect(estIndisponible(carte(1))).toBe(false);
  });
});

describe("cartesIndisponiblesDansLeDeck", () => {
  it("compte les exemplaires, quantités comprises", () => {
    const deck = [
      { card: carte(1, "playable"), quantity: 3 },
      { card: carte(2, "retired"), quantity: 2 },
      { card: carte(3, "draft"), quantity: 1 },
    ];
    expect(cartesIndisponiblesDansLeDeck(deck, false)).toBe(3);
    expect(cartesIndisponiblesDansLeDeck(deck, true)).toBe(2);
  });
});
