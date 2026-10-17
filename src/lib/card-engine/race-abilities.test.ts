import { describe, expect, it } from "vitest";
import { FACTIONS, getAllClanNames, getAllRaces, KEYWORDS } from "./constants";
import { RACE_VISUALS } from "../ai/race-visuals";
import { AILES_FACULTATIVES, CAVALIERS_VOLANTS, CLAN_ABILITY_RULES, RACE_ABILITY_RULES, volParMonture, regleRace, THEME_ABILITY_RULES } from "./race-abilities";

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

describe("races ailées", () => {
  it("toute race dessinée avec des ailes a Vol obligatoire", () => {
    const ailees = Object.entries(RACE_VISUALS).filter(([r, d]) => /\bwing(s|ed|span)?\b/i.test(d) && !AILES_FACULTATIVES.has(r)).map(([r]) => r);
    expect(ailees.length).toBeGreaterThan(5);
    for (const race of ailees) expect(regleRace(race).obligatoires, race).toContain("Vol");
  });

  it("ailes facultatives : Vol ni obligatoire ni interdit", () => {
    for (const race of AILES_FACULTATIVES) {
      expect(regleRace(race).obligatoires, race).not.toContain("Vol");
      expect(regleRace(race).interdits, race).not.toContain("Vol");
    }
  });
});

describe("THEME_ABILITY_RULES", () => {
  it("ne nomme que des races et des capacités existantes", () => {
    const races = new Set(getAllRaces());
    for (const [race, regles] of Object.entries(THEME_ABILITY_RULES)) {
      expect(races.has(race), race).toBe(true);
      for (const l of regles.flatMap((r) => r.interdits ?? [])) expect(KEYWORDS[l], `${race} → ${l}`).toBeDefined();
    }
  });

  it("s'ajoutent aux règles de race", () => {
    expect(regleRace("Fées").interdits).toEqual(expect.arrayContaining(["Piétinement", "Armure"]));
    expect(regleRace("Géants").interdits).toEqual(expect.arrayContaining(["Vol", "Ombre"]));
    expect(regleRace("Gargouilles").obligatoires).toContain("Vol");
    expect(regleRace("Gargouilles").interdits).toContain("Poison");
  });

  it("n'interdisent aucune capacité typique du profil de la race", () => {
    const conflits: string[] = [];
    for (const f of Object.values(FACTIONS)) {
      for (const [race, prof] of Object.entries(f.raceProfiles ?? {})) {
        const themes = (THEME_ABILITY_RULES[race] ?? []).flatMap((r) => r.interdits ?? []);
        for (const l of Object.keys(prof.likelyKeywords ?? {})) if (themes.includes(l)) conflits.push(`${race} : ${l}`);
      }
    }
    expect(conflits).toEqual([]);
  });
});

describe("profils et interdits", () => {
  it("aucune capacité typique d'un profil de race n'est interdite à cette race", () => {
    const conflits: string[] = [];
    for (const f of Object.values(FACTIONS)) {
      for (const [race, prof] of Object.entries(f.raceProfiles ?? {})) {
        const interdits = regleRace(race).interdits;
        for (const l of Object.keys(prof.likelyKeywords ?? {})) if (interdits.includes(l)) conflits.push(`${race} : ${l}`);
      }
    }
    expect(conflits).toEqual([]);
  });
});

describe("cavaliers volants", () => {
  it("Elfes, Humains, Nains… peuvent avoir Vol (monture), les bêtes à terre non", () => {
    for (const r of ["Elfes", "Humains", "Nains"]) {
      expect(CAVALIERS_VOLANTS.has(r)).toBe(true);
      expect(regleRace(r).interdits).not.toContain("Vol");
    }
    for (const r of ["Loups", "Centaures", "Géants"]) expect(regleRace(r).interdits).toContain("Vol");
  });
  it("volParMonture : seulement un cavalier avec Vol", () => {
    expect(volParMonture("Elfes", ["Vol", "Précision"])).toBe(true);
    expect(volParMonture("Elfes", ["Précision"])).toBe(false);
    expect(volParMonture("Dragons", ["Vol"])).toBe(false);
    expect(volParMonture(null, ["Vol"])).toBe(false);
  });
});
