// Races « Tengu » et « Oni », ajoutées aux **Lames de l'Ombre** (faction
// `EmpireDuMilieu`) le 2026-09-20 — le clan passe de une à trois races.
//
// Arbitrage des Nagas, et pour une raison plus nette encore : « Humains » est
// partagée par les QUATRE clans de la faction, et une race partagée interdit à
// son clan de céder ses `statWeights` (règle des Primordiaux). Le clan GARDE
// donc son corps 1.20/0.80, les deux yōkai n'en déclarent aucun, et c'est la
// table de pouvoirs — qui se comble pouvoir par pouvoir — qui porte toute la
// différence : le tengu vole et enseigne, l'oni terrifie et enfonce.
import { describe, expect, it } from "vitest";
import {
  FACTIONS,
  KEYWORDS,
  getClanNamesForRace,
  getFactionForRace,
  getRacesForClan,
} from "@/lib/card-engine/constants";
import { generateCardStats } from "@/lib/card-engine/generator";
import { RACE_FORMS_FR } from "@/lib/card-engine/race-forms";
import { validateRace } from "./faction-clan";

const CLAN = "Les Lames de l'Ombre";
const YOKAI = ["Tengu", "Oni"] as const;

const def = () => FACTIONS["EmpireDuMilieu"];
const clan = () => def().clanProfiles?.[CLAN] ?? {};
const profil = (race: string) => def().raceProfiles?.[race] ?? {};
const pouvoirs = (race: string) => Object.keys(profil(race).likelyKeywords ?? {});

describe("rattachement", () => {
  it.each(YOKAI)("%s appartient à l'Empire du Milieu, sans ambiguïté", (race) => {
    expect(def().races).toContain(race);
    expect(getFactionForRace(race)).toBe("EmpireDuMilieu");
  });

  it.each(YOKAI)("%s n'ouvre QUE Les Lames de l'Ombre", (race) => {
    // Le piège des Nagas : un groupe `appliesTo: "all"` résiduel, ou une race
    // glissée dans le groupe des Humains, l'ouvrirait aux quatre clans en
    // silence.
    expect(getClanNamesForRace("EmpireDuMilieu", race)).toEqual([CLAN]);
  });

  it("porte le clan à trois races", () => {
    expect(getRacesForClan(CLAN).sort()).toEqual(["Humains", "Oni", "Tengu"]);
  });

  it("ne touche à rien d'autre dans la faction", () => {
    expect(getClanNamesForRace("EmpireDuMilieu", "Humains")).toEqual([
      "Les Hordes des Steppes", "L'Empire de Jade", CLAN, "Les Défenseurs d'Ivoire",
    ]);
    expect(getClanNamesForRace("EmpireDuMilieu", "Nagas")).toEqual(["Les Défenseurs d'Ivoire"]);
    expect((def().clans ?? []).some((g) => g.appliesTo === "all")).toBe(false);
  });

  it.each(YOKAI)("%s passe la validation serveur, et seulement dans sa faction", (race) => {
    expect(validateRace(race, "EmpireDuMilieu")).toEqual({ ok: true, race });
    expect(validateRace(race, "Elfes").ok).toBe(false);
  });
});

describe("le clan GARDE ses stats — les yōkai n'en déclarent aucune", () => {
  it.each(YOKAI)("%s ne déclare AUCUN statWeights", (race) => {
    // La cascade est `clanStatW ?? raceStatW` : un choix d'OBJET ENTIER. Le clan
    // déclarant les siens, tout gabarit posé ici serait mort-né sans le moindre
    // avertissement. L'omission est la façon de le DIRE.
    expect(profil(race).statWeights).toBeUndefined();
  });

  it("le clan, lui, garde bien les siens", () => {
    // Les céder aurait renvoyé les ninjas humains à l'ombrelle de faction
    // (0.95/1.10) : ils auraient cessé d'être des lames.
    expect(clan().statWeights).toEqual({ atk: 1.20, def: 0.80 });
    expect(def().raceProfiles?.["Humains"]).toBeUndefined();
  });
});

