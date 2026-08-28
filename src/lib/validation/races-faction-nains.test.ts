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

// ─── Mammouths : la SECONDE race du clan des Géants ─────────────────────────
//
// Premier clan de la faction à héberger DEUX races. Ce qui est verrouillé ici,
// c'est qu'elles restent distinctes : même clan, mêmes mots-clés d'identité,
// mais des corps opposés — les Géants tiennent le terrain, les Mammouths le
// traversent. Deux races d'un même clan qui généreraient les mêmes stats
// n'auraient été qu'un habillage.
describe("race Mammouths — rattachement", () => {
  it("appartient aux Armées des Montagnes, et à elles seules", () => {
    expect(FACTIONS.Nains.races).toContain("Mammouths");
    const autres = Object.entries(FACTIONS)
      .filter(([id, f]) => id !== "Nains" && f.races.includes("Mammouths"))
      .map(([id]) => id);
    expect(autres).toEqual([]);
  });

  it("est acceptée par la validation, et refusée ailleurs", () => {
    expect(validateRace("Mammouths", "Nains")).toEqual({ ok: true, race: "Mammouths" });
    expect(validateRace("Mammouths", null)).toEqual({ ok: true, race: "Mammouths" });
    expect(validateRace("Mammouths", "Elfes").ok).toBe(false);
  });

  it("relève du clan des Géants, et de lui seul", () => {
    expect(getClanNamesForRace("Nains", "Mammouths")).toEqual(["Clan des Premiers Géants"]);
  });

  it("n'est PAS une race libre : elle n'a rien à faire dans une forge naine", () => {
    expect(FACTIONS.Nains.freeRaces ?? []).not.toContain("Mammouths");
    expect(getClanNamesForRace("Nains", "Mammouths")).not.toEqual(getAllClanNames("Nains"));
  });

  it("n'introduit AUCUN clan supplémentaire malgré son entrée `appliesTo` jumelle", () => {
    // Deux groupes `clans` portent le même nom (un par race). `getAllClanNames`
    // dédoublonne : le joueur ne doit jamais voir « Clan des Premiers Géants »
    // deux fois dans une liste déroulante.
    expect(getAllClanNames("Nains")).toHaveLength(4);
    expect(validateFactionClan("Nains", "Clan des Premiers Géants").ok).toBe(true);
  });

  it("partage exactement le même clan que les Géants", () => {
    expect(getClanNamesForRace("Nains", "Mammouths"))
      .toEqual(getClanNamesForRace("Nains", "Géants"));
  });
});

describe("race Mammouths — profil « charge lourde »", () => {
  const mam = () => FACTIONS.Nains.raceProfiles!["Mammouths"]!;
  const gea = () => FACTIONS.Nains.raceProfiles!["Géants"]!;

  it("frappe plus fort et encaisse moins que les Géants", () => {
    expect(mam().statWeights!.atk!).toBeGreaterThan(gea().statWeights!.atk!);
    expect(mam().statWeights!.def!).toBeLessThan(gea().statWeights!.def!);
  });

  it("joue la percée là où les Géants jouent l'ancrage", () => {
    const kws = Object.keys(mam().likelyKeywords ?? {});
    expect(kws).toContain("Piétinement");
    expect(kws).toContain("Carnage X");
    // Ancré immobilise : c'est l'exact contraire d'une charge.
    expect(kws).not.toContain("Ancré");
    expect(kws).not.toContain("Provocation");
  });

  it("ne sollicite aucun mot-clé interdit de la faction", () => {
    const interdits = new Set(FACTIONS.Nains.forbiddenKeywords ?? []);
    expect(Object.keys(mam().likelyKeywords ?? {}).filter((k) => interdits.has(k))).toEqual([]);
  });

  it("dispose de ses formes grammaticales françaises", () => {
    expect(RACE_FORMS_FR["Mammouths"]).toEqual({
      def: "le Mammouth", bare: "Mammouth", de: "du Mammouth",
    });
  });
});

describe("clan des Premiers Géants — il CÈDE ses stats à ses races", () => {
  // La cascade du générateur est `clanStatW ?? raceStatW ?? faction` : un choix
  // d'objet ENTIER, pas champ par champ. Tant que ce clan déclarait des
  // `statWeights`, ses deux races recevaient le même gabarit et le profil des
  // Mammouths était mort-né — sans le moindre avertissement. L'omission est donc
  // load-bearing : la remettre reviendrait à annuler la race en silence.
  it("ne déclare AUCUN statWeights", () => {
    expect(FACTIONS.Nains.clanProfiles?.["Clan des Premiers Géants"]?.statWeights).toBeUndefined();
  });

  it("garde en revanche son profil de mots-clés, commun aux deux races", () => {
    const kws = FACTIONS.Nains.clanProfiles?.["Clan des Premiers Géants"]?.likelyKeywords ?? {};
    expect(Object.keys(kws).length).toBeGreaterThan(0);
    expect(kws["Provocation"]).toBeGreaterThan(0);
  });

  it("les clans qui cèdent leurs stats sont EXACTEMENT les quatre clans multi-races", () => {
    // Liste close, volontairement : y ajouter un clan sans lui donner des races
    // qui portent chacune leur gabarit revient à le renvoyer à l'ombrelle de
    // faction. La Cour Écarlate a rejoint la liste le 2026-08-27, en passant de
    // une à cinq races ; Le Cénacle Nécromant le même jour, en passant de une à
    // quatre — et en DONNANT au passage un profil à Lich, qui n'en avait pas.
    // Le Voile Hurlant a suivi, en passant de deux à cinq : c'est le Dullahan,
    // seul corps solide d'un clan d'intangibles, qui a rendu le partage
    // impossible.
    const sansStats: string[] = [];
    for (const [fid, f] of Object.entries(FACTIONS)) {
      for (const [clan, prof] of Object.entries(f.clanProfiles ?? {})) {
        if (!prof.statWeights) sansStats.push(`${fid}/${clan}`);
      }
    }
    expect(sansStats.sort()).toEqual(
      [
        "Morts-Vivants/La Cour Écarlate",
        "Morts-Vivants/Le Cénacle Nécromant",
        "Morts-Vivants/Le Voile Hurlant",
        "Nains/Clan des Premiers Géants",
      ].sort(),
    );
  });
});
