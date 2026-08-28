// Les trois races ajoutées au « Voile Hurlant » (faction d'id `Morts-Vivants`,
// affichée « La Nécropole ») le 2026-08-27 : Poltergeists, Dullahans, Sluaghs.
// Le clan passe de DEUX à CINQ races et devient le QUATRIÈME du jeu à céder ses
// `statWeights`.
//
// Ce qui distingue ce lot des trois précédents : le dégraissage de la table de
// clan est PARTIEL. Seul le paquet incorporel redescend sur les races ; les
// quatre traits du présage de mort restent au clan (cf. le describe dédié).
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
import { validateRace, validateFactionClan } from "./faction-clan";

const NOUVELLES = ["Poltergeists", "Dullahans", "Sluaghs"] as const;
const ANCIENNES = ["Spectres", "Banshees"] as const;
const TOUTES = [...ANCIENNES, ...NOUVELLES] as const;
const def = () => FACTIONS["Morts-Vivants"];
const clan = () => def().clanProfiles?.["Le Voile Hurlant"] ?? {};
const prof = (r: string) => def().raceProfiles?.[r] ?? {};

describe("rattachement des trois races", () => {
  it("chacune appartient à la Nécropole", () => {
    for (const r of NOUVELLES) {
      expect(def().races, r).toContain(r);
      expect(getFactionForRace(r), r).toBe("Morts-Vivants");
    }
  });

  it("chacune n'ouvre QUE Le Voile Hurlant", () => {
    for (const r of NOUVELLES) {
      expect(getClanNamesForRace("Morts-Vivants", r), r).toEqual(["Le Voile Hurlant"]);
    }
  });

  it("le clan compte désormais cinq races, Spectres et Banshees en tête", () => {
    expect(getRacesForClan("Le Voile Hurlant")).toEqual([...TOUTES]);
  });

  it("n'ouvre aucun clan supplémentaire à la faction", () => {
    expect(getAllClanNames("Morts-Vivants")).toEqual([
      "Les Rangs Silencieux",
      "Le Voile Hurlant",
      "La Cour Écarlate",
      "Le Cénacle Nécromant",
    ]);
  });

  it("passe la validation serveur, et seulement dans sa faction", () => {
    for (const r of NOUVELLES) {
      expect(validateRace(r, "Morts-Vivants"), r).toEqual({ ok: true, race: r });
      expect(validateRace(r, "Elfes").ok, r).toBe(false);
      expect(validateFactionClan("Morts-Vivants", "Le Voile Hurlant").ok, r).toBe(true);
    }
  });

  it("chacune se décline au masculin en français", () => {
    expect(RACE_FORMS_FR["Poltergeists"].def).toBe("le Poltergeist");
    expect(RACE_FORMS_FR["Dullahans"].def).toBe("le Dullahan");
    expect(RACE_FORMS_FR["Sluaghs"].def).toBe("le Sluagh");
  });
});

describe("le clan CÈDE ses stats — le Dullahan en est la raison", () => {
  it("le clan ne déclare plus AUCUN statWeights", () => {
    expect(clan().statWeights).toBeUndefined();
  });

  it("les cinq races en déclarent chacune un", () => {
    for (const r of TOUTES) expect(prof(r).statWeights, r).toBeDefined();
  });

  it("Spectres et Banshees reprennent au bit près le gabarit cédé", () => {
    // Sans ce report, les deux races seraient retombées sur l'ombrelle de
    // faction (1.05/0.95) — la régression silencieuse que le critère des
    // Ghoules cherche à éviter.
    for (const r of ANCIENNES) {
      expect(prof(r).statWeights, r).toEqual({ atk: 1.05, def: 0.75 });
    }
  });

  it("le Dullahan est le seul corps SOLIDE d'un clan d'intangibles", () => {
    // C'est toute la justification du don : 1.05/0.75 aurait fait du cavalier
    // décapiteur un feu follet.
    const d = prof("Dullahans").statWeights!;
    for (const r of TOUTES) {
      if (r === "Dullahans") continue;
      expect(d.atk, r).toBeGreaterThan(prof(r).statWeights!.atk);
      expect(d.def, r).toBeGreaterThan(prof(r).statWeights!.def);
    }
  });

  it("le poltergeist ne frappe pas, le sluagh ne tient pas", () => {
    const p = prof("Poltergeists").statWeights!;
    const s = prof("Sluaghs").statWeights!;
    for (const r of TOUTES) expect(p.atk, r).toBeLessThanOrEqual(prof(r).statWeights!.atk);
    for (const r of TOUTES) expect(s.def, r).toBeLessThanOrEqual(prof(r).statWeights!.def);
  });

  it("la génération sépare bien les corps", () => {
    const moy = (race: string, champ: "attack" | "defense") => {
      let t = 0;
      for (let i = 0; i < 80; i++) {
        t += generateCardStats("Morts-Vivants", "Unité", "Rare", 5, race, "Le Voile Hurlant")[champ] ?? 0;
      }
      return t / 80;
    };
    expect(moy("Dullahans", "attack")).toBeGreaterThan(moy("Poltergeists", "attack"));
    expect(moy("Dullahans", "defense")).toBeGreaterThan(moy("Sluaghs", "defense"));
  });
});

