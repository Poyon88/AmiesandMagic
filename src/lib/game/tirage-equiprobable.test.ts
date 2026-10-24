// TIRAGES ÉQUIPROBABLES PAR CARTE — Découverte, Sélections « ? » et Faveur.
//
// Règle (arbitrage de l'auteur, 2026-10-24) : quand le coût est libre ou « ? »,
// chaque carte éligible a la même chance de sortir. Un coût sort donc en
// proportion du nombre de cartes qui le portent — auparavant le coût était tiré
// à chances égales, ce qui sur-représentait les gros coûts, peu peuplés.
import { describe, expect, it } from "vitest";
import { getFaveurCard, getSelectionCards, offreDecouverte } from "./engine";
import { mkCard, mkState } from "./test-harness";
import type { Card } from "./types";

const commune = (id: number, cout: number, over: Partial<Card> = {}) =>
  mkCard({ id, name: `C${id}`, mana_cost: cout, attack: 1, health: 1, rarity: "Commune", faction: "Mercenaires", ...over });

/** 10 cartes à 2, 2 cartes à 8 : une carte à 8 sur six. */
const vivier = (over: Partial<Card> = {}) => [
  ...Array.from({ length: 10 }, (_, k) => commune(9500 + k, 2, over)),
  commune(9600, 8, over), commune(9601, 8, over),
];

const N = 300;

describe("Découverte — chaque carte à chances égales", () => {
  it("les coûts sortent en proportion de leur profondeur, sans doublon", () => {
    let hauts = 0, total = 0;
    for (let i = 0; i < N; i++) {
      const s = mkState();
      s.rngState = 11 + i * 7919;
      s.turnNumber = 3 + (i % 5) * 2;
      s.factionCardPool = vivier({ faction: "Humains", clan: "Aube" });
      s.players[0].identite = { faction: "Humains", clan: "Aube" };
      const offre = offreDecouverte(s, s.players[0]);
      expect(new Set(offre.map(c => c.id)).size).toBe(offre.length);
      for (const c of offre) { total++; if (c.mana_cost === 8) hauts++; }
    }
    // 1/6 ≈ 0,17 (l'ancien tirage par coût donnait ≈ 0,5).
    expect(hauts / total).toBeGreaterThan(0.08);
    expect(hauts / total).toBeLessThan(0.28);
  });
});

describe("Sélection « ? » — chaque carte à chances égales entre A et X", () => {
  it("X = 8 au hasard : un coût 8 sur six environ", () => {
    let hauts = 0, total = 0;
    for (let i = 0; i < N; i++) {
      const s = mkState();
      s.rngState = 5 + i * 104729;
      s.players[0].mana = i % 10;
      s.factionCardPool = vivier();
      for (const c of getSelectionCards(s, 8, { faction: "Mercenaires" }, undefined, true)) {
        total++; if (c.mana_cost === 8) hauts++;
      }
    }
    expect(hauts / total).toBeGreaterThan(0.08);
    expect(hauts / total).toBeLessThan(0.28);
  });
});

describe("Faveur — chaque carte à chances égales", () => {
  it("coût libre : un coût 8 sur six environ", () => {
    let hauts = 0;
    for (let i = 0; i < N; i++) {
      const s = mkState();
      s.rngState = 3 + i * 15485863;
      s.players[0].mana = i % 10;
      s.factionCardPool = vivier();
      const c = getFaveurCard(s, 0, { faction: "Mercenaires" });
      expect(c).not.toBeNull();
      if (c!.mana_cost === 8) hauts++;
    }
    expect(hauts / N).toBeGreaterThan(0.06);
    expect(hauts / N).toBeLessThan(0.3);
  });
});
