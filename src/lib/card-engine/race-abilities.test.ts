import { describe, expect, it } from "vitest";
import { FACTIONS, getAllClanNames, getAllRaces, KEYWORDS } from "./constants";
import { CLAN_ABILITY_RULES, RACE_ABILITY_RULES, regleRace } from "./race-abilities";

describe("RACE_ABILITY_RULES", () => {
  it("ne nomme que des races et des capacités existantes", () => {
    const races = new Set(getAllRaces());
    for (const [race, r] of Object.entries(RACE_ABILITY_RULES)) {
      expect(races.has(race), race).toBe(true);
      for (const l of [...(r.interdits ?? []), ...(r.obligatoires ?? [])]) expect(KEYWORDS[l], `${race} → ${l}`).toBeDefined();
    }
  });

  it("aucune capacité à la fois interdite et obligatoire", () => {
    for (const [race, r] of Object.entries(RACE_ABILITY_RULES)) {
      for (const l of r.obligatoires ?? []) expect(r.interdits ?? [], `${race} → ${l}`).not.toContain(l);
    }
  });

  it("exemples de l'auteur : Fées et Aigles volent, Géants jamais", () => {
    expect(regleRace("Fées").obligatoires).toContain("Vol");
    expect(regleRace("Aigles Géants").obligatoires).toContain("Vol");
    expect(regleRace("Géants").interdits).toContain("Vol");
    expect(regleRace("Inconnue")).toEqual({ interdits: [], obligatoires: [] });
  });

  it("règles de clan : seul l'Air vole parmi les Élémentaires", () => {
    const clans = new Set(Object.keys(FACTIONS).flatMap((f) => getAllClanNames(f)));
    for (const c of Object.keys(CLAN_ABILITY_RULES)) expect(clans.has(c), c).toBe(true);
    expect(regleRace("Élémentaire", "Le Souffle des Cimes").obligatoires).toContain("Vol");
    expect(regleRace("Élémentaire", "Le Socle du Monde").interdits).toContain("Vol");
  });
});
