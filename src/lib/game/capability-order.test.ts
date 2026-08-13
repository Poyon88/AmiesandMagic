// L'ordre des pouvoirs d'une créature est celui de `keywords[]`.
//
// Constaté sur « Devin du Ciel Fendu » (Divination · Préincanter 2 ·
// Inspiration 1) : la forge affiche cet ordre dans « Déclenchement des
// pouvoirs », mais la carte en base portait des `capabilities` dans un autre —
// Divination reléguée en DERNIER. Or ce sont les capabilities qui pilotent la
// résolution, et l'ordre compte dès qu'un pouvoir prépare le terrain d'un autre.
//
// Cause : `effectiveCreatureInstances` concaténait `[...keyword_instances,
// ...mots-clés sans instance]`. Un mot-clé sans X n'a pas d'instance (rien à y
// stocker) : il partait donc systématiquement en queue, quel que soit son rang
// dans `keywords[]`. `keyword_instances` est une source de DONNÉES (x, y, mode),
// pas un ordre.
import { describe, expect, it } from "vitest";
import { deriveCapabilities } from "./capability-adapter";
import { mkCard } from "./test-harness";
import type { Card, KeywordInstance } from "./types";

/** Ordre des abilities dérivées, dans l'ordre des capabilities. */
const ordre = (card: Card) => deriveCapabilities(card).map((c) => c.abilityId);

describe("Ordre des pouvoirs d'une créature", () => {
  it("« Devin du Ciel Fendu » : Divination reste en TÊTE, comme déclaré", () => {
    // Donnée exacte relevée en base, hors capabilities (qui sont dérivées).
    const card = mkCard({
      name: "Devin du Ciel Fendu", mana_cost: 3, attack: 2, health: 1,
      keywords: ["divination", "preincanter", "inspiration"] as never,
      keyword_instances: [
        { id: "preincanter", x: 2 },
        { id: "inspiration", x: 1 },
      ] as unknown as KeywordInstance[],
    });

    expect(ordre(card)).toEqual(["divination", "preincanter", "inspiration"]);
  });

  it("le mot-clé sans X peut être au milieu, ou en dernier", () => {
    const milieu = mkCard({
      keywords: ["preincanter", "divination", "inspiration"] as never,
      keyword_instances: [
        { id: "preincanter", x: 2 },
        { id: "inspiration", x: 1 },
      ] as unknown as KeywordInstance[],
    });
    expect(ordre(milieu)).toEqual(["preincanter", "divination", "inspiration"]);

    const fin = mkCard({
      keywords: ["preincanter", "inspiration", "divination"] as never,
      keyword_instances: [
        { id: "preincanter", x: 2 },
        { id: "inspiration", x: 1 },
      ] as unknown as KeywordInstance[],
    });
    expect(ordre(fin)).toEqual(["preincanter", "inspiration", "divination"]);
  });

  it("l'ordre des instances ne prime PAS sur celui de keywords[]", () => {
    // Instances volontairement en ordre inverse : elles portent les données, pas
    // le rang.
    const card = mkCard({
      keywords: ["preincanter", "inspiration"] as never,
      keyword_instances: [
        { id: "inspiration", x: 1 },
        { id: "preincanter", x: 2 },
      ] as unknown as KeywordInstance[],
    });
    expect(ordre(card)).toEqual(["preincanter", "inspiration"]);
  });

  it("les X restent appariés au bon mot-clé après réordonnancement", () => {
    const card = mkCard({
      keywords: ["divination", "preincanter", "inspiration"] as never,
      keyword_instances: [
        { id: "preincanter", x: 2 },
        { id: "inspiration", x: 1 },
      ] as unknown as KeywordInstance[],
    });
    const caps = deriveCapabilities(card);
    const x = (id: string) => caps.find((c) => c.abilityId === id)?.params?.x;
    expect(x("preincanter")).toBe(2);
    expect(x("inspiration")).toBe(1);
  });

  it("sans aucune instance, l'ordre de keywords[] est déjà respecté (inchangé)", () => {
    const card = mkCard({
      keywords: ["divination", "augure", "bravoure"] as never,
    });
    expect(ordre(card)).toEqual(["divination", "augure", "bravoure"]);
  });
});

describe("Ordre des pouvoirs — données héritées préservées", () => {
  it("une instance absente de keywords[] n'est pas perdue (rangée en queue)", () => {
    const card = mkCard({
      keywords: ["divination"] as never,
      keyword_instances: [
        { id: "preincanter", x: 2 },
      ] as unknown as KeywordInstance[],
    });
    expect(ordre(card)).toEqual(["divination", "preincanter"]);
  });

  it("deux instances d'un même id sont toutes conservées", () => {
    // Une Map id→instance unique en aurait perdu une.
    const card = mkCard({
      keywords: ["preincanter", "divination"] as never,
      keyword_instances: [
        { id: "preincanter", x: 2 },
        { id: "preincanter", x: 5, mode: "death" },
      ] as unknown as KeywordInstance[],
    });
    const caps = deriveCapabilities(card);
    expect(caps.filter((c) => c.abilityId === "preincanter")).toHaveLength(2);
    // Et Divination reste APRÈS les deux, comme dans keywords[].
    expect(ordre(card)).toEqual(["preincanter", "preincanter", "divination"]);
  });

  it("un id répété dans keywords[] ne dédouble pas la capacité", () => {
    const card = mkCard({
      keywords: ["divination", "preincanter", "divination"] as never,
      keyword_instances: [{ id: "preincanter", x: 2 }] as unknown as KeywordInstance[],
    });
    expect(ordre(card)).toEqual(["divination", "preincanter"]);
  });
});
