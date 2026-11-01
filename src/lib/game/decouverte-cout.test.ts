// DÉCOUVERTE — le coût C (refonte du 2026-11-01, arbitrages de l'auteur) :
//   • 2 cartes du clan au coût C, 1 d'un autre clan de la faction à C+1 ;
//   • C identique pour les deux joueurs à la même découverte, tiré au hasard
//     dans la table du rang (tous les coûts 1-10 possibles, milieu dominant,
//     coûts bas favorisés en début de partie) ;
//   • REPLI des clans incomplets : le coût valide le plus proche, commun aux
//     deux joueurs si possible.
import { describe, expect, it } from "vitest";
import { coutDeDecouverte, offreDecouverte } from "./engine";
import {
  TABLE_COUTS_DECOUVERTE, coutAutreClan, coutValideLePlusProche, rangDeDecouverte, tirerCoutDecouverte,
} from "./decouverte";
import { mkCard, mkState } from "./test-harness";
import type { Card, GameState } from "./types";

const F = "Humains", CLAN = "Aube", AUTRE = "Nord";
let id = 20000;
const commune = (clan: string, cout: number) =>
  mkCard({ id: id++, name: `${clan}-${cout}-${id}`, faction: F, clan, rarity: "Commune", mana_cost: cout, attack: 1, health: 1 } as Partial<Card>);

/** Vivier complet : 3 cartes par coût 1-10 dans chacun des deux clans. */
function vivierComplet(sauf: { clan?: string; cout?: number }[] = []): Card[] {
  const out: Card[] = [];
  for (const clan of [CLAN, AUTRE]) for (let c = 1; c <= 10; c++) {
    if (sauf.some(x => x.clan === clan && x.cout === c)) continue;
    out.push(commune(clan, c), commune(clan, c), commune(clan, c));
  }
  return out;
}

function etat(turnNumber: number, graine: number, pool = vivierComplet()): GameState {
  const s = mkState();
  s.turnNumber = turnNumber;
  s.regles = { decouverteAlternee: true, graineDecouverte: graine };
  s.factionCardPool = pool;
  s.players[0].identite = { faction: F, clan: CLAN };
  s.players[1].identite = { faction: F, clan: AUTRE };
  return s;
}

describe("la table des coûts", () => {
  it("chaque ligne : 10 coûts, tous possibles, total 100", () => {
    for (const ligne of TABLE_COUTS_DECOUVERTE) {
      expect(ligne).toHaveLength(10);
      expect(ligne.every(p => p > 0)).toBe(true);
      expect(ligne.reduce((a, b) => a + b, 0)).toBe(100);
    }
  });

  it("le coût moyen monte d'une découverte à l'autre", () => {
    const moyennes = TABLE_COUTS_DECOUVERTE.map(l => l.reduce((a, p, i) => a + p * (i + 1), 0) / 100);
    for (let i = 1; i < moyennes.length; i++) expect(moyennes[i]).toBeGreaterThan(moyennes[i - 1]);
  });

  it("le tirage suit la table (sur 20 000 graines)", () => {
    for (const rang of [1, 3, 5]) {
      const compte = Array(10).fill(0);
      for (let g = 0; g < 20000; g++) compte[tirerCoutDecouverte(rang, g * 2654435761) - 1]++;
      const ligne = TABLE_COUTS_DECOUVERTE[rang - 1];
      compte.forEach((n, i) => expect(Math.abs(n / 200 - ligne[i]), `rang ${rang}, coût ${i + 1}`).toBeLessThan(1.5));
    }
  });

  it("au-delà de la 5ᵉ découverte, la dernière ligne s'applique", () => {
    for (let g = 0; g < 200; g++) {
      const c = tirerCoutDecouverte(12, g);
      expect(c).toBeGreaterThanOrEqual(1);
      expect(c).toBeLessThanOrEqual(10);
    }
  });
});

