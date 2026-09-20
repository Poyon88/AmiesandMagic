// OBJETS, LOT 4a — la FORGE peut enfin en fabriquer.
//
// Ces tests portent sur les règles, pas sur le rendu React : le type produit,
// le budget, et les deux failles que l'ouverture d'un troisième type de carte
// laissait béantes (la remise à zéro entre deux cartes, et la limite de
// capacités par deck).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ADDITIONAL_COST_POINTS, TYPES, TYPES_ALEATOIRES, additionalCostPoints } from "@/lib/card-engine/constants";
import { namedCreatureCapabilityIds } from "./deck-rules";
import { mkCard } from "./test-harness";
import type { Keyword } from "./types";

const SRC = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("Le type « Objet » dans la forge", () => {
  it("est proposé à l'auteur", () => {
    expect(TYPES).toContain("Objet");
  });

  it("fabrique bien un `item`", () => {
    const src = SRC("src/components/card-forge/CardForge.tsx");
    const i = src.indexOf("const FORGE_TO_GAME_TYPE");
    const decl = src.slice(i, src.indexOf("};", i));
    expect(decl).toContain('"Objet": "item"');
  });

  it("« Artefact » n'est PLUS proposé — c'était un piège à côté d'« Objet »", () => {
    // Il produisait un sort. L'auteur a cliqué dessus en croyant fabriquer un
    // objet et s'est retrouvé devant un panneau « Effets du sort » sans champ
    // d'équipement. Le libellé reste mappé (filet pour le générateur IA), mais
    // il ne s'affiche plus.
    expect(TYPES).not.toContain("Artefact");
    const src = SRC("src/components/card-forge/CardForge.tsx");
    const i = src.indexOf("const FORGE_TO_GAME_TYPE");
    expect(src.slice(i, src.indexOf("};", i))).toContain('"Artefact": "spell"');
  });

  it("le générateur ALÉATOIRE ne tire jamais un objet", () => {
    // Il ne sait pas doter un objet d'un coût d'équipement, ni lui choisir des
    // capacités qui partiront une fois transférées : il produirait des objets
    // gratuits à équiper et à moitié inertes.
    expect(TYPES_ALEATOIRES).not.toContain("Objet");
    expect(TYPES_ALEATOIRES).toContain("Unité");
    expect(SRC("src/components/card-forge/CardForge.tsx"))
      .toContain("pick(TYPES_ALEATOIRES)");
  });

  it("le coût d'équipement n'est écrit QUE sur un objet", () => {
    // Un 0 franc sur un sort laisserait croire à un équipement gratuit.
    const src = SRC("src/components/card-forge/CardForge.tsx");
    expect(src).toContain('equip_cost: FORGE_TO_GAME_TYPE[forgeCard.type] === "item" ? (forgeCard.equipCost ?? 0) : null');
  });
});

describe("Budget : le coût d'équipement rend des points", () => {
  it("il est négatif, comme tous les coûts additionnels", () => {
    expect(ADDITIONAL_COST_POINTS.equip).toBeLessThan(0);
  });

  it("le crédit est proportionnel au coût saisi", () => {
    expect(additionalCostPoints({ equipCost: 3 }))
      .toBe(3 * ADDITIONAL_COST_POINTS.equip);
  });

  it("il s'ajoute aux autres coûts sans les écraser", () => {
    expect(additionalCostPoints({ lifeCost: 2, equipCost: 3 }))
      .toBe(2 * ADDITIONAL_COST_POINTS.life + 3 * ADDITIONAL_COST_POINTS.equip);
  });

  it("aucun coût ⇒ zéro POSITIF, jamais « −0 »", () => {
    expect(Object.is(additionalCostPoints({ equipCost: 0 }), -0)).toBe(false);
    expect(additionalCostPoints({})).toBe(0);
  });
});

describe("Faille refermée : la limite de capacités par deck", () => {
  it("les capacités d'un OBJET comptent dans la limite", () => {
    // Un objet TRANSFÈRE sa capacité à son porteur : l'en exempter aurait
    // ouvert la porte de derrière — dix objets conférant Vol pour contourner un
    // plafond que dix créatures n'auraient pas eu le droit de franchir.
    const objet = mkCard({
      card_type: "item", attack: 1, health: 1,
      keywords: ["ranged", "taunt"] as unknown as Keyword[],
    });
    const ids = namedCreatureCapabilityIds(objet);
    expect(ids).toContain("taunt");
    expect(ids.length).toBeGreaterThan(0);
  });

  it("un SORT n'en porte toujours aucune", () => {
    const sort = mkCard({ card_type: "spell", attack: null, health: null });
    expect(namedCreatureCapabilityIds(sort)).toEqual([]);
  });
});

describe("Faille refermée : la remise à zéro entre deux cartes", () => {
  it("les deux réinitialisations remettent le coût d'équipement à zéro", () => {
    // Sans cela, un coût saisi sur un objet fuyait sur la carte suivante — et
    // `forge-reset.test.ts` l'a effectivement attrapé à l'écriture de ce lot.
    const src = SRC("src/components/card-forge/CardForge.tsx");
    expect(src.split("setManualEquipCost(0)").length - 1,
      "resetManualForm ET resetCardForm").toBe(2);
  });
});
