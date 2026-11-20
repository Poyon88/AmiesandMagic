// Retour joueur du 2026-11-20 : sur un grand écran (2560×1236), le plateau ne
// couvrait pas la largeur — un canevas 16:9 entre deux bandes. Le terrain
// s'élargit désormais jusqu'aux écrans ultra-larges ; ces tests gardent le gabarit.
import { describe, expect, it } from "vitest";
import { DESIGN_H, DESIGN_W, DESIGN_W_MAX, gabaritPlateau } from "./board-fit";

describe("gabarit du plateau", () => {
  it("écran 16:9 : rien ne change (1920 de large, sans bande)", () => {
    for (const [w, h] of [[1920, 1080], [2560, 1440], [1280, 720]]) {
      const g = gabaritPlateau(w, h);
      expect(g.largeur, `${w}×${h}`).toBe(DESIGN_W);
      expect(g.bandes, `${w}×${h}`).toBe(false);
      expect(g.echelle).toBeCloseTo(h / DESIGN_H, 6);
    }
  });

  it("le cas signalé : en 2560×1236, le terrain prend toute la largeur", () => {
    const g = gabaritPlateau(2560, 1236);
    // La hauteur fixe l'échelle ; la largeur de dessin grandit d'autant.
    expect(g.echelle).toBeCloseTo(1236 / DESIGN_H, 6);
    expect(g.largeur).toBe(Math.floor(2560 / (1236 / DESIGN_H)));
    expect(g.largeur).toBeGreaterThan(DESIGN_W);
    expect(g.largeur).toBeLessThan(DESIGN_W_MAX);
    expect(g.bandes).toBe(false);
    // Le canevas mis à l'échelle couvre la fenêtre, au pixel près.
    expect(2560 - g.largeur * g.echelle).toBeLessThan(2);
  });

  it("écrans ultra-larges du commerce : pleine largeur, sans bande", () => {
    // Vendus comme « 21:9 », ils sont en réalité un peu plus larges.
    for (const [w, h] of [[3440, 1440], [2560, 1080], [5120, 2160]]) {
      const g = gabaritPlateau(w, h);
      expect(g.largeur, `${w}×${h}`).toBeGreaterThan(2500);
      expect(g.largeur, `${w}×${h}`).toBeLessThanOrEqual(DESIGN_W_MAX);
      expect(g.bandes, `${w}×${h}`).toBe(false);
    }
  });

  it("au-delà (32:9) : le terrain plafonne et des bandes restent", () => {
    const g = gabaritPlateau(3840, 1080);
    expect(g.largeur).toBe(DESIGN_W_MAX);
    expect(g.echelle).toBe(1);
    expect(g.bandes).toBe(true);
  });

  it("fenêtre plus haute que 16:9 (tablette) : 1920 de large, bandes haut et bas", () => {
    const g = gabaritPlateau(1366, 1024);
    expect(g.largeur).toBe(DESIGN_W);
    expect(g.echelle).toBeCloseTo(1366 / DESIGN_W, 6);
    expect(g.bandes).toBe(true);
  });

  it("un écart d'un pixel ou deux n'est ni une bande ni un élargissement visible", () => {
    expect(gabaritPlateau(1920, 1082).bandes).toBe(false);
    expect(gabaritPlateau(1921, 1080)).toMatchObject({ largeur: 1921, bandes: false });
  });

  it("zone pas encore mesurée : gabarit d'origine", () => {
    expect(gabaritPlateau(0, 0)).toEqual({ echelle: 1, largeur: DESIGN_W, bandes: false });
    expect(gabaritPlateau(1920, 0)).toEqual({ echelle: 1, largeur: DESIGN_W, bandes: false });
  });

  it("l'échelle est toujours la même en largeur et en hauteur", () => {
    for (const [w, h] of [[2560, 1236], [3840, 1080], [1366, 1024], [1024, 768], [3440, 1440]]) {
      const g = gabaritPlateau(w, h);
      // Le canevas mis à l'échelle ne dépasse jamais la zone disponible.
      expect(g.largeur * g.echelle, `${w}×${h}`).toBeLessThanOrEqual(w + 0.001);
      expect(DESIGN_H * g.echelle, `${w}×${h}`).toBeLessThanOrEqual(h + 0.001);
    }
  });
});