describe("même coût pour les deux joueurs", () => {
  it("le rang est le même pour la k-ième découverte de chacun", () => {
    expect([3, 4].map(rangDeDecouverte)).toEqual([1, 1]);
    expect([7, 8].map(rangDeDecouverte)).toEqual([2, 2]);
    expect([19, 20].map(rangDeDecouverte)).toEqual([5, 5]);
  });

  it("ta 2ᵉ découverte et celle de l'adversaire ont le même C", () => {
    for (let g = 1; g <= 40; g++) {
      const p1 = etat(7, g * 7919);
      const p2 = etat(8, g * 7919);
      expect(coutDeDecouverte(p1, p1.players[0])).toBe(coutDeDecouverte(p2, p2.players[1]));
    }
  });

  it("deux parties différentes ne donnent pas les mêmes coûts", () => {
    const suite = (g: number) => [1, 2, 3, 4, 5].map(r => tirerCoutDecouverte(r, g));
    const vues = new Set(Array.from({ length: 20 }, (_, i) => suite(i * 104729 + 1).join(",")));
    expect(vues.size).toBeGreaterThan(10);
  });
});

describe("l'offre", () => {
  it("2 cartes du clan à C, 1 de l'autre clan à C+1", () => {
    for (let g = 1; g <= 40; g++) {
      const s = etat(3, g * 31337);
      const c = coutDeDecouverte(s, s.players[0])!;
      const offre = offreDecouverte(s, s.players[0]);
      expect(offre).toHaveLength(3);
      expect(offre.slice(0, 2).every(x => x.clan === CLAN && x.mana_cost === c)).toBe(true);
      expect(offre[2].clan).toBe(AUTRE);
      expect(offre[2].mana_cost).toBe(coutAutreClan(c));
      expect(new Set(offre.map(x => x.id)).size).toBe(3);
    }
  });

  it("à C = 10, la carte de l'autre clan coûte 10 aussi", () => {
    expect(coutAutreClan(10)).toBe(10);
    expect(coutAutreClan(9)).toBe(10);
  });
});

describe("repli des clans incomplets", () => {
  it("le coût valide le plus proche, le moins cher d'abord à égalité", () => {
    expect(coutValideLePlusProche(5, c => c !== 5)).toBe(4);
    expect(coutValideLePlusProche(5, c => c >= 7)).toBe(7);
    expect(coutValideLePlusProche(1, c => c === 10)).toBe(10);
    expect(coutValideLePlusProche(5, () => false)).toBeNull();
  });

  it("un coût absent du clan est reporté — et l'adversaire suit, pour rester symétrique", () => {
    // Trouve une graine qui tire C = 7 à la 1ʳᵉ découverte, puis retire les
    // coûts 7 du clan Aube : les DEUX joueurs doivent passer au même coût.
    const g = Array.from({ length: 5000 }, (_, i) => i).find(i => tirerCoutDecouverte(1, i) === 7)!;
    const pool = vivierComplet([{ clan: CLAN, cout: 7 }]);
    const p1 = etat(3, g, pool), p2 = etat(4, g, pool);
    const c1 = coutDeDecouverte(p1, p1.players[0]);
    const c2 = coutDeDecouverte(p2, p2.players[1]);
    expect(c1).not.toBe(7);
    expect(c1).toBe(c2);
  });

  it("sans coût commun, chaque joueur prend le plus proche qui tient pour lui", () => {
    const g = Array.from({ length: 5000 }, (_, i) => i).find(i => tirerCoutDecouverte(1, i) === 5)!;
    // Aube tient à 2 (Nord à 3 en face), Nord tient à 9 (Aube à 10 en face) :
    // aucun coût ne tient pour les deux.
    const pool = [commune(CLAN, 2), commune(CLAN, 2), commune(AUTRE, 3), commune(AUTRE, 9), commune(AUTRE, 9), commune(CLAN, 10)];
    const s = etat(3, g, pool);
    expect(coutDeDecouverte(s, s.players[0])).toBe(2);
    expect(coutDeDecouverte(s, s.players[1])).toBe(9);
  });
});
