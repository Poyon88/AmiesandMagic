// Races ajoutées à la faction d'id `Nains` — affichée « Les Armées des Montagnes ».
// Le fichier est nommé d'après l'ID, stable, et non d'après le nom affiché, qui
// a déjà changé deux fois (Nains → Confrérie de la Forge → Armées des Montagnes).
//
// · Machines — rattachées au clan existant des Gnomes (La Guilde des
//   Ingénieurs) pour que les deux races restent mélangeables en deck.
// · Kobolds  — rattachés aux Gardiens de la Montagne, pour répartir les races
//   entre les clans plutôt que d'en surcharger un seul.
import { describe, expect, it } from "vitest";
import { FACTIONS, getClanNamesForRace, getAllClanNames } from "@/lib/card-engine/constants";
import { validateRace, validateFactionClan } from "./faction-clan";
import { RACE_FORMS_FR, FACTION_FORMS_FR } from "@/lib/card-engine/race-forms";

describe("faction Nains — nom affiché", () => {
  it("s'affiche « Les Armées des Montagnes »", () => {
    expect(FACTIONS.Nains.displayName).toBe("Les Armées des Montagnes");
  });

  it("porte la forme génitive accordée au nom affiché", () => {
    // Se désynchronise sans bruit à chaque renommage : « de la Confrérie… »
    // resterait grammaticalement valide mais nommerait l'ancienne faction.
    expect(FACTION_FORMS_FR["Nains"]).toBe("des Armées des Montagnes");
  });
});

describe("race Machines — rattachement", () => {
  it("appartient aux Armées des Montagnes", () => {
    expect(FACTIONS.Nains.displayName).toBe("Les Armées des Montagnes");
    expect(FACTIONS.Nains.races).toContain("Machines");
  });

  it("n'appartient à AUCUNE autre faction", () => {
    const autres = Object.entries(FACTIONS)
      .filter(([id, f]) => id !== "Nains" && f.races.includes("Machines"))
      .map(([id]) => id);
    expect(autres).toEqual([]);
  });

  it("est acceptée par la validation, seule ou avec sa faction", () => {
    expect(validateRace("Machines", "Nains")).toEqual({ ok: true, race: "Machines" });
    expect(validateRace("Machines", null)).toEqual({ ok: true, race: "Machines" });
  });

  it("est refusée sous une autre faction", () => {
    expect(validateRace("Machines", "Elfes").ok).toBe(false);
  });
});

describe("race Machines — clan (race libre)", () => {
  it("est déclarée race libre de la faction", () => {
    expect(FACTIONS.Nains.freeRaces).toContain("Machines");
  });

  it("accède à TOUS les clans de la faction", () => {
    expect(getClanNamesForRace("Nains", "Machines")).toEqual(getAllClanNames("Nains"));
  });

  it("n'a pas de clan propre : elle n'apparaît dans aucun groupe `appliesTo`", () => {
    const cible = (FACTIONS.Nains.clans ?? []).filter((g) => g.appliesTo === "Machines");
    expect(cible).toEqual([]);
  });
});

describe("race Machines — profil et rendu", () => {
  it("porte un profil de race dédié", () => {
    const p = FACTIONS.Nains.raceProfiles?.["Machines"];
    expect(p).toBeDefined();
    // Plus offensive que les Golems (murs de la faction), plus solide qu'un Gnome.
    const golems = FACTIONS.Nains.raceProfiles!["Golems"]!;
    expect(p!.statWeights!.atk!).toBeGreaterThan(golems.statWeights!.atk!);
    expect(p!.statWeights!.def!).toBeLessThan(golems.statWeights!.def!);
  });

  it("ne sollicite aucun mot-clé interdit de la faction", () => {
    const interdits = new Set(FACTIONS.Nains.forbiddenKeywords ?? []);
    const proposes = Object.keys(FACTIONS.Nains.raceProfiles!["Machines"]!.likelyKeywords ?? {});
    expect(proposes.filter((k) => interdits.has(k))).toEqual([]);
  });

  it("dispose de ses formes grammaticales françaises", () => {
    expect(RACE_FORMS_FR["Machines"]).toEqual({
      def: "la Machine", bare: "Machine", de: "de la Machine",
    });
  });
});

describe("race Kobolds — rattachement", () => {
  it("appartient aux Armées des Montagnes, et à elles seules", () => {
    expect(FACTIONS.Nains.races).toContain("Kobolds");
    const autres = Object.entries(FACTIONS)
      .filter(([id, f]) => id !== "Nains" && f.races.includes("Kobolds"))
      .map(([id]) => id);
    expect(autres).toEqual([]);
  });

  it("est acceptée par la validation, et refusée ailleurs", () => {
    expect(validateRace("Kobolds", "Nains")).toEqual({ ok: true, race: "Kobolds" });
    expect(validateRace("Kobolds", null)).toEqual({ ok: true, race: "Kobolds" });
    expect(validateRace("Kobolds", "Nains2").ok).toBe(false);
  });

  it("relève de son clan dédié, et de lui seul", () => {
    expect(getClanNamesForRace("Nains", "Kobolds")).toEqual(["Clan des Mille Tunnels"]);
  });
});

