// ENTERREMENT X — les X premières cartes du deck du joueur VISÉ partent dans son
// cimetière ; chaque carte manquante inflige la fatigue au héros visé.
import { describe, expect, it } from "vitest";
import { applyAction, getCreatureTargets } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, GameAction, GameState, KeywordInstance, KeywordMode, SpellKeywordInstance } from "./types";

function fossoyeur(x = 3, mode?: KeywordMode, extra: Record<string, unknown> = {}): CardInstance {
  return mkInstance(mkCard({
    name: "Fossoyeur", mana_cost: 1, attack: 1, health: 1,
    keywords: ["enterrement"] as never,
    keyword_instances: [{ id: "enterrement", x, ...(mode ? { mode } : {}) }] as KeywordInstance[],
    ...extra,
  }));
}
const carte = (nom: string, extra: Record<string, unknown> = {}) => mkInstance(mkCard({ name: nom, mana_cost: 9, ...extra }));

/** Decks nommés « P1-i » / « P2-i », du dessus (0) vers le bas. */
function etat(n = 10): GameState {
  const s = mkState();
  s.players.forEach((p, k) => { for (let i = 0; i < n; i++) p.deck.push(carte(`P${k + 1}-${i}`)); });
  return s;
}
const jouer = (s: GameState, c: CardInstance, cible?: string): GameState => {
  s.players[0].hand.push(c);
  return applyAction(s, { type: "play_card", cardInstanceId: c.instanceId, targetInstanceId: cible } as GameAction);
};
const noms = (cs: CardInstance[]) => cs.map((c) => c.card.name);

describe("forme créature", () => {
  it("vise l'adversaire : ses 3 premières cartes, dans l'ordre, dans SON cimetière", () => {
    const st = jouer(etat(), fossoyeur(3), "enemy_hero");
    expect(noms(st.players[1].graveyard)).toEqual(["P2-0", "P2-1", "P2-2"]);
    expect(st.players[1].deck).toHaveLength(7);
    expect(st.players[0].deck).toHaveLength(10);
  });

  it("se vise soi-même : son propre deck", () => {
    const st = jouer(etat(), fossoyeur(2), "friendly_hero");
    expect(noms(st.players[0].graveyard)).toEqual(["P1-0", "P1-1"]);
    expect(st.players[1].graveyard).toHaveLength(0);
  });

  it("à l'entrée, seules les deux cibles héros sont proposées", () => {
    const s = etat();
    expect(getCreatureTargets(s, fossoyeur(2).card).sort()).toEqual(["enemy_hero", "friendly_hero"]);
  });

  it("sans choix possible (fin de tour) : l'adversaire est visé", () => {
    const s = etat();
    s.players[0].board.push(fossoyeur(2, "end_of_turn"));
    const st = applyAction(s, { type: "end_turn" } as GameAction);
    expect(noms(st.players[1].graveyard)).toEqual(["P2-0", "P2-1"]);
  });
});

describe("deck trop court", () => {
  it("enterre le reste puis inflige la fatigue pour chaque manque, cumulée", () => {
    const s = etat(1);
    const victime = s.players[1];
    victime.fatigueDamage = 1;
    const pv0 = victime.hero.hp;
    const st = jouer(s, fossoyeur(3), "enemy_hero");
    expect(st.players[1].graveyard).toHaveLength(1);
    expect(st.players[1].deck).toHaveLength(0);
    // 2 cartes manquantes : fatigue 2 puis 3.
    expect(st.players[1].fatigueDamage).toBe(3);
    expect(st.players[1].hero.hp).toBe(pv0 - 5);
  });
});

