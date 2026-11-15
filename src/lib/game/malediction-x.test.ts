// MALÉDICTION X — X est le coût MAXIMUM de la créature qui peut être maudite.
// X vide ⇒ aucune limite (convention du coût optionnel) : les cartes d'avant
// « Malédiction X » gardent leur comportement. Sous la portée « toutes », ce
// sont toutes les créatures adverses de coût ≤ X qui sont maudites.
import { describe, expect, it } from "vitest";
import { applyAction, getCreatureTargets } from "./engine";
import { describeKeyword } from "./keyword-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameAction, GameState, KeywordInstance } from "./types";

function maudisseur(inst: Partial<KeywordInstance> = {}): CardInstance {
  return mkInstance(mkCard({
    name: "Tisse-Nuit", mana_cost: 0, attack: 1, health: 5,
    keywords: ["malediction"] as never,
    keyword_instances: [{ id: "malediction", ...inst } as KeywordInstance],
  }));
}
const cible = (name: string, mana_cost: number) => mkInstance(mkCard({ name, mana_cost, attack: 1, health: 5 }));

/** Decks garnis : sans eux, la pioche à vide coûte des PV. */
function etat(ennemis: CardInstance[]): GameState {
  const s = mkState();
  for (const p of s.players) for (let i = 0; i < 10; i++) p.deck.push(mkInstance(mkCard({ name: `Pioche ${i}`, mana_cost: 9 })));
  s.players[1].board.push(...ennemis);
  return s;
}
/** P0 joue la maudisseuse (en visant `vise`), puis deux fins de tour : la
 *  malédiction tombe au début du tour suivant de P0. Rend les survivantes. */
function survivantes(s: GameState, carte: CardInstance, vise?: CardInstance): string[] {
  s.players[0].hand.push(carte);
  let st = applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId, targetInstanceId: vise?.instanceId } as GameAction);
  st = applyAction(st, { type: "end_turn" } as GameAction);
  st = applyAction(st, { type: "end_turn" } as GameAction);
  return st.players[1].board.map((c) => c.card.name).sort();
}

describe("Malédiction X — une cible", () => {
  it("coût ≤ X : la créature est exilée", () => {
    const petite = cible("Petite", 3);
    expect(survivantes(etat([petite]), maudisseur({ x: 3 }), petite)).toEqual([]);
  });

  it("coût > X : la malédiction ne prend pas, même si la cible est désignée de force", () => {
    const grosse = cible("Grosse", 4);
    expect(survivantes(etat([grosse]), maudisseur({ x: 3 }), grosse)).toEqual(["Grosse"]);
  });

  it("seules les créatures de coût ≤ X sont proposées comme cibles", () => {
    const petite = cible("Petite", 2), grosse = cible("Grosse", 6);
    const s = etat([petite, grosse]);
    expect(getCreatureTargets(s, maudisseur({ x: 3 }).card)).toEqual([petite.instanceId]);
  });

  it("X vide : aucune limite de coût (cartes existantes inchangées)", () => {
    const enorme = cible("Énorme", 10);
    const s = etat([enorme]);
    expect(getCreatureTargets(s, maudisseur().card)).toEqual([enorme.instanceId]);
    expect(survivantes(s, maudisseur(), enorme)).toEqual([]);
  });
});

describe("Malédiction X — portée « toutes »", () => {
  it("toutes les créatures adverses de coût ≤ X sont exilées, les autres restent", () => {
    const s = etat([cible("Un", 1), cible("Trois", 3), cible("Quatre", 4), cible("Neuf", 9)]);
    expect(survivantes(s, maudisseur({ x: 3, targetScope: "all_enemies" }))).toEqual(["Neuf", "Quatre"]);
  });

  it("X vide + toutes : tout le plateau adverse est exilé", () => {
    const s = etat([cible("Un", 1), cible("Neuf", 9)]);
    expect(survivantes(s, maudisseur({ targetScope: "all_enemies" }))).toEqual([]);
  });
});

