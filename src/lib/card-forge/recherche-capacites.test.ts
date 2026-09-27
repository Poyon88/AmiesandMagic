import { describe, expect, it } from "vitest";
import { correspondRecherche } from "./recherche-capacites";

describe("recherche de capacités", () => {
  it("ignore accents et casse, mots dans n'importe quel ordre", () => {
    expect(correspondRecherche("epargne", "Épargne X")).toBe(true);
    expect(correspondRecherche("X renfor", "Renforcement +X/+Y")).toBe(true);
    expect(correspondRecherche("vol", "Traque", "charge")).toBe(false);
    expect(correspondRecherche("ranged", "Vol", "ranged")).toBe(true);
  });
  it("recherche vide : tout correspond", () => {
    expect(correspondRecherche("  ", "Impact X")).toBe(true);
  });
});