describe("à l'arrivée au cimetière", () => {
  it("aucun râle : un « à la mort » enterré ne part pas", () => {
    const s = etat();
    const pioche: Capability = {
      uid: "cx_0", trigger: "on_death", effectKind: "immediate", abilityId: "_composed",
      composed: { content: "deal_damage", magnitude: { x: 5 }, target: { entity: "hero", side: "enemy", count: 1, location: "board", designation: "automatic" } },
    };
    s.players[1].deck.unshift(carte("Martyr", { capabilities: [pioche] }));
    const pv0 = s.players[0].hero.hp;
    const st = jouer(s, fossoyeur(1), "enemy_hero");
    expect(noms(st.players[1].graveyard)).toEqual(["Martyr"]);
    expect(st.players[0].hero.hp).toBe(pv0);
  });

  it("un effet « fin de tour au cimetière » enterré part à la fin du tour suivant de son propriétaire", () => {
    const s = etat();
    const brulure: Capability = {
      uid: "cx_0", trigger: "on_end_of_turn_in_graveyard", effectKind: "immediate", abilityId: "_composed",
      composed: { content: "deal_damage", magnitude: { x: 2 }, target: { entity: "hero", side: "enemy", count: 1, location: "board", designation: "automatic" } },
    };
    s.players[0].deck.unshift(carte("Revenant", { capabilities: [brulure] }));
    const st = jouer(s, fossoyeur(1), "friendly_hero");
    const pv0 = st.players[1].hero.hp;
    const apres = applyAction(st, { type: "end_turn" } as GameAction);
    expect(apres.players[1].hero.hp).toBe(pv0 - 2);
  });

  it("une copie d'Infestation enterrée perd son marqueur et n'est pas invoquée", () => {
    const s = etat();
    const copie = carte("Cafard", { card_type: "creature" });
    copie.infestationAutoSummon = true;
    s.players[1].deck.unshift(copie);
    const st = jouer(s, fossoyeur(1), "enemy_hero");
    const enterree = st.players[1].graveyard.find((c) => c.instanceId === copie.instanceId)!;
    expect(enterree.infestationAutoSummon).toBe(false);
    expect(st.players[1].board).toHaveLength(0);
  });
});

describe("forme action", () => {
  it("le sort enterre le deck du héros visé", () => {
    const s = etat();
    const sort = mkInstance(mkCard({
      name: "Fosse commune", card_type: "spell", mana_cost: 0, attack: null, health: null, keywords: [],
      spell_keywords: [{ id: "enterrement", amount: 4 }] as SpellKeywordInstance[],
    }));
    s.players[0].hand.push(sort);
    const st = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId, targetMap: { kw_0: "friendly_hero" } } as GameAction);
    expect(noms(st.players[0].graveyard).filter((n) => n.startsWith("P1-"))).toEqual(["P1-0", "P1-1", "P1-2", "P1-3"]);
  });
});

describe("forme composée (filtrable)", () => {
  const sortCompose = (x: number, extra: Record<string, unknown> = {}, side: "enemy" | "ally" = "enemy") => mkInstance(mkCard({
    name: "Fossoyage", card_type: "spell", mana_cost: 0, attack: null, health: null, keywords: [],
    capabilities: [{
      uid: "cx_e", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
      composed: { content: "enterrement", magnitude: { x }, target: { entity: "hero", side, count: 1, location: "board", designation: "automatic" }, ...extra },
    }] as never,
  }));
  const lancer = (s: GameState, sort: CardInstance) => {
    s.players[0].hand.push(sort);
    return applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId } as GameAction);
  };

  it("sans filtre : comme le mot-clé (dessus du deck, fatigue si trop court)", () => {
    const st = lancer(etat(), sortCompose(2));
    expect(noms(st.players[1].graveyard)).toEqual(["P2-0", "P2-1"]);
  });

  it("filtre de race : les X premières cartes de cette race, où qu'elles soient dans le deck", () => {
    const s = etat();
    s.players[1].deck.splice(3, 0, carte("Momie A", { race: "Momies" }));
    s.players[1].deck.splice(7, 0, carte("Momie B", { race: "Momies" }));
    s.players[1].deck.push(carte("Momie C", { race: "Momies" }));
    const st = lancer(s, sortCompose(2, { pool: { race: "Momies" } }));
    expect(noms(st.players[1].graveyard)).toEqual(["Momie A", "Momie B"]);
    expect(st.players[1].deck.some((c) => c.card.name === "Momie C")).toBe(true);
    expect(st.players[1].deck).toHaveLength(11);
  });

  it("filtre de capacité portée (Raid) ; il en manque : pas de fatigue", () => {
    const s = etat();
    s.players[1].deck.splice(5, 0, carte("Pillard", { keywords: ["raid"] }));
    const pv0 = s.players[1].hero.hp;
    const st = lancer(s, sortCompose(3, { pool: { keywordId: "raid" } }));
    expect(noms(st.players[1].graveyard)).toEqual(["Pillard"]);
    expect(st.players[1].hero.hp).toBe(pv0);
    expect(st.players[1].fatigueDamage ?? 0).toBe(0);
  });

  it("bord allié : son propre deck", () => {
    const st = lancer(etat(), sortCompose(1, {}, "ally"));
    expect(noms(st.players[0].graveyard).filter((n) => n.startsWith("P1-"))).toEqual(["P1-0"]);
  });
});
