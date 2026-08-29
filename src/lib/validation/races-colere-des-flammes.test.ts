// La race ajoutée à « La Colère des Flammes » (faction `Élémentaires`, affichée
// « Les Primordiaux ») le 2026-08-28 : Salamandres.
//
// Troisième clan élémentaire peuplé, sur le même arbitrage que l'Eau et la
// Terre : il héberge « Élémentaire », race partagée par les QUATRE clans, donc
// il ne peut pas céder ses `statWeights`.
import { describe, expect, it } from "vitest";
import {
  FACTIONS,
  getAllClanNames,
  getClanNamesForRace,
  getFactionForRace,
  getRacesForClan,
} from "@/lib/card-engine/constants";
import { generateCardStats } from "@/lib/card-engine/generator";
import { RACE_FORMS_FR } from "@/lib/card-engine/race-forms";
import { validateRace } from "./faction-clan";

const def = () => FACTIONS["Élémentaires"];
const clan = () => def().clanProfiles?.["La Colère des Flammes"] ?? {};
const prof = () => def().raceProfiles?.["Salamandres"] ?? {};

describe("rattachement de la Salamandre", () => {
  it("elle appartient aux Primordiaux", () => {
    expect(def().races).toContain("Salamandres");
    expect(getFactionForRace("Salamandres")).toBe("Élémentaires");
  });

  it("elle n'ouvre QUE La Colère des Flammes", () => {
    expect(getClanNamesForRace("Élémentaires", "Salamandres")).toEqual(["La Colère des Flammes"]);
  });

  it("le clan compte désormais deux races", () => {
    expect(getRacesForClan("La Colère des Flammes")).toEqual(["Élémentaire", "Salamandres"]);
  });

  it("aucun autre clan ne la reçoit", () => {
    for (const c of ["Le Socle du Monde", "La Vague Sans Fin", "Le Souffle des Cimes"]) {
      expect(getRacesForClan(c), c).not.toContain("Salamandres");
    }
  });

  it("n'ouvre aucun clan supplémentaire à la faction", () => {
    expect(getAllClanNames("Élémentaires")).toEqual([
      "La Colère des Flammes",
      "Le Socle du Monde",
      "La Vague Sans Fin",
      "Le Souffle des Cimes",
    ]);
  });

  it("passe la validation serveur, et seulement dans sa faction", () => {
    expect(validateRace("Salamandres", "Élémentaires")).toEqual({ ok: true, race: "Salamandres" });
    expect(validateRace("Salamandres", "Morts-Vivants").ok).toBe(false);
  });

  it("se décline au féminin", () => {
    expect(RACE_FORMS_FR["Salamandres"].def).toBe("la Salamandre");
    expect(RACE_FORMS_FR["Salamandres"].de).toBe("de la Salamandre");
  });
});

describe("le clan GARDE ses stats — même règle que l'Eau et la Terre", () => {
  it("la Salamandre ne déclare AUCUN statWeights", () => {
    expect(prof().statWeights).toBeUndefined();
  });

  it("le clan garde le corps le plus offensif du jeu", () => {
    expect(clan().statWeights).toEqual({ atk: 1.40, def: 0.75 });
  });

  it("« Élémentaire » n'a toujours AUCUN profil de race", () => {
    expect(def().raceProfiles?.["Élémentaire"]).toBeUndefined();
  });

  it("elle partage le corps du clan", () => {
      // Mesuré à 10 manas et sur 200 tirages, PAS à 5 sur 80 : le générateur
      // écrête la dispersion (`maxRatio` 2.5), et sur un petit total de stats
      // cet écrêtage comprime l'écart voulu sous le bruit — ces comparaisons
      // devenaient instables (deux d'entre elles ont échoué au hasard des
      // exécutions). Plus le total est grand, plus le ratio s'exprime.
    const moy = (race: string, champ: "attack" | "defense") => {
      let t = 0;
      for (let i = 0; i < 200; i++) {
        t += generateCardStats("Élémentaires", "Unité", "Rare", 10, race, "La Colère des Flammes")[champ] ?? 0;
      }
      return t / 200;
    };
    const el = moy("Élémentaire", "attack") + moy("Élémentaire", "defense");
    const sa = moy("Salamandres", "attack") + moy("Salamandres", "defense");
    expect(Math.abs(sa - el)).toBeLessThan(1.5);
  });

  it("le feu frappe plus fort que la terre", () => {
    const moyAtk = (clanId: string) => {
      let t = 0;
      for (let i = 0; i < 200; i++) {
        t += generateCardStats("Élémentaires", "Unité", "Rare", 10, "Élémentaire", clanId).attack ?? 0;
      }
      return t / 200;
    };
    expect(moyAtk("La Colère des Flammes")).toBeGreaterThan(moyAtk("Le Socle du Monde"));
  });
});

describe("table de pouvoirs — ce qui SURVIT au feu", () => {
  it("elle repousse, elle file, elle brûle qui la saisit", () => {
    const kws = Object.keys(prof().likelyKeywords ?? {});
    expect(kws).toContain("Régénération");
    expect(kws).toContain("Célérité");
    expect(kws).toContain("Riposte X");
  });

  it("elle ne double AUCUN pouvoir du clan", () => {
    // Le clan est celui de ce qui BRÛLE : Fureur, Souffle de feu X, Combustion,
    // Carnage X. Les redéclarer en ferait des lignes mortes.
    const duClan = new Set(Object.keys(clan().likelyKeywords ?? {}));
    expect(duClan.has("Souffle de feu X")).toBe(true);
    expect(Object.keys(prof().likelyKeywords ?? {}).filter((k) => duClan.has(k))).toEqual([]);
  });

  it("dépasse l'ombrelle de faction là où elle la recoupe", () => {
    // Régénération (0.35) et Esquive (0.35) y figurent : sans dépassement, les
    // deux lignes ne diraient rien.
    const faction = def().likelyKeywords;
    for (const [kw, poids] of Object.entries(prof().likelyKeywords ?? {})) {
      if (faction[kw] !== undefined) expect(poids, kw).toBeGreaterThan(faction[kw]);
    }
    expect(prof().likelyKeywords?.["Régénération"]).toBeGreaterThan(faction["Régénération"]);
  });

  it("ne sollicite aucun pouvoir interdit de la faction", () => {
    const interdits = new Set(def().forbiddenKeywords);
    expect(Object.keys(prof().likelyKeywords ?? {}).filter((k) => interdits.has(k))).toEqual([]);
  });
});