describe("Malédiction X — texte", () => {
  it("avec X : le coût maximum est écrit ; sans X : aucune mention de coût", () => {
    expect(describeKeyword("malediction", { x: 3 })).toContain("coût ≤ 3");
    expect(describeKeyword("malediction", {})).not.toContain("coût");
  });

  it("portée « toutes » : même règle", () => {
    const toutes = { id: "malediction", targetScope: "all_enemies" } as KeywordInstance;
    expect(describeKeyword("malediction", { x: 4, instance: toutes })).toContain("coût ≤ 4");
    expect(describeKeyword("malediction", { instance: toutes })).not.toContain("coût");
  });
});

// ── Forme ACTION ────────────────────────────────────────────────────────────
import { getSpellSlotTargets, getSpellTargetSlots } from "./engine";
import { getSpellKeywordDesc } from "./spell-keywords";
import type { SpellKeywordInstance } from "./types";

function actionMaudite(kw: Partial<SpellKeywordInstance> = {}): CardInstance {
  return mkInstance(mkCard({
    name: "Sceau funeste", card_type: "spell", mana_cost: 0, attack: null, health: null,
    spell_keywords: [{ id: "malediction", ...kw } as SpellKeywordInstance],
  }));
}
/** P0 lance l'action (en visant `vise`), puis deux fins de tour. */
function apresAction(s: GameState, carte: CardInstance, vise?: CardInstance): string[] {
  s.players[0].hand.push(carte);
  let st = applyAction(s, {
    type: "play_card", cardInstanceId: carte.instanceId,
    ...(vise ? { targetInstanceId: vise.instanceId, targetMap: { kw_0: vise.instanceId } } : {}),
  } as GameAction);
  // Pas d'exil immédiat : la créature est encore là pendant le tour adverse.
  expect(st.players[1].board.length).toBe(s.players[1].board.length);
  st = applyAction(st, { type: "end_turn" } as GameAction);
  st = applyAction(st, { type: "end_turn" } as GameAction);
  return st.players[1].board.map((c) => c.card.name).sort();
}

describe("Malédiction X — forme action", () => {
  it("coût ≤ X : la cible est exilée au début du tour suivant du lanceur", () => {
    const petite = cible("Petite", 3);
    expect(apresAction(etat([petite]), actionMaudite({ amount: 3 }), petite)).toEqual([]);
  });

  it("coût > X : rien ne se passe, même cible désignée de force", () => {
    const grosse = cible("Grosse", 4);
    expect(apresAction(etat([grosse]), actionMaudite({ amount: 3 }), grosse)).toEqual(["Grosse"]);
  });

  it("seules les créatures de coût ≤ X sont proposées comme cibles", () => {
    const petite = cible("Petite", 2), grosse = cible("Grosse", 6);
    const s = etat([petite, grosse]);
    const carte = actionMaudite({ amount: 3 }).card;
    const [creneau] = getSpellTargetSlots(carte);
    expect(getSpellSlotTargets(s, carte, creneau)).toEqual([petite.instanceId]);
  });

  it("X vide : aucune limite de coût", () => {
    const enorme = cible("Énorme", 10);
    expect(apresAction(etat([enorme]), actionMaudite(), enorme)).toEqual([]);
  });

  it("portée « toutes » : toutes les créatures adverses de coût ≤ X, sans cible à désigner", () => {
    const s = etat([cible("Un", 1), cible("Trois", 3), cible("Quatre", 4)]);
    const carte = actionMaudite({ amount: 3, targetScope: "all_enemies" });
    expect(getSpellTargetSlots(carte.card)).toEqual([]);
    expect(apresAction(s, carte)).toEqual(["Quatre"]);
  });

  it("la malédiction ne se rejoue pas : une créature arrivée après n'est pas exilée", () => {
    const s = etat([cible("Maudite", 1)]);
    const carte = actionMaudite({ amount: 5 });
    s.players[0].hand.push(carte);
    let st = applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId, targetMap: { kw_0: s.players[1].board[0].instanceId } } as GameAction);
    st = applyAction(st, { type: "end_turn" } as GameAction);
    st = applyAction(st, { type: "end_turn" } as GameAction);
    expect(st.players[0].maledictions).toBeUndefined();
  });

  it("texte : coût écrit avec X, absent sans X", () => {
    expect(getSpellKeywordDesc({ id: "malediction", amount: 3 } as SpellKeywordInstance)).toContain("coût ≤ 3");
    expect(getSpellKeywordDesc({ id: "malediction" } as SpellKeywordInstance)).not.toContain("coût");
  });
});
