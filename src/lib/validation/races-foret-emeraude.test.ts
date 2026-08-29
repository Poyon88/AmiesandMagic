// Les trois races du petit peuple ajoutées à « La Forêt d'Émeraude » (faction
// Elfes, « L'Alliance Céleste ») le 2026-08-29 : Farfadets, Korrigans, Faunes.
//
// Particularité de ce lot : le critère des Ghoules était satisfait SANS RIEN
// INVENTER. Les Fées déclaraient déjà leur propre gabarit, jusque-là mort-né
// dans ce clan — le don le rend simplement effectif.
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

const NOUVELLES = ["Farfadets", "Korrigans", "Faunes", "Dryades"] as const;
const TOUTES = ["Fées", ...NOUVELLES] as const;
const def = () => FACTIONS["Elfes"];
const clan = () => def().clanProfiles?.["La Forêt d'Émeraude"] ?? {};
const prof = (r: string) => def().raceProfiles?.[r] ?? {};

describe("rattachement des trois races", () => {
  it("chacune appartient à l'Alliance Céleste", () => {
    for (const r of NOUVELLES) {
      expect(def().races, r).toContain(r);
      expect(getFactionForRace(r), r).toBe("Elfes");
    }
  });

  it("chacune n'ouvre QUE La Forêt d'Émeraude", () => {
    for (const r of NOUVELLES) {
      expect(getClanNamesForRace("Elfes", r), r).toEqual(["La Forêt d'Émeraude"]);
    }
  });

  it("le clan compte désormais cinq races, Fées en tête", () => {
    expect(getRacesForClan("La Forêt d'Émeraude")).toEqual([...TOUTES]);
  });

  it("aucune ne fuit vers les autres clans elfes", () => {
    for (const c of ["Les Sylvains", "Les Hauts-Elfes", "La Combe Verte"]) {
      for (const r of NOUVELLES) expect(getRacesForClan(c), `${c} / ${r}`).not.toContain(r);
    }
  });

  it("n'ouvre aucun clan supplémentaire à la faction", () => {
    expect(getAllClanNames("Elfes")).toEqual([
      "Les Sylvains", "Les Hauts-Elfes", "La Forêt d'Émeraude", "La Combe Verte",
    ]);
  });

  it("passe la validation serveur, et seulement dans sa faction", () => {
    for (const r of NOUVELLES) {
      expect(validateRace(r, "Elfes"), r).toEqual({ ok: true, race: r });
      expect(validateRace(r, "Nains").ok, r).toBe(false);
    }
  });

  it("trois masculines, la Dryade féminine", () => {
    expect(RACE_FORMS_FR["Farfadets"].def).toBe("le Farfadet");
    expect(RACE_FORMS_FR["Korrigans"].def).toBe("le Korrigan");
    expect(RACE_FORMS_FR["Faunes"].def).toBe("le Faune");
    expect(RACE_FORMS_FR["Dryades"].def).toBe("la Dryade");
  });
});

describe("le clan CÈDE ses stats — et les Fées y gagnent leur propre corps", () => {
  it("le clan ne déclare plus AUCUN statWeights", () => {
    expect(clan().statWeights).toBeUndefined();
  });

  it("les quatre races en déclarent chacune un", () => {
    for (const r of TOUTES) expect(prof(r).statWeights, r).toBeDefined();
  });

  it("le gabarit des Fées était DÉJÀ là — le don le rend effectif", () => {
    // C'est ce qui rendait le critère des Ghoules satisfait d'avance : aucune
    // race du clan ne retombe sur l'ombrelle de faction.
    expect(prof("Fées").statWeights).toEqual({ atk: 0.75, def: 0.65 });
  });

  it("le Faune est le seul FRAPPEUR — mesuré en PART d'attaque", () => {
    // Piège déjà rencontré avec le Léviathan : `statWeights` ne décide que du
    // PARTAGE atk/déf, jamais de la taille. Comparer les `atk` bruts ne dit
    // rien — c'est le RATIO qu'il faut lire. Un premier jet à 1.20/0.80 avait
    // été écrit 1.10/0.95, ce qui donnait au satyre moins d'attaque qu'au
    // farfadet.
    const part = (r: string) => {
      const w = prof(r).statWeights!;
      return w.atk / (w.atk + w.def);
    };
    for (const r of TOUTES) {
      if (r === "Faunes") continue;
      expect(part("Faunes"), r).toBeGreaterThan(part(r));
    }
  });

  it("la Dryade est le corps le plus DÉFENSIF, devant le Korrigan", () => {
    // Lu en PART d'attaque, seule grandeur que `statWeights` commande :
    // Faune 60 % > Fée 53,6 % > Farfadet 48,5 % > Korrigan 45,7 % > Dryade 41,7 %.
    const part = (r: string) => {
      const w = prof(r).statWeights!;
      return w.atk / (w.atk + w.def);
    };
    for (const r of TOUTES) {
      if (r === "Dryades") continue;
      expect(part("Dryades"), r).toBeLessThan(part(r));
    }
    expect(part("Korrigans")).toBeLessThan(part("Farfadets"));
  });

  it("la génération sépare bien les corps", () => {
    // Mesuré à 10 manas, PAS à 5 : le générateur écrête la dispersion
    // (`maxRatio` 2.5), et sur un petit total de stats cet écrêtage rogne les
    // hauts tirages du Faune au point de comprimer l'écart sous le bruit — le
    // test devenait instable. Plus le total est grand, plus le ratio voulu
    // s'exprime.
    const moy = (race: string, champ: "attack" | "defense") => {
      let t = 0;
      for (let i = 0; i < 200; i++) {
        t += generateCardStats("Elfes", "Unité", "Rare", 10, race, "La Forêt d'Émeraude")[champ] ?? 0;
      }
      return t / 200;
    };
    expect(moy("Faunes", "attack")).toBeGreaterThan(moy("Farfadets", "attack"));
    expect(moy("Korrigans", "defense")).toBeGreaterThan(moy("Faunes", "defense"));
    expect(moy("Dryades", "defense")).toBeGreaterThan(moy("Korrigans", "defense"));
  });
});

describe("tables de pouvoirs", () => {
  it("chacune joue son propre registre", () => {
    expect(Object.keys(prof("Farfadets").likelyKeywords ?? {})).toContain("Richesse X");
    expect(Object.keys(prof("Korrigans").likelyKeywords ?? {})).toContain("Malédiction");
    expect(Object.keys(prof("Faunes").likelyKeywords ?? {})).toContain("Inspiration X");
    expect(Object.keys(prof("Dryades").likelyKeywords ?? {})).toContain("Régénération");
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

  it("aucune ne sollicite un pouvoir interdit — Pillage X en fait partie", () => {
    // Le registre évident du farfadet voleur d'or est INTERDIT dans cette
    // faction : Richesse X en tient lieu.
    const interdits = new Set(def().forbiddenKeywords);
    expect(interdits.has("Pillage X")).toBe(true);
    // Armure, la lecture évidente de l'écorce d'une dryade, l'est aussi.
    expect(interdits.has("Armure")).toBe(true);
    for (const r of NOUVELLES) {
      expect(Object.keys(prof(r).likelyKeywords ?? {}).filter((k) => interdits.has(k)), r).toEqual([]);
    }
  });
});
