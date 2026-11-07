// Race « Yétis », ajoutée au **Royaume du Nord** (faction d'id `Humains`, « Les
// Royaumes Libres ») le 2026-10-31 — le géant des neiges du clan nordique.
//
// Même arbitrage que Pégases et Sphinx : « Humains » est partagée par les
// quatre clans, le clan GARDE donc son corps 1.15/0.90 et la race n'en déclare
// aucun — c'est la table de pouvoirs qui la distingue.
import { describe, expect, it } from "vitest";
import {
  FACTIONS,
  KEYWORDS,
  getAllClanNames,
  getClanNamesForRace,
  getFactionForRace,
  getRacesForClan,
} from "@/lib/card-engine/constants";
import { generateCardStats } from "@/lib/card-engine/generator";
import { RACE_FORMS_FR } from "@/lib/card-engine/race-forms";
import { RACE_ABILITY_RULES } from "@/lib/card-engine/race-abilities";
import { validateRace } from "./faction-clan";

const CLAN = "Le Royaume du Nord";
const RACE = "Yétis";

const def = () => FACTIONS["Humains"];
const clan = () => def().clanProfiles?.[CLAN] ?? {};
const profil = () => def().raceProfiles?.[RACE] ?? {};
const pouvoirs = () => Object.keys(profil().likelyKeywords ?? {});

describe("rattachement", () => {
  it("appartient aux Royaumes Libres, sans ambiguïté", () => {
    expect(def().races).toContain(RACE);
    expect(getFactionForRace(RACE)).toBe("Humains");
  });

  it("n'ouvre QUE Le Royaume du Nord", () => {
    expect(getClanNamesForRace("Humains", RACE)).toEqual([CLAN]);
  });

  it("porte le clan à quatre races ; Humains, Griffons et Faucons gardent leurs quatre clans", () => {
    expect(getRacesForClan(CLAN).sort()).toEqual(["Faucons", "Griffons", "Humains", "Yétis"]);
    for (const r of ["Humains", "Griffons", "Faucons"]) {
      expect(getClanNamesForRace("Humains", r)).toEqual(getAllClanNames("Humains"));
    }
  });

  it("passe la validation serveur, et seulement dans sa faction", () => {
    expect(validateRace(RACE, "Humains")).toEqual({ ok: true, race: RACE });
    expect(validateRace(RACE, "Nains").ok).toBe(false);
  });
});

describe("le clan GARDE ses stats", () => {
  it("la race ne déclare AUCUN statWeights (il serait mort-né)", () => {
    expect(profil().statWeights).toBeUndefined();
    expect(clan().statWeights).toEqual({ atk: 1.15, def: 0.90 });
  });
});

describe("table de pouvoirs", () => {
  it("le yéti glace, épouvante et écrase", () => {
    expect(pouvoirs()).toEqual(expect.arrayContaining(["Paralysie", "Terreur X", "Piétinement"]));
  });

  it("ne double AUCUN pouvoir du clan (le poids de clan gagnerait, ligne morte)", () => {
    const duClan = new Set(Object.keys(clan().likelyKeywords ?? {}));
    expect(pouvoirs().filter((k) => duClan.has(k))).toEqual([]);
  });

  it("ne recoupe pas l'ombrelle de faction, ni ses pouvoirs interdits", () => {
    const f = def().likelyKeywords;
    expect(pouvoirs().filter((k) => f[k] !== undefined)).toEqual([]);
    const interdits = new Set(def().forbiddenKeywords);
    expect(pouvoirs().filter((k) => interdits.has(k))).toEqual([]);
  });

  it("ne cite que des pouvoirs qui EXISTENT", () => {
    expect(pouvoirs().filter((k) => !(k in KEYWORDS))).toEqual([]);
  });

  it("ne vole pas et n'esquive pas", () => {
    expect(RACE_ABILITY_RULES[RACE]?.interdits).toEqual(expect.arrayContaining(["Vol", "Esquive"]));
    for (let i = 0; i < 60; i++) {
      const kws = generateCardStats("Humains", "Unité", "Commune", 5, RACE, CLAN).keywords;
      expect(kws).not.toContain("Vol");
      expect(kws).not.toContain("Esquive");
    }
  });
});

describe("génération et formes", () => {
  it("la génération renvoie la race et des stats non nulles", () => {
    const c = generateCardStats("Humains", "Unité", "Rare", 4, RACE, CLAN);
    expect(c.race).toBe(RACE);
    expect((c.attack ?? 0) + (c.defense ?? 0)).toBeGreaterThan(0);
  });

  it("est déclinée en français", () => {
    expect(RACE_FORMS_FR[RACE]).toMatchObject({ def: "le Yéti", bare: "Yéti", de: "du Yéti", all: "tous les Yétis" });
  });
});
