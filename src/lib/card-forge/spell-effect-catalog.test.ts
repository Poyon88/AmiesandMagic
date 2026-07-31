// Le catalogue est la couture entre l'ancien vocabulaire (mots-clés de sort) et
// le modèle composé : ces tests verrouillent (a) que chaque preset est un
// ComposedEffect valide, (b) qu'aucun mot-clé n'est perdu en route, et (c) que
// le nom affiché sur la carte reste celui que l'auteur a choisi dans la liste
// (« Déferlement » doit rester « Déferlement », pas « Infliger des dégâts »).
import { describe, expect, it } from "vitest";
import { buildSpellEffectCatalog, GRANT_ENTRY, instantiatePreset } from "./spell-effect-catalog";
import { ALL_SPELL_KEYWORDS } from "@/lib/game/spell-keywords";
import { composedKeywordName, describeComposedCap } from "@/lib/game/composed-display";
import type { Capability, ComposedEffect } from "@/lib/game/types";

const CONTENTS = new Set([
  "deal_damage", "heal", "buff", "debuff", "draw_cards", "discard", "summon_token",
  "gain_mana", "destroy", "bounce", "paralyze", "grant_keyword", "exhumation",
  "selection", "selection_magique", "renfort_royal", "poison", "invocation", "epargne", "incineration", "devoration", "retour_differe",
]);

const catalog = buildSpellEffectCatalog(ALL_SPELL_KEYWORDS);
const capOf = (composed: ComposedEffect): Capability =>
  ({ uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", composed });

describe("catalogue d'effets de sort", () => {
  it("expose chaque mot-clé de sort exactement une fois, plus l'entrée Conférer", () => {
    const ids = catalog.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ALL_SPELL_KEYWORDS) expect(ids).toContain(id);
    expect(ids).toContain(GRANT_ENTRY.id);
  });

  it("chaque preset composé porte un contenu connu et une cible cohérente", () => {
    for (const entry of catalog) {
      if (entry.kind !== "composed") continue;
      const eff = instantiatePreset(entry);
      expect(CONTENTS.has(eff.content), `${entry.id} → ${eff.content}`).toBe(true);
      if (eff.target) {
        // "scatter" n'a de sens que pour dégâts/soin (cf. resolveComposedEffect).
        if (eff.target.designation === "scatter") {
          expect(["deal_damage", "heal"]).toContain(eff.content);
        }
        // Une cible "self" sur un sort n'aurait pas de source unité.
        expect(eff.target.entity).not.toBe("self");
      }
    }
  });

  it("instantiatePreset renvoie des objets indépendants", () => {
    const entry = catalog.find((e) => e.kind === "composed" && e.id === "deferlement")!;
    const a = instantiatePreset(entry);
    const b = instantiatePreset(entry);
    a.target!.side = "ally";
    expect(b.target!.side).toBe("enemy");
  });

  it("le vocabulaire d'origine survit à l'affichage", () => {
    const byId = new Map(catalog.map((e) => [e.id, e]));
    // Ces trois presets doivent retomber sur l'icône/nom du mot-clé choisi.
    const expectations: [string, string][] = [
      ["deferlement", "Déferlement"],
      ["cataclysme", "Cataclysme"],
      ["tempete", "Tempête"],
    ];
    for (const [id, expected] of expectations) {
      const entry = byId.get(id)!;
      expect(entry.kind).toBe("composed");
      const name = composedKeywordName(capOf(instantiatePreset(entry)));
      expect(name, `${id} → ${name}`).toBe(expected);
    }
  });

  it("chaque preset produit une phrase de carte non vide", () => {
    for (const entry of catalog) {
      if (entry.kind !== "composed") continue;
      const text = describeComposedCap(capOf(instantiatePreset(entry)));
      expect(text.length, `${entry.id} : phrase vide`).toBeGreaterThan(1);
      expect(text, `${entry.id} : contenu brut non traduit`).not.toContain(entry.kind === "composed" ? "undefined" : "");
    }
  });
});
