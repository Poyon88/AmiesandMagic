// Les offres de Sélection ne doivent pas se répéter d'une partie à l'autre avec
// les mêmes decks : la graine mêle la position de la RNG portée par l'état.
import { describe, expect, it } from "vitest";
import { getSelectionCards, getMagicalSelectionCards } from "./engine";
import { mkCard, mkState } from "./test-harness";
import type { GameState } from "./types";

function etat(rng: number): GameState {
  const s = mkState();
  const pool = Array.from({ length: 30 }, (_, i) =>
    mkCard({ id: 1000 + i, name: `C${i}`, faction: "Mercenaires", rarity: "Commune", mana_cost: 3 }));
  const sorts = Array.from({ length: 30 }, (_, i) =>
    mkCard({ id: 2000 + i, name: `S${i}`, faction: "Mercenaires", rarity: "Commune", mana_cost: 3, card_type: "spell", attack: null, health: null }));
  s.factionCardPool = pool;
  s.allSpellsPool = sorts;
  s.rngState = rng;
  return s;
}
const ids = (l: { id: number }[]) => l.map(c => c.id).join(",");
const src = { faction: "Mercenaires" };

describe("offres de Sélection d'une partie à l'autre", () => {
  it("même état visible, partie différente ⇒ offres différentes", () => {
    const offres = new Set([11, 222222, 98765432, -123456789].map(r => ids(getSelectionCards(etat(r), 3, src))));
    expect(offres.size).toBeGreaterThan(1);
    const magiques = new Set([11, 222222, 98765432, -123456789].map(r => ids(getMagicalSelectionCards(etat(r), 3, src))));
    expect(magiques.size).toBeGreaterThan(1);
  });

  it("même partie ⇒ même offre (les deux clients et le moteur s'accordent)", () => {
    expect(ids(getSelectionCards(etat(4242), 3, src))).toBe(ids(getSelectionCards(etat(4242), 3, src)));
  });
});
