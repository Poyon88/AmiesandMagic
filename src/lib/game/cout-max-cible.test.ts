// X = COÛT MAXIMUM DE LA CIBLE — Domination X, Corruption X, Exécution X,
// Retour différé X (et Malédiction X, testée dans malediction-x.test.ts).
//
// Règle commune : la capacité n'affecte qu'une créature (ou un objet) de coût
// imprimé ≤ X. X vide ⇒ aucune limite, ce qui laisse intactes les cartes
// d'avant. Elle vaut pour la cible désignée, la cible tirée au hasard et la
// portée « toutes ». Une ACTION sans cible valide est injouable.
import { describe, expect, it } from "vitest";
import { applyAction, canPlayCard, getCreatureTargets, getSpellSlotTargets, getSpellTargetSlots } from "./engine";
import { describeKeyword } from "./keyword-display";
import { getSpellKeywordDesc } from "./spell-keywords";
import { objetsDe } from "./items";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameAction, GameState, Keyword, KeywordInstance, SpellKeywordInstance } from "./types";

type Capa = "domination" | "corruption" | "execution" | "retour_differe";
const CAPACITES: Capa[] = ["domination", "corruption", "execution", "retour_differe"];

const cible = (name: string, mana_cost: number) => mkInstance(mkCard({ name, mana_cost, attack: 1, health: 5 }));
const action = (id: Capa, kw: Partial<SpellKeywordInstance> = {}) => mkInstance(mkCard({
  name: "Action", card_type: "spell", mana_cost: 0, attack: null, health: null,
  spell_keywords: [{ id, ...kw } as SpellKeywordInstance],
}));
const porteuse = (id: Capa, inst: Partial<KeywordInstance> = {}) => mkInstance(mkCard({
  name: "Porteuse", mana_cost: 0, attack: 1, health: 5,
  keywords: [id] as Keyword[],
  keyword_instances: [{ id, ...inst } as KeywordInstance],
}));

function etat(ennemis: CardInstance[]): GameState {
  const s = mkState();
  for (const p of s.players) for (let i = 0; i < 10; i++) p.deck.push(mkInstance(mkCard({ name: `Pioche ${i}`, mana_cost: 9 })));
  s.players[1].board.push(...ennemis);
  return s;
}
function jouer(s: GameState, carte: CardInstance, vise?: string): GameState {
  s.players[0].hand.push(carte);
  return applyAction(s, {
    type: "play_card", cardInstanceId: carte.instanceId,
    ...(vise ? { targetInstanceId: vise, targetMap: { kw_0: vise } } : {}),
  } as GameAction);
}
/** Noms des créatures encore sur le plateau ADVERSE : toutes ces capacités
 *  retirent leur victime de ce plateau (vol, mort, renvoi au deck). */
const restantes = (st: GameState) => st.players[1].board.filter((c) => c.currentHealth > 0).map((c) => c.card.name).sort();

describe.each(CAPACITES)("%s X — forme action", (id) => {
  it("cible de coût ≤ X : affectée", () => {
    const petite = cible("Petite", 3);
    expect(restantes(jouer(etat([petite]), action(id, { amount: 3 }), petite.instanceId))).toEqual([]);
  });

  it("cible de coût > X : épargnée, même désignée de force", () => {
    const grosse = cible("Grosse", 4);
    expect(restantes(jouer(etat([grosse]), action(id, { amount: 3 }), grosse.instanceId))).toEqual(["Grosse"]);
  });

  it("seules les créatures adverses de coût ≤ X sont proposées", () => {
    const petite = cible("Petite", 2), grosse = cible("Grosse", 6);
    const s = etat([petite, grosse]);
    const carte = action(id, { amount: 3 }).card;
    const proposees = getSpellSlotTargets(s, carte, getSpellTargetSlots(carte)[0]);
    expect(proposees).toContain(petite.instanceId);
    expect(proposees).not.toContain(grosse.instanceId);
  });

  it("X vide : aucune limite (cartes existantes inchangées)", () => {
    const enorme = cible("Énorme", 10);
    expect(restantes(jouer(etat([enorme]), action(id), enorme.instanceId))).toEqual([]);
  });

  it("portée « toutes » : seules les créatures de coût ≤ X sont affectées", () => {
    const s = etat([cible("Un", 1), cible("Trois", 3), cible("Quatre", 4)]);
    expect(restantes(jouer(s, action(id, { amount: 3, targetScope: "all_enemies" })))).toEqual(["Quatre"]);
  });

  // Exécution n'a pas de tirage : sans cible désignée, l'action ne fait rien.
  it.runIf(id !== "execution")("sans cible désignée (action relancée) : tirage parmi les seules éligibles", () => {
    for (let graine = 1; graine <= 8; graine++) {
      const s = etat([cible("Petite", 2), cible("Grosse", 7), cible("Géante", 9)]);
      s.rngState = graine;
      expect(restantes(jouer(s, action(id, { amount: 3 })))).toEqual(["Grosse", "Géante"]);
    }
  });

  it("injouable quand aucune cible ne coûte X ou moins ; jouable dès qu'il y en a une", () => {
    const s = etat([cible("Grosse", 6)]);
    const carte = action(id, { amount: 3 });
    s.players[0].hand.push(carte);
    expect(canPlayCard(s, carte.instanceId)).toBe(false);
    s.players[1].board.push(cible("Petite", 2));
    expect(canPlayCard(s, carte.instanceId)).toBe(true);
  });

  it("texte : le coût est écrit avec X, absent sans X", () => {
    expect(getSpellKeywordDesc({ id, amount: 3 } as SpellKeywordInstance)).toContain("coût ≤ 3");
    expect(getSpellKeywordDesc({ id } as SpellKeywordInstance)).not.toContain("coût");
    expect(getSpellKeywordDesc({ id, amount: 4, targetScope: "all_enemies" } as SpellKeywordInstance)).toContain("coût ≤ 4");
    expect(getSpellKeywordDesc({ id, targetScope: "all_enemies" } as SpellKeywordInstance)).not.toContain("coût");
  });
});

