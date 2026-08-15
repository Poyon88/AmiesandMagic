// Le PROFIL DE JEU se mesure sur les cartes, plus sur l'intention déclarée.
//
// `statWeights` disait ce que le générateur VISE. La comparaison à la base a
// montré un écart moyen de 5,3 points, jusqu'à 11,6 (Les Fils du Volcan :
// 59,5 % annoncé, 47,9 % mesuré) — et toujours dans le même sens, le réel
// ramenant vers l'équilibre.
//
// Deuxième défaut, plus grave : les deux poids étaient affichés en ABSOLU alors
// que le générateur n'en utilise que le rapport. La Forêt d'Émeraude, déclarée
// `{atk: 0.21, def: 0.21}`, montrait deux barres presque vides — « faible
// partout » — quand son partage est 50/50.
import { describe, expect, it } from "vitest";
import {
  statProfileFromCards, jaugeDilatee, MIN_CREATURES_PROFIL, FENETRE_MIN, FENETRE_MAX,
} from "./clan-stat-profile";

const creature = (attack: number, health: number) => ({ card_type: "creature", attack, health });
const sortDe = () => ({ card_type: "spell", attack: null, health: null });

describe("Le partage mesuré", () => {
  it("est la part de l'attaque dans le total ATK+PV", () => {
    const p = statProfileFromCards([creature(3, 1), creature(2, 2), creature(1, 3)])!;
    expect(p.offensif).toBeCloseTo(6 / 12, 5);
    expect(p.defensif).toBeCloseTo(6 / 12, 5);
    expect(p.creatures).toBe(3);
  });

  it("somme toujours à 1 — c'est un partage, pas deux mesures", () => {
    const p = statProfileFromCards([creature(5, 1), creature(4, 2), creature(3, 1)])!;
    expect(p.offensif + p.defensif).toBeCloseTo(1, 10);
  });

  it("somme AVANT de diviser : une 8/8 pèse plus qu'une 1/1", () => {
    // Une moyenne de rapports par carte donnerait 50 % ici aussi, mais
    // masquerait le cas où la grosse créature penche fortement.
    const p = statProfileFromCards([creature(1, 1), creature(1, 1), creature(8, 2)])!;
    expect(p.offensif).toBeCloseTo(10 / 14, 5);
  });

  it("ignore les SORTS — ils ne disent rien du penchant", () => {
    const p = statProfileFromCards([creature(3, 1), sortDe(), sortDe(), creature(1, 3), creature(2, 2)])!;
    expect(p.creatures).toBe(3);
  });

  it("ignore une créature sans statistiques plutôt que de la compter à zéro", () => {
    const bancale = { card_type: "creature", attack: null, health: 4 };
    expect(statProfileFromCards([creature(1, 1), creature(1, 1), creature(1, 1), bancale])!.creatures).toBe(3);
  });
});

describe("Quand on ne dit rien", () => {
  it("il faut au moins trois créatures", () => {
    expect(MIN_CREATURES_PROFIL).toBe(3);
    expect(statProfileFromCards([creature(2, 2), creature(3, 1)])).toBeNull();
    expect(statProfileFromCards([creature(2, 2), creature(3, 1), creature(1, 1)])).not.toBeNull();
  });

  it("un clan sans créature ne rend rien", () => {
    expect(statProfileFromCards([sortDe(), sortDe(), sortDe(), sortDe()])).toBeNull();
  });

  it("un total nul ne rend rien plutôt que de diviser par zéro", () => {
    expect(statProfileFromCards([creature(0, 0), creature(0, 0), creature(0, 0)])).toBeNull();
  });
});

describe("La jauge dilatée", () => {
  it("étire la fourchette observée sur toute la largeur", () => {
    expect(jaugeDilatee(FENETRE_MIN)).toBe(0);
    expect(jaugeDilatee(FENETRE_MAX)).toBe(1);
    expect(jaugeDilatee(0.5)).toBeCloseTo(0.5, 5);
  });

  it("rend les écarts réels LISIBLES", () => {
    // Le Socle du Monde (39,6 %) et La Colère des Flammes (55,8 %) : 16 points
    // d'écart réel, illisibles en proportionnel. La dilatation les sépare.
    const ecartBrut = 0.558 - 0.396;
    const ecartDilate = jaugeDilatee(0.558) - jaugeDilatee(0.396);
    expect(ecartBrut).toBeCloseTo(0.162, 3);
    expect(ecartDilate).toBeGreaterThan(0.5);
  });

  it("écrête hors fenêtre au lieu de déborder", () => {
    expect(jaugeDilatee(0.1)).toBe(0);
    expect(jaugeDilatee(0.9)).toBe(1);
  });

  it("la fenêtre laisse de la marge autour des valeurs observées", () => {
    // Mesuré en base : min 39,6 %, max 55,8 %. Aucune n'est écrêtée aujourd'hui.
    expect(FENETRE_MIN).toBeLessThan(0.396);
    expect(FENETRE_MAX).toBeGreaterThan(0.558);
  });
});

describe("Le cas qui a motivé la bascule", () => {
  it("La Forêt d'Émeraude est ÉQUILIBRÉE, pas faible", () => {
    // Poids déclarés {0.21, 0.21} : l'ancien affichage montrait deux barres
    // vides. Ses cartes réelles totalisent 16 ATK pour 15 PV.
    const p = statProfileFromCards([creature(6, 5), creature(5, 5), creature(5, 5)])!;
    expect(p.offensif).toBeGreaterThan(0.5);
    expect(jaugeDilatee(p.offensif)).toBeGreaterThan(0.5);
  });
});
