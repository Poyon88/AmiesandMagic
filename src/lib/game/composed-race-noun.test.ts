// Exhumation / Rappel limités à UNE race : le complément nomme la race
// (« ressuscite une Machine ») au lieu de « une créature (Machines) ».
import { describe, expect, it } from "vitest";
import { describeComposedCap } from "./composed-display";
import { RACE_FORMS_FR } from "@/lib/card-engine/race-forms";
import { getAllRaces } from "@/lib/card-engine/constants";
import type { Capability, ComposedEffectContent, TargetSpec } from "./types";

const cap = (content: ComposedEffectContent, target: Partial<TargetSpec>): Capability => ({
  uid: "a", trigger: "on_play", effectKind: "immediate", abilityId: "_composed",
  composed: { content, target: { entity: "unit", count: 1, side: "ally", location: "graveyard", designation: "choice", ...target } },
} as Capability);
const machines = { membership: { race: ["Machines"] } };

describe("Complément nommé par la race", () => {
  it("Exhumation : une / toutes / jusqu'à N Machines", () => {
    expect(describeComposedCap(cap("exhumation", machines))).toBe("Ressuscite une Machine de votre cimetière.");
    expect(describeComposedCap(cap("exhumation", { ...machines, count: "all" }))).toBe("Ressuscite toutes les Machines de votre cimetière.");
    expect(describeComposedCap(cap("exhumation", { ...machines, count: 3 }))).toBe("Ressuscite jusqu'à 3 Machines de votre cimetière.");
  });
  it("Rappel : toutes cartes ou unités seulement", () => {
    expect(describeComposedCap(cap("rappel", machines))).toBe("Renvoie une Machine de votre cimetière dans votre main.");
    expect(describeComposedCap(cap("rappel", { ...machines, cardKind: "creature", maxCost: 3 }))).toBe("Renvoie une Machine de votre cimetière dans votre main (coût ≤ 3).");
  });
  it("parenthèse gardée : deux races, race + clan, objets, actions", () => {
    expect(describeComposedCap(cap("exhumation", { membership: { race: ["Machines", "Golems"] } }))).toContain("une créature (Machines/Golems)");
    expect(describeComposedCap(cap("exhumation", { membership: { race: ["Machines"], clan: ["La Guilde des Ingénieurs"] } }))).toContain("une créature (Machines + La Guilde des Ingénieurs)");
    expect(describeComposedCap(cap("exhumation", { ...machines, entity: "unit_or_item" }))).toContain("(Machines)");
    expect(describeComposedCap(cap("rappel", { ...machines, cardKind: "spell" }))).toContain("une action (Machines)");
  });
  it("toutes les races du jeu ont leurs trois formes, {n} compris", () => {
    for (const race of getAllRaces()) {
      const f = RACE_FORMS_FR[race];
      expect(f?.one, race).toBeTruthy();
      expect(f?.all, race).toBeTruthy();
      expect(f?.upto, race).toContain("{n}");
    }
  });
});