describe.each(CAPACITES)("%s X — forme créature (à l'entrée en jeu)", (id) => {
  // Domination tire sa cible au hasard à l'invocation ; les trois autres la
  // font désigner.
  const designe = id !== "domination";

  it("coût ≤ X : affectée ; coût > X : épargnée", () => {
    const petite = cible("Petite", 3);
    expect(restantes(jouer(etat([petite]), porteuse(id, { x: 3 }), designe ? petite.instanceId : undefined))).toEqual([]);
    const grosse = cible("Grosse", 4);
    expect(restantes(jouer(etat([grosse]), porteuse(id, { x: 3 }), designe ? grosse.instanceId : undefined))).toEqual(["Grosse"]);
  });

  it("X vide : aucune limite", () => {
    const enorme = cible("Énorme", 10);
    expect(restantes(jouer(etat([enorme]), porteuse(id), designe ? enorme.instanceId : undefined))).toEqual([]);
  });

  it("portée « toutes » : seules les créatures adverses de coût ≤ X", () => {
    const s = etat([cible("Un", 1), cible("Trois", 3), cible("Quatre", 4)]);
    expect(restantes(jouer(s, porteuse(id, { x: 3, targetScope: "all_enemies" })))).toEqual(["Quatre"]);
  });

  it.runIf(designe)("seules les créatures de coût ≤ X sont proposées comme cibles", () => {
    const petite = cible("Petite", 2), grosse = cible("Grosse", 6);
    const proposees = getCreatureTargets(etat([petite, grosse]), porteuse(id, { x: 3 }).card);
    expect(proposees).toContain(petite.instanceId);
    expect(proposees).not.toContain(grosse.instanceId);
  });

  it.runIf(!designe)("tirage au hasard parmi les seules créatures de coût ≤ X", () => {
    for (let graine = 1; graine <= 8; graine++) {
      const s = etat([cible("Petite", 2), cible("Grosse", 7), cible("Géante", 9)]);
      s.rngState = graine;
      expect(restantes(jouer(s, porteuse(id, { x: 3 })))).toEqual(["Grosse", "Géante"]);
    }
  });

  it("texte : le coût est écrit avec X, absent sans X", () => {
    expect(describeKeyword(id, { x: 3 })).toContain("coût ≤ 3");
    expect(describeKeyword(id, {})).not.toContain("coût");
  });
});

describe("Exécution X et Retour différé X — objets", () => {
  const objet = (name: string, mana_cost: number) =>
    mkInstance(mkCard({ name, card_type: "item", mana_cost, attack: 1, health: 1, equip_cost: 0 }));

  it.each(["execution", "retour_differe"] as Capa[])("%s : un objet de coût > X n'est ni proposé ni affecté ; ≤ X l'est", (id) => {
    const s = etat([cible("Témoin", 9)]);
    const cher = objet("Relique", 6), modeste = objet("Dague", 2);
    s.players[1].items = [cher, modeste];
    const carte = action(id, { amount: 3 });
    const proposees = getSpellSlotTargets(s, carte.card, getSpellTargetSlots(carte.card)[0]);
    expect(proposees).toContain(modeste.instanceId);
    expect(proposees).not.toContain(cher.instanceId);

    const force = jouer(structuredClone(s), structuredClone(carte), cher.instanceId);
    expect(objetsDe(force.players[1]).map((o) => o.card.name).sort()).toEqual(["Dague", "Relique"]);
    const ok = jouer(s, carte, modeste.instanceId);
    expect(objetsDe(ok.players[1]).map((o) => o.card.name)).toEqual(["Relique"]);
  });
});
