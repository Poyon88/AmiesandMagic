import { describe, expect, it } from "vitest";
import { choisirAffiches, jourCourant, type LigneIllustration } from "../affichesDuHub";

const lignes: LigneIllustration[] = [
  { id: 1, faction: "A", image_url: "a1" },
  { id: 2, faction: "A", image_url: "a2" },
  { id: 3, faction: "B", image_url: "b1" },
  { id: 4, faction: "C", image_url: "c1" },
  { id: 5, faction: "X", image_url: "x1" },
  { id: 6, faction: null, image_url: "n1" },
  { id: 7, faction: "B", image_url: null },
];
const admises = (f: string) => f !== "X";

describe("choisirAffiches", () => {
  it("rend une illustration par faction, toutes différentes", () => {
    expect(choisirAffiches(lignes, admises, 0, 3)).toEqual(["a1", "b1", "c1"]);
  });

  it("écarte les factions refusées et les lignes sans faction ou sans image", () => {
    const out = choisirAffiches(lignes, admises, 0, 5);
    expect(out).toHaveLength(3);
    expect(out).not.toContain("x1");
    expect(out).not.toContain("n1");
  });

  it("change d'un jour à l'autre et reste stable dans la journée", () => {
    expect(choisirAffiches(lignes, admises, 1, 2)).toEqual(["b1", "c1"]);
    expect(choisirAffiches(lignes, admises, 1, 2)).toEqual(choisirAffiches(lignes, admises, 1, 2));
    // La faction A revient au jour 3 avec sa seconde carte.
    expect(choisirAffiches(lignes, admises, 3, 1)).toEqual(["a2"]);
  });

  it("ne dépend pas de l'ordre des lignes reçues", () => {
    expect(choisirAffiches([...lignes].reverse(), admises, 0, 3)).toEqual(["a1", "b1", "c1"]);
  });

  it("rend une liste vide sans catalogue", () => {
    expect(choisirAffiches([], admises, 4, 5)).toEqual([]);
  });
});

describe("jourCourant", () => {
  it("compte les jours entiers depuis l'époque", () => {
    expect(jourCourant(0)).toBe(0);
    expect(jourCourant(86_400_000 * 3 + 5)).toBe(3);
  });
});
