// « Détruire » une unité HORS PLATEAU (deck, main).
//
// Signalé sur « Jugement du Soleil Éternel » (Elfes, 5 mana) : « détruit 3
// unités ennemies dans le deck » ne faisait rien. Deux causes : aucun sélecteur
// n'existe pour une cible dans un deck (désignation « au choix » → repli sur le
// plateau ennemi → liste vide → l'effet s'évanouit), et le contenu `destroy`
// se contentait de mettre les PV à zéro — geste que seul le balayage du PLATEAU
// concrétise. Une carte du deck y serait restée, « morte », sans jamais en
// sortir. La carte passe en désignation « au hasard », et le moteur retire
// désormais la carte de sa zone vers le cimetière de son propriétaire.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, TargetSpec } from "./types";

function jugement(target: Partial<TargetSpec>): CardInstance {
  return mkInstance(mkCard({
    name: "Jugement", card_type: "spell", attack: null as unknown as number, health: null as unknown as number,
    mana_cost: 0, faction: "Elfes",
    capabilities: [{
      uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
      composed: {
        content: "destroy",
        target: { side: "enemy", count: 3, entity: "unit", location: "deck", designation: "random", cardKind: "creature", ...target },
      },
    }] as Capability[],
  }));
}

const creature = (name: string) => mkInstance(mkCard({ name, attack: 2, health: 2 }));
const sort = (name: string) => mkInstance(mkCard({ name, card_type: "spell", attack: null as unknown as number, health: null as unknown as number }));

function lancer(s: ReturnType<typeof mkState>, carte: CardInstance) {
  s.players[0].hand.push(carte);
  return applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId });
}

describe("détruire des unités dans le DECK ennemi", () => {
  it("3 créatures au hasard quittent le deck pour le cimetière ; les sorts sont épargnés", () => {
    const s = mkState();
    s.players[1].deck = [creature("A"), creature("B"), creature("C"), creature("D"), sort("S1"), sort("S2")];

    const next = lancer(s, jugement({}));

    const deck = next.players[1].deck.map((c) => c.card.name);
    const cimetiere = next.players[1].graveyard.map((c) => c.card.name);
    expect(cimetiere).toHaveLength(3);
    expect(deck).toHaveLength(3);
    expect(deck).toEqual(expect.arrayContaining(["S1", "S2"]));
    // Les trois détruites sont des créatures, et elles ont bien DISPARU du deck.
    for (const n of cimetiere) {
      expect(["A", "B", "C", "D"]).toContain(n);
      expect(deck).not.toContain(n);
    }
    // Rien ne reste « mort » dans le deck : aucune carte à 0 PV.
    expect(next.players[1].deck.every((c) => c.currentHealth > 0 || c.card.card_type === "spell")).toBe(true);
  });

  it("moins de créatures que demandé : toutes partent, le deck garde ses sorts", () => {
    const s = mkState();
    s.players[1].deck = [creature("A"), sort("S1")];

    const next = lancer(s, jugement({}));

    expect(next.players[1].graveyard.map((c) => c.card.name)).toEqual(["A"]);
    expect(next.players[1].deck.map((c) => c.card.name)).toEqual(["S1"]);
  });

  it("le deck du LANCEUR n'est pas touché", () => {
    const s = mkState();
    s.players[0].deck = [creature("Mienne")];
    s.players[1].deck = [creature("A")];

    const next = lancer(s, jugement({}));

    expect(next.players[0].deck.map((c) => c.card.name)).toEqual(["Mienne"]);
    expect(next.players[1].deck).toHaveLength(0);
  });
});

describe("détruire une unité dans la MAIN ennemie", () => {
  it("la carte est défaussée : elle rejoint le cimetière et Richesse sonne", () => {
    const s = mkState();
    s.players[1].hand = [creature("EnMain")];
    const richesse = mkInstance(mkCard({ name: "Avare", attack: 1, health: 1, mana_cost: 3, keywords: ["richesse"], effect_text: "[Richesse 2]" }));
    s.players[0].board = [richesse];

    const next = lancer(s, jugement({ location: "hand", count: 1 }));

    expect(next.players[1].hand).toHaveLength(0);
    expect(next.players[1].graveyard.map((c) => c.card.name)).toEqual(["EnMain"]);
    expect(next.players[0].board[0].currentAttack).toBe(3);
  });
});

describe("sur le PLATEAU, rien ne change", () => {
  it("détruire une unité en jeu passe toujours par les PV à zéro et le balayage", () => {
    const s = mkState();
    s.players[1].board = [creature("EnJeu")];

    const next = lancer(s, jugement({ location: "board", count: 1 }));

    expect(next.players[1].board).toHaveLength(0);
    expect(next.players[1].graveyard.map((c) => c.card.name)).toEqual(["EnJeu"]);
  });
});
