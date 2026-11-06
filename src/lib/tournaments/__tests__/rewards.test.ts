// Barème des tournois : les totaux doivent reproduire la maquette « Arena
// Prize Pool » validée, et l'indexation par victoires doit tenir.
import { describe, expect, it } from "vitest";
import { GRAND_SIZES } from "../config";
import { computeReward, podium, prizePool, rankLabel, rewardTable } from "../rewards";

describe("qualification à 32", () => {
  it("distribue 5 800 essences, 480 crédits et 1 Golden Ticket", () => {
    expect(prizePool("qualification", 32)).toEqual({ cash: 0, credits: 480, essence: 5800, goldenTickets: 1 });
  });

  it("le vainqueur (5 victoires) remporte le Golden Ticket", () => {
    const [champion] = rewardTable("qualification", 32);
    expect(champion).toMatchObject({ wins: 5, rankLabel: "1er", players: 1, goldenTicket: true, essence: 2000 });
  });
});

describe("grand tournoi", () => {
  // Valeurs de la maquette validée par l'utilisateur, crédits ×10 (arbitrage du
  // 2026-11-06, suite à la division de l'or par 10).
  const MAQUETTE: Record<number, [number, number, number]> = {
    16: [600, 2280, 5750],
    32: [1150, 4560, 11400],
    64: [2200, 9170, 22700],
    128: [5000, 18390, 45250],
    256: [10000, 36830, 90050],
    512: [21000, 73660, 179500],
    1024: [46000, 147570, 357000],
    2048: [100000, 294640, 712500],
    4096: [216000, 588780, 1423000],
  };

  it.each(GRAND_SIZES.map((s) => [s]))("prize pool à %i joueurs = maquette", (size) => {
    const [cash, credits, essence] = MAQUETTE[size];
    expect(prizePool("grand", size)).toEqual({ cash, credits, essence, goldenTickets: 0 });
  });

  it("à victoires égales, même montant quelle que soit la taille (champion excepté)", () => {
    for (const wins of [0, 1, 2, 3, 4]) {
      const a = computeReward({ kind: "grand", wins, isChampion: false, totalRounds: 6 });
      const b = computeReward({ kind: "grand", wins, isChampion: false, totalRounds: 12 });
      expect(a).toEqual(b);
    }
  });

  it("podium du 16 : 500 € / 100 € / rien en euros pour les 3e–4e", () => {
    expect(podium("grand", 16).map((r) => [r.rankLabel, r.cash, r.credits, r.essence])).toEqual([
      ["1er", 500, 500, 1500],
      ["2e", 100, 200, 550],
      ["3e–4e", 0, 150, 350],
    ]);
  });

  it("chaque joueur est compté une fois", () => {
    for (const size of GRAND_SIZES) {
      expect(rewardTable("grand", size).reduce((n, r) => n + r.players, 0)).toBe(size);
    }
  });

  it("au-delà de 12 victoires : erreur explicite", () => {
    expect(() => computeReward({ kind: "grand", wins: 13, isChampion: true, totalRounds: 13 })).toThrow();
  });
});

describe("libellés de rang", () => {
  it("1er, 2e, 3e–4e, 9e–16e", () => {
    expect([4, 3, 2, 0].map((w) => rankLabel(w, 16))).toEqual(["1er", "2e", "3e–4e", "9e–16e"]);
  });
});
