// Tests des règles de capacité à la composition de deck (deck-rules.ts).
import { describe, expect, it } from "vitest";
import { namedCreatureCapabilityIds, creatureCapabilityCounts, capabilityLimitViolations, estAjoutableAuDeck, objetsDansLeDeck } from "./deck-rules";
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
    expect(namedCreatureCapabilityIds(mkCard({ keywords: ["gloire"] as unknown as Card["keywords"] }))).toEqual(["gloire"]);
  });
  it("dédoublonne une capacité présente deux fois sur une même carte", () => {
    const cap = (uid: string): Capability => ({ uid, trigger: "on_play", effectKind: "immediate", abilityId: "gloire" });
    const card = mkCard({ capabilities: [cap("a"), cap("b")] });
    expect(namedCreatureCapabilityIds(card)).toEqual(["gloire"]);
  });
  it("ignore les effets composés (_composed absent du registre ABILITIES)", () => {
    const composed: Capability = { uid: "c1", trigger: "on_play", effectKind: "immediate", abilityId: "_composed",
      composed: { content: "deal_damage", magnitude: { x: 1 }, target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "random" } } };
    expect(namedCreatureCapabilityIds(mkCard({ capabilities: [composed] }))).toEqual([]);
  });
  it("retourne [] pour un sort", () => {
    expect(namedCreatureCapabilityIds(mkCard({ card_type: "spell", attack: null, health: null, keywords: ["gloire"] as unknown as Card["keywords"] }))).toEqual([]);
  });
});

describe("creatureCapabilityCounts + capabilityLimitViolations", () => {
  it("13 créatures « gloire » → violation (count 13)", () => {
    const counts = creatureCapabilityCounts(creatures("gloire", 13));
    expect(counts.get("gloire")).toBe(13);
    const v = capabilityLimitViolations(counts);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ id: "gloire", count: 13 });
  });

  it("exactement 12 « gloire » → aucune violation (seuil inclusif)", () => {
    expect(capabilityLimitViolations(creatureCapabilityCounts(creatures("gloire", 12)))).toEqual([]);
  });

  it("le comptage est pondéré par la quantité", () => {
    const entries = [
      { card: mkCard({ keywords: ["gloire"] as unknown as Card["keywords"] }), quantity: 3 },
      { card: mkCard({ keywords: ["gloire"] as unknown as Card["keywords"] }), quantity: 3 },
      { card: mkCard({ keywords: ["gloire"] as unknown as Card["keywords"] }), quantity: 3 },
      { card: mkCard({ keywords: ["gloire"] as unknown as Card["keywords"] }), quantity: 3 },
      { card: mkCard({ keywords: ["gloire"] as unknown as Card["keywords"] }), quantity: 3 },
    ];
    expect(creatureCapabilityCounts(entries).get("gloire")).toBe(15);
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
    const entries = Array.from({ length: 11 }, () => ({ card: mkCard({ card_type: "spell", attack: null, health: null, keywords: ["gloire"] as unknown as Card["keywords"] }), quantity: 1 }));
    expect(capabilityLimitViolations(creatureCapabilityCounts(entries))).toEqual([]);
  });
});

describe("objets hors des decks", () => {
  it("un objet n'est pas ajoutable, une créature ou un sort l'est", () => {
    expect(estAjoutableAuDeck({ card_type: "item" })).toBe(false);
    expect(estAjoutableAuDeck({ card_type: "creature" })).toBe(true);
    expect(estAjoutableAuDeck({ card_type: "spell" })).toBe(true);
  });
  it("compte les exemplaires d'objets d'un deck enregistré avant la règle", () => {
    expect(objetsDansLeDeck([
      { card: { card_type: "item" }, quantity: 2 },
      { card: { card_type: "creature" }, quantity: 3 },
      { card: { card_type: "item" }, quantity: 1 },
    ])).toBe(3);
    expect(objetsDansLeDeck([{ card: { card_type: "spell" }, quantity: 3 }])).toBe(0);
  });
});
