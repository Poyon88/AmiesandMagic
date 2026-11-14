// INFESTATION X — X copies de la porteuse (état actuel) mélangées au deck du
// contrôleur ; une copie PIOCHÉE est invoquée d'office (détruite si le plateau
// est plein) et remplacée par une autre pioche.
import { describe, expect, it } from "vitest";
import { applyAction, INFESTATION_DECK_CAP } from "./engine";
import { syncHash } from "./stateHash";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { MAX_BOARD_SIZE } from "./constants";
import type { CardInstance, GameAction, GameState, KeywordInstance, KeywordMode } from "./types";

function infesteur(x = 2, mode?: KeywordMode, extra: Record<string, unknown> = {}): CardInstance {
  return mkInstance(mkCard({
    name: "Cafard", mana_cost: 1, attack: 1, health: 1,
    keywords: ["infestation"] as never,
    keyword_instances: [{ id: "infestation", x, ...(mode ? { mode } : {}) }] as KeywordInstance[],
    ...extra,
  }));
}
const pioche = (i: number) => mkInstance(mkCard({ name: `Pioche ${i}`, mana_cost: 9 }));

/** Decks garnis : sans eux, la pioche à vide coûte des PV et fausse les comptes. */
function etat(): GameState {
  const s = mkState();
  for (const p of s.players) for (let i = 0; i < 10; i++) p.deck.push(pioche(i));
  return s;
}
const jouer = (s: GameState, c: CardInstance): GameState => {
  s.players[0].hand.push(c);
  return applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as GameAction);
};
const copies = (s: GameState, idx = 0) => s.players[idx].deck.filter((c) => c.infestationAutoSummon);

describe("le déclenchement", () => {
  it("entrée en jeu : X copies marquées mélangées au deck", () => {
    const st = jouer(etat(), infesteur(3));
    expect(st.players[0].deck).toHaveLength(13);
    expect(copies(st)).toHaveLength(3);
    expect(copies(st).every((c) => c.card.name === "Cafard")).toBe(true);
  });

  it("copies de l'état ACTUEL, une carte par copie", () => {
    const s = etat();
    const c = infesteur(2);
    c.card = { ...c.card, attack: 5 }; // bonus permanent cuit dans la carte
    const st = jouer(s, c);
    const [a, b] = copies(st);
    expect(a.card.attack).toBe(5);
    expect(a.card).not.toBe(b.card);
    expect(a.instanceId).not.toBe(b.instanceId);
  });

  it("les copies gardent Infestation", () => {
    const st = jouer(etat(), infesteur(1));
    expect(copies(st)[0].card.keywords).toContain("infestation");
  });

  it("plafond du deck respecté", () => {
    const s = etat();
    for (let i = 0; i < INFESTATION_DECK_CAP - 11; i++) s.players[0].deck.push(pioche(100 + i));
    const st = jouer(s, infesteur(5));
    expect(st.players[0].deck).toHaveLength(INFESTATION_DECK_CAP);
    expect(copies(st)).toHaveLength(1);
  });
});

