// COÛT OPTIONNEL — pour les capacités dont le X désigne un coût, un X non
// renseigné veut dire « n'importe quel coût » ; l'icône seule le représente.
import { describe, expect, it } from "vitest";
import { applyAction, getSelectionCards } from "./engine";
import { applyKeywordValueToLabel, keywordBadgeValue } from "./keyword-labels";
import { getSpellKeywordBadgeValue, getSpellKeywordDesc, getSpellKeywordLabel } from "./spell-keywords";
import { describeComposedCap } from "./composed-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, CardInstance, GameAction, GameState, Keyword, KeywordInstance, SpellKeywordInstance } from "./types";

const creature = (name: string, cost: number, over: Partial<Card> = {}) =>
  mkCard({ name, mana_cost: cost, attack: 1, health: 1, faction: "Mercenaires", rarity: "Commune", ...over });
const rappel = (amount?: number) => mkInstance(mkCard({
  name: "Souvenir", card_type: "spell", attack: null, health: null, mana_cost: 0,
  spell_keywords: [{ id: "rappel", ...(amount != null ? { amount } : {}) } as SpellKeywordInstance],
}));
function jouer(s: GameState, c: CardInstance, targetMap?: Record<string, string>): GameState {
  s.players[0].hand.push(c);
  return applyAction(s, { type: "play_card", cardInstanceId: c.instanceId, ...(targetMap ? { targetMap } : {}) } as GameAction);
}

describe("Rappel X", () => {
  it("X = 2 : une carte de coût 3 ne revient pas, une de coût 2 si", () => {
    const s = mkState();
    const chere = mkInstance(creature("Chère", 3)); const juste = mkInstance(creature("Juste", 2));
    s.players[0].graveyard.push(chere, juste);
    let st = jouer(s, rappel(2), { kw_0: chere.instanceId, target_0: chere.instanceId });
    expect(st.players[0].hand.map(c => c.card.name)).not.toContain("Chère");
    st = jouer(st, rappel(2), { kw_0: juste.instanceId, target_0: juste.instanceId });
    expect(st.players[0].hand.map(c => c.card.name)).toContain("Juste");
  });
  it("sans X : n'importe quel coût", () => {
    const s = mkState();
    const chere = mkInstance(creature("Chère", 9));
    s.players[0].graveyard.push(chere);
    const st = jouer(s, rappel(), { kw_0: chere.instanceId, target_0: chere.instanceId });
    expect(st.players[0].hand.map(c => c.card.name)).toContain("Chère");
  });
});

describe("Exhumation / Invocation sans coût", () => {
  it("Exhumation sans X ranime une créature de n'importe quel coût", () => {
    const s = mkState();
    const geant = mkInstance(creature("Géant", 9));
    s.players[0].graveyard.push(geant);
    const porteur = mkInstance(mkCard({
      name: "Nécromant", mana_cost: 1, attack: 1, health: 1, keywords: ["exhumation"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "exhumation" as Keyword }] as KeywordInstance[],
    }));
    const st = jouer(s, porteur);
    expect(st.players[0].board.map(c => c.card.name)).toContain("Géant");
  });

  it("Invocation sans X invoque, et chaque coût a sa chance", () => {
    let pasA1 = 0; const n = 60;
    for (let i = 0; i < n; i++) {
      const s = mkState();
      s.rngState = 7 + i * 7919;
      // Beaucoup de créatures à 1, une seule à chaque autre coût.
      s.factionCardPool = [
        ...Array.from({ length: 20 }, (_, k) => creature(`Petite${k}`, 1, { id: 9100 + k })),
        ...[2, 3, 4, 5, 6].map((c) => creature(`C${c}`, c, { id: 9200 + c })),
      ];
      const porteur = mkInstance(mkCard({
        name: "Mage", mana_cost: 1, attack: 1, health: 1, faction: "Mercenaires",
        keywords: ["invocation"] as unknown as Card["keywords"],
        keyword_instances: [{ id: "invocation" as Keyword }] as KeywordInstance[],
      }));
      const st = jouer(s, porteur);
      const invoquee = st.players[0].board.find(c => c.card.name !== "Mage");
      expect(invoquee).toBeDefined();
      if (invoquee!.card.mana_cost !== 1) pasA1++;
    }
    // Tirage direct : les 20 créatures à 1 sortiraient ~80 % du temps (autre
    // coût ≈ 20 %). Par coût : 5 coûts sur 6 ne sont pas 1 (≈ 83 %).
    expect(pasA1 / n).toBeGreaterThan(0.5);
  });
});

describe("Sélection sans coût : chaque coût à chances égales", () => {
  it("les coûts élevés, rares, sortent autant que les bas", () => {
    let hauts = 0, total = 0;
    for (let i = 0; i < 60; i++) {
      const s = mkState();
      s.players[0].mana = i;
      s.factionCardPool = [
        ...Array.from({ length: 30 }, (_, k) => creature(`Petite${k}`, 1, { id: 9300 + k })),
        creature("Chère", 8, { id: 9399 }),
      ];
      for (const c of getSelectionCards(s, 0, { faction: "Mercenaires" })) { total++; if (c.mana_cost === 8) hauts++; }
    }
    // Tirage direct : ~1 carte sur 31. Par coût : environ une sur deux.
    expect(hauts / total).toBeGreaterThan(0.2);
  });
});

describe("affichage : icône seule, libellé sans X, description sans coût", () => {
  it("capacité d'unité", () => {
    expect(keywordBadgeValue("rappel" as Keyword, undefined)).toBeNull();
    expect(applyKeywordValueToLabel("rappel" as Keyword, "Rappel X", undefined)).toBe("Rappel");
    expect(applyKeywordValueToLabel("rappel" as Keyword, "Rappel X", 3)).toBe("Rappel 3");
  });
  it("capacité d'action", () => {
    const sans = { id: "selection" } as SpellKeywordInstance;
    expect(getSpellKeywordBadgeValue(sans)).toBeNull();
    expect(getSpellKeywordLabel(sans)).toBe("Sélection");
    expect(getSpellKeywordDesc(sans)).not.toMatch(/coût/);
    expect(getSpellKeywordBadgeValue({ id: "selection", amount: 3 } as SpellKeywordInstance)).toBe("3");
    // Déchainement sans Y : le nombre d'actions reste affiché.
    expect(getSpellKeywordBadgeValue({ id: "dechainement", amount: 2 } as SpellKeywordInstance)).toBe("2");
  });
  it("effet composé", () => {
    const cap = (composed: object) => ({ uid: "u", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", composed }) as Capability;
    expect(describeComposedCap(cap({ content: "selection", magnitude: {} }))).toBe("Révèle 3 cartes et en garde une en main.");
    expect(describeComposedCap(cap({ content: "selection", magnitude: { x: 2 } }))).toContain("(coût 2)");
  });
});
