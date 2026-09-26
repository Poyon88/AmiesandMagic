// Contresort X et Exclusion X : X annulations, sur une unité (garde qui
// s'épuise charge par charge) comme sur un sort (réserve du lanceur).
// Exclusion est le miroir de Contresort pour les INVOCATIONS d'unités.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, GameState, SpellKeywordInstance } from "./types";

function sort(nom: string, sk: SpellKeywordInstance[], cout = 1): CardInstance {
  return mkInstance(mkCard({ name: nom, card_type: "spell", attack: null, health: null, mana_cost: cout, spell_keywords: sk }));
}
const impact = () => sort("Éclair", [{ id: "impact", amount: 2 } as SpellKeywordInstance]);
const soldat = (nom = "Soldat") => mkInstance(mkCard({ name: nom, attack: 2, health: 2, mana_cost: 1 }));

/** Unité portant `kw` X à l'entrée en jeu (même forme que les cartes en base :
 *  capacité `on_play` avec `params.x`). */
function porteur(kw: "contresort" | "exclusion", x: number | undefined): CardInstance {
  return mkInstance(mkCard({
    name: `Porteur ${kw}`, attack: 1, health: 4, mana_cost: 1, keywords: [kw] as never,
    capabilities: [{
      uid: "cw_0", trigger: "on_play", abilityId: kw, effectKind: "immediate",
      ...(x != null ? { params: { x } } : {}), targets: [],
    }] as unknown as Capability[],
  }));
}

function jouer(s: GameState, joueur: 0 | 1, carte: CardInstance, target?: string): GameState {
  s.currentPlayerIndex = joueur;
  s.players[joueur].mana = 10;
  s.players[joueur].hand.push(carte);
  return applyAction(s, {
    type: "play_card", cardInstanceId: carte.instanceId,
    ...(target ? { targetMap: { target_0: target } } : {}),
  });
}

describe("Contresort X — unité", () => {
  it("annule les X prochains sorts adverses, puis se désarme", () => {
    let s = jouer(mkState(), 0, porteur("contresort", 2));
    const garde = () => s.players[0].board.find(c => c.card.name === "Porteur contresort")!;
    expect(garde().contresortActive).toBe(true);
    expect(garde().contresortCharges).toBe(2);
    const pv = s.players[0].hero.hp;

    s = jouer(s, 1, impact(), "enemy_hero");
    expect(s.players[0].hero.hp).toBe(pv);
    expect(garde().contresortActive).toBe(true);        // encore une charge
    expect(garde().contresortCharges).toBe(1);

    s = jouer(s, 1, impact(), "enemy_hero");
    expect(s.players[0].hero.hp).toBe(pv);
    expect(garde().contresortActive).toBe(false);       // épuisée

    s = jouer(s, 1, impact(), "enemy_hero");
    expect(s.players[0].hero.hp).toBe(pv - 2);          // le 3e passe
  });

  it("sans X saisi (cartes existantes) : Contresort 1", () => {
    let s = jouer(mkState(), 0, porteur("contresort", undefined));
    const pv = s.players[0].hero.hp;
    s = jouer(s, 1, impact(), "enemy_hero");
    s = jouer(s, 1, impact(), "enemy_hero");
    expect(s.players[0].hero.hp).toBe(pv - 2);
  });

  it("une garde armée d'avant Contresort X (sans charges) vaut 1", () => {
    const s = mkState();
    const vieille = mkInstance(mkCard({ name: "Ancien", attack: 1, health: 3, keywords: ["contresort"] as never }));
    vieille.contresortActive = true;
    delete vieille.contresortCharges;
    s.players[0].board.push(vieille);
    const pv = s.players[0].hero.hp;
    let next = jouer(s, 1, impact(), "enemy_hero");
    expect(next.players[0].hero.hp).toBe(pv);
    expect(next.players[0].board[0].contresortActive).toBe(false);
    next = jouer(next, 1, impact(), "enemy_hero");
    expect(next.players[0].hero.hp).toBe(pv - 2);
  });
});

