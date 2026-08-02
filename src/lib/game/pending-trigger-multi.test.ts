// Déclencheur en attente à PLUSIEURS cibles désignées.
//
// Signalé en partie avec « Esprit du Masque Silencieux » (Incinération de
// 4 cartes au choix dans le cimetière ADVERSE, en fin de tour) : impossible de
// désigner quoi que ce soit. Deux trous distincts :
//   1. le SÉLECTEUR — traité côté interface : le mode pending_trigger ne
//      surligne que le plateau, et le visualiseur de cimetière adverse était en
//      lecture seule. Le jeu réclamait une cible qu'aucun écran ne permettait
//      de désigner ;
//   2. la RÉSOLUTION — l'action ne transportait qu'un `targetInstanceId`, donc
//      `selectComposedTargets` faisait `.slice(0, N)` sur une liste d'un seul
//      élément. C'est ce point que ce fichier verrouille.
import { describe, expect, it } from "vitest";
import { applyAction, endOfTurnTriggerTargets } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, ComposedEffect, GameState, TargetSpec } from "./types";

function capFinDeTour(composed: ComposedEffect): Capability {
  return { uid: "cx_0", trigger: "on_end_of_turn", effectKind: "immediate", abilityId: "_composed", composed, targets: [] };
}

function porteur(composed: ComposedEffect) {
  return mkInstance(mkCard({ name: "Esprit", attack: 2, health: 2, capabilities: [capFinDeTour(composed)] }));
}

/** Fin de tour de P0 → le déclencheur interactif suspend la bascule. */
const finDeTour = (s: GameState) => applyAction(s, { type: "end_turn" });

const cible = (o: Partial<TargetSpec>): TargetSpec => ({
  entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice", ...o,
} as TargetSpec);

describe("cibles multiples désignées — contenu qui LIT les cibles", () => {
  /** 3 unités ennemies à 5 PV ; l'effet en frappe 2 au choix pour 3 dégâts. */
  function etatDegats() {
    const s = mkState();
    s.players[0].board.push(porteur({
      content: "deal_damage", magnitude: { x: 3 }, target: cible({ count: 2 }),
    }));
    s.players[1].board = ["A", "B", "C"].map(n =>
      mkInstance(mkCard({ name: n, attack: 1, health: 5 })));
    return { s, ids: s.players[1].board.map(c => c.instanceId) };
  }

  it("les DEUX cibles de la liste sont frappées, la troisième est épargnée", () => {
    const { s, ids } = etatDegats();
    let st = finDeTour(s);

    st = applyAction(st, {
      type: "resolve_pending_trigger",
      triggerId: st.pendingTriggers![0].id,
      targetInstanceIds: [ids[0], ids[2]],
    });

    const pv = Object.fromEntries(st.players[1].board.map(c => [c.card.name, c.currentHealth]));
    expect(pv).toEqual({ A: 2, B: 5, C: 2 });
  });

  it("une seule cible transmise → une seule frappée (pas de complément au hasard)", () => {
    const { s, ids } = etatDegats();
    let st = finDeTour(s);

    st = applyAction(st, {
      type: "resolve_pending_trigger",
      triggerId: st.pendingTriggers![0].id,
      targetInstanceIds: [ids[1]],
    });

    const pv = Object.fromEntries(st.players[1].board.map(c => [c.card.name, c.currentHealth]));
    expect(pv).toEqual({ A: 5, B: 2, C: 5 });
  });

  it("la forme historique à cible UNIQUE reste honorée", () => {
    // Les actions déjà journalisées d'une partie en cours doivent continuer à
    // se rejouer à l'identique après la mise à jour.
    const { s, ids } = etatDegats();
    let st = finDeTour(s);

    st = applyAction(st, {
      type: "resolve_pending_trigger",
      triggerId: st.pendingTriggers![0].id,
      targetInstanceId: ids[2],
    });

    expect(st.players[1].board.find(c => c.card.name === "C")!.currentHealth).toBe(2);
    expect(st.players[1].board.find(c => c.card.name === "A")!.currentHealth).toBe(5);
  });
});

