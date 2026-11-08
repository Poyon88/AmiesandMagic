// Texte d'Exhumation : « au hasard » n'est annoncé que si le moteur tire.
import { describe, expect, it } from "vitest";
import { describeComposedCap } from "./composed-display";
import type { Capability, TargetSpec } from "./types";

const cap = (p: Partial<TargetSpec>) => ({
  uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
  composed: { content: "exhumation", magnitude: {}, target: { entity: "unit", count: 4, side: "ally", location: "graveyard", designation: "random", ...p } },
} as unknown as Capability);

describe("texte d'Exhumation", () => {
  it("annonce le tirage", () => {
    expect(describeComposedCap(cap({})).toLowerCase()).toContain("ressuscite jusqu'à 4 créatures au hasard de votre cimetière");
  });
  it("ne l'annonce pas pour un choix ni pour « toutes »", () => {
    expect(describeComposedCap(cap({ designation: "choice" }))).not.toContain("au hasard");
    expect(describeComposedCap(cap({ count: "all" }))).not.toContain("au hasard");
  });
});
