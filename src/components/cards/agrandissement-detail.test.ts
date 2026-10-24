import { describe, expect, it } from "vitest";
import { AGRANDISSEMENT_MAX, AGRANDISSEMENT_MIN, lireAgrandissement, regleAgrandissement } from "./agrandissement-detail";

describe("taille du descriptif en partie", () => {
  it("reste bornée entre 1× et le maximum", () => {
    regleAgrandissement(10);
    expect(lireAgrandissement()).toBe(AGRANDISSEMENT_MAX);
    regleAgrandissement(0.2);
    expect(lireAgrandissement()).toBe(AGRANDISSEMENT_MIN);
    regleAgrandissement(1.5);
    expect(lireAgrandissement()).toBe(1.5);
  });
});
