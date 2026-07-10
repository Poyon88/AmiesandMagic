// Le sélecteur de cible d'un déclencheur interactif (ex. effet composé de fin de
// tour) doit décrire l'EFFET réel. Régression : un buff de fin de tour affichait
// « choisissez une créature à remonter en main » (texte de Remontée figé).
import { describe, expect, it } from "vitest";
import { composedChoicePrompt } from "./composed-display";
import type { Capability, ComposedEffect } from "./types";

function cap(composed: ComposedEffect): Capability {
  return { uid: "u", trigger: "on_end_of_turn", effectKind: "immediate", abilityId: "_composed", composed };
}
const unitTarget = { entity: "unit", count: 1, side: "ally", location: "board", designation: "choice" } as const;

describe("composedChoicePrompt — libellé du sélecteur selon l'effet", () => {
  it("buff → renforcer (et non remontée)", () => {
    const p = composedChoicePrompt(cap({ content: "buff", magnitude: { x: 2, y: 2 }, target: unitTarget }));
    expect(p).toContain("renforcer");
    expect(p).not.toContain("remonter");
    expect(p).not.toContain("renvoyer");
  });

  it("chaque contenu a son verbe propre", () => {
    const verb = (c: ComposedEffect["content"], extra?: Partial<ComposedEffect>) =>
      composedChoicePrompt(cap({ content: c, magnitude: { x: 1, y: 1 }, target: { ...unitTarget, side: "enemy" }, ...extra }));
    expect(verb("debuff")).toContain("affaiblir");
    expect(verb("deal_damage")).toContain("blesser");
    expect(verb("heal")).toContain("soigner");
    expect(verb("destroy")).toContain("détruire");
    expect(verb("bounce")).toContain("renvoyer en main");
    expect(verb("paralyze")).toContain("paralyser");
  });
});
