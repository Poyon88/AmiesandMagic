// Cible « unité ou héros » (entity "both") : la branche dédiée de describeTarget
// sortait avant d'ajouter la désignation — « au hasard » n'apparaissait pas
// (Réactif à Double Phase) — et accordait le camp au pluriel sur une cible unique.
import { describe, expect, it } from "vitest";
import { describeComposedCap } from "./composed-display";
import type { Capability } from "./types";

const cap = (side: string, content: string, designation: string, count: number | "all" = 1) => ({
  uid: "t", trigger: "spell_resolution", abilityId: "_composed", effectKind: "immediate",
  composed: { target: { side, count, entity: "both", location: "board", designation }, content, magnitude: { x: 4 } },
}) as unknown as Capability;

describe("cible unité ou héros", () => {
  it("dit le hasard", () => {
    expect(describeComposedCap(cap("any", "heal", "random"))).toBe("Soigne 4 PV à une cible (unité ou héros) au hasard.");
    expect(describeComposedCap(cap("enemy", "deal_damage", "random"))).toBe("Inflige 4 dégâts à une cible (unité ou héros) ennemie au hasard.");
  });

  it("accorde le camp au singulier, sans rien ajouter au choix", () => {
    expect(describeComposedCap(cap("enemy", "deal_damage", "choice"))).toBe("Inflige 4 dégâts à une cible (unité ou héros) ennemie.");
  });

  it("garde le pluriel pour « toutes »", () => {
    expect(describeComposedCap(cap("ally", "heal", "random", "all"))).toBe("Soigne 4 PV à toutes les unités et au héros alliés.");
  });
});
