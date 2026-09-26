// Singulier — couche d'affichage : peinture bicolore de l'icône, badge de
// déclencheur et phrase d'aide. Pas de DOM ici (environnement node) : on teste
// les fonctions PURES que KeywordIcon et les renderers consomment.
import { describe, expect, it } from "vitest";
import { keywordIconPaint, keywordModeColor, isLightHexColor, buildKeywordDisplayEntries } from "./keyword-labels";
import { SINGULIER_COLOR } from "./singulier";
import { describeKeyword, keywordTriggerBadge } from "./keyword-display";
import { composedBadge, describeComposedCap } from "./composed-display";
import { getSpellKeywordDesc, getSpellKeywordLabel } from "./spell-keywords";
import type { Capability } from "./types";

describe("Singulier — icône bicolore", () => {
  it("la couleur réservée est #0D9488", () => {
    expect(SINGULIER_COLOR.toUpperCase()).toBe("#0D9488");
  });

  it("sans Singulier : couleur unie du déclencheur, pas de liseré", () => {
    expect(keywordIconPaint(keywordModeColor("death"), false)).toEqual({ background: "#a83232", outline: false });
    expect(keywordIconPaint(null, undefined)).toEqual({ background: null, outline: false });
  });

  it("Singulier + Entrée (jaune) : moitié turquoise, moitié jaune, liseré (jaune est clair)", () => {
    const p = keywordIconPaint(keywordModeColor("entry"), true);
    expect(p.background).toContain("linear-gradient(90deg");
    expect(p.background).toContain(`${SINGULIER_COLOR} 0%`);
    expect(p.background).toContain(`${SINGULIER_COLOR} 50%`);
    expect(p.background).toContain("#FFE05C 50%");
    expect(p.outline).toBe(true);
  });

  it("Singulier + persistant : moitié turquoise, moitié BLANCHE, avec liseré", () => {
    const p = keywordIconPaint(null, true);
    expect(p.background).toContain(`${SINGULIER_COLOR} 0%`);
    expect(p.background).toContain("#ffffff 50%");
    expect(p.outline).toBe(true);
  });

  it("Singulier + Mort (rouge sombre) : pas de liseré nécessaire", () => {
    const p = keywordIconPaint(keywordModeColor("death"), true);
    expect(p.background).toContain("#a83232 50%");
    expect(p.outline).toBe(false);
  });

  it("isLightHexColor", () => {
    expect(isLightHexColor("#ffffff")).toBe(true);
    expect(isLightHexColor("#FFE05C")).toBe(true);
    expect(isLightHexColor("#0D9488")).toBe(false);
    expect(isLightHexColor("pas une couleur")).toBe(false);
  });

  it("l'entrée d'affichage porte le drapeau", () => {
    const entries = buildKeywordDisplayEntries({
      keywords: ["inspiration", "taunt"] as never,
      keyword_instances: [{ id: "inspiration", x: 1, singulier: true }] as never,
      effect_text: "",
    });
    expect(entries.find((e) => e.kw === ("inspiration" as never))?.singulier).toBe(true);
    expect(entries.find((e) => e.kw === ("taunt" as never))?.singulier).toBeUndefined();
  });
});

describe("Singulier — badge et aide", () => {
  it("badge « Mort · Singulier » en turquoise", () => {
    const b = keywordTriggerBadge("inspiration" as never, { id: "inspiration", mode: "death", singulier: true } as never)!;
    expect(b.label).toBe("Mort · Singulier");
    expect(b.color).toBe(SINGULIER_COLOR);
  });

  it("badge d'un passif Singulier : « Singulier » seul", () => {
    const b = keywordTriggerBadge("taunt" as never, { id: "taunt", singulier: true } as never)!;
    expect(b.label).toBe("Singulier");
  });

  it("sans Singulier, le badge est inchangé", () => {
    expect(keywordTriggerBadge("inspiration" as never, { id: "inspiration", mode: "death" } as never)?.label).toBe("Mort");
    expect(keywordTriggerBadge("taunt" as never)).toBeNull();
  });

  it("la description reçoit la phrase d'aide avec le moment", () => {
    const d = describeKeyword("inspiration" as never, { x: 1, instance: { mode: "death", singulier: true } })!;
    expect(d).toContain("Se déclenche à la mort si votre deck de départ ne contenait aucune carte en double.");
    const e = describeKeyword("inspiration" as never, { x: 1, instance: { singulier: true } })!;
    expect(e).toContain("Se déclenche à l'entrée si");
    const p = describeKeyword("taunt" as never, { instance: { singulier: true } })!;
    expect(p).toContain("Actif si votre deck de départ");
    expect(describeKeyword("inspiration" as never, { x: 1 })).not.toContain("deck de départ");
  });

  it("composé : badge et description", () => {
    const cap = { uid: "cx_0", abilityId: "_composed", effectKind: "immediate", trigger: "on_attack", composed: { content: "foi", magnitude: { x: 2 } }, singulier: true } as unknown as Capability;
    expect(composedBadge(cap)?.label).toBe("Attaque · Singulier");
    expect(composedBadge(cap)?.color).toBe(SINGULIER_COLOR);
    expect(describeComposedCap(cap)).toContain("Se déclenche à l'attaque si votre deck de départ");
  });

  it("sort : label et description", () => {
    const kw = { id: "foi", amount: 2, singulier: true } as never;
    expect(getSpellKeywordLabel(kw)).toBe("Foi 2 · Singulier");
    expect(getSpellKeywordDesc(kw)).toContain("Se déclenche à la résolution de l'action si votre deck de départ");
    expect(getSpellKeywordLabel({ id: "foi", amount: 2 } as never)).toBe("Foi 2");
  });
});
