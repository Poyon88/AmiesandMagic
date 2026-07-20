import { describe, it, expect } from "vitest";
import { isManaSpark, MANA_SPARK_NAMES, MANA_SPARK_FALLBACK } from "./mana-spark";
import type { Card } from "./types";

const asCard = (name: string, card_type: Card["card_type"] = "spell") =>
  ({ name, card_type }) as Pick<Card, "name" | "card_type">;

describe("isManaSpark", () => {
  // Le nom réellement stocké en prod (ligne cards id 64). Une égalité stricte
  // sur "Mana Spark" échouait ici : le 2e joueur recevait le repli sans
  // illustration et au nom anglais.
  it("reconnaît le nom stocké en base", () => {
    expect(isManaSpark(asCard("Etincelle de Mana"))).toBe(true);
  });

  it("tolère accents, casse et espaces multiples", () => {
    for (const name of ["Étincelle de Mana", "étincelle de mana", "ETINCELLE DE MANA", "Etincelle  de   Mana", " Étincelle de mana "]) {
      expect(isManaSpark(asCard(name)), name).toBe(true);
    }
  });

  it("accepte encore l'ancien libellé anglais", () => {
    expect(isManaSpark(asCard("Mana Spark"))).toBe(true);
  });

  it("rejette les autres cartes", () => {
    for (const name of ["Étincelle Primordiale", "Etincelle", "Mana", "Éclair de Mana"]) {
      expect(isManaSpark(asCard(name)), name).toBe(false);
    }
  });

  it("exige un sort — une créature homonyme ne compte pas", () => {
    expect(isManaSpark(asCard("Etincelle de Mana", "creature"))).toBe(false);
  });

  // Le filtre SQL utilise `.in(...)` et ne normalise pas : chaque variante
  // listée doit rester reconnue côté moteur, sinon la carte remontée de la base
  // serait ignorée par le pool.
  it("reconnaît toutes les orthographes du filtre SQL", () => {
    for (const name of MANA_SPARK_NAMES) {
      expect(isManaSpark(asCard(name)), name).toBe(true);
    }
  });

  it("le repli reste identifiable et sans illustration", () => {
    expect(isManaSpark(MANA_SPARK_FALLBACK)).toBe(true);
    expect(MANA_SPARK_FALLBACK.image_url).toBeNull();
  });
});