describe("race Kobolds — profil", () => {
  const kob = () => FACTIONS.Nains.raceProfiles!["Kobolds"]!;

  it("est la race FRAGILE de la faction", () => {
    // La faction est bâtie sur la défense (def 1.40) : les Kobolds l'inversent.
    expect(kob().statWeights!.def!).toBeLessThan(FACTIONS.Nains.statWeights!.def!);
    expect(kob().statWeights!.def!).toBeLessThan(FACTIONS.Nains.raceProfiles!["Machines"]!.statWeights!.def!);
  });

  it("mise sur le nombre plutôt que sur le blindage", () => {
    const kws = Object.keys(kob().likelyKeywords ?? {});
    expect(kws).toContain("Rassemblement X");
    expect(kws).toContain("Solidarité X");
    expect(kws).not.toContain("Armure");
  });

  it("ne sollicite aucun mot-clé interdit de la faction", () => {
    const interdits = new Set(FACTIONS.Nains.forbiddenKeywords ?? []);
    const proposes = Object.keys(kob().likelyKeywords ?? {});
    expect(proposes.filter((k) => interdits.has(k))).toEqual([]);
  });

  it("dispose de ses formes grammaticales françaises", () => {
    expect(RACE_FORMS_FR["Kobolds"]).toEqual({
      def: "le Kobold", bare: "Kobold", de: "du Kobold",
    });
  });
});

describe("structure des clans — un clan par race « peuple »", () => {
  it("expose exactement les quatre clans voulus", () => {
    expect(getAllClanNames("Nains").sort()).toEqual([
      "Clan des Mille Tunnels",
      "Clan des Premiers Géants",
      "La Forge Ardente",
      "La Guilde des Ingénieurs",
    ]);
  });

  it("ne conserve AUCUN des deux clans supprimés", () => {
    const clans = getAllClanNames("Nains");
    expect(clans).not.toContain("Les Gardiens de la Montagne");
    expect(clans).not.toContain("Les Sentinelles d'Airain");
  });

  it("donne à chaque race « peuple » son clan unique", () => {
    expect(getClanNamesForRace("Nains", "Nains")).toEqual(["La Forge Ardente"]);
    expect(getClanNamesForRace("Nains", "Gnomes")).toEqual(["La Guilde des Ingénieurs"]);
    expect(getClanNamesForRace("Nains", "Kobolds")).toEqual(["Clan des Mille Tunnels"]);
    expect(getClanNamesForRace("Nains", "Géants")).toEqual(["Clan des Premiers Géants"]);
  });

  it("ouvre tous les clans aux deux races de constructs", () => {
    for (const race of ["Golems", "Machines"]) {
      expect(getClanNamesForRace("Nains", race)).toEqual(getAllClanNames("Nains"));
    }
  });

  it("dote les deux nouveaux clans d'un profil", () => {
    for (const clan of ["Clan des Mille Tunnels", "Clan des Premiers Géants"]) {
      expect(FACTIONS.Nains.clanProfiles?.[clan]).toBeDefined();
    }
  });

  it("ne laisse aucun profil orphelin d'un clan supprimé", () => {
    const clans = new Set(getAllClanNames("Nains"));
    const orphelins = Object.keys(FACTIONS.Nains.clanProfiles ?? {}).filter((c) => !clans.has(c));
    expect(orphelins).toEqual([]);
  });
});

describe("race Géants — transfert depuis les Mercenaires", () => {
  it("appartient désormais aux Armées des Montagnes", () => {
    expect(FACTIONS.Nains.races).toContain("Géants");
    expect(validateRace("Géants", "Nains").ok).toBe(true);
  });

  it("a bien QUITTÉ les Mercenaires", () => {
    expect(FACTIONS.Mercenaires.races).not.toContain("Géants");
    expect(validateRace("Géants", "Mercenaires").ok).toBe(false);
    // Le profil de race a suivi : plus de résidu côté Mercenaires.
    expect(FACTIONS.Mercenaires.raceProfiles?.["Géants"]).toBeUndefined();
  });

  it("a emporté son profil de race dans la faction d'accueil", () => {
    const p = FACTIONS.Nains.raceProfiles?.["Géants"];
    expect(p).toBeDefined();
    const interdits = new Set(FACTIONS.Nains.forbiddenKeywords ?? []);
    expect(Object.keys(p!.likelyKeywords ?? {}).filter((k) => interdits.has(k))).toEqual([]);
  });

  it("accepte le couple faction/clan correspondant", () => {
    expect(validateFactionClan("Nains", "Clan des Premiers Géants").ok).toBe(true);
  });
});
