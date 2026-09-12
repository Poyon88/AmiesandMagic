// SÉLECTION AU HASARD : le X d'une Sélection (selection / selection_magique /
// renfort_royal) devient un plafond tiré entre 1 et lui à chaque déclenchement,
// via le drapeau `randomX` de l'instance — le même contrat que la case « ? »
// des amplitudes composées, étendu aux mots-clés curés et aux sorts.
import { describe, expect, it } from "vitest";
import { applyAction, initRNG, plafondSelection, selectionAmplitudeOnPlay } from "./engine";
import { getCapabilities } from "./capability-adapter";
import { buildKeywordInstances } from "../card-forge/keyword-instances";
import { getSpellKeywordBadgeValue, getSpellKeywordDesc } from "./spell-keywords";
import { keywordBadgeValue } from "./keyword-labels";
import { resolveMarkers } from "./desc-markers";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, Keyword, SpellKeywordInstance } from "./types";

describe("plafondSelection — le tirage", () => {
  it("sans drapeau, rend le X tel quel", () => {
    expect(plafondSelection(4, undefined, () => 0.99)).toBe(4);
    expect(plafondSelection(4, false, () => 0)).toBe(4);
  });
  it("sous un plafond < 2, rien à tirer : constante", () => {
    expect(plafondSelection(1, true, () => 0.99)).toBe(1);
    expect(plafondSelection(0, true, () => 0.5)).toBe(0);
  });
  it("avec drapeau, tire un entier entre 1 et X inclus", () => {
    expect(plafondSelection(4, true, () => 0)).toBe(1);
    expect(plafondSelection(4, true, () => 0.999)).toBe(4);
    expect(plafondSelection(4, true, () => 0.5)).toBe(3);
  });
});

describe("le drapeau voyage dans le modèle unifié", () => {
  it("créature : keyword_instances.randomX → capability.params.randomX", () => {
    const card = mkCard({
      keywords: ["selection"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "selection" as Keyword, x: 3, randomX: true }],
    });
    const cap = getCapabilities(card).find((c) => c.abilityId === "selection")!;
    expect(cap.params?.x).toBe(3);
    expect(cap.params?.randomX).toBe(true);
    expect(selectionAmplitudeOnPlay(card, "selection")).toEqual({ x: 3, randomX: true });
  });
  it("créature sans drapeau : aucun champ parasite", () => {
    const card = mkCard({
      keywords: ["selection"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "selection" as Keyword, x: 3 }],
    });
    const cap = getCapabilities(card).find((c) => c.abilityId === "selection")!;
    expect(cap.params).toEqual({ x: 3 });
    expect(selectionAmplitudeOnPlay(card, "selection")).toEqual({ x: 3, randomX: false });
  });
  it("sort : spell_keywords.randomX → capability.params.randomX", () => {
    const card = mkCard({
      card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "selection_magique", amount: 4, randomX: true }] as SpellKeywordInstance[],
    });
    const cap = getCapabilities(card).find((c) => c.abilityId === "selection_magique")!;
    expect(cap.params?.randomX).toBe(true);
  });
});

describe("la forge persiste le drapeau", () => {
  it("buildKeywordInstances écrit randomX: true sur une Sélection cochée", () => {
    expect(buildKeywordInstances({
      labels: ["Sélection X"], xValues: { "Sélection X": 3 }, randomX: { "Sélection X": true },
    })).toEqual([{ id: "selection", x: 3, randomX: true }]);
  });
  it("…et l'ignore sur une capacité qui n'est pas une Sélection", () => {
    expect(buildKeywordInstances({
      labels: ["Tempête X"], xValues: { "Tempête X": 3 }, randomX: { "Tempête X": true },
    })).toEqual([{ id: "tempete", x: 3 }]);
  });
});