describe("cibles dans le CIMETIÈRE adverse", () => {
  /** Le cas de la carte réelle : Incinération, 4 désignations au cimetière. */
  function etatIncineration(count: number, n = 5) {
    const s = mkState();
    s.players[0].board.push(porteur({
      content: "incineration", magnitude: { x: 1 },
      target: cible({ count, location: "graveyard" }),
    }));
    s.players[1].graveyard = Array.from({ length: n }, (_, i) =>
      mkInstance(mkCard({ name: `C${i}`, card_type: "creature", attack: 1, health: 1 })));
    s.players[1].deck = [mkInstance(mkCard({ name: "Deck1" }))];
    return { s, ids: s.players[1].graveyard.map(c => c.instanceId) };
  }

  it("le déclencheur propose bien TOUT le cimetière adverse comme cibles", () => {
    // C'est cette liste que l'interface doit rendre cliquable : elle ne contient
    // que des cartes de cimetière, aucune n'est sur le plateau.
    const { s, ids } = etatIncineration(4);
    const st = finDeTour(s);

    expect(st.endTurnPending).toBe(true);
    expect(endOfTurnTriggerTargets(st, st.pendingTriggers![0]).sort()).toEqual([...ids].sort());
  });

  it("PIÈGE D'ÉCRITURE : Incinération ignore totalement les désignations", () => {
    // Le contenu `incineration` vise un CAMP (`target.side`) et recycle `x`
    // cartes de son cimetière, choisies par le moteur. Il est résolu UNE fois,
    // hors de la boucle sur les cibles : ni les cartes désignées ni leur NOMBRE
    // n'ont d'effet. Une carte réglée sur « 4 cartes au choix, x=1 » fait donc
    // cliquer le joueur quatre fois pour recycler… une seule carte.
    // Bonne écriture : x = 4, et une cible qui nomme juste le camp.
    const { s, ids } = etatIncineration(4);
    let st = finDeTour(s);

    st = applyAction(st, {
      type: "resolve_pending_trigger",
      triggerId: st.pendingTriggers![0].id,
      targetInstanceIds: ids.slice(0, 4),
    });

    expect(st.players[1].graveyard.length).toBe(4); // 5 - x(=1), et non 5 - 4
  });

  it("c'est bien `x` qui pilote le volume recyclé", () => {
    // Le pendant du test précédent : à désignation identique, seul x bouge.
    const s = mkState();
    s.players[0].board.push(porteur({
      content: "incineration", magnitude: { x: 3 },
      target: cible({ count: 1, location: "graveyard" }),
    }));
    s.players[1].graveyard = Array.from({ length: 5 }, (_, i) =>
      mkInstance(mkCard({ name: `C${i}`, card_type: "creature", attack: 1, health: 1 })));
    s.players[1].deck = [];
    let st = finDeTour(s);

    st = applyAction(st, {
      type: "resolve_pending_trigger",
      triggerId: st.pendingTriggers![0].id,
      targetInstanceId: st.players[1].graveyard[0].instanceId,
    });

    expect(st.players[1].graveyard.length).toBe(2); // 5 - 3
    // Les 3 recyclées repartent sous le deck — mais la main passe aussitôt à P1,
    // qui en pioche une. On compte donc deck + main, pas le deck seul.
    expect(st.players[1].deck.length + st.players[1].hand.length).toBe(3);
  });
});

describe("robustesse du déclencheur en attente", () => {
  function etatSimple() {
    const s = mkState();
    s.players[0].board.push(porteur({
      content: "deal_damage", magnitude: { x: 3 }, target: cible({ count: 2 }),
    }));
    s.players[1].board = ["A", "B"].map(n => mkInstance(mkCard({ name: n, attack: 1, health: 5 })));
    return { s, ids: s.players[1].board.map(c => c.instanceId) };
  }

  it("liste VIDE : le déclencheur est consommé, le tour n'est pas bloqué", () => {
    // Un tableau vide ne doit pas être pris pour « choix fourni » — sinon
    // selectComposedTargets court-circuite son repli.
    const { s } = etatSimple();
    let st = finDeTour(s);

    st = applyAction(st, {
      type: "resolve_pending_trigger",
      triggerId: st.pendingTriggers![0].id,
      targetInstanceIds: [],
    });

    expect(st.pendingTriggers?.length ?? 0).toBe(0);
    expect(st.endTurnPending ?? false).toBe(false);
  });

  it("la fin de tour se débloque une fois le déclencheur résolu", () => {
    // Le symptôme d'origine : le tour restait suspendu jusqu'au chrono.
    const { s, ids } = etatSimple();
    let st = finDeTour(s);
    expect(st.endTurnPending).toBe(true);

    st = applyAction(st, {
      type: "resolve_pending_trigger",
      triggerId: st.pendingTriggers![0].id,
      targetInstanceIds: ids,
    });

    expect(st.endTurnPending ?? false).toBe(false);
    expect(st.currentPlayerIndex).toBe(1);
  });
});