describe("Contresort X — sort", () => {
  it("arme X contres chez le lanceur, cumulables", () => {
    let s = jouer(mkState(), 0, sort("Mur", [{ id: "contresort", amount: 2 } as SpellKeywordInstance]));
    expect(s.players[0].contresort).toBe(2);
    s = jouer(s, 0, sort("Mur 2", [{ id: "contresort" } as SpellKeywordInstance]));
    expect(s.players[0].contresort).toBe(3);
  });
});

describe("Exclusion X — unité", () => {
  it("annule les X prochaines invocations adverses : l'unité part au cimetière, mana dépensé", () => {
    let s = jouer(mkState(), 0, porteur("exclusion", 2));
    const garde = () => s.players[0].board.find(c => c.card.name === "Porteur exclusion")!;
    expect(garde().exclusionCharges).toBe(2);

    s = jouer(s, 1, soldat("A"));
    expect(s.players[1].board.map(c => c.card.name)).toEqual([]);
    expect(s.players[1].graveyard.map(c => c.card.name)).toContain("A");
    expect(s.players[1].mana).toBe(9);
    expect(garde().exclusionCharges).toBe(1);

    s = jouer(s, 1, soldat("B"));
    expect(s.players[1].board).toHaveLength(0);
    expect(garde().exclusionCharges).toBe(0);

    s = jouer(s, 1, soldat("C"));
    expect(s.players[1].board.map(c => c.card.name)).toEqual(["C"]);
  });

  it("n'annule QUE les invocations adverses, et laisse passer les sorts", () => {
    let s = jouer(mkState(), 0, porteur("exclusion", 1));
    s = jouer(s, 0, soldat("Allié"));
    expect(s.players[0].board.map(c => c.card.name)).toContain("Allié");
    const pv = s.players[0].hero.hp;
    s = jouer(s, 1, impact(), "enemy_hero");
    expect(s.players[0].hero.hp).toBe(pv - 2);
    expect(s.players[0].board.find(c => c.card.name === "Porteur exclusion")!.exclusionCharges).toBe(1);
  });

  it("l'unité exclue ne déclenche rien (pas d'effet d'entrée en jeu)", () => {
    let s = jouer(mkState(), 0, porteur("exclusion", 1));
    const piocheuse = mkInstance(mkCard({
      name: "Piocheuse", attack: 1, health: 1, mana_cost: 1, keywords: ["pillage"] as never,
      capabilities: [{ uid: "cw_0", trigger: "on_play", abilityId: "pillage", effectKind: "immediate", params: { x: 2 }, targets: [] }] as unknown as Capability[],
    }));
    s.players[0].hand.push(soldat("Main 1"), soldat("Main 2"));
    s = jouer(s, 1, piocheuse);
    expect(s.players[0].hand).toHaveLength(2);
  });

  it("le Silence désarme la garde", () => {
    let s = jouer(mkState(), 0, porteur("exclusion", 3));
    const cible = s.players[0].board[0].instanceId;
    s = jouer(s, 1, sort("Chut", [{ id: "silence" } as SpellKeywordInstance]), cible);
    expect(s.players[0].board[0].exclusionCharges ?? 0).toBe(0);
    s = jouer(s, 1, soldat());
    expect(s.players[1].board).toHaveLength(1);
  });
});

describe("Exclusion X — sort", () => {
  it("arme X exclusions chez le lanceur, consommées AVANT la garde d'une unité", () => {
    let s = jouer(mkState(), 0, sort("Barrage", [{ id: "exclusion", amount: 1 } as SpellKeywordInstance]));
    expect(s.players[0].exclusion).toBe(1);
    s = jouer(s, 0, porteur("exclusion", 1));
    s = jouer(s, 1, soldat("A"));
    expect(s.players[1].board).toHaveLength(0);
    expect(s.players[0].exclusion).toBe(0);
    expect(s.players[0].board.find(c => c.card.name === "Porteur exclusion")!.exclusionCharges).toBe(1);
  });
});