describe("la pioche d'une copie", () => {
  function avecCopieAuDessus(): { s: GameState; copie: CardInstance } {
    const st = jouer(etat(), infesteur(1));
    const s = st;
    const i = s.players[0].deck.findIndex((c) => c.infestationAutoSummon);
    const [copie] = s.players[0].deck.splice(i, 1);
    s.players[0].deck.unshift(copie);
    return { s, copie };
  }

  it("invoquée d'office avec le mal d'invocation, remplacée par une autre pioche", () => {
    const { s, copie } = avecCopieAuDessus();
    // Fin de tour P1, puis fin de tour P2 : P1 pioche au début de son tour.
    s.currentPlayerIndex = 1;
    const main0 = s.players[0].hand.length;
    const st = applyAction(s, { type: "end_turn" } as GameAction);
    const p = st.players[0];
    const enJeu = p.board.find((c) => c.instanceId === copie.instanceId)!;
    expect(enJeu).toBeDefined();
    expect(enJeu.infestationAutoSummon).toBe(false);
    expect(p.hand).toHaveLength(main0 + 1);
    expect(p.hand.some((c) => c.instanceId === copie.instanceId)).toBe(false);
  });

  it("annonce l'éclosion à l'écran — et rien si le plateau est plein", () => {
    const { s, copie } = avecCopieAuDessus();
    s.currentPlayerIndex = 1;
    const st = applyAction(s, { type: "end_turn" } as GameAction);
    expect(st.eclosionEvents).toEqual([{ ownerId: st.players[0].id, cards: [copie.card] }]);

    const plein = avecCopieAuDessus();
    plein.s.players[0].board = Array.from({ length: MAX_BOARD_SIZE }, (_, i) => mkInstance(mkCard({ name: `Mur ${i}`, attack: 0, health: 5 })));
    plein.s.currentPlayerIndex = 1;
    expect(applyAction(plein.s, { type: "end_turn" } as GameAction).eclosionEvents ?? []).toHaveLength(0);
  });

  it("sans effet d'entrée : la copie invoquée ne réinfeste pas", () => {
    const { s } = avecCopieAuDessus();
    s.currentPlayerIndex = 1;
    const st = applyAction(s, { type: "end_turn" } as GameAction);
    expect(copies(st)).toHaveLength(0);
  });

  it("plateau plein : la copie va au cimetière, sans râle, et une autre carte est piochée", () => {
    const { s, copie } = avecCopieAuDessus();
    s.players[0].board = Array.from({ length: MAX_BOARD_SIZE }, (_, i) => mkInstance(mkCard({ name: `Mur ${i}`, attack: 0, health: 5 })));
    s.currentPlayerIndex = 1;
    const main0 = s.players[0].hand.length;
    const st = applyAction(s, { type: "end_turn" } as GameAction);
    const p = st.players[0];
    expect(p.graveyard.some((c) => c.instanceId === copie.instanceId)).toBe(true);
    expect(p.board).toHaveLength(MAX_BOARD_SIZE);
    expect(p.hand).toHaveLength(main0 + 1);
  });

  it("plusieurs copies d'affilée : chaîne bornée, sans boucle", () => {
    const s = etat();
    s.players[0].deck = Array.from({ length: 12 }, () => {
      const c = infesteur(1);
      c.infestationAutoSummon = true;
      return c;
    }).concat([pioche(1)]);
    s.currentPlayerIndex = 1;
    const st = applyAction(s, { type: "end_turn" } as GameAction);
    const p = st.players[0];
    expect(p.board.length + p.graveyard.length).toBeLessThanOrEqual(MAX_BOARD_SIZE + 1);
    expect(p.board.length).toBeLessThanOrEqual(MAX_BOARD_SIZE);
  });
});

describe("boule de neige et synchro", () => {
  it("Infestation à la mort sur une copie invoquée : elle réinfeste", () => {
    const s = etat();
    const copie = infesteur(2, "death", { health: 1 });
    copie.hasSummoningSickness = false;
    s.players[0].board.push(copie);
    const bourreau = mkInstance(mkCard({ name: "Bourreau", mana_cost: 5, attack: 9, health: 9 }));
    bourreau.hasSummoningSickness = false;
    s.players[1].board.push(bourreau);
    s.currentPlayerIndex = 1;
    const st = applyAction(s, { type: "attack", attackerInstanceId: bourreau.instanceId, targetInstanceId: copie.instanceId } as GameAction);
    expect(copies(st)).toHaveLength(2);
  });

  it("même graine ⇒ même deck mélangé", () => {
    const s1 = etat();
    const c = infesteur(3);
    const s2 = structuredClone(s1);
    const c2 = structuredClone(c);
    expect(syncHash(jouer(s1, c))).toBe(syncHash(jouer(s2, c2)));
  });
});
