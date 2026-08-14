// Indice d'animation de COMPAGNONS — les cartes liées filent vers le deck.
//
// Demandé : une animation quand la capacité se déclenche, sur le modèle de Cycle
// éternel. Les cartes liées ne transitent par aucune zone visible — seul le
// compteur du deck monte, sans que rien ne dise ce qui vient d'y entrer.
//
// Contrairement aux effets « deck » silencieux (Préincanter, Fortifier), on
// transmet ICI les cartes : elles sont choisies par l'auteur de la carte, pas
// tirées du deck du joueur. Les montrer ne divulgue donc rien de sa pioche.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { syncHash } from "./stateHash";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, GameState } from "./types";

const liee = (id: number, nom: string): Card =>
  mkCard({ id, name: nom, mana_cost: 2, attack: 2, health: 2 });

/** Sort « Compagnons » liant les cartes données. */
function sortCompagnons(ids: number[]) {
  return mkInstance(mkCard({
    name: "Appel des Compagnons", card_type: "spell", attack: null, health: null, mana_cost: 3,
    spell_keywords: [{ id: "compagnons" }] as never,
    capabilities: [{
      uid: "sk_0", targets: [], trigger: "spell_resolution",
      abilityId: "compagnons", effectKind: "immediate", linkedCardIds: ids,
    }] as unknown as Capability[],
  }));
}

/** Table dont le pool contient les cartes liées — sans pool, elles sont sautées. */
function table(pool: Card[]): GameState {
  const s = mkState();
  s.players[0].id = "MOI";
  s.players[1].id = "LUI";
  s.players[0].mana = 10;
  s.factionCardPool = pool;
  return s;
}

const jouer = (s: GameState, sort: ReturnType<typeof sortCompagnons>) => {
  s.players[0].hand.push(sort);
  return applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId });
};

describe("Compagnons — l'indice d'animation", () => {
  it("porte les cartes réellement mélangées, et leur camp", () => {
    const pool = [liee(901, "Louve"), liee(902, "Ourse")];
    const st = jouer(table(pool), sortCompagnons([901, 902]));

    expect(st.compagnonsEvents).toHaveLength(1);
    expect(st.compagnonsEvents![0].ownerId).toBe("MOI");
    expect(st.compagnonsEvents![0].cards.map((c) => c.name)).toEqual(["Louve", "Ourse"]);
  });

  it("les cartes sont bien ENTRÉES dans le deck", () => {
    const pool = [liee(901, "Louve")];
    const st = jouer(table(pool), sortCompagnons([901]));
    expect(st.players[0].deck.map((c) => c.card.name)).toContain("Louve");
  });

  it("un doublon donne DEUX entrées : une carte animée par copie", () => {
    const pool = [liee(901, "Louve")];
    const st = jouer(table(pool), sortCompagnons([901, 901]));
    expect(st.compagnonsEvents![0].cards.map((c) => c.name)).toEqual(["Louve", "Louve"]);
  });

  it("une carte liée INTROUVABLE dans les pools est sautée, sans l'animer", () => {
    // Le moteur avertit en console et poursuit ; l'animation ne doit pas
    // prétendre qu'une carte fantôme est entrée dans le deck.
    const pool = [liee(901, "Louve")];
    const st = jouer(table(pool), sortCompagnons([901, 999]));
    expect(st.compagnonsEvents![0].cards.map((c) => c.name)).toEqual(["Louve"]);
  });

  it("aucune carte résolue ⇒ AUCUN événement", () => {
    const st = jouer(table([]), sortCompagnons([999]));
    expect(st.compagnonsEvents).toBeUndefined();
  });

  it("aucune carte liée configurée ⇒ aucun événement", () => {
    const st = jouer(table([liee(901, "Louve")]), sortCompagnons([]));
    expect(st.compagnonsEvents).toBeUndefined();
  });
});

describe("L'indice ne casse pas la synchro", () => {
  it("est EXCLU du hash : un client sans l'indice ne désynchronise pas", () => {
    const st = jouer(table([liee(901, "Louve")]), sortCompagnons([901]));
    expect(st.compagnonsEvents).toBeTruthy();
    const sans: GameState = { ...st, compagnonsEvents: undefined };
    expect(syncHash(st)).toBe(syncHash(sans));
  });
});
