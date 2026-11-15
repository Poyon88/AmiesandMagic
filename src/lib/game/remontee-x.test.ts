// REMONTÉE X — X = nombre d'unités renvoyées en main (alliées ou adverses).
// Les cibles désignées partent d'abord ; ce qui manque est tiré au hasard.
// X absent = 1 : les cartes d'avant le X gardent leur comportement.
import { describe, expect, it } from "vitest";
import { applyAction, getCreatureComposedChoice, getSpellTargetSlots, REMONTEE_CHOIX_UID } from "./engine";
import { describeKeyword } from "./keyword-display";
import { getSpellKeywordDesc, getSpellKeywordLabel } from "./spell-keywords";
import { applyKeywordValueToLabel, KEYWORD_LABELS } from "./keyword-labels";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { creatureScopes, spellScopes } from "./target-scope";
import type { CardInstance, GameAction, GameState, Keyword, KeywordInstance, SpellKeywordInstance } from "./types";

const unite = (name: string) => mkInstance(mkCard({ name, mana_cost: 2, attack: 1, health: 5 }));
const action = (kw: Partial<SpellKeywordInstance> = {}) => mkInstance(mkCard({
  name: "Reflux", card_type: "spell", mana_cost: 0, attack: null, health: null,
  spell_keywords: [{ id: "remontee", ...kw } as SpellKeywordInstance],
}));
const porteuse = (inst: Partial<KeywordInstance> = {}) => mkInstance(mkCard({
  name: "Passeuse", mana_cost: 0, attack: 1, health: 5,
  keywords: ["remontee"] as Keyword[],
  keyword_instances: [{ id: "remontee", ...inst } as KeywordInstance],
}));

function etat(miens: CardInstance[], ennemis: CardInstance[]): GameState {
  const s = mkState();
  s.players[0].board.push(...miens);
  s.players[1].board.push(...ennemis);
  return s;
}
function jouer(s: GameState, carte: CardInstance, extra: Partial<GameAction> = {}): GameState {
  s.players[0].hand.push(carte);
  return applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId, ...extra } as GameAction);
}
const plateau = (st: GameState, i: 0 | 1) => st.players[i].board.map((c) => c.card.name).filter((n) => n !== "Passeuse").sort();
const main = (st: GameState, i: 0 | 1) => st.players[i].hand.map((c) => c.card.name).sort();

describe("Remontée X — action", () => {
  it("X créneaux de cible ; pas plus qu'il n'existe de cibles quand l'état est connu", () => {
    const carte = action({ amount: 3 }).card;
    expect(getSpellTargetSlots(carte).map((c) => c.slot)).toEqual(["kw_0", "kw_0:1", "kw_0:2"]);
    const s = etat([], [unite("A"), unite("B")]);
    expect(getSpellTargetSlots(carte, s).map((c) => c.slot)).toEqual(["kw_0", "kw_0:1"]);
    expect(getSpellTargetSlots(action().card).map((c) => c.slot)).toEqual(["kw_0"]);
  });

  it("renvoie les X unités désignées, alliées comme adverses, chacune chez son propriétaire", () => {
    const mienne = unite("Mienne"), a = unite("A"), b = unite("B");
    const st = jouer(etat([mienne], [a, b]), action({ amount: 2 }), { targetMap: { kw_0: mienne.instanceId, "kw_0:1": a.instanceId } });
    expect(plateau(st, 0)).toEqual([]);
    expect(plateau(st, 1)).toEqual(["B"]);
    expect(main(st, 0)).toContain("Mienne");
    expect(main(st, 1)).toEqual(["A"]);
  });

  it("une seule cible désignée sur X = 2 : la seconde est tirée au hasard", () => {
    const a = unite("A"), b = unite("B"), c = unite("C");
    const st = jouer(etat([], [a, b, c]), action({ amount: 2 }), { targetMap: { kw_0: a.instanceId } });
    expect(plateau(st, 1)).toHaveLength(1);
    expect(main(st, 1)).toContain("A");
  });

  it("sans cible (action relancée) : X unités au hasard ; moins de X en jeu : toutes", () => {
    expect(plateau(jouer(etat([], [unite("A"), unite("B"), unite("C")]), action({ amount: 2 })), 1)).toHaveLength(1);
    expect(plateau(jouer(etat([], [unite("A")]), action({ amount: 3 })), 1)).toEqual([]);
  });

  it("X absent = 1 : une seule unité, comme avant", () => {
    const a = unite("A"), b = unite("B");
    const st = jouer(etat([], [a, b]), action(), { targetMap: { kw_0: a.instanceId } });
    expect(plateau(st, 1)).toEqual(["B"]);
  });

  it("la même unité désignée deux fois ne compte qu'une fois, sans tirage de remplacement", () => {
    const a = unite("A"), b = unite("B"), c = unite("C");
    const st = jouer(etat([], [a, b, c]), action({ amount: 2 }), { targetMap: { kw_0: a.instanceId, "kw_0:1": a.instanceId } });
    expect(main(st, 1)).toContain("A");
    expect(plateau(st, 1)).toHaveLength(1); // A, puis une tirée au hasard pour le 2ᵉ
  });

  it("portée « toutes » : tout le camp visé, sans créneau", () => {
    const carte = action({ amount: 2, targetScope: "all_enemies" });
    expect(getSpellTargetSlots(carte.card)).toEqual([]);
    expect(plateau(jouer(etat([unite("Mienne")], [unite("A"), unite("B"), unite("C")]), carte), 1)).toEqual([]);
  });
});