describe("tables de pouvoirs — c'est elles qui distinguent les deux yōkai", () => {
  it("le tengu vole, enseigne et rend coup pour coup", () => {
    expect(pouvoirs("Tengu")).toEqual(expect.arrayContaining(["Vol", "Tactique X", "Riposte X"]));
    // Vol est son premier poids, de loin.
    const t = profil("Tengu").likelyKeywords ?? {};
    expect(Math.max(...Object.values(t))).toBe(t["Vol"]);
  });

  it("l'oni terrifie, s'enrage et enfonce — rien de furtif", () => {
    expect(pouvoirs("Oni")).toEqual(expect.arrayContaining(["Terreur", "Fureur", "Piétinement"]));
    for (const furtif of ["Ombre", "Invisible", "Esquive", "Vol"]) {
      expect(pouvoirs("Oni"), furtif).not.toContain(furtif);
    }
  });

  it("les deux registres ne se recoupent sur AUCUN pouvoir", () => {
    const oni = new Set(pouvoirs("Oni"));
    expect(pouvoirs("Tengu").filter((k) => oni.has(k))).toEqual([]);
  });

  it.each(YOKAI)("%s ne double AUCUN pouvoir du clan", (race) => {
    // Le poids de clan gagne pouvoir par pouvoir : un doublon serait une ligne
    // morte. Esquive et Première Frappe, évidentes pour un tengu, lui viennent
    // donc du clan.
    const duClan = new Set(Object.keys(clan().likelyKeywords ?? {}));
    expect(duClan.has("Esquive")).toBe(true);
    expect(pouvoirs(race).filter((k) => duClan.has(k))).toEqual([]);
  });

  it.each(YOKAI)("%s dépasse l'ombrelle de faction là où il la recoupe", (race) => {
    // Un poids égal ou inférieur à celui de la faction n'ajouterait rien.
    const faction = def().likelyKeywords;
    for (const [kw, poids] of Object.entries(profil(race).likelyKeywords ?? {})) {
      if (faction[kw] !== undefined) expect(poids, kw).toBeGreaterThan(faction[kw]);
    }
  });

  it("le recoupement du tengu avec l'ombrelle est bien Tactique X", () => {
    expect(def().likelyKeywords["Tactique X"]).toBe(0.50);
    expect(profil("Tengu").likelyKeywords?.["Tactique X"]).toBe(0.55);
  });

  it.each(YOKAI)("%s ne sollicite aucun pouvoir interdit de la faction", (race) => {
    const interdits = new Set(def().forbiddenKeywords);
    expect(pouvoirs(race).filter((k) => interdits.has(k))).toEqual([]);
  });

  it.each(YOKAI)("%s ne cite que des pouvoirs qui EXISTENT", (race) => {
    // Un libellé mal orthographié ne lève aucune erreur : le générateur ne le
    // trouve simplement jamais, et la ligne est morte.
    expect(pouvoirs(race).filter((k) => !(k in KEYWORDS))).toEqual([]);
  });
});

describe("génération et formes", () => {
  it.each(YOKAI)("%s : la génération renvoie la race et des stats non nulles", (race) => {
    const c = generateCardStats("EmpireDuMilieu", "Unité", "Rare", 4, race, CLAN);
    expect(c.race).toBe(race);
    expect((c.attack ?? 0) + (c.defense ?? 0)).toBeGreaterThan(0);
  });

  it("les trois races partagent le corps offensif du clan", () => {
    // À 10 manas et sur 200 tirages : sur un petit total, l'écrêtage du
    // générateur comprime l'écart sous le bruit (cf. races-rangs-silencieux).
    const moy = (race: string, champ: "attack" | "defense") => {
      let t = 0;
      for (let i = 0; i < 200; i++) {
        t += generateCardStats("EmpireDuMilieu", "Unité", "Rare", 10, race, CLAN)[champ] ?? 0;
      }
      return t / 200;
    };
    for (const race of ["Humains", ...YOKAI]) {
      expect(moy(race, "attack"), race).toBeGreaterThan(moy(race, "defense"));
    }
  });

  it("le tengu vole TOUJOURS, l'oni jamais", () => {
    // Garanti par la liste en dur du générateur, comme les Chiroptères : les
    // poids étant RELATIFS entre ~130 mots-clés, « Vol: 0.85 » seul ne faisait
    // voler qu'un tengu sur quatre-vingts. Une race ailée par définition ne peut
    // pas dépendre de ce tirage.
    for (let i = 0; i < 60; i++) {
      expect(generateCardStats("EmpireDuMilieu", "Unité", "Commune", 3, "Tengu", CLAN).keywords).toContain("Vol");
      expect(generateCardStats("EmpireDuMilieu", "Unité", "Commune", 3, "Oni", CLAN).keywords ?? []).not.toContain("Vol");
    }
  });

  it("sont déclinées en français — mots japonais, invariables, et l'Oni s'élide", () => {
    expect(RACE_FORMS_FR["Tengu"]).toEqual({ def: "le Tengu", bare: "Tengu", de: "du Tengu" });
    expect(RACE_FORMS_FR["Oni"]).toEqual({ def: "l'Oni", bare: "Oni", de: "de l'Oni" });
  });
});
