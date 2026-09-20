// OBJETS, LOT 3 — les capacités portées.
//
// Le principe tient en une phrase : les capacités d'un objet sont TRANSFÉRÉES à
// son porteur. Il les porte alors comme les siennes, et toute la plomberie du
// moteur — déclencheurs, auras, râles, combat — fonctionne sans en rien savoir.
//
// Ce que ces tests protègent, par ordre de dangerosité :
//
//  1. La RÉVERSIBILITÉ du don sur les DEUX canaux. `applyGrantedKeyword` écrit
//     dans `card.keywords` ET dans `card.keyword_instances`. Or plusieurs
//     résolveurs — `buildEndOfTurnQueue` en tête — balaient les instances sans
//     jamais consulter `keywords`. Ne purger que la seconde laisse une capacité
//     d'objet se déclencher indéfiniment sur une créature désormais nue.
//  2. La PROPRIÉTÉ du don. Un mot-clé que le porteur possédait déjà ne doit pas
//     partir avec l'objet.
//  3. L'IMMÉDIATETÉ : un objet qui confère une aura doit agir dans la passe où
//     il est équipé, pas à la suivante.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { objetsDe } from "./items";
import { ITEM_ABILITIES, isItemAuthorable, itemRequiresMode } from "./abilities";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, CardInstance, GameAction, GameState, Keyword, KeywordInstance } from "./types";

const objet = (name: string, kws: string[], instances?: KeywordInstance[], over: Partial<Card> = {}): CardInstance =>
  mkInstance(mkCard({
    name, card_type: "item", mana_cost: 0, attack: 0, health: 0, faction: "Humains",
    keywords: kws as unknown as Keyword[],
    ...(instances ? { keyword_instances: instances } : {}),
    ...over,
  }));

const creature = (name: string, over: Partial<Card> = {}): CardInstance =>
  mkInstance(mkCard({ name, mana_cost: 0, attack: 1, health: 3, faction: "Humains", ...over }));

function table(item: CardInstance, unite = creature("Soldat")) {
  const s = mkState();
  s.players[0].board.push(unite);
  s.players[0].items = [item];
  return { s, item, unite };
}

const equiper = (s: GameState, item: CardInstance, cible: CardInstance): GameState =>
  applyAction(s, { type: "equip_item", itemInstanceId: item.instanceId, targetInstanceId: cible.instanceId } as GameAction);

const sacrifier = (s: GameState, item: CardInstance): GameState =>
  applyAction(s, { type: "sacrifice_item", itemInstanceId: item.instanceId } as GameAction);

const unite = (s: GameState, nom: string) => s.players[0].board.find(c => c.card.name === nom)!;
const kws = (c: CardInstance) => c.card.keywords as unknown as string[];

describe("Le don passe au porteur", () => {
  it("une capacité de l'objet arrive sur la créature équipée", () => {
    const { s, item, unite: soldat } = table(objet("Ailes", ["ranged"]));
    expect(kws(unite(s, "Soldat"))).not.toContain("ranged");

    const next = equiper(s, item, soldat);
    expect(kws(unite(next, "Soldat"))).toContain("ranged");
  });

  it("l'objet POSÉ mais non équipé ne confère rien", () => {
    // « Les capacités ne valent que porté » : l'objet est là, inerte.
    const { s } = table(objet("Ailes", ["ranged"]));
    const apres = applyAction(s, { type: "end_turn" } as GameAction);
    expect(kws(apres.players[0].board.find(c => c.card.name === "Soldat")!)).not.toContain("ranged");
  });

  it("le X de la capacité suit le don", () => {
    const { s, item, unite: soldat } = table(
      objet("Cotte", ["resistance"], [{ id: "resistance" as Keyword, x: 3 }]));
    const next = equiper(s, item, soldat);
    expect(unite(next, "Soldat").grantedKeywordX["resistance"]).toBe(3);
  });
});

