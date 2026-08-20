// POINTS DE PASSAGE de l'animation — l'axe du temps INTERNE d'une action.
//
// Le store ne compare que deux états, celui d'avant et celui d'après l'action.
// Il ignore donc QUAND, à l'intérieur de l'action, chaque point de vie a été
// perdu : tous les dégâts partaient dans une salve unique et toutes les morts
// dans une autre, quel que soit le nombre de moments réellement traversés.
//
// Signalé en partie : le Diablotin Ricanant tire son effet de fin de tour, le
// tour bascule, l'adversaire pioche les Lances du Zénith dont l'effet « à la
// pioche » tue le Diablotin — et l'écran ANNONÇAIT les Lances avant de peindre
// les dégâts de fin de tour, pourtant antérieurs.
//
// Le moteur pose donc un instantané étiqueté à chaque frontière connue. Première
// frontière : la pioche.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { syncHash } from "./stateHash";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, ComposedEffect, GameState } from "./types";

function capPioche(composed: ComposedEffect): Capability {
  return { uid: "cx_0", trigger: "on_draw", effectKind: "immediate", abilityId: "_composed", composed, targets: [] };
}

function capFinDeTour(composed: ComposedEffect): Capability {
  return { uid: "cx_0", trigger: "on_end_of_turn", effectKind: "immediate", abilityId: "_composed", composed, targets: [] };
}

/** Les Lances du Zénith : 2 dégâts à une unité ennemie au hasard, à la pioche. */
function lancesDuZenith() {
  return mkInstance(mkCard({
    name: "Lances du Zénith", card_type: "spell", attack: null, health: null, mana_cost: 3,
    capabilities: [capPioche({
      target: { side: "enemy", count: 1, entity: "unit", location: "board", designation: "scatter" },
      content: "deal_damage",
      magnitude: { x: 2 },
    })] as Capability[],
  }));
}

const frontiere = (s: GameState) => (s.animationCheckpoints ?? []).find(c => c.label === "pioche");

describe("frontière de pioche — pose", () => {
  it("l'action porte un instantané étiqueté « pioche »", () => {
    const s = mkState();
    s.players[1].deck = [lancesDuZenith()];
    s.players[0].board = [mkInstance(mkCard({ name: "Cible", attack: 1, health: 5 }))];

    const st = applyAction(s, { type: "end_turn" });

    expect(frontiere(st)).toBeDefined();
  });

  it("une pioche SANS effet ne pose aucune frontière", () => {
    // Une vague par pioche banale n'aurait rien à montrer : elle ne ferait
    // qu'introduire un temps mort au milieu de chaque fin de tour.
    const s = mkState();
    s.players[1].deck = [mkInstance(mkCard({ name: "Carte muette" }))];

    const st = applyAction(s, { type: "end_turn" });

    expect(st.animationCheckpoints).toBeUndefined();
  });

  it("deux pioches à effet dans la même action ne posent qu'UNE frontière", () => {
    // L'étiquette sépare « avant la pioche » de « ce que la pioche a fait » :
    // trois cartes piochées ne font pas trois vagues.
    const s = mkState();
    s.players[1].deck = [lancesDuZenith(), lancesDuZenith()];
    s.players[0].board = [
      mkInstance(mkCard({ name: "A", attack: 1, health: 9 })),
      mkInstance(mkCard({ name: "B", attack: 1, health: 9 })),
    ];
    // Une créature qui fait piocher une seconde carte à la fin du tour adverse
    // n'existe pas ici : on force la double pioche par un simple second tour.
    let st = applyAction(s, { type: "end_turn" });
    expect((st.animationCheckpoints ?? []).length).toBe(1);

    st = applyAction(st, { type: "end_turn" }); // action suivante : file remise à zéro
    st = applyAction(st, { type: "end_turn" });
    expect((st.animationCheckpoints ?? []).length).toBe(1);
  });
});

describe("frontière de pioche — ce que l'instantané contient", () => {
  it("la carte piochée est DÉJÀ en main, son effet n'a PAS encore frappé", () => {
    // C'est tout l'intérêt de la frontière : elle sépare le moment où le joueur
    // reçoit la carte du moment où elle agit.
    const s = mkState();
    s.players[1].deck = [lancesDuZenith()];
    s.players[0].board = [mkInstance(mkCard({ name: "Victime", attack: 1, health: 2 }))];

    const st = applyAction(s, { type: "end_turn" });
    const inst = frontiere(st)!.state;

    expect(inst.players[1].hand.some(c => c.card.name === "Lances du Zénith")).toBe(true);
    // Victime encore intacte dans l'instantané…
    expect(inst.players[0].board.find(c => c.card.name === "Victime")?.currentHealth).toBe(2);
    // …et morte dans l'état final.
    expect(st.players[0].board.some(c => c.card.name === "Victime")).toBe(false);
  });

  it("ce qui précède la pioche est DÉJÀ dans l'instantané", () => {
    // Le cas signalé : les dégâts de fin de tour doivent tomber du côté « avant »
    // de la frontière, sinon l'écran les peindra encore après la révélation.
    const s = mkState();
    s.players[0].board = [mkInstance(mkCard({
      name: "Diablotin Ricanant", attack: 2, health: 1,
      capabilities: [capFinDeTour({
        target: { side: "enemy", count: 1, entity: "unit", location: "board", designation: "random" },
        content: "deal_damage",
        magnitude: { x: 1 },
      })] as Capability[],
    }))];
    s.players[1].board = [mkInstance(mkCard({ name: "Encaisse", attack: 1, health: 9 }))];
    s.players[1].deck = [lancesDuZenith()];

    const st = applyAction(s, { type: "end_turn" });
    const inst = frontiere(st)!.state;

    // Le dégât de fin de tour est TOMBÉ avant la frontière.
    expect(inst.players[1].board.find(c => c.card.name === "Encaisse")!.currentHealth).toBe(8);
    // Le Diablotin, lui, est encore debout à la frontière : ce sont les Lances
    // qui le tuent, APRÈS.
    expect(inst.players[0].board.some(c => c.card.name === "Diablotin Ricanant")).toBe(true);
    expect(st.players[0].board.some(c => c.card.name === "Diablotin Ricanant")).toBe(false);
  });
});

describe("frontière de pioche — c'est un indice, pas une vérité de jeu", () => {
  it("exclue du hash de synchronisation", () => {
    const s = mkState();
    const b: GameState = { ...s, animationCheckpoints: [{ label: "pioche", state: s, sequentialHitsBefore: 0 }] };
    expect(syncHash(s)).toBe(syncHash(b));
  });

  it("l'instantané n'embarque ni les pools de cartes ni la vague d'attaque", () => {
    // Un instantané qui recopierait un pool complet (ou un autre état entier)
    // ferait grossir chaque action d'un facteur déraisonnable.
    const s = mkState();
    s.factionCardPool = [mkCard({ name: "Pool" })];
    s.players[1].deck = [lancesDuZenith()];
    s.players[0].board = [mkInstance(mkCard({ name: "Cible", attack: 1, health: 5 }))];

    const st = applyAction(s, { type: "end_turn" });
    const inst = frontiere(st)!.state;

    expect(inst.factionCardPool).toBeUndefined();
    expect(inst.onAttackWave).toBeUndefined();
    // …et l'état RÉEL garde bien son pool.
    expect(st.factionCardPool).toBeDefined();
  });
});
