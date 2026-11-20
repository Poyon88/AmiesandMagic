// Retour joueur du 2026-11-20 : sur un grand écran (2560×1236), le plateau ne
// couvrait pas la largeur — bandes unies de chaque côté. Le décor est désormais
// prolongé dans ces bandes ; ces tests gardent la détection des bandes.
import { describe, expect, it } from "vitest";
import { aDesBandes, echellePlateau } from "./board-fit";

describe("ajustement du plateau", () => {
  it("le cas signalé : fenêtre 2560×1236, bandes sur les côtés", () => {
    expect(aDesBandes(2560, 1236)).toBe(true);
    // Le canevas tient en hauteur : c'est elle qui fixe l'échelle.
    expect(echellePlateau(2560, 1236)).toBeCloseTo(1236 / 1080, 6);
  });

  it("pas de bande en 16:9, quelle que soit la taille", () => {
    expect(aDesBandes(1920, 1080)).toBe(false);
    expect(aDesBandes(2560, 1440)).toBe(false);
    expect(aDesBandes(1280, 720)).toBe(false);
  });

  it("un écart d'un pixel ou deux n'est pas une bande", () => {
    expect(aDesBandes(1921, 1080)).toBe(false);
    expect(aDesBandes(1920, 1082)).toBe(false);
  });

  it("bandes en haut et en bas sur une fenêtre plus haute (tablette)", () => {
    expect(aDesBandes(1366, 1024)).toBe(true);
    expect(echellePlateau(1366, 1024)).toBeCloseTo(1366 / 1920, 6);
  });

  it("zone pas encore mesurée : pas de bande", () => {
    expect(aDesBandes(0, 0)).toBe(false);
    expect(aDesBandes(1920, 0)).toBe(false);
  });
});