describe("Remontée X — créature à l'entrée en jeu", () => {
  it("X ≥ 2 : saisie de X cibles sous la clé dédiée ; X = 1 : cible unique classique", () => {
    expect(getCreatureComposedChoice(porteuse({ x: 2 }).card)).toEqual({ uid: REMONTEE_CHOIX_UID, count: 2, type: "any_creature" });
    expect(getCreatureComposedChoice(porteuse({ x: 1 }).card)).toBeNull();
    expect(getCreatureComposedChoice(porteuse().card)).toBeNull();
  });

  it("renvoie les X unités désignées", () => {
    const a = unite("A"), b = unite("B"), c = unite("C");
    const st = jouer(etat([], [a, b, c]), porteuse({ x: 2 }),
      { targetMap: { [`${REMONTEE_CHOIX_UID}#0`]: a.instanceId, [`${REMONTEE_CHOIX_UID}#1`]: c.instanceId } });
    expect(plateau(st, 1)).toEqual(["B"]);
  });

  it("X = 1 avec la cible de l'action : une seule unité", () => {
    const a = unite("A"), b = unite("B");
    const st = jouer(etat([], [a, b]), porteuse(), { targetInstanceId: a.instanceId });
    expect(plateau(st, 1)).toEqual(["B"]);
  });
});

describe("Remontée X — portée « toutes »", () => {
  it("le « A » ne vaut que pour toutes les créatures ADVERSES, en créature comme en action", () => {
    expect(creatureScopes("remontee")).toEqual(["all_enemies"]);
    expect(spellScopes("remontee")).toEqual(["all_enemies"]);
  });

  it("une portée « tous les alliés » héritée n'est plus honorée : l'action redemande une cible", () => {
    const carte = action({ targetScope: "all_allies" });
    expect(getSpellTargetSlots(carte.card).map((c) => c.slot)).toEqual(["kw_0"]);
  });
});

describe("Remontée X — textes", () => {
  it("le nombre remplace X ; une carte sans X affiche 1", () => {
    expect(describeKeyword("remontee", { x: 2 })).toContain("Renvoie 2 unité(s)");
    expect(applyKeywordValueToLabel("remontee", KEYWORD_LABELS.remontee, undefined)).toBe("Remontée 1");
    expect(getSpellKeywordLabel({ id: "remontee", amount: 3 } as SpellKeywordInstance)).toBe("Remontée 3");
    expect(getSpellKeywordDesc({ id: "remontee" } as SpellKeywordInstance)).toContain("Renvoie 1 unité(s)");
    // Le X de l'action prime sur le X implicite (bug vu sur « Portes qui claquent »).
    expect(getSpellKeywordDesc({ id: "remontee", amount: 2 } as SpellKeywordInstance)).toContain("Renvoie 2 unité(s)");
  });
});
