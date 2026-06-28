// Tests des règles de capacité à la composition de deck (deck-rules.ts).
import { describe, expect, it } from "vitest";
import { namedCreatureCapabilityIds, creatureCapabilityCounts, capabilityLimitViolations } from "./deck-rules";
import type { Capability, Card } from "./types";

let seq = 1;
function mkCard(partial: Partial<Card>): Card {
  return {
    id: seq++, name: "C", mana_cost: 0, card_type: "creature", attack: 1, health: 1,
    effect_text: "", keywords: [], spell_keywords: null, spell_effects: null,
    image_url: null, capabilities: null, ...partial,
  } as Card;
}
// Crée `n` entrées de cartes créature distinctes portant le mot-clé `kw`, qty 1.
function creatures(kw: string, n: number) {
  return Array.from({ length: n }, () => ({ card: mkCard({ keywords: [kw] as unknown as Card["keywords"] }), quantity: 1 }));
}

describe("namedCreatureCapabilityIds", () => {
  it("retourne l'id de capacité nommé d'une créature", () => {
    expect(namedCreatureCapabilityIds(mkCard({ keywords: ["berserk"] as unknown as Card["keywords"] }))).toEqual(["berserk"]);
  });
  it("dédoublonne une capacité présente deux fois sur une même carte", () => {
    const cap = (uid: string): Capability => ({ uid, trigger: "on_play", effectKind: "immediate", abilityId: "berserk" });
    const card = mkCard({ capabilities: [cap("a"), cap("b")] });
    expect(namedCreatureCapabilityIds(card)).toEqual(["berserk"]);
  });
  it("ignore les effets composés (_composed absent du registre ABILITIES)", () => {
    const composed: Capability = { uid: "c1", trigger: "on_play", effectKind: "immediate", abilityId: "_composed",
      composed: { content: "deal_damage", magnitude: { x: 1 }, target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "random" } } };
    expect(namedCreatureCapabilityIds(mkCard({ capabilities: [composed] }))).toEqual([]);
  });
  it("retourne [] pour un sort", () => {
    expect(namedCreatureCapabilityIds(mkCard({ card_type: "spell", attack: null, health: null, keywords: ["berserk"] as unknown as Card["keywords"] }))).toEqual([]);
  });
});

describe("creatureCapabilityCounts + capabilityLimitViolations", () => {
  it("13 créatures « berserk » → violation (count 13)", () => {
    const counts = creatureCapabilityCounts(creatures("berserk", 13));
    expect(counts.get("berserk")).toBe(13);
    const v = capabilityLimitViolations(counts);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ id: "berserk", count: 13 });
  });

  it("exactement 12 « berserk » → aucune violation (seuil inclusif)", () => {
    expect(capabilityLimitViolations(creatureCapabilityCounts(creatures("berserk", 12)))).toEqual([]);
  });

  it("le comptage est pondéré par la quantité", () => {
    const entries = [
      { card: mkCard({ keywords: ["berserk"] as unknown as Card["keywords"] }), quantity: 3 },
      { card: mkCard({ keywords: ["berserk"] as unknown as Card["keywords"] }), quantity: 3 },
      { card: mkCard({ keywords: ["berserk"] as unknown as Card["keywords"] }), quantity: 3 },
      { card: mkCard({ keywords: ["berserk"] as unknown as Card["keywords"] }), quantity: 3 },
      { card: mkCard({ keywords: ["berserk"] as unknown as Card["keywords"] }), quantity: 3 },
    ];
    expect(creatureCapabilityCounts(entries).get("berserk")).toBe(15);
    expect(capabilityLimitViolations(creatureCapabilityCounts(entries))).toHaveLength(1);
  });

  it("Vol / ranged sont exemptés même au-delà de la limite", () => {
    expect(capabilityLimitViolations(creatureCapabilityCounts(creatures("vol", 15)))).toEqual([]);
    expect(capabilityLimitViolations(creatureCapabilityCounts(creatures("ranged", 15)))).toEqual([]);
  });

  it("11 effets composés → aucune violation (capacités non nommées)", () => {
    const composed = (): Capability => ({ uid: `c_${seq++}`, trigger: "on_play", effectKind: "immediate", abilityId: "_composed",
      composed: { content: "deal_damage", magnitude: { x: 1 }, target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "random" } } });
    const entries = Array.from({ length: 11 }, () => ({ card: mkCard({ capabilities: [composed()] }), quantity: 1 }));
    expect(capabilityLimitViolations(creatureCapabilityCounts(entries))).toEqual([]);
  });

  it("les sorts portant un mot-clé sont ignorés (créatures uniquement)", () => {
    const entries = Array.from({ length: 11 }, () => ({ card: mkCard({ card_type: "spell", attack: null, health: null, keywords: ["berserk"] as unknown as Card["keywords"] }), quantity: 1 }));
    expect(capabilityLimitViolations(creatureCapabilityCounts(entries))).toEqual([]);
  });
});
