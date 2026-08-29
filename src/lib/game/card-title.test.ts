// Mise à l'échelle du titre : les noms longs rétrécissent au lieu d'être coupés.
import { describe, expect, it } from "vitest";
import { titleFontScale, wrappedLineCount, TITLE_CHARS_PER_LINE } from "./card-title";

describe("simulation du retour à la ligne", () => {
  it("compte les lignes d'après la coupure des MOTS, pas la longueur", () => {
    // Les deux noms font 28 caractères, et se comportent différemment : c'est
    // toute la raison d'être de la simulation.
    expect("Mobilisation des Profondeurs").toHaveLength(28);
    expect("Intendant Suprême du Royaume").toHaveLength(28);
    expect(wrappedLineCount("Mobilisation des Profondeurs", TITLE_CHARS_PER_LINE)).toBe(2);
    expect(wrappedLineCount("Intendant Suprême du Royaume", TITLE_CHARS_PER_LINE)).toBe(3);
  });

  it("un mot seul trop long occupe UNE ligne, sans être coupé", () => {
    expect(wrappedLineCount("Anticonstitutionnellement", 10)).toBe(1);
  });

  it("un nom vide ne compte aucune ligne", () => {
    expect(wrappedLineCount("   ", TITLE_CHARS_PER_LINE)).toBe(0);
  });
});

describe("facteur d'échelle", () => {
  it("laisse INTACTES les cartes qui tiennent déjà — l'immense majorité", () => {
    for (const nom of ["Tailleur de Runes", "Héritage des Ancêtres", "Mobilisation des Profondeurs"]) {
      expect(titleFontScale(nom), nom).toBe(1);
    }
  });

  it("réduit « Intendant Suprême du Royaume » juste assez pour deux lignes", () => {
    const echelle = titleFontScale("Intendant Suprême du Royaume");
    expect(echelle).toBeLessThan(1);
    expect(wrappedLineCount("Intendant Suprême du Royaume",
      Math.floor(TITLE_CHARS_PER_LINE / echelle))).toBeLessThanOrEqual(2);
  });

  it("ne descend jamais sous le plancher de lisibilité", () => {
    const echelle = titleFontScale("Grand Intendant Suprême des Profondeurs Insondables du Royaume Perdu");
    expect(echelle).toBeGreaterThanOrEqual(0.7);
  });

  it("tolère un nom absent", () => {
    expect(titleFontScale(null)).toBe(1);
    expect(titleFontScale(undefined)).toBe(1);
  });
});