describe("affichage : « 1 à X » et badge « X? »", () => {
  it("description créature : le X devient « 1 à X » quand l'instance porte le drapeau", () => {
    const s = resolveMarkers("coût ≤ X", "selection", { x: 3, instance: { randomX: true } });
    expect(s).toBe("coût ≤ 1 à 3");
    expect(resolveMarkers("coût ≤ X", "selection", { x: 3, instance: {} })).toBe("coût ≤ 3");
    // Plafond 1 : constante, pas de plage.
    expect(resolveMarkers("coût ≤ X", "selection", { x: 1, instance: { randomX: true } })).toBe("coût ≤ 1");
  });
  it("description sort : même règle", () => {
    const desc = getSpellKeywordDesc({ id: "selection", amount: 3, randomX: true });
    expect(desc).toContain("1 à 3");
    expect(getSpellKeywordDesc({ id: "selection", amount: 3 })).not.toContain("1 à");
  });
  it("badges : « 3? » côté créature comme côté sort", () => {
    expect(keywordBadgeValue("selection" as Keyword, 3, { id: "selection" as Keyword, x: 3, randomX: true })).toBe("3?");
    expect(keywordBadgeValue("selection" as Keyword, 3, { id: "selection" as Keyword, x: 3 })).toBe("3");
    expect(getSpellKeywordBadgeValue({ id: "selection", amount: 3, randomX: true })).toBe("3?");
  });
});

// Le pool offre des communes de coût 1, 2 et 3 ; la Sélection en fin de tour
// porte X = 3 au hasard. Sur plusieurs graines, l'offre doit parfois EXCLURE
// la carte à 3 (plafond tiré < 3) et ne jamais dépasser 3 — tout en restant
// déterministe pour une graine donnée (les deux clients rejouent la même).
describe("moteur : Sélection curée en fin de tour, plafond tiré via la RNG semée", () => {
  function partie(seed: number) {
    const s = mkState();
    s.factionCardPool = [1, 2, 3].map((cost) => mkCard({
      id: 700 + cost, name: `C${cost}`, faction: "Mercenaires", rarity: "Commune", mana_cost: cost,
    }));
    const src = mkInstance(mkCard({
      attack: 1, health: 3, faction: undefined,
      keywords: ["selection"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "selection" as Keyword, mode: "end_of_turn", x: 3, randomX: true }],
    }));
    s.players[0].board = [src];
    s.rngState = seed;
    initRNG(seed);
    return applyAction(s, { type: "end_turn" });
  }
  it("jamais au-dessus du plafond, parfois en dessous, et rejouable à l'identique", () => {
    const offres = new Set<string>();
    let sousPlafond = false;
    for (let seed = 1; seed <= 40; seed++) {
      const next = partie(seed);
      const ids = next.pendingTriggers?.[0]?.selectionOptionIds ?? [];
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.every((id) => id <= 703)).toBe(true);
      if (!ids.includes(703)) sousPlafond = true;
      offres.add(`${seed}:${[...ids].sort().join(",")}`);
      // Déterminisme : la même graine reproduit la même offre.
      const again = partie(seed);
      expect([...(again.pendingTriggers?.[0]?.selectionOptionIds ?? [])].sort()).toEqual([...ids].sort());
    }
    expect(sousPlafond).toBe(true);
  });
  it("sans drapeau, la carte à 3 est toujours proposée (pool de 3 cartes, offre de 3)", () => {
    const s = mkState();
    s.factionCardPool = [1, 2, 3].map((cost) => mkCard({
      id: 800 + cost, name: `D${cost}`, faction: "Mercenaires", rarity: "Commune", mana_cost: cost,
    }));
    const src = mkInstance(mkCard({
      attack: 1, health: 3, faction: undefined,
      keywords: ["selection"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "selection" as Keyword, mode: "end_of_turn", x: 3 }],
    }));
    s.players[0].board = [src];
    initRNG(7);
    const next = applyAction(s, { type: "end_turn" });
    expect(next.pendingTriggers?.[0]?.selectionOptionIds).toContain(803);
  });
});
