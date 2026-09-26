// PLANCHER A d'un coût « au hasard » : avec la case « ? », les coûts se tirent
// entre A et X au lieu de 1 et X. Exemple demandé : une Sélection 4/6 ne
// propose que des cartes de 4 à 6 manas.
import { describe, expect, it } from "vitest";
import { applyAction, getFaveurCard, getMagicalSelectionCards, getSelectionCards, plancherAleatoire, selectionAmplitudeOnPlay } from "./engine";
import { getCapabilities } from "./capability-adapter";
import { buildKeywordInstances } from "../card-forge/keyword-instances";
import { describeComposedCap } from "./composed-display";
import { getSpellKeywordBadgeValue, getSpellKeywordDesc } from "./spell-keywords";
import { keywordBadgeValue } from "./keyword-labels";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, Keyword, SpellKeywordInstance } from "./types";

/** Vivier : deux communes à chaque coût de 1 à 8. */
function etat(type: Card["card_type"] = "creature") {
  const s = mkState();
  const cartes = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((cost) => [0, 1].map((n) => mkCard({
    id: 700 + cost * 10 + n, name: `C${cost}-${n}`, faction: "Mercenaires",
    rarity: "Commune", mana_cost: cost, card_type: type,
    ...(type === "spell" ? { attack: null, health: null } : {}),
  })));
  if (type === "spell") s.allSpellsPool = cartes; else s.factionCardPool = cartes;
  return s;
}
const src = { faction: "Mercenaires" };

describe("plancherAleatoire", () => {
  it("borne A à [1, X]", () => {
    expect(plancherAleatoire(undefined, 6)).toBe(1);
    expect(plancherAleatoire(4, 6)).toBe(4);
    expect(plancherAleatoire(0, 6)).toBe(1);
    expect(plancherAleatoire(9, 6)).toBe(6); // au pire, coût exact X
  });
});

describe("Sélection A/X", () => {
  it("4/6 : toutes les cartes proposées coûtent entre 4 et 6, sur de nombreux germes", () => {
    const vus = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const s = etat();
      s.players[0].mana = i;
      const offre = getSelectionCards(s, 6, src, undefined, true, undefined, 4);
      expect(offre.length).toBeGreaterThan(0);
      for (const c of offre) {
        expect(c.mana_cost).toBeGreaterThanOrEqual(4);
        expect(c.mana_cost).toBeLessThanOrEqual(6);
        vus.add(c.mana_cost);
      }
    }
    // Le tirage couvre bien toute la plage, pas seulement le plafond.
    expect([...vus].sort()).toEqual([4, 5, 6]);
  });

  it("sans plancher : comportement d'avant (1 à X)", () => {
    const vus = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const s = etat();
      s.players[0].mana = i;
      for (const c of getSelectionCards(s, 3, src, undefined, true)) vus.add(c.mana_cost);
    }
    expect(Math.min(...vus)).toBe(1);
  });

  it("le plancher est ignoré sans la case « ? » (coût exact X)", () => {
    const offre = getSelectionCards(etat(), 6, src, undefined, false, undefined, 4);
    expect(offre.every((c) => c.mana_cost === 6)).toBe(true);
  });

  it("Sélection magique : même plage sur les sorts", () => {
    for (let i = 0; i < 20; i++) {
      const s = etat("spell");
      s.players[0].mana = i;
      const offre = getMagicalSelectionCards(s, 6, src, undefined, undefined, true, 4);
      expect(offre.every((c) => c.mana_cost >= 4 && c.mana_cost <= 6)).toBe(true);
    }
  });
});

describe("Faveur A/X", () => {
  it("la carte tirée coûte entre A et X", () => {
    for (let i = 0; i < 30; i++) {
      const s = etat();
      s.players[0].mana = i;
      const c = getFaveurCard(s, 6, src, undefined, true, undefined, 5)!;
      expect(c.mana_cost).toBeGreaterThanOrEqual(5);
      expect(c.mana_cost).toBeLessThanOrEqual(6);
    }
  });
});

describe("Invocation composée A/X", () => {
  it("la créature invoquée coûte entre A et X", () => {
    for (let i = 0; i < 15; i++) {
      const s = etat();
      s.rngState = 1000 + i * 7919;
      const sort = mkInstance(mkCard({
        name: "Portail", card_type: "spell", attack: null, health: null, faction: "Mercenaires",
        capabilities: [{
          uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
          composed: { content: "invocation", magnitude: { x: 7, randomX: true, minX: 6 } },
        }] as never,
      }));
      s.players[0].hand.push(sort);
      const next = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId });
      const invoquee = next.players[0].board[0];
      expect(invoquee).toBeDefined();
      expect(invoquee.card.mana_cost).toBeGreaterThanOrEqual(6);
      expect(invoquee.card.mana_cost).toBeLessThanOrEqual(7);
    }
  });
});

describe("la donnée voyage : forge → instance → capacité", () => {
  it("buildKeywordInstances pose minX, borné au plafond, et seulement sous « ? »", () => {
    const [avec] = buildKeywordInstances({
      labels: ["Sélection X"], xValues: { "Sélection X": 6 }, randomX: { "Sélection X": true }, minX: { "Sélection X": 4 },
    }) as { minX?: number; randomX?: boolean }[];
    expect(avec?.randomX).toBe(true);
    expect(avec?.minX).toBe(4);
    const [sans] = buildKeywordInstances({
      labels: ["Sélection X"], xValues: { "Sélection X": 6 }, minX: { "Sélection X": 4 },
    }) as { minX?: number }[];
    expect(sans?.minX).toBeUndefined();
  });

  it("keyword_instances.minX → capability.params.minX → amplitude d'entrée en jeu", () => {
    const card = mkCard({
      keywords: ["selection"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "selection" as Keyword, x: 6, randomX: true, minX: 4 }],
    });
    expect(getCapabilities(card).find((c) => c.abilityId === "selection")!.params?.minX).toBe(4);
    expect(selectionAmplitudeOnPlay(card, "selection")).toEqual({ x: 6, randomX: true, minX: 4 });
  });
});

describe("affichage", () => {
  it("pastille « 4–6 » et description « 4 à 6 » côté sort", () => {
    const kw = { id: "selection", amount: 6, randomX: true, minX: 4 } as SpellKeywordInstance;
    expect(getSpellKeywordBadgeValue(kw)).toBe("4–6");
    expect(getSpellKeywordDesc(kw)).toContain("4 à 6");
  });
  it("pastille côté créature", () => {
    expect(keywordBadgeValue("selection" as Keyword, 6, { id: "selection" as Keyword, x: 6, randomX: true, minX: 4 })).toBe("4–6");
    expect(keywordBadgeValue("selection" as Keyword, 6, { id: "selection" as Keyword, x: 6, randomX: true })).toMatch(/\?$/);
  });
  it("effet composé : « 4 à 6 »", () => {
    const cap = {
      uid: "u", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
      composed: { content: "selection", magnitude: { x: 6, randomX: true, minX: 4 } },
    } as unknown as Capability;
    expect(describeComposedCap(cap)).toContain("4 à 6");
  });
});
