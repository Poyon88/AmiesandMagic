// Filtre par pouvoir : un effet composé répond au pouvoir dont il affiche l'icône.
import { describe, expect, it } from "vitest";
import { cardHasAbility, composedAbilityIds } from "./ability-filter";
import type { Capability } from "./types";

const compose = (composed: Capability["composed"]): Capability => ({
  uid: "cx", trigger: "on_play", effectKind: "immediate", abilityId: "_composed", composed,
});
const plateau = (over: object = {}) => ({ entity: "unit" as const, count: 1 as const, side: "enemy" as const, location: "board" as const, designation: "choice" as const, ...over });

describe("filtre par pouvoir", () => {
  it("un composé « paralyser » répond à Entrave, un « dégâts à toutes les ennemies » à Déferlement", () => {
    const caps = [
      compose({ content: "paralyze", target: plateau() }),
      compose({ content: "deal_damage", magnitude: { x: 2 }, target: plateau({ count: "all", designation: "automatic" }) }),
    ];
    expect(composedAbilityIds(caps).sort()).toEqual(["deferlement", "entrave"]);
    expect(cardHasAbility({ keywords: [], capabilities: caps }, "entrave")).toBe(true);
    expect(cardHasAbility({ keywords: [], capabilities: caps }, "impact")).toBe(false);
  });

  it("un don composé répond à la capacité conférée", () => {
    const caps = [compose({ content: "grant_keyword", grantAbilityId: "armure", target: plateau({ side: "ally" }) })];
    expect(cardHasAbility({ keywords: [], capabilities: caps }, "armure")).toBe(true);
  });

  it("mots-clés et mécaniques de sort restent trouvés", () => {
    expect(cardHasAbility({ keywords: ["taunt"] }, "taunt")).toBe(true);
    expect(cardHasAbility({ keywords: [], spell_keywords: [{ id: "siphon" }] }, "siphon")).toBe(true);
  });
});
