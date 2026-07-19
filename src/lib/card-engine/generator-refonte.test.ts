// Refonte factions & clans (Phase A) : cohérence des données, précédence
// clan > race > faction, race persistée par le mana, interdits assouplis,
// clan bonus inerte et race libre.
import { describe, expect, it } from "vitest";
import {
  FACTIONS,
  KEYWORDS,
  deriveRaceForClan,
  getAllClanNames,
  getClanNamesForRace,
  getFactionForRace,
} from "./constants";
import { generateCardStats } from "./generator";

const ALIGNMENTS = new Set(["bon", "neutre", "maléfique", "spéciale"]);
const KEYWORD_KEYS = new Set(Object.keys(KEYWORDS));

describe("cohérence des données FACTIONS", () => {
  it("chaque clan déclaré dans clans[] possède un profil (clanProfiles)", () => {
    for (const [fid, def] of Object.entries(FACTIONS)) {
      const declared = getAllClanNames(fid);
      for (const clan of declared) {
        expect(def.clanProfiles?.[clan], `${fid} / ${clan}`).toBeDefined();
      }
    }
  });

  it("chaque mot-clé cité (likely/forbidden, race/clan) existe dans KEYWORDS", () => {
    for (const [fid, def] of Object.entries(FACTIONS)) {
      const maps: Record<string, number>[] = [def.likelyKeywords];
      for (const rp of Object.values(def.raceProfiles ?? {})) if (rp.likelyKeywords) maps.push(rp.likelyKeywords);
      for (const cp of Object.values(def.clanProfiles ?? {})) if (cp.likelyKeywords) maps.push(cp.likelyKeywords);
      for (const m of maps) {
        for (const kw of Object.keys(m)) expect(KEYWORD_KEYS.has(kw), `${fid} likely "${kw}"`).toBe(true);
      }
      for (const kw of def.forbiddenKeywords) expect(KEYWORD_KEYS.has(kw), `${fid} forbidden "${kw}"`).toBe(true);
    }
  });

  it("chaque race d'une faction est rattachée à une faction (RACE_TO_FACTION)", () => {
    for (const [fid, def] of Object.entries(FACTIONS)) {
      for (const race of def.races) expect(getFactionForRace(race), `${fid} / ${race}`).not.toBeNull();
    }
  });

  it("chaque faction a un alignement valide", () => {
    for (const [fid, def] of Object.entries(FACTIONS)) {
      expect(ALIGNMENTS.has(def.alignment), `${fid}`).toBe(true);
    }
  });

  it("compte 10 factions", () => {
    expect(Object.keys(FACTIONS)).toHaveLength(10);
  });
});

describe("deriveRaceForClan — race persistée par le mana", () => {
  it("Cohortes Sanglantes : Gobelins < 3, Trolls >= 6", () => {
    expect(deriveRaceForClan("Elfes Noirs", "Les Cohortes Sanglantes", 1)).toBe("Gobelins");
    expect(deriveRaceForClan("Elfes Noirs", "Les Cohortes Sanglantes", 2)).toBe("Gobelins");
    expect(deriveRaceForClan("Elfes Noirs", "Les Cohortes Sanglantes", 6)).toBe("Trolls");
    expect(deriveRaceForClan("Elfes Noirs", "Les Cohortes Sanglantes", 9)).toBe("Trolls");
  });

  it("Cohortes 3–5 mana : Orcs OU Wargs, pondéré (~70/30 sur un échantillon)", () => {
    const counts: Record<string, number> = { Orcs: 0, Wargs: 0 };
    for (let i = 0; i < 400; i++) {
      const r = deriveRaceForClan("Elfes Noirs", "Les Cohortes Sanglantes", 4)!;
      expect(["Orcs", "Wargs"]).toContain(r);
      counts[r]++;
    }
    // Les deux races apparaissent ; Orcs est majoritaire.
    expect(counts.Orcs).toBeGreaterThan(0);
    expect(counts.Wargs).toBeGreaterThan(0);
    expect(counts.Orcs).toBeGreaterThan(counts.Wargs);
  });

  it("clan Hobbits : Hobbits <= 5, Hommes-Arbres >= 6", () => {
    expect(deriveRaceForClan("Elfes", "La Combe Verte", 3)).toBe("Hobbits");
    expect(deriveRaceForClan("Elfes", "La Combe Verte", 5)).toBe("Hobbits");
    expect(deriveRaceForClan("Elfes", "La Combe Verte", 6)).toBe("Hommes-Arbres");
  });

  it("renvoie null pour un clan sans bandes", () => {
    expect(deriveRaceForClan("Elfes", "Les Sylvains", 4)).toBeNull();
    expect(deriveRaceForClan("Nains", "La Forge Ardente", 4)).toBeNull();
  });

  it("le générateur persiste la race dérivée du mana", () => {
    const troll = generateCardStats("Elfes Noirs", "Unité", "Commune", 7, undefined, "Les Cohortes Sanglantes");
    expect(troll.race).toBe("Trolls");
    const gob = generateCardStats("Elfes Noirs", "Unité", "Commune", 2, undefined, "Les Cohortes Sanglantes");
    expect(gob.race).toBe("Gobelins");
    // Hors clan à bandes : la race passée est conservée.
    const elfe = generateCardStats("Elfes", "Unité", "Commune", 3, "Elfes", "Les Sylvains");
    expect(elfe.race).toBe("Elfes");
  });
});

describe("interdits assouplis", () => {
  it("Elfes autorise désormais Ancré et Provocation", () => {
    expect(FACTIONS["Elfes"].forbiddenKeywords).not.toContain("Ancré");
    expect(FACTIONS["Elfes"].forbiddenKeywords).not.toContain("Provocation");
  });

  it("Légions du Chaos autorise désormais Provocation et Régénération", () => {
    expect(FACTIONS["Elfes Noirs"].forbiddenKeywords).not.toContain("Provocation");
    expect(FACTIONS["Elfes Noirs"].forbiddenKeywords).not.toContain("Régénération");
    // Interdits finaux inchangés.
    expect(FACTIONS["Elfes Noirs"].forbiddenKeywords).toEqual(
      expect.arrayContaining(["Loyauté", "Commandement", "Bouclier", "Bénédiction", "Bravoure"]),
    );
  });
});

describe("clan bonus inerte + race libre", () => {
  it("Les Mignons a un profil mais n'est pas un clan jouable", () => {
    expect(FACTIONS["Hommes-Bêtes"].clanProfiles?.["Les Mignons"]).toBeDefined();
    expect(getAllClanNames("Hommes-Bêtes")).not.toContain("Les Mignons");
    expect(getClanNamesForRace("Hommes-Bêtes", "Mimis")).not.toContain("Les Mignons");
  });

  it("Aigles Géants (race libre) accède à tous les clans elfes", () => {
    const all = getAllClanNames("Elfes");
    expect(getClanNamesForRace("Elfes", "Aigles Géants").sort()).toEqual(all.sort());
    // Une race non-libre reste restreinte à ses clans.
    expect(getClanNamesForRace("Elfes", "Fées")).toEqual(["La Forêt d'Émeraude"]);
  });
});
