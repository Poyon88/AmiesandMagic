// Les ICÔNES de la carte et l'ordre de RÉSOLUTION doivent être le même ordre.
//
// Ils étaient calculés deux fois, dans deux fichiers, par deux boucles écrites à
// l'identique — et identiquement fausses : `[...keyword_instances, ...mots-clés
// sans instance]`. Un pouvoir sans X n'a rien à stocker, donc pas d'instance,
// donc il partait en queue quel que soit son rang dans `keywords[]`.
//
// Le premier correctif n'a touché que l'adaptateur (résolution) : la carte
// continuait d'afficher l'ancien ordre, et les deux se contredisaient à l'écran.
// Les deux lisent désormais `orderedKeywordSlots`. Ce fichier vérifie qu'ils ne
// peuvent plus se séparer — un futur « petit tri local » d'un côté le fera
// tomber.
import { describe, expect, it } from "vitest";
import { buildKeywordDisplayEntries, orderedKeywordSlots } from "./keyword-labels";
import { deriveCapabilities } from "./capability-adapter";
import { mkCard } from "./test-harness";
import type { Card, KeywordInstance } from "./types";

/** Devin du Ciel Fendu — la carte qui a révélé les deux défauts. */
const devin = () => mkCard({
  name: "Devin du Ciel Fendu", mana_cost: 3, attack: 2, health: 1,
  keywords: ["divination", "preincanter", "inspiration"] as never,
  keyword_instances: [
    { id: "preincanter", x: 2 },
    { id: "inspiration", x: 1 },
  ] as unknown as KeywordInstance[],
});

const iconesDe = (card: Card) => buildKeywordDisplayEntries(card).map((e) => e.kw);
const resolutionDe = (card: Card) => deriveCapabilities(card).map((c) => c.abilityId);

describe("Accord icônes / résolution", () => {
  it("« Devin du Ciel Fendu » : Divination en tête des DEUX côtés", () => {
    const card = devin();
    expect(iconesDe(card)).toEqual(["divination", "preincanter", "inspiration"]);
    expect(resolutionDe(card)).toEqual(["divination", "preincanter", "inspiration"]);
  });

  it("les deux ordres coïncident sur une série de dispositions", () => {
    const dispositions: { keywords: string[]; instances: KeywordInstance[] }[] = [
      // Pouvoir sans X en tête, au milieu, en queue.
      { keywords: ["divination", "preincanter", "inspiration"], instances: [{ id: "preincanter", x: 2 }, { id: "inspiration", x: 1 }] as never },
      { keywords: ["preincanter", "divination", "inspiration"], instances: [{ id: "preincanter", x: 2 }, { id: "inspiration", x: 1 }] as never },
      { keywords: ["preincanter", "inspiration", "divination"], instances: [{ id: "preincanter", x: 2 }, { id: "inspiration", x: 1 }] as never },
      // Instances en ordre inverse de keywords[] : elles ne doivent pas primer.
      { keywords: ["preincanter", "inspiration"], instances: [{ id: "inspiration", x: 1 }, { id: "preincanter", x: 2 }] as never },
      // Aucune instance du tout.
      { keywords: ["divination", "augure", "bravoure"], instances: [] },
      // Passifs mêlés aux pouvoirs.
      { keywords: ["armure", "divination", "vol", "preincanter"], instances: [{ id: "preincanter", x: 2 }] as never },
    ];

    for (const { keywords, instances } of dispositions) {
      const card = mkCard({
        keywords: keywords as never,
        keyword_instances: (instances.length ? instances : null) as never,
      });
      const icones = iconesDe(card);
      const resolution = resolutionDe(card);
      // La résolution ne retient que ce qui produit une capacité ; l'affichage
      // peint tout. On compare donc l'ordre RELATIF des ids communs.
      const communs = icones.filter((k) => resolution.includes(k));
      const resolutionCommune = resolution.filter((k) => icones.includes(k as never));
      expect(communs, `disposition ${keywords.join("+")}`).toEqual(resolutionCommune);
    }
  });

  it("l'ordre des icônes est exactement celui de keywords[] (passifs inclus)", () => {
    const card = mkCard({
      keywords: ["armure", "divination", "vol", "preincanter"] as never,
      keyword_instances: [{ id: "preincanter", x: 2 }] as unknown as KeywordInstance[],
    });
    expect(iconesDe(card)).toEqual(["armure", "divination", "vol", "preincanter"]);
  });
});

describe("orderedKeywordSlots — invariants", () => {
  it("préserve l'index d'origine de l'instance (clé React stable)", () => {
    const card = devin();
    const slots = orderedKeywordSlots(card);
    // preincanter est l'instance 0, inspiration l'instance 1, malgré le tri.
    expect(slots.find((s) => s.id === "preincanter")?.instanceIdx).toBe(0);
    expect(slots.find((s) => s.id === "inspiration")?.instanceIdx).toBe(1);
    // divination n'a pas d'instance.
    expect(slots.find((s) => s.id === "divination")?.instanceIdx).toBeUndefined();
  });

  it("garde les DEUX instances d'un même id (une icône par mode)", () => {
    const card = mkCard({
      keywords: ["convocation", "divination"] as never,
      keyword_instances: [
        { id: "convocation", x: 1 },
        { id: "convocation", x: 1, mode: "tap" },
      ] as unknown as KeywordInstance[],
    });
    const slots = orderedKeywordSlots(card);
    expect(slots.filter((s) => s.id === "convocation")).toHaveLength(2);
    // Et les icônes en peignent bien deux, dans cet ordre, avant Divination.
    expect(iconesDe(card)).toEqual(["convocation", "convocation", "divination"]);
  });

  it("n'oublie aucun mot-clé, quelle que soit l'incohérence des données", () => {
    const card = mkCard({
      keywords: ["divination", "divination"] as never, // doublon
      keyword_instances: [{ id: "preincanter", x: 2 }] as unknown as KeywordInstance[], // orpheline
    });
    const slots = orderedKeywordSlots(card);
    expect(slots.map((s) => s.id)).toEqual(["divination", "preincanter"]);
  });
});
