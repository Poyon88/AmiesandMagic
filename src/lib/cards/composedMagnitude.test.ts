// Le garde-fou d'amplitude des effets composés +X/+Y, au CONTRAT DE SORTIE.
import { describe, expect, it } from "vitest";
import { fillXYMagnitude } from "./composedMagnitude";
import type { Capability } from "@/lib/game/types";

const cap = (composed: Capability["composed"]): Capability =>
  ({ uid: "cx_0", trigger: "on_play", abilityId: "_composed", effectKind: "immediate", composed }) as Capability;

describe("fillXYMagnitude", () => {
  it("complète le `y` absent d'un buff : c'est ce qui rend Soleil/Lune/Chant capables de le majorer", () => {
    const out = fillXYMagnitude(cap({ content: "buff", magnitude: { x: 0 } }));
    expect(out.composed!.magnitude).toEqual({ x: 0, y: 0 });
  });

  it("complète aussi le `x` absent, et vaut pour le debuff", () => {
    expect(fillXYMagnitude(cap({ content: "debuff", magnitude: { y: 2 } })).composed!.magnitude).toEqual({ x: 0, y: 2 });
    expect(fillXYMagnitude(cap({ content: "buff" })).composed!.magnitude).toEqual({ x: 0, y: 0 });
  });

  it("ne touche pas aux valeurs déjà saisies", () => {
    expect(fillXYMagnitude(cap({ content: "buff", magnitude: { x: 3, y: 1 } })).composed!.magnitude).toEqual({ x: 3, y: 1 });
  });

  it("laisse `grant_keyword` intact : un `y` absent y garde le repli du moteur", () => {
    // Gloire conférée sans `y` ⇒ le moteur accorde 1 PV. Matérialiser un 0 ici
    // transformerait ce repli en « aucun PV », en silence.
    const out = fillXYMagnitude(cap({ content: "grant_keyword", grantAbilityId: "gloire", magnitude: { x: 1 } }));
    expect(out.composed!.magnitude).toEqual({ x: 1 });
  });

  it("laisse intacte une capacité sans effet composé", () => {
    const plain = { uid: "cw_0", trigger: "automatic", abilityId: "soleil", effectKind: "immediate" } as Capability;
    expect(fillXYMagnitude(plain)).toBe(plain);
  });
});
