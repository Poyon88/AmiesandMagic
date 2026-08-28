// Les deux races ajoutées à « Le Souffle des Cimes » (faction `Élémentaires`,
// affichée « Les Primordiaux ») le 2026-08-28 : Sylphes, Néphélides. Elles
// achèvent de peupler les quatre éléments.
//
// Même arbitrage que les trois autres clans élémentaires : celui-ci héberge
// « Élémentaire », race partagée par les QUATRE clans, donc il ne peut pas céder
// ses `statWeights`.
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

const NOUVELLES = ["Sylphes", "Néphélides"] as const;
const def = () => FACTIONS["Élémentaires"];
const clan = () => def().clanProfiles?.["Le Souffle des Cimes"] ?? {};
const prof = (r: string) => def().raceProfiles?.[r] ?? {};

describe("rattachement des deux races d'air", () => {
  it("chacune appartient aux Primordiaux", () => {
    for (const r of NOUVELLES) {
      expect(def().races, r).toContain(r);
      expect(getFactionForRace(r), r).toBe("Élémentaires");
    }
  });

  it("chacune n'ouvre QUE Le Souffle des Cimes", () => {
    for (const r of NOUVELLES) {
      expect(getClanNamesForRace("Élémentaires", r), r).toEqual(["Le Souffle des Cimes"]);
    }
  });

  it("le clan compte désormais trois races", () => {
    expect(getRacesForClan("Le Souffle des Cimes")).toEqual(["Élémentaire", ...NOUVELLES]);
  });

  it("aucun autre clan ne les reçoit", () => {
    for (const c of ["La Colère des Flammes", "Le Socle du Monde", "La Vague Sans Fin"]) {
      for (const r of NOUVELLES) expect(getRacesForClan(c), `${c} / ${r}`).not.toContain(r);
    }
  });

  it("les quatre éléments sont désormais peuplés", () => {
    for (const c of getAllClanNames("Élémentaires")) {
      expect(getRacesForClan(c).length, c).toBeGreaterThan(1);
    }
  });

  it("passe la validation serveur, et seulement dans sa faction", () => {
    for (const r of NOUVELLES) {
      expect(validateRace(r, "Élémentaires"), r).toEqual({ ok: true, race: r });
      expect(validateRace(r, "Elfes").ok, r).toBe(false);
    }
  });

  it("le Sylphe est masculin, la Néphélide féminine", () => {
    expect(RACE_FORMS_FR["Sylphes"].def).toBe("le Sylphe");
    expect(RACE_FORMS_FR["Néphélides"].def).toBe("la Néphélide");
  });
});

describe("le clan GARDE ses stats, et il donne le Vol", () => {
  it("aucune des deux ne déclare de statWeights", () => {
    for (const r of NOUVELLES) expect(prof(r).statWeights, r).toBeUndefined();
  });

  it("le clan garde les siens", () => {
    expect(clan().statWeights).toEqual({ atk: 1.15, def: 0.85 });
  });

  it("« Élémentaire » n'a toujours AUCUN profil de race", () => {
    expect(def().raceProfiles?.["Élémentaire"]).toBeUndefined();
  });

  it("le Vol est GARANTI par le clan, sans que les races le déclarent", () => {
    // `generator.ts` pousse "Vol" dès que clanId === "Le Souffle des Cimes".
    // Poser "Vol" dans une table de race serait doublement mort : le clan le
    // porte déjà à 0.80, et la garantie court-circuite le tirage.
    for (const r of NOUVELLES) {
      expect(Object.keys(prof(r).likelyKeywords ?? {}), r).not.toContain("Vol");
      for (let i = 0; i < 20; i++) {
        const c = generateCardStats("Élémentaires", "Unité", "Rare", 5, r, "Le Souffle des Cimes");
        expect(c.keywords, r).toContain("Vol");
      }
    }
  });

  it("elles partagent le corps du clan", () => {
    const moy = (race: string, champ: "attack" | "defense") => {
      let t = 0;
      for (let i = 0; i < 80; i++) {
        t += generateCardStats("Élémentaires", "Unité", "Rare", 5, race, "Le Souffle des Cimes")[champ] ?? 0;
      }
      return t / 80;
    };
    const base = moy("Élémentaire", "attack") + moy("Élémentaire", "defense");
    for (const r of NOUVELLES) {
      expect(Math.abs(moy(r, "attack") + moy(r, "defense") - base), r).toBeLessThan(1.5);
    }
  });
});

describe("tables de pouvoirs — le farceur et l'orage", () => {
  it("le Sylphe se dérobe et échange", () => {
    const kws = Object.keys(prof("Sylphes").likelyKeywords ?? {});
    expect(kws).toContain("Invisible");
    expect(kws).toContain("Permutation");
  });

  it("la Néphélide est l'orage, pas la brise", () => {
    const kws = Object.keys(prof("Néphélides").likelyKeywords ?? {});
    expect(kws).toContain("Paralysie");
    expect(kws).toContain("Douleur X");
  });

  it("aucune ne double un pouvoir du clan", () => {
    const duClan = new Set(Object.keys(clan().likelyKeywords ?? {}));
    expect(duClan.has("Vol")).toBe(true);
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
