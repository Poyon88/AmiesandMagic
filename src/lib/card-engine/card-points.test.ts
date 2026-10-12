// Score d'une carte selon le barème (card-points.ts). Le barème de test part de
// l'a priori (ancien barème plat) pour que les attentes restent lisibles.
import { describe, expect, it } from "vitest";
import type { Capability, ComposedEffect } from "@/lib/game/types";
import { baremeAPriori } from "./calibrage";
import { scoreCarte, budgetCarte } from "./card-points";
import type { Bareme } from "./bareme";

const neutre = (): Bareme => {
  const b = baremeAPriori();
  b.declencheur = { on_play: 1, automatic: 1, spell_resolution: 1, on_end_of_turn: 1.6, on_attack: 0.8 };
  b.parts = { "race:Elfes": 0.1 };
  return b;
};

const unite = (caps: Capability[], extra: Record<string, unknown> = {}) => ({
  card_type: "creature" as const, mana_cost: 4, attack: 3, health: 3, rarity: "Commune",
  keywords: [], capabilities: caps, ...extra,
});

const cap = (abilityId: string, trigger: Capability["trigger"], params?: Capability["params"], more: Partial<Capability> = {}): Capability =>
  ({ uid: `${abilityId}-${trigger}`, abilityId, trigger, effectKind: "immediate", params, ...more });

describe("scoreCarte", () => {
  it("reproduit l'ancien barème quand tout vaut 1 (Provocation sur un 3/3)", () => {
    const b = neutre();
    const s = scoreCarte(b, unite([cap("taunt", "automatic")]));
    // 3×5 + 3×4 + Provocation 5
    expect(s.utilise).toBe(32);
    expect(s.budget).toBe(40);
  });

  it("le déclencheur pondère : fin de tour > entrée > attaque", () => {
    const b = neutre();
    const pts = (t: Capability["trigger"]) => scoreCarte(b, unite([cap("impact", t, { x: 2 })])).utilise;
    expect(pts("on_end_of_turn")).toBeGreaterThan(pts("on_play"));
    expect(pts("on_play")).toBeGreaterThan(pts("on_attack"));
  });

  it("un X au hasard vaut la moyenne entre le plancher et X, rabais de hasard compris", () => {
    const b = neutre();
    b.hasard = 1;
    const fixe = scoreCarte(b, unite([cap("selection", "on_play", { x: 3 })])).utilise;
    const tirage = scoreCarte(b, unite([cap("selection", "on_play", { x: 5, randomX: true, minX: 1 })])).utilise;
    expect(tirage).toBe(fixe);
  });

  it("le rabais des coûts additionnels est plafonné à une part du budget", () => {
    const b = neutre();
    b.plafondAdditionnel = 0.4;
    const s = scoreCarte(b, unite([], { mana_cost: 1, attack: 1, health: 1, life_cost: 20 }));
    expect(s.rabaisAdditionnel).toBe(-4); // 40 % de 10, pas 20 × −3
  });

  it("un composé sur toutes les ennemies coûte plus, un filtre de race le ramène", () => {
    const b = neutre();
    const comp = (target: ComposedEffect["target"]): Capability => ({
      ...cap("_composed", "spell_resolution"),
      composed: { content: "deal_damage", magnitude: { x: 2 }, target },
    });
    const sort = (c: Capability) => ({ card_type: "spell" as const, mana_cost: 3, attack: null, health: null, rarity: "Commune", capabilities: [c] });
    const base = { entity: "unit" as const, side: "enemy" as const, location: "board" as const, designation: "automatic" as const };
    const une = scoreCarte(b, sort(comp({ ...base, count: 1, designation: "choice" }))).utilise;
    const toutes = scoreCarte(b, sort(comp({ ...base, count: "all" }))).utilise;
    const elfes = scoreCarte(b, sort(comp({ ...base, count: "all", membership: { race: ["Elfes"] } }))).utilise;
    expect(toutes).toBeGreaterThan(une);
    expect(elfes).toBeLessThan(toutes);
  });

  it("l'éveil élargit le budget d'un mana équivalent", () => {
    const b = neutre();
    b.eveil = 0.5;
    expect(budgetCarte(b, unite([], { eveil_cost: 4 }))).toBe((4 + 2) * 10);
  });

  it("deux branches « OU » d'un même déclencheur ne comptent que la plus chère", () => {
    const b = neutre();
    const seule = scoreCarte(b, unite([cap("impact", "on_play", { x: 3 })])).utilise;
    const ou = scoreCarte(b, unite([
      cap("impact", "on_play", { x: 3 }, { alternative: true, uid: "a" }),
      cap("impact", "on_play", { x: 1 }, { alternative: true, uid: "b" }),
    ])).utilise;
    expect(ou).toBe(seule);
  });
});
