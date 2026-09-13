// Race « Insectes », ajoutée à **La Forêt Enchantée** (faction d'id
// `Hommes-Bêtes`, « La Meute ») le 2026-09-13 — le clan passe des seuls Mimis à
// deux races.
//
// Arbitrage des Ghoules : le clan GARDE ses `statWeights`, la race n'en déclare
// aucun. Les Mimis n'ont aucun profil de race — la Meute n'en avait aucun avant
// celui-ci — et céder le gabarit du clan les aurait renvoyés à l'ombrelle de
// faction (1.20/1.00 au lieu de 0.85/0.90). C'est la table de pouvoirs, qui se
// comble pouvoir par pouvoir, qui fait l'insecte.
import { describe, expect, it } from "vitest";
import {
  FACTIONS,
  getClanNamesForRace,
  getFactionForRace,
  getRacesForClan,
} from "@/lib/card-engine/constants";
import { generateCardStats } from "@/lib/card-engine/generator";
import { RACE_FORMS_FR } from "@/lib/card-engine/race-forms";
import { validateRace } from "./faction-clan";

const def = () => FACTIONS["Hommes-Bêtes"];
const clan = () => def().clanProfiles?.["La Forêt Enchantée"] ?? {};
const insectes = () => def().raceProfiles?.["Insectes"] ?? {};

describe("rattachement", () => {
  it("appartient à la Meute, sans ambiguïté", () => {
    expect(def().races).toContain("Insectes");
    expect(getFactionForRace("Insectes")).toBe("Hommes-Bêtes");
  });

  it("ouvre La Forêt Enchantée ET le Pacte des Griffes (transversal), rien d'autre", () => {
    const clans = getClanNamesForRace("Hommes-Bêtes", "Insectes");
    expect(clans).toHaveLength(2);
    expect(clans).toEqual(expect.arrayContaining(["La Forêt Enchantée", "Le Pacte des Griffes"]));
  });

  it("porte le clan à deux races, rangée après les Mimis", () => {
    expect(getRacesForClan("La Forêt Enchantée")).toEqual(["Mimis", "Insectes"]);
  });

  it("passe la validation serveur, et seulement dans sa faction", () => {
    expect(validateRace("Insectes", "Hommes-Bêtes")).toEqual({ ok: true, race: "Insectes" });
    expect(validateRace("Insectes", "Elfes").ok).toBe(false);
  });
});

describe("le clan GARDE ses stats — la race n'en déclare aucune", () => {
  it("les Insectes ne déclarent AUCUN statWeights", () => {
    expect(insectes().statWeights).toBeUndefined();
  });

  it("le clan, lui, garde bien les siens", () => {
    expect(clan().statWeights).toEqual({ atk: 0.85, def: 0.90 });
  });

  it("ne change RIEN pour les Mimis, qui n'ont toujours aucun profil", () => {
    expect(def().raceProfiles?.["Mimis"]).toBeUndefined();
  });

  it("Mimis et Insectes partagent le même corps — c'est l'arbitrage assumé", () => {
    const moy = (race: string, champ: "attack" | "defense") => {
      let t = 0;
      for (let i = 0; i < 200; i++) {
        t += generateCardStats("Hommes-Bêtes", "Unité", "Rare", 10, race, "La Forêt Enchantée")[champ] ?? 0;
      }
      return t / 200;
    };
    const mimi = moy("Mimis", "attack") + moy("Mimis", "defense");
    const ins = moy("Insectes", "attack") + moy("Insectes", "defense");
    expect(Math.abs(ins - mimi)).toBeLessThan(1.5);
  });
});

describe("table de pouvoirs — c'est elle qui fait l'insecte", () => {
  it("empoisonne, pullule, vole et se dérobe", () => {
    const kws = Object.keys(insectes().likelyKeywords ?? {});
    expect(kws).toContain("Poison");
    expect(kws).toContain("Convocations multiples");
    expect(kws).toContain("Vol");
    expect(kws).toContain("Esquive");
  });

  it("ne double AUCUN pouvoir du clan", () => {
    const duClan = new Set(Object.keys(clan().likelyKeywords ?? {}));
    expect(Object.keys(insectes().likelyKeywords ?? {}).filter((k) => duClan.has(k))).toEqual([]);
  });

  it("dépasse l'ombrelle de faction partout où elle la recoupe (Vol, Esquive)", () => {
    const faction = def().likelyKeywords;
    const recoupes: string[] = [];
    for (const [kw, poids] of Object.entries(insectes().likelyKeywords ?? {})) {
      if (faction[kw] !== undefined) { recoupes.push(kw); expect(poids, kw).toBeGreaterThan(faction[kw]); }
    }
    expect(recoupes.sort()).toEqual(["Esquive", "Vol"]);
  });

  it("ne sollicite aucun pouvoir interdit de la faction", () => {
    const interdits = new Set(def().forbiddenKeywords);
    expect(Object.keys(insectes().likelyKeywords ?? {}).filter((k) => interdits.has(k))).toEqual([]);
  });
});

describe("génération et formes", () => {
  it("renvoie bien la race et des stats non nulles", () => {
    const c = generateCardStats("Hommes-Bêtes", "Unité", "Rare", 4, "Insectes", "La Forêt Enchantée");
    expect(c.race).toBe("Insectes");
    expect((c.attack ?? 0) + (c.defense ?? 0)).toBeGreaterThan(0);
  });

  it("est déclinée en français — masculine, AVEC élision", () => {
    expect(RACE_FORMS_FR["Insectes"]).toEqual({
      def: "l'Insecte", bare: "Insecte", de: "de l'Insecte",
    });
  });
});