describe("dégraissage PARTIEL de la table de clan", () => {
  it("le clan garde les quatre traits du présage de mort", () => {
    // Terreur, Maléfice, Malédiction et Paralysie valent pour les cinq races —
    // le Dullahan les porte autant que la Banshee. Les descendre aurait forcé à
    // les recopier cinq fois.
    expect(Object.keys(clan().likelyKeywords ?? {}).sort()).toEqual([
      "Malédiction", "Maléfice", "Paralysie", "Terreur",
    ]);
  });

  it("seul le paquet INCORPOREL est redescendu, à l'identique", () => {
    // Ombre / Invisible / Esquive ne pouvaient pas rester au clan : un cavalier
    // sans tête n'est ni invisible ni insaisissable.
    for (const r of ANCIENNES) {
      expect(prof(r).likelyKeywords, r).toEqual({ "Ombre": 0.55, "Invisible": 0.50, "Esquive": 0.50 });
    }
  });

  it("le Dullahan n'a NI Ombre NI Invisible — on le voit venir", () => {
    const kws = Object.keys(prof("Dullahans").likelyKeywords ?? {});
    expect(kws).not.toContain("Ombre");
    expect(kws).not.toContain("Invisible");
    expect(kws).toContain("Touché mortel");
  });

  it("Paralysie reste au CLAN, donc hors des profils de ses races", () => {
    // Un test des Ghoules la réserve à la goule parmi les profils de RACE — la
    // garder au niveau du clan préserve cet invariant sans rien retirer aux
    // spectres, qui l'avaient déjà. La Ghoule, elle, la garde bien : c'est
    // justement ce que l'on ne veut pas concurrencer.
    expect(clan().likelyKeywords?.["Paralysie"]).toBe(0.35);
    for (const r of TOUTES) {
      expect(Object.keys(prof(r).likelyKeywords ?? {}), r).not.toContain("Paralysie");
    }
    expect(def().raceProfiles?.["Ghoules"]?.likelyKeywords?.["Paralysie"]).toBe(0.50);
  });
});

describe("tables de pouvoirs des trois nouvelles", () => {
  it("chacune joue son propre registre", () => {
    expect(Object.keys(prof("Poltergeists").likelyKeywords ?? {})).toContain("Douleur X");
    expect(Object.keys(prof("Poltergeists").likelyKeywords ?? {})).toContain("Pillage X");
    expect(Object.keys(prof("Dullahans").likelyKeywords ?? {})).toContain("Première Frappe");
    expect(Object.keys(prof("Sluaghs").likelyKeywords ?? {})).toContain("Vol");
  });

  it("aucune ne double un pouvoir du clan", () => {
    const duClan = new Set(Object.keys(clan().likelyKeywords ?? {}));
    for (const r of TOUTES) {
      expect(Object.keys(prof(r).likelyKeywords ?? {}).filter((k) => duClan.has(k)), r).toEqual([]);
    }
  });

  it("dépasse l'ombrelle de faction partout où elle la recoupe", () => {
    // C'est ce qui monte le Vol du sluagh à 0.80 (ombrelle 0.15), son Rappel à
    // 0.60 (0.55) et sa Convocation X à 0.55 (0.40).
    const faction = def().likelyKeywords;
    for (const r of TOUTES) {
      for (const [kw, poids] of Object.entries(prof(r).likelyKeywords ?? {})) {
        if (faction[kw] !== undefined) expect(poids, `${r} / ${kw}`).toBeGreaterThan(faction[kw]);
      }
    }
  });

  it("aucune ne sollicite un pouvoir interdit de la faction", () => {
    const interdits = new Set(def().forbiddenKeywords);
    for (const r of TOUTES) {
      expect(Object.keys(prof(r).likelyKeywords ?? {}).filter((k) => interdits.has(k)), r).toEqual([]);
    }
  });
});
