// Race « Qilins », ajoutée à **L'Empire de Jade** (faction `EmpireDuMilieu`) le
// 2026-09-20 — le clan passe de une à deux races.
//
// Quatrième application, le même jour, de l'arbitrage des Nagas : « Humains »
// est partagée par les quatre clans de la faction, donc le clan GARDE son corps
// (0.90/1.20) et la race n'en déclare aucun. C'est la table de pouvoirs qui
// fait le qilin : le clan commande et calcule, lui bénit et protège.
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

const CLAN = "L'Empire de Jade";

const def = () => FACTIONS["EmpireDuMilieu"];
const clan = () => def().clanProfiles?.[CLAN] ?? {};
const qilins = () => def().raceProfiles?.["Qilins"] ?? {};
const pouvoirs = () => Object.keys(qilins().likelyKeywords ?? {});

describe("rattachement", () => {
  it("appartient à l'Empire du Milieu, sans ambiguïté", () => {
    expect(def().races).toContain("Qilins");
    expect(getFactionForRace("Qilins")).toBe("EmpireDuMilieu");
  });

  it("n'ouvre QUE L'Empire de Jade", () => {
    expect(getClanNamesForRace("EmpireDuMilieu", "Qilins")).toEqual([CLAN]);
  });

  it("porte le clan à deux races, sans toucher aux trois autres", () => {
    expect(getRacesForClan(CLAN)).toEqual(["Humains", "Qilins"]);
    expect(getRacesForClan("Les Hordes des Steppes")).toEqual(["Humains"]);
    expect(getRacesForClan("Les Lames de l'Ombre")).toEqual(["Humains", "Tengu", "Oni"]);
    expect(getRacesForClan("Les Défenseurs d'Ivoire")).toEqual(["Humains", "Nagas"]);
  });

  it("chaque race de la faction a son groupe — aucune n'est orpheline de clan", () => {
    // La faction n'a plus de groupe « all » : une race déclarée sans entrée dans
    // `clans` n'ouvrirait AUCUN clan, en silence.
    for (const race of def().races) {
      expect(getClanNamesForRace("EmpireDuMilieu", race).length, race).toBeGreaterThan(0);
    }
  });

  it("passe la validation serveur, et seulement dans sa faction", () => {
    expect(validateRace("Qilins", "EmpireDuMilieu")).toEqual({ ok: true, race: "Qilins" });
    expect(validateRace("Qilins", "Elfes").ok).toBe(false);
  });
});

describe("le clan GARDE ses stats — la race n'en déclare aucune", () => {
  it("les Qilins ne déclarent AUCUN statWeights", () => {
    // La cascade est `clanStatW ?? raceStatW` : un choix d'OBJET ENTIER. Tout
    // gabarit posé ici serait mort-né sans le moindre avertissement.
    expect(qilins().statWeights).toBeUndefined();
  });

  it("le clan, lui, garde bien les siens — et ce corps défensif sied au qilin", () => {
    expect(clan().statWeights).toEqual({ atk: 0.90, def: 1.20 });
    const moy = (champ: "attack" | "defense") => {
      let t = 0;
      for (let i = 0; i < 200; i++) t += generateCardStats("EmpireDuMilieu", "Unité", "Rare", 10, "Qilins", CLAN)[champ] ?? 0;
      return t / 200;
    };
    expect(moy("defense")).toBeGreaterThan(moy("attack"));
  });
});

describe("table de pouvoirs — le clan calcule, le qilin bénit", () => {
  it("guérit, protège, et tire sa force de ce qu'aucun sang n'ait coulé", () => {
    expect(pouvoirs()).toEqual(expect.arrayContaining(["Bénédiction", "Bouclier", "Pureté +X/+Y"]));
  });

  it("ne double AUCUN pouvoir du clan", () => {
    const duClan = new Set(Object.keys(clan().likelyKeywords ?? {}));
    expect(pouvoirs().filter((k) => duClan.has(k))).toEqual([]);
  });

  it("ne recoupe l'ombrelle de faction sur aucun pouvoir", () => {
    // Registre entièrement neuf : la question du dépassement ne se pose pas, et
    // ce test le verrouille (là où il la recouperait, il devrait la dépasser).
    const faction = def().likelyKeywords;
    expect(pouvoirs().filter((k) => faction[k] !== undefined)).toEqual([]);
  });

  it("ne marche sur aucune autre race de la faction", () => {
    // En particulier les Nagas, l'autre race mystique : eux veillent et
    // contre-lancent, lui soigne et protège.
    const ailleurs = new Set(
      Object.entries(def().raceProfiles ?? {})
        .filter(([r]) => r !== "Qilins")
        .flatMap(([, p]) => Object.keys(p.likelyKeywords ?? {})),
    );
    expect(pouvoirs().filter((k) => ailleurs.has(k))).toEqual([]);
  });

  it("ne sollicite aucun pouvoir interdit de la faction", () => {
    const interdits = new Set(def().forbiddenKeywords);
    expect(pouvoirs().filter((k) => interdits.has(k))).toEqual([]);
  });

  it("ne cite que des pouvoirs qui EXISTENT", () => {
    // Un libellé mal orthographié ne lève aucune erreur : la ligne est morte.
    // « Pureté +X/+Y » est le cas à surveiller — son libellé porte le suffixe.
    expect(pouvoirs().filter((k) => !(k in KEYWORDS))).toEqual([]);
  });
});

describe("génération et formes", () => {
  it("renvoie bien la race et des stats non nulles", () => {
    const c = generateCardStats("EmpireDuMilieu", "Unité", "Rare", 4, "Qilins", CLAN);
    expect(c.race).toBe("Qilins");
    expect((c.attack ?? 0) + (c.defense ?? 0)).toBeGreaterThan(0);
  });

  it("n'est pas dans la liste « Vol garanti » — il marche, il ne vole pas", () => {
    let volants = 0;
    for (let i = 0; i < 60; i++) {
      if (generateCardStats("EmpireDuMilieu", "Unité", "Commune", 3, "Qilins", CLAN).keywords?.includes("Vol")) volants++;
    }
    expect(volants).toBeLessThan(10);
  });

  it("est décliné en français", () => {
    expect(RACE_FORMS_FR["Qilins"]).toEqual({ def: "le Qilin", bare: "Qilin", de: "du Qilin" });
  });
});
