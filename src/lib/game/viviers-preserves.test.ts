// LES VIVIERS DE CARTES SURVIVENT À TOUTE ACTION.
//
// Défaut signalé en partie : « sélection magique ne fonctionne plus », puis
// « les invocations non plus ». Les deux lisent `factionCardPool` /
// `allSpellsPool`, et les deux avaient cessé de produire quoi que ce soit —
// sans une erreur, sans un message.
//
// La cause : `cloneStateForAction` ÉCARTE les viviers du clonage (ils pèsent
// des milliers de cartes et ne changent jamais), à charge pour chaque appelant
// de les ré-attacher. `equip_item` et `sacrifice_item`, écrits sans ce
// ré-attachement, rendaient un état amputé. Et la perte est DÉFINITIVE : chaque
// action repart de l'état précédent, donc un seul objet sacrifié suffisait à
// éteindre Sélection, Invocation, Faveur et Déchainement pour toute la partie.
//
// Le ré-attachement vit désormais DANS `cloneStateForAction`, ce qui rend
// l'oubli impossible. Ce fichier vérifie la propriété de bout en bout, action
// par action, pour qu'une action future ne puisse pas rouvrir la brèche.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, CardInstance, GameAction, GameState } from "./types";

const commune = (name: string, mana: number): Card =>
  mkCard({ name, faction: "Humains", rarity: "Commune", mana_cost: mana, attack: 1, health: 1 });

function table(): GameState {
  const s = mkState();
  s.rngState = 7;
  s.factionCardPool = [commune("Recrue", 1), commune("Garde", 2)];
  s.allSpellsPool = [
    mkCard({ name: "Étincelle", faction: "Humains", rarity: "Commune", mana_cost: 1, card_type: "spell", attack: null, health: null }),
  ];
  return s;
}

const objet = (name: string): CardInstance =>
  mkInstance(mkCard({
    name, card_type: "item", mana_cost: 0, attack: 1, health: 1, faction: "Humains",
  }));

const creature = (name: string): CardInstance =>
  mkInstance(mkCard({ name, mana_cost: 0, attack: 1, health: 3, faction: "Humains" }));

/** Chaque action du jeu, jouée sur une table où elle a un sens. */
function actionsAVerifier(): { nom: string; monter: () => { s: GameState; a: GameAction } }[] {
  return [
    {
      nom: "equip_item",
      monter: () => {
        const s = table();
        const o = objet("Épée"); const c = creature("Soldat");
        s.players[0].board.push(c); s.players[0].items = [o];
        return { s, a: { type: "equip_item", itemInstanceId: o.instanceId, targetInstanceId: c.instanceId } as GameAction };
      },
    },
    {
      nom: "sacrifice_item",
      monter: () => {
        const s = table();
        const o = objet("Épée");
        s.players[0].items = [o];
        return { s, a: { type: "sacrifice_item", itemInstanceId: o.instanceId } as GameAction };
      },
    },
    {
      nom: "play_card",
      monter: () => {
        const s = table();
        const c = creature("Soldat");
        s.players[0].hand.push(c);
        return { s, a: { type: "play_card", cardInstanceId: c.instanceId } as GameAction };
      },
    },
    { nom: "end_turn", monter: () => ({ s: table(), a: { type: "end_turn" } as GameAction }) },
  ];
}

describe("Aucune action ne perd les viviers", () => {
  it.each(actionsAVerifier())("$nom rend un état qui les porte encore", ({ monter }) => {
    const { s, a } = monter();
    expect(s.factionCardPool, "garde-fou de montage").toHaveLength(2);

    const next = applyAction(s, a);

    // `toBe` et non `toEqual` : les viviers sont ré-attachés PAR RÉFÉRENCE,
    // jamais clonés — c'est tout l'intérêt de les écarter du clonage.
    expect(next.factionCardPool).toBe(s.factionCardPool);
    expect(next.allSpellsPool).toBe(s.allSpellsPool);
  });
});

describe("Le défaut exact qui a été signalé", () => {
  it("après un sacrifice d'objet, une INVOCATION produit encore sa créature", () => {
    // LE scénario du rapport, de bout en bout. L'Invocation est le témoin idéal :
    // elle lit le vivier ET se résout sans modale, là où une Sélection attend
    // que le MAGASIN ouvre son sélecteur — invisible depuis un test moteur.
    //
    // Sans le correctif, ce test voit `factionCardPool` à `undefined` et un
    // plateau où seul l'invocateur a été posé.
    const s = table();
    const o = objet("Épée");
    s.players[0].items = [o];

    const apresSacrifice = applyAction(s,
      { type: "sacrifice_item", itemInstanceId: o.instanceId } as GameAction);
    expect(apresSacrifice.factionCardPool, "le vivier survit au sacrifice").toBe(s.factionCardPool);

    const invocateur = mkInstance(mkCard({
      name: "Invocateur", mana_cost: 0, attack: 1, health: 1, faction: "Humains",
      capabilities: [{
        uid: "cx_0", abilityId: "_composed", effectKind: "immediate", targets: [],
        trigger: "on_play", composed: { content: "invocation", magnitude: { x: 1 } },
      }] as unknown as Capability[],
    }));
    apresSacrifice.players[0].hand.push(invocateur);
    const fin = applyAction(apresSacrifice,
      { type: "play_card", cardInstanceId: invocateur.instanceId } as GameAction);

    expect(fin.players[0].board.map(c => c.card.name)).toContain("Recrue");
  });

  it("après un ÉQUIPEMENT aussi", () => {
    const s = table();
    const o = objet("Épée"); const c = creature("Soldat");
    s.players[0].board.push(c); s.players[0].items = [o];

    const apres = applyAction(s,
      { type: "equip_item", itemInstanceId: o.instanceId, targetInstanceId: c.instanceId } as GameAction);

    expect(apres.factionCardPool).toBe(s.factionCardPool);
    expect(apres.allSpellsPool).toBe(s.allSpellsPool);
  });
});
