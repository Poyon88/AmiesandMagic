// Les COÛTS ADDITIONNELS d'un clan : ce qu'il demande en plus du mana.
//
// Une carte qui réclame le sacrifice d'une créature est une particularité.
// Six communes qui le réclament, c'est une manière de jouer — celle des Enfants
// du Soleil. Tout l'enjeu du module tient dans ce SEUIL : en dessous, la page
// ne doit rien dire, sous peine de faire passer une carte isolée pour une
// identité de clan.
import { describe, expect, it } from "vitest";
import { additionalCostsFromCards, SEUIL_COUT_ADDITIONNEL } from "./clan-costs";

const sacrifie = (n = 1) => ({ sacrifice_cost: n });
const gratuite = () => ({ life_cost: 0, discard_cost: 0, sacrifice_cost: 0, exile_cost: 0 });

describe("Le seuil", () => {
  it("est de cinq cartes", () => {
    expect(SEUIL_COUT_ADDITIONNEL).toBe(5);
  });

  it("ne dit RIEN en dessous", () => {
    const cartes = [...Array(SEUIL_COUT_ADDITIONNEL - 1)].map(() => sacrifie());
    expect(additionalCostsFromCards(cartes)).toEqual([]);
  });

  it("parle dès qu'il est atteint", () => {
    const cartes = [...Array(SEUIL_COUT_ADDITIONNEL)].map(() => sacrifie());
    expect(additionalCostsFromCards(cartes)).toEqual([
      { kind: "sacrifice", count: 5, min: 1, max: 1 },
    ]);
  });
});

describe("Regroupement", () => {
  it("réunit les MONTANTS d'une même nature de coût", () => {
    // « Sacrifier une créature » et « en sacrifier deux » relèvent de la même
    // habitude. Les séparer ferait passer les deux sous le seuil.
    const cartes = [sacrifie(1), sacrifie(1), sacrifie(2), sacrifie(1), sacrifie(3)];
    expect(additionalCostsFromCards(cartes)).toEqual([
      { kind: "sacrifice", count: 5, min: 1, max: 3 },
    ]);
  });

  it("ne mélange PAS deux natures différentes", () => {
    const cartes = [
      ...[...Array(5)].map(() => sacrifie()),
      ...[...Array(5)].map(() => ({ exile_cost: 2 })),
    ];
    const r = additionalCostsFromCards(cartes);
    expect(r.map((c) => c.kind).sort()).toEqual(["exile", "sacrifice"]);
  });

  it("classe le plus fréquent d'abord", () => {
    const cartes = [
      ...[...Array(5)].map(() => sacrifie()),
      ...[...Array(7)].map(() => ({ life_cost: 1 })),
    ];
    expect(additionalCostsFromCards(cartes)[0]).toMatchObject({ kind: "life", count: 7 });
  });
});

describe("Ce qui ne compte pas", () => {
  it("un coût à ZÉRO n'est pas un coût", () => {
    // La grande majorité des cartes portent 0 dans les quatre colonnes : les
    // compter afficherait les quatre rubriques sur chaque clan.
    expect(additionalCostsFromCards([...Array(20)].map(gratuite))).toEqual([]);
  });

  it("une colonne absente ne casse rien", () => {
    expect(additionalCostsFromCards([{}, { sacrifice_cost: null }])).toEqual([]);
  });

  it("un pool vide ne dit rien", () => {
    expect(additionalCostsFromCards([])).toEqual([]);
  });
});

describe("Le cas des Enfants du Soleil", () => {
  it("six sacrifices suffisent à caractériser le clan", () => {
    // Relevé en base : c'est l'exemple qui a motivé la section.
    const r = additionalCostsFromCards([...Array(6)].map(() => sacrifie()));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "sacrifice", count: 6 });
  });
});
