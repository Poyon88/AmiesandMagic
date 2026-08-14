// Un RENVOI en main n'est pas une PIOCHE.
//
// Signalé sur « Louve kiptchake » : une fois revenue en main, elle disparaissait
// puis réapparaissait aussitôt. Le store retient les cartes piochées hors des
// états intermédiaires pour les révéler dans leur phase dédiée ; il les comptait
// par différence de taille de la main, si bien qu'une carte renvoyée était prise
// pour une pioche — retenue, puis rendue au commit final.
import { describe, expect, it } from "vitest";
import { drawnCardIds } from "./drawn-cards";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameState } from "./types";

const carte = (nom: string, id: string): CardInstance => {
  const c = mkInstance(mkCard({ name: nom, attack: 1, health: 1 }));
  c.instanceId = id;
  return c;
};

/** Deux états : avant / après, construits à la main. */
function paire(
  avant: (s: GameState) => void,
  apres: (s: GameState) => void,
): [GameState, GameState] {
  const a = mkState(); avant(a);
  const b = mkState(); apres(b);
  return [a, b];
}

describe("drawnCardIds", () => {
  it("une carte venue du DECK est une pioche", () => {
    const [a, b] = paire(
      (s) => { s.players[0].deck.push(carte("Piochée", "x")); },
      (s) => { s.players[0].hand.push(carte("Piochée", "x")); },
    );
    expect([...drawnCardIds(a, b)[0]]).toEqual(["x"]);
  });

  it("une carte venue d'un PLATEAU est un RETOUR, pas une pioche", () => {
    // Le cas de la Louve : elle était sur le plateau, elle est en main après.
    const [a, b] = paire(
      (s) => { s.players[0].board.push(carte("Louve", "x")); },
      (s) => { s.players[0].hand.push(carte("Louve", "x")); },
    );
    expect([...drawnCardIds(a, b)[0]]).toEqual([]);
  });

  it("un retour depuis le plateau ADVERSE compte aussi comme un retour", () => {
    // Remontée d'une créature volée : elle rentre dans la main de son
    // propriétaire, en venant du plateau d'en face.
    const [a, b] = paire(
      (s) => { s.players[1].board.push(carte("Volée", "x")); },
      (s) => { s.players[0].hand.push(carte("Volée", "x")); },
    );
    expect([...drawnCardIds(a, b)[0]]).toEqual([]);
  });

  it("une carte surgie d'un POOL (Sélection) reste comptée", () => {
    // Elle ne vient ni de la main ni d'un plateau : elle mérite sa révélation.
    const [a, b] = paire(
      () => { /* rien avant */ },
      (s) => { s.players[0].hand.push(carte("Choisie", "x")); },
    );
    expect([...drawnCardIds(a, b)[0]]).toEqual(["x"]);
  });

  it("une carte DÉJÀ en main n'est jamais comptée", () => {
    const [a, b] = paire(
      (s) => { s.players[0].hand.push(carte("Déjà là", "x")); },
      (s) => { s.players[0].hand.push(carte("Déjà là", "x")); },
    );
    expect([...drawnCardIds(a, b)[0]]).toEqual([]);
  });

  it("pioche ET retour dans la même action : seule la pioche est comptée", () => {
    const [a, b] = paire(
      (s) => {
        s.players[0].deck.push(carte("Piochée", "p"));
        s.players[0].board.push(carte("Louve", "l"));
      },
      (s) => {
        s.players[0].hand.push(carte("Louve", "l"));
        s.players[0].hand.push(carte("Piochée", "p"));
      },
    );
    expect([...drawnCardIds(a, b)[0]]).toEqual(["p"]);
  });

  it("les deux joueurs sont traités séparément", () => {
    const [a, b] = paire(
      () => {},
      (s) => {
        s.players[0].hand.push(carte("A", "a"));
        s.players[1].hand.push(carte("B", "b"));
      },
    );
    const [j0, j1] = drawnCardIds(a, b);
    expect([...j0]).toEqual(["a"]);
    expect([...j1]).toEqual(["b"]);
  });
});
