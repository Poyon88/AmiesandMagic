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
  "appel",
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

describe("entrée « Appel depuis le deck »", () => {
  const cat = buildSpellEffectCatalog([...ALL_SPELL_KEYWORDS]);
  const appel = cat.find((e) => e.id === "appel");

  it("figure dans le catalogue — sinon elle est INTROUVABLE sur un sort", () => {
    // Le contenu composé existait déjà, mais la liste « + Effet » d'un sort se
    // construit à partir des MOTS-CLÉS DE SORT : un contenu sans mot-clé
    // équivalent n'y apparaît pas, et n'était atteignable qu'en ajoutant une
    // autre ligne puis en changeant son CONTENU.
    expect(appel).toBeDefined();
    expect(appel!.kind).toBe("composed");
  });

  it("pose un effet composé `appel`, prêt à être filtré", () => {
    expect(instantiatePreset(appel!)).toEqual({ content: "appel", magnitude: { x: 1 } });
  });

  it("ne remplace PAS le mot-clé « Appel du clan », qui reste proposé", () => {
    // Les deux coexistent parce qu'ils ne font pas la même chose : le mot-clé
    // hérite du clan de sa carte, l'entrée composée déclare sa cible.
    expect(cat.some((e) => e.id === "appel_du_clan")).toBe(true);
  });

  it("chaque ajout est INDÉPENDANT — pas d'objet partagé entre deux lignes", () => {
    const a = instantiatePreset(appel!);
    const b = instantiatePreset(appel!);
    a.magnitude!.x = 9;
    expect(b.magnitude!.x).toBe(1);
  });
});
