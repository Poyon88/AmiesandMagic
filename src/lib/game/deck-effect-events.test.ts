// Indice d'animation des effets « deck » SILENCIEUX (Préincanter, Fortifier).
//
// Ces capacités préparent une carte DANS le deck : rien à l'écran ne disait
// qu'elles avaient agi. `deckEffectEvents` alimente un badge qui s'élève de la
// pile de deck.
//
// Deux exigences fortes :
//   * un NO-OP n'émet rien — un badge annonçant un effet qui n'a pas eu lieu
//     serait pire que pas de badge du tout ;
//   * l'amplitude annoncée est celle RÉELLEMENT accordée. Préincanter est écrêté
//     au plancher de 1 mana : annoncer −3 pour une remise de −1 mentirait.
//
// L'événement ne porte JAMAIS la carte visée : la capacité tient à ne pas
// divulguer le sommet du deck.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { syncHash } from "./stateHash";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, GameState, KeywordInstance } from "./types";

/** Créature portant la capacité demandée à l'entrée en jeu. */
function porteur(abilityId: "preincanter" | "fortifier", x: number, y = 0) {
  return mkInstance(mkCard({
    name: `Porteur ${abilityId}`, mana_cost: 2, attack: 1, health: 1,
    keywords: [abilityId] as never,
    keyword_instances: [{ id: abilityId, x, y }] as unknown as KeywordInstance[],
    capabilities: [
      { uid: "cw_0", params: { x, y }, targets: [], trigger: "on_play", abilityId, effectKind: "immediate" },
    ] as unknown as Capability[],
  }));
}

/** Deck contenant un SORT à `coutSort` mana et une CRÉATURE. */
function table(coutSort = 4): GameState {
  const s = mkState();
  s.players[0].id = "MOI";
  s.players[1].id = "LUI";
  s.players[0].mana = 10;
  s.players[0].deck = [
    mkInstance(mkCard({ name: "Sort", card_type: "spell", attack: null, health: null, mana_cost: coutSort })),
    mkInstance(mkCard({ name: "Bête", attack: 2, health: 2 })),
  ];
  return s;
}

const jouer = (s: GameState, c: ReturnType<typeof porteur>) => {
  s.players[0].hand.push(c);
  return applyAction(s, { type: "play_card", cardInstanceId: c.instanceId });
};

describe("Préincanter — indice d'animation", () => {
  it("émet un événement avec la réduction accordée", () => {
    const st = jouer(table(4), porteur("preincanter", 2));
    expect(st.deckEffectEvents).toEqual([
      { ownerId: "MOI", abilityId: "preincanter", x: 2, y: 0 },
    ]);
  });

  it("annonce la réduction ÉCRÊTÉE, pas celle demandée", () => {
    // Sort à 2 mana, Préincanter 5 : le plancher est 1, donc −1 accordé.
    const st = jouer(table(2), porteur("preincanter", 5));
    expect(st.deckEffectEvents?.[0].x).toBe(1);
  });

  it("n'émet RIEN quand l'effet ne mord pas (sort déjà à 1)", () => {
    const st = jouer(table(1), porteur("preincanter", 3));
    expect(st.deckEffectEvents).toBeUndefined();
  });

  it("n'émet RIEN sans aucun sort dans le deck", () => {
    const s = table();
    s.players[0].deck = [mkInstance(mkCard({ name: "Bête", attack: 2, health: 2 }))];
    const st = jouer(s, porteur("preincanter", 2));
    expect(st.deckEffectEvents).toBeUndefined();
  });
});

describe("Fortifier — indice d'animation", () => {
  it("émet un événement portant les DEUX membres du couple", () => {
    const st = jouer(table(), porteur("fortifier", 2, 1));
    expect(st.deckEffectEvents).toEqual([
      { ownerId: "MOI", abilityId: "fortifier", x: 2, y: 1 },
    ]);
  });

  it("n'émet RIEN sans créature dans le deck", () => {
    const s = table();
    s.players[0].deck = [
      mkInstance(mkCard({ name: "Sort", card_type: "spell", attack: null, health: null, mana_cost: 4 })),
    ];
    const st = jouer(s, porteur("fortifier", 2, 1));
    expect(st.deckEffectEvents).toBeUndefined();
  });

  it("n'émet RIEN pour un buff nul", () => {
    const st = jouer(table(), porteur("fortifier", 0, 0));
    expect(st.deckEffectEvents).toBeUndefined();
  });
});

describe("L'indice ne divulgue pas le deck et ne casse pas la synchro", () => {
  it("l'événement ne contient AUCUNE référence à la carte visée", () => {
    const st = jouer(table(4), porteur("preincanter", 2));
    const clefs = Object.keys(st.deckEffectEvents![0]).sort();
    expect(clefs).toEqual(["abilityId", "ownerId", "x", "y"]);
  });

  it("est EXCLU du hash d'état : un client sans l'indice ne désynchronise pas", () => {
    const s = table(4);
    const st = jouer(s, porteur("preincanter", 2));
    expect(st.deckEffectEvents).toBeTruthy();
    const sans: GameState = { ...st, deckEffectEvents: undefined };
    expect(syncHash(st)).toBe(syncHash(sans));
  });
});
