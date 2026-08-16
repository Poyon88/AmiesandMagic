// MAIN DE DÉPART ASYMÉTRIQUE : le joueur qui COMMENCE reçoit une carte de moins.
//
// L'initiative vaut cher — poser sa créature avant l'autre, attaquer un tour
// plus tôt, piocher dès son premier tour. Le jeu compensait déjà côté MANA (le
// second joueur reçoit une Étincelle de mana au sortir du mulligan) ; il
// compense désormais aussi côté CARTES.
//
// Ce que ce fichier verrouille, et que le golden de non-régression ne dit pas :
// la règle elle-même, indépendamment de la partie scriptée dont il est
// l'empreinte.
import { describe, expect, it } from "vitest";
import { initializeGame, applyAction } from "./engine";
import { mkCard } from "./test-harness";
import { FIRST_PLAYER_HAND_SIZE, STARTING_HAND_SIZE, startingHandSizeFor } from "./constants";
import type { Card, GameState } from "./types";

/** Deck de 30 cartes distinctes — assez pour distribuer sans épuiser. */
function deck(): { card: Card; quantity: number }[] {
  return Array.from({ length: 30 }, (_, i) => ({
    card: mkCard({ name: `C${i}`, mana_cost: (i % 5) + 1, attack: 1, health: 1 }),
    quantity: 1,
  }));
}

const hands = (s: GameState) => s.players.map((p) => p.hand.length);

describe("la règle", () => {
  it("le premier joueur reçoit une carte de MOINS que le second", () => {
    expect(FIRST_PLAYER_HAND_SIZE).toBe(STARTING_HAND_SIZE - 1);
  });

  it("`startingHandSizeFor` dit qui reçoit quoi, quel que soit le camp qui commence", () => {
    expect(startingHandSizeFor(0, 0)).toBe(FIRST_PLAYER_HAND_SIZE);
    expect(startingHandSizeFor(1, 0)).toBe(STARTING_HAND_SIZE);
    expect(startingHandSizeFor(0, 1)).toBe(STARTING_HAND_SIZE);
    expect(startingHandSizeFor(1, 1)).toBe(FIRST_PLAYER_HAND_SIZE);
  });
});

describe("distribution à l'initialisation", () => {
  it("P1 commence ⇒ P1 a 3 cartes, P2 en a 4", () => {
    const s = initializeGame("P1", "P2", deck(), deck(), 0, 42);
    expect(hands(s)).toEqual([FIRST_PLAYER_HAND_SIZE, STARTING_HAND_SIZE]);
  });

  it("P2 commence ⇒ l'asymétrie SUIT l'initiative, elle n'est pas figée sur le camp", () => {
    // Le piège : coder « le joueur 0 a 3 cartes » plutôt que « celui qui
    // commence a 3 cartes ». Le tirage au sort du premier joueur rendrait alors
    // le désavantage arbitraire.
    const s = initializeGame("P1", "P2", deck(), deck(), 1, 42);
    expect(hands(s)).toEqual([STARTING_HAND_SIZE, FIRST_PLAYER_HAND_SIZE]);
  });

  it("la carte non distribuée reste dans le deck — elle n'est pas perdue", () => {
    const s = initializeGame("P1", "P2", deck(), deck(), 0, 42);
    expect(s.players[0].deck.length).toBe(30 - FIRST_PLAYER_HAND_SIZE);
    expect(s.players[1].deck.length).toBe(30 - STARTING_HAND_SIZE);
    // Conservation : main + deck = le deck complet, des deux côtés.
    for (const p of s.players) expect(p.hand.length + p.deck.length).toBe(30);
  });
});

describe("après le mulligan", () => {
  function playedOut(firstPlayerIndex: 0 | 1) {
    let s = initializeGame("P1", "P2", deck(), deck(), firstPlayerIndex, 42);
    s = applyAction(s, { type: "mulligan", playerId: "P1", replacedInstanceIds: [] });
    s = applyAction(s, { type: "mulligan", playerId: "P2", replacedInstanceIds: [] });
    return s;
  }

  it("les deux compensations se cumulent, et l'écart reste d'une carte", () => {
    // Au premier tour : celui qui commence a 3 + 1 (sa pioche de début de tour)
    // = 4 ; l'autre a 4 + 1 (Étincelle de mana) = 5. Le second joueur garde donc
    // une carte d'avance, ET son mana d'avance — c'est le but.
    const s = playedOut(0);
    expect(s.phase).toBe("playing");
    expect(hands(s)).toEqual([FIRST_PLAYER_HAND_SIZE + 1, STARTING_HAND_SIZE + 1]);
  });

  it("l'Étincelle de mana va bien au SECOND joueur, pas au premier", () => {
    const s = playedOut(0);
    const noms = (i: number) => s.players[i].hand.map((c) => c.card.name);
    expect(noms(1).some((n) => /tincelle|spark/i.test(n))).toBe(true);
    expect(noms(0).some((n) => /tincelle|spark/i.test(n))).toBe(false);
  });

  it("quand P2 commence, tout s'inverse — y compris l'Étincelle", () => {
    const s = playedOut(1);
    expect(hands(s)).toEqual([STARTING_HAND_SIZE + 1, FIRST_PLAYER_HAND_SIZE + 1]);
    const noms = (i: number) => s.players[i].hand.map((c) => c.card.name);
    expect(noms(0).some((n) => /tincelle|spark/i.test(n))).toBe(true);
    expect(noms(1).some((n) => /tincelle|spark/i.test(n))).toBe(false);
  });

  it("remplacer toutes ses cartes au mulligan ne change PAS le compte", () => {
    // Le mulligan rend autant de cartes qu'il en reprend. Un premier joueur qui
    // recycle sa main entière doit en ressortir avec 3, pas avec 4.
    let s = initializeGame("P1", "P2", deck(), deck(), 0, 42);
    const toutP1 = s.players[0].hand.map((c) => c.instanceId);
    s = applyAction(s, { type: "mulligan", playerId: "P1", replacedInstanceIds: toutP1 });
    expect(s.players[0].hand.length).toBe(FIRST_PLAYER_HAND_SIZE);

    s = applyAction(s, { type: "mulligan", playerId: "P2", replacedInstanceIds: [] });
    expect(hands(s)).toEqual([FIRST_PLAYER_HAND_SIZE + 1, STARTING_HAND_SIZE + 1]);
  });
});

describe("déterminisme réseau", () => {
  it("deux initialisations de même graine donnent des mains IDENTIQUES", () => {
    // Les deux clients exécutent le même code : si la distribution asymétrique
    // dépendait d'autre chose que de la graine et de l'index du premier joueur,
    // les mains divergeraient et la partie désyncherait au premier tour.
    const a = initializeGame("P1", "P2", deck(), deck(), 0, 987);
    const b = initializeGame("P1", "P2", deck(), deck(), 0, 987);
    const mains = (s: GameState) => s.players.map((p) => p.hand.map((c) => c.card.name));
    expect(mains(a)).toEqual(mains(b));
    expect(a.rngState).toBe(b.rngState);
  });
});
