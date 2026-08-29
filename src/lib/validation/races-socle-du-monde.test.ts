// Les trois races de terre ajoutées à « Le Socle du Monde » (faction
// `Élémentaires`, affichée « Les Primordiaux ») le 2026-08-28 : Cristallins,
// Troglodytes, Bêtes Chtoniennes.
//
// Même arbitrage que La Vague Sans Fin, et pour la même raison structurelle : le
// clan héberge « Élémentaire », race partagée par les QUATRE clans, donc il ne
// peut pas céder ses `statWeights`. Voir races-vague-sans-fin.test.ts.
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

const NOUVELLES = ["Cristallins", "Troglodytes", "Bêtes Chtoniennes"] as const;
const def = () => FACTIONS["Élémentaires"];
const clan = () => def().clanProfiles?.["Le Socle du Monde"] ?? {};
const prof = (r: string) => def().raceProfiles?.[r] ?? {};

describe("rattachement des trois races de terre", () => {
  it("chacune appartient aux Primordiaux", () => {
    for (const r of NOUVELLES) {
      expect(def().races, r).toContain(r);
      expect(getFactionForRace(r), r).toBe("Élémentaires");
    }
  });

  it("chacune n'ouvre QUE Le Socle du Monde", () => {
    for (const r of NOUVELLES) {
      expect(getClanNamesForRace("Élémentaires", r), r).toEqual(["Le Socle du Monde"]);
    }
  });

  it("le clan compte désormais quatre races", () => {
    expect(getRacesForClan("Le Socle du Monde")).toEqual(["Élémentaire", ...NOUVELLES]);
  });

  it("l'eau et la terre ne se mélangent pas", () => {
    // Les deux clans peuplés de la faction doivent rester étanches — c'est ce que
    // la scission du groupe transversal garantit.
    const eau = getRacesForClan("La Vague Sans Fin");
    for (const r of NOUVELLES) expect(eau, r).not.toContain(r);
    for (const r of ["Ondins", "Sirènes", "Léviathans"]) {
      expect(getRacesForClan("Le Socle du Monde"), r).not.toContain(r);
    }
  });

  it("le feu et l'air ne reçoivent aucune race de terre", () => {
    // Formulé en « aucune FUITE » et non en liste close : la première rédaction
    // affirmait que ces deux clans n'avaient qu'« Élémentaire », et elle a cassé
    // dès l'arrivée des Salamandres dans le feu. Même erreur que celle déjà
    // corrigée dans races-vague-sans-fin.test.ts.
    for (const c of ["La Colère des Flammes", "Le Souffle des Cimes"]) {
      for (const r of NOUVELLES) expect(getRacesForClan(c), `${c} / ${r}`).not.toContain(r);
      expect(getRacesForClan(c), c).toContain("Élémentaire");
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
    for (const r of NOUVELLES) {
      expect(validateRace(r, "Élémentaires"), r).toEqual({ ok: true, race: r });
      expect(validateRace(r, "Nains").ok, r).toBe(false);
    }
  });

  it("la Bête Chtonienne est féminine, les deux autres masculines", () => {
    expect(RACE_FORMS_FR["Cristallins"].def).toBe("le Cristallin");
    expect(RACE_FORMS_FR["Troglodytes"].def).toBe("le Troglodyte");
    expect(RACE_FORMS_FR["Bêtes Chtoniennes"].def).toBe("la Bête Chtonienne");
  });
});

describe("le clan GARDE ses stats — même règle que l'Eau", () => {
  it("aucune des trois ne déclare de statWeights", () => {
    for (const r of NOUVELLES) expect(prof(r).statWeights, r).toBeUndefined();
  });

  it("le clan garde le corps le plus défensif du jeu", () => {
    expect(clan().statWeights).toEqual({ atk: 0.85, def: 1.50 });
  });

  it("« Élémentaire » n'a toujours AUCUN profil de race", () => {
    // La règle qui interdit à ce clan de céder : la race appartient aux quatre
    // clans, son corps dépend donc du clan choisi.
    expect(def().raceProfiles?.["Élémentaire"]).toBeUndefined();
  });

  it("les quatre races de terre partagent le corps du clan", () => {
      // Mesuré à 10 manas et sur 200 tirages, PAS à 5 sur 80 : le générateur
      // écrête la dispersion (`maxRatio` 2.5), et sur un petit total de stats
      // cet écrêtage comprime l'écart voulu sous le bruit — ces comparaisons
      // devenaient instables (deux d'entre elles ont échoué au hasard des
      // exécutions). Plus le total est grand, plus le ratio s'exprime.
    const moy = (race: string, champ: "attack" | "defense") => {
      let t = 0;
      for (let i = 0; i < 200; i++) {
        t += generateCardStats("Élémentaires", "Unité", "Rare", 10, race, "Le Socle du Monde")[champ] ?? 0;
      }
      return t / 200;
    };
    const base = moy("Élémentaire", "attack") + moy("Élémentaire", "defense");
    for (const r of NOUVELLES) {
      expect(Math.abs(moy(r, "attack") + moy(r, "defense") - base), r).toBeLessThan(1.5);
    }
  });

  it("la terre encaisse plus que l'eau", () => {
    const moyDef = (clanId: string) => {
      let t = 0;
      for (let i = 0; i < 200; i++) {
        t += generateCardStats("Élémentaires", "Unité", "Rare", 10, "Élémentaire", clanId).defense ?? 0;
      }
      return t / 200;
    };
    expect(moyDef("Le Socle du Monde")).toBeGreaterThan(moyDef("La Vague Sans Fin"));
  });
});

describe("tables de pouvoirs — c'est elles qui séparent les trois", () => {
  it("chacune joue son propre registre", () => {
    expect(Object.keys(prof("Cristallins").likelyKeywords ?? {})).toContain("Contresort");
    expect(Object.keys(prof("Troglodytes").likelyKeywords ?? {})).toContain("Creuser X");
    expect(Object.keys(prof("Bêtes Chtoniennes").likelyKeywords ?? {})).toContain("Piétinement");
  });

  it("aucune ne double un pouvoir du clan", () => {
    // Provocation, Armure, Ancré, Résistance X, Riposte X et Indestructible
    // viennent toutes du clan : les redéclarer en ferait des lignes mortes.
    const duClan = new Set(Object.keys(clan().likelyKeywords ?? {}));
    expect(duClan.has("Armure")).toBe(true);
    for (const r of NOUVELLES) {
      expect(Object.keys(prof(r).likelyKeywords ?? {}).filter((k) => duClan.has(k)), r).toEqual([]);
    }
  });

  it("dépasse l'ombrelle de faction partout où elle la recoupe", () => {
    const faction = def().likelyKeywords;
    for (const r of NOUVELLES) {
      for (const [kw, poids] of Object.entries(prof(r).likelyKeywords ?? {})) {
        if (faction[kw] !== undefined) expect(poids, `${r} / ${kw}`).toBeGreaterThan(faction[kw]);
      }
    }
  });

  it("aucune ne sollicite un pouvoir interdit de la faction", () => {
    const interdits = new Set(def().forbiddenKeywords);
    for (const r of NOUVELLES) {
      expect(Object.keys(prof(r).likelyKeywords ?? {}).filter((k) => interdits.has(k)), r).toEqual([]);
    }
  });
});