describe("Le don se retire avec l'objet", () => {
  it("déséquipé (porteur mort), la capacité s'en va", () => {
    const { s, item, unite: soldat } = table(objet("Ailes", ["ranged"]));
    const equipe = equiper(s, item, soldat);
    expect(kws(unite(equipe, "Soldat"))).toContain("ranged");

    // L'objet change de porteur : la première créature doit être rendue nue.
    equipe.players[0].board.push(creature("Garde"));
    const deplace = equiper(equipe, objetsDe(equipe.players[0])[0], unite(equipe, "Garde"));

    expect(kws(unite(deplace, "Soldat"))).not.toContain("ranged");
    expect(kws(unite(deplace, "Garde"))).toContain("ranged");
  });

  it("sacrifié, la capacité s'en va aussi", () => {
    const { s, item, unite: soldat } = table(objet("Ailes", ["ranged"]));
    const equipe = equiper(s, item, soldat);
    const apres = sacrifier(equipe, objetsDe(equipe.players[0])[0]);
    expect(kws(unite(apres, "Soldat"))).not.toContain("ranged");
  });

  it("LE SIDECAR aussi : une capacité à déclencheur ne survit pas à l'objet", () => {
    // LE test de ce lot. `buildEndOfTurnQueue` balaie `keyword_instances` SANS
    // consulter `keywords` : purger la seule liste de mots-clés laisserait cette
    // Tempête partir à chaque fin de tour, pour toujours, sur une créature qui
    // ne porte plus rien — et absolument rien ne le signalerait.
    const { s, item, unite: soldat } = table(
      objet("Sceptre", ["tempete"], [{ id: "tempete" as Keyword, x: 2, mode: "end_of_turn" }]));
    const equipe = equiper(s, item, soldat);

    const porteur = unite(equipe, "Soldat");
    expect(porteur.card.keyword_instances?.some(i => i.id === "tempete" && i.mode === "end_of_turn")).toBe(true);

    const apres = sacrifier(equipe, objetsDe(equipe.players[0])[0]);
    const nu = unite(apres, "Soldat");
    expect(nu.card.keyword_instances?.some(i => i.id === "tempete")).toBeFalsy();
    expect(kws(nu)).not.toContain("tempete");
  });

  it("ce que le porteur avait DÉJÀ ne part pas avec l'objet", () => {
    const { s, item, unite: soldat } = table(
      objet("Ailes", ["ranged"]), creature("Aigle", { keywords: ["ranged"] as unknown as Keyword[] }));
    const equipe = equiper(s, item, soldat);
    const apres = sacrifier(equipe, objetsDe(equipe.players[0])[0]);

    expect(kws(unite(apres, "Aigle")), "le Vol natif survit à l'objet").toContain("ranged");
  });

  it("dix recalculs n'empilent pas le don en double", () => {
    const { s, item, unite: soldat } = table(objet("Ailes", ["ranged"]));
    let etat = equiper(s, item, soldat);
    for (let i = 0; i < 10; i++) etat = applyAction(etat, { type: "end_turn" } as GameAction);

    expect(kws(unite(etat, "Soldat")).filter(k => k === "ranged")).toHaveLength(1);
    expect(unite(etat, "Soldat").itemGrantedKeywords).toEqual(["ranged"]);
  });
});

describe("Une AURA conférée par un objet agit tout de suite", () => {
  it("Commandement porté par un objet buffe les alliés dès l'équipement", () => {
    // Le don des objets passe AVANT le calcul des auras, contrairement à celui
    // des emblèmes : sans cela, il aurait fallu une seconde action pour que le
    // bonus apparaisse — visible, et incompréhensible pour le joueur.
    const { s, item, unite: soldat } = table(
      objet("Bannière", ["commandement"], [{ id: "commandement" as Keyword, x: 2 }]));
    s.players[0].board.push(creature("Piquier"));

    const next = equiper(s, item, soldat);
    expect(unite(next, "Piquier").currentAttack).toBe(1 + 2);
    expect(unite(next, "Piquier").maxHealth).toBe(3 + 2);
  });

  it("et cesse dès que l'objet part", () => {
    const { s, item, unite: soldat } = table(
      objet("Bannière", ["commandement"], [{ id: "commandement" as Keyword, x: 2 }]));
    s.players[0].board.push(creature("Piquier"));
    const equipe = equiper(s, item, soldat);

    const apres = sacrifier(equipe, objetsDe(equipe.players[0])[0]);
    expect(unite(apres, "Piquier").currentAttack).toBe(1);
    expect(unite(apres, "Piquier").maxHealth).toBe(3);
  });
});

describe("Arbitrage : quelles capacités sur un objet", () => {
  it("les passives et réactives de combat passent", () => {
    for (const id of ["ranged", "taunt", "divine_shield", "premiere_frappe", "poison", "precision"]) {
      expect(isItemAuthorable(id), id).toBe(true);
      expect(itemRequiresMode(id), id).toBe(false);
    }
  });

  it("Touché mortel passe — l'archétype de la capacité d'équipement", () => {
    // Il était classé nulle part dans la taxonomie, alors que tous les réactifs
    // de combat comparables y figuraient. Omission corrigée avec ce lot ; elle
    // le rendait aussi inauthorable sur un jeton.
    expect(isItemAuthorable("touche_mortel")).toBe(true);
  });

  it("les râles d'agonie passent : le porteur mourra", () => {
    for (const id of ["carnage", "martyr", "resurrection"]) {
      expect(isItemAuthorable(id), id).toBe(true);
    }
  });

  it("les curées multi-mode passent, mais réclament un déclencheur explicite", () => {
    for (const id of ["tempete", "epargne", "rappel"]) {
      expect(isItemAuthorable(id), id).toBe(true);
      expect(itemRequiresMode(id), id).toBe(true);
    }
  });

  it("celles dont le déclencheur naturel est l'INVOCATION sont écartées", () => {
    // Le porteur est déjà en jeu quand l'objet le rejoint : ces capacités
    // seraient proposées à l'auteur puis resteraient muettes en partie.
    for (const id of ["relancer", "dechainement", "lycanthropie", "conferer"]) {
      expect(isItemAuthorable(id), id).toBe(false);
    }
  });

  it("la liste est DÉRIVÉE, donc non vide et sans entrée fantôme", () => {
    expect(ITEM_ABILITIES.length).toBeGreaterThan(100);
    for (const a of ITEM_ABILITIES) expect(a.applicable_to).toContain("creature");
  });

  it("ITEM_ABILITIES est évaluable à l'import (zone morte temporelle)", () => {
    // Elle lit des jeux d'ids déclarés PLUS BAS dans abilities.ts. Évaluée trop
    // tôt, elle jetait un ReferenceError au premier import réel — que `tsc` ne
    // signale pas et qu'aucun test n'attrapait tant que rien ne l'importait.
    expect(Array.isArray(ITEM_ABILITIES)).toBe(true);
  });
});
