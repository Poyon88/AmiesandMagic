// FORGE X — un objet de la collection (neutre ou de l'alignement de la carte,
// coût ≤ X et ≥ A, X vide = tout coût) est mélangé dans le deck du contrôleur,
// au hasard, sans révélation.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, CardInstance, GameAction, GameState, Keyword, KeywordInstance, SpellKeywordInstance } from "./types";

const objet = (id: number, name: string, cout: number, alignement: string) =>
  mkCard({ id, name, card_type: "item", mana_cost: cout, attack: 1, health: 0, faction: "Humains", card_alignment: alignement } as Partial<Card>);

const POOL = [
  objet(9101, "Neutre2", 2, "neutre"),
  objet(9102, "Bon3", 3, "bon"),
  objet(9103, "Bon5", 5, "bon"),
  objet(9104, "Mal1", 1, "maléfique"),
  mkCard({ id: 9105, name: "Créature", mana_cost: 1, faction: "Humains", card_alignment: "neutre" } as Partial<Card>),
];

function table(graine = 1): GameState {
  const s = mkState();
  s.factionCardPool = POOL;
  s.rngState = graine;
  s.players[0].deck = [mkInstance(mkCard({ name: "D1" })), mkInstance(mkCard({ name: "D2" }))];
  return s;
}

/** Sort Forge d'une carte NAINE (alignement bon). */
const sort = (sk: Partial<SpellKeywordInstance>, faction = "Nains"): CardInstance => mkInstance(mkCard({
  name: "Forge", card_type: "spell", attack: null, health: null, mana_cost: 0, faction,
  spell_keywords: [{ id: "forge", ...sk }] as SpellKeywordInstance[],
}));

function lancer(s: GameState, c: CardInstance): GameState {
  s.players[0].hand.push(c);
  return applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as GameAction);
}

const forges = (s: GameState) => s.players[0].deck.filter(c => c.card.card_type === "item").map(c => c.card.name);

/** Objets forgés sur plusieurs graines : l'ensemble de ce que la règle permet. */
function possibles(sk: Partial<SpellKeywordInstance>, faction = "Nains"): Set<string> {
  const out = new Set<string>();
  for (let g = 1; g <= 40; g++) for (const n of forges(lancer(table(g), sort(sk, faction)))) out.add(n);
  return out;
}

describe("Forge X — vivier", () => {
  it("un seul objet mélangé dans le deck, jamais en main", () => {
    const n = lancer(table(), sort({ amount: 3 }));
    expect(n.players[0].deck).toHaveLength(3);
    expect(forges(n)).toHaveLength(1);
    expect(n.players[0].hand.some(c => c.card.card_type === "item")).toBe(false);
  });

  it("coût ≤ X, neutre ou de l'alignement de la carte (bon) — ni maléfique ni créature", () => {
    expect([...possibles({ amount: 3 })].sort()).toEqual(["Bon3", "Neutre2"]);
  });

  it("borne basse A : coût entre A et X", () => {
    expect([...possibles({ amount: 5, minX: 3 })].sort()).toEqual(["Bon3", "Bon5"]);
  });

  it("X vide : tout coût ; avec A seulement « au moins A »", () => {
    expect([...possibles({})].sort()).toEqual(["Bon3", "Bon5", "Neutre2"]);
    expect([...possibles({ minX: 4 })]).toEqual(["Bon5"]);
  });

  it("une carte neutre ne forge que des objets neutres", () => {
    expect([...possibles({ amount: 10 }, "Humains")]).toEqual(["Neutre2"]);
  });

  it("aucun objet éligible : rien ne se passe", () => {
    const n = lancer(table(), sort({ amount: 1 }, "Humains"));
    expect(forges(n)).toEqual([]);
    expect(n.players[0].deck).toHaveLength(2);
  });

  it("tirage reproductible : même graine, même objet, même place", () => {
    const a = lancer(table(7), sort({ amount: 5 })).players[0].deck.map(c => c.card.name);
    const b = lancer(table(7), sort({ amount: 5 })).players[0].deck.map(c => c.card.name);
    expect(a).toEqual(b);
  });
});

describe("Forge X — créature et effet composé", () => {
  const creature = (inst: Partial<KeywordInstance>) => mkInstance(mkCard({
    name: "Forgeron", faction: "Nains", mana_cost: 0,
    keywords: ["forge"] as unknown as Keyword[],
    keyword_instances: [{ id: "forge" as Keyword, ...inst }] as KeywordInstance[],
  }));

  it("à l'entrée en jeu", () => {
    const n = lancer(table(), creature({ x: 3 }));
    expect(forges(n)).toHaveLength(1);
  });

  it("en fin de tour (déclencheur curé)", () => {
    const s = table();
    const f = creature({ x: 3, mode: "end_of_turn" });
    f.hasSummoningSickness = false;
    s.players[0].board.push(f);
    const n = applyAction(s, { type: "end_turn" } as GameAction);
    expect(forges(n)).toHaveLength(1);
  });

  it("composé ×2 avec filtre : deux objets, tous dans le filtre", () => {
    const caps: Capability[] = [{
      uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
      composed: { content: "forge", magnitude: { x: 5, minX: 3 }, occurrences: 2 } as Capability["composed"],
    }];
    const c = mkInstance(mkCard({ name: "Double forge", card_type: "spell", attack: null, health: null, mana_cost: 0, faction: "Nains", capabilities: caps as never }));
    const n = lancer(table(3), c);
    const f = forges(n);
    expect(f).toHaveLength(2);
    for (const nom of f) expect(["Bon3", "Bon5"]).toContain(nom);
  });
});

describe("Forge X — texte", () => {
  it("dit le plafond, la fourchette et l'alignement", async () => {
    const { getSpellKeywordDesc } = await import("./spell-keywords");
    const nain = { faction: "Nains" } as Card;
    expect(getSpellKeywordDesc({ id: "forge", amount: 3 }, nain)).toBe("Mélange dans votre deck un objet neutre ou d'alignement Bon de coût 3 au plus, au hasard");
    expect(getSpellKeywordDesc({ id: "forge", amount: 5, minX: 2 }, nain)).toContain("de coût 2 à 5");
    expect(getSpellKeywordDesc({ id: "forge", amount: 3 }, { faction: "Humains" } as Card)).toBe("Mélange dans votre deck un objet neutre de coût 3 au plus, au hasard");
  });
});
