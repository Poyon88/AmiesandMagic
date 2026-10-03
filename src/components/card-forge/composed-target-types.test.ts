import { describe, expect, it } from "vitest";
import { basculerType, cibleDesTypes, typesCoches } from "./composed-target-types";
import type { TargetSpec } from "@/lib/game/types";

const cible = (p: Partial<TargetSpec>): TargetSpec => ({ entity: "unit", count: 1, side: "ally", location: "graveyard", designation: "choice", ...p });
const tri = (s: Set<string> | null) => s && [...s].sort();

describe("Type des cibles — cases cumulables", () => {
  it("Rappel par défaut (unit, sans nature) = Unité + Action", () => {
    expect(tri(typesCoches(cible({}), true))).toEqual(["spell", "unit"]);
    // Contenu sans case Action : Unité seule.
    expect(tri(typesCoches(cible({}), false))).toEqual(["unit"]);
  });
  it("aller-retour cases → cible → cases sur toutes les combinaisons cartes", () => {
    const combos: string[][] = [["unit"], ["spell"], ["item"], ["unit", "spell"], ["unit", "item"], ["spell", "item"], ["unit", "spell", "item"]];
    for (const c of combos) {
      const t = cible(cibleDesTypes(new Set(c as never), true));
      expect(tri(typesCoches(t, true))).toEqual([...c].sort());
    }
  });
  it("encodage en base inchangé pour les cas historiques", () => {
    expect(cibleDesTypes(new Set(["unit", "spell"]), true)).toEqual({ entity: "unit", cardKind: undefined });
    expect(cibleDesTypes(new Set(["unit", "item"]), false)).toEqual({ entity: "unit_or_item", cardKind: undefined });
    expect(cibleDesTypes(new Set(["hero", "unit"]), false)).toEqual({ entity: "both", cardKind: undefined });
    expect(cibleDesTypes(new Set(["self"]), false)).toMatchObject({ entity: "self", designation: "automatic" });
  });
  it("exclusivités : Soi-même seul, Héros sans action/objet, jamais zéro case", () => {
    expect(tri(basculerType(new Set(["unit", "spell"]), "self"))).toEqual(["self"]);
    expect(tri(basculerType(new Set(["self"]), "unit"))).toEqual(["unit"]);
    expect(tri(basculerType(new Set(["unit", "item"]), "hero"))).toEqual(["hero", "unit"]);
    expect(basculerType(new Set(["unit"]), "unit")).toBeNull();
  });
});
